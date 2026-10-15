import { and, eq, exists, lte, ne } from "drizzle-orm";
import { db, dbReady } from "@/db/client";
import { deliveries, changes, jobs, targets, users, watches, type Job } from "@/db/schema";
import { DEFAULT_POLICY, DomainGate } from "@/core/limiter";
import { MINUTE } from "@/core/schedule";
import { markTimeout, RetryableCheckError, runCheck } from "@/server/check";
import { config } from "@/server/config";
import { notifyChange, sendDigest } from "@/server/notify";
import { claim, complete, enqueue, fail, pruneJobs, release } from "@/server/queue";
import { closeBrowser } from "@/server/render";
import { summarizeChange } from "@/server/summarize";

const SCHEDULER_TICK_MS = 5_000;
const DIGEST_TICK_MS = 5 * MINUTE;
const PRUNE_TICK_MS = 6 * 60 * MINUTE;
const IDLE_MS = 750;
const SIDE_SLOTS = 2;

const gate = new DomainGate({ ...DEFAULT_POLICY, minGapMs: config.domainGapMs });
const inFlight = new Set<Promise<void>>();
let checkSlots = 0;
let sideSlots = 0;
let running = true;

function log(scope: string, message: string): void {
  process.stdout.write(`${new Date().toISOString().slice(11, 19)} [${scope}] ${message}\n`);
}

class JobTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new JobTimeoutError(`Timed out after ${ms / 1000}s`)), ms);
    }),
  ]);
}

/** Q4: enqueue due targets; dedupe keys mean a target is never queued twice. */
async function scheduleDueTargets(): Promise<void> {
  const now = Date.now();
  const due = await db
    .select({ id: targets.id, host: targets.host, intervalMin: targets.intervalMin })
    .from(targets)
    .where(
      and(
        lte(targets.nextCheckAt, now),
        exists(db.select({ one: watches.id }).from(watches).where(and(eq(watches.targetId, targets.id), eq(watches.paused, false)))),
      ),
    )
    .limit(200);

  for (const t of due) {
    await enqueue("check", { targetId: t.id }, { host: t.host, dedupeKey: `check:${t.id}`, runAt: now });
    // Provisional next slot; runCheck replaces it with the jittered / backoff / confirm time.
    await db.update(targets).set({ nextCheckAt: now + t.intervalMin * MINUTE }).where(eq(targets.id, t.id));
  }
}

function localParts(timezone: string, now: Date): { hour: number; dateKey: string } {
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(now));
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
    return { hour, dateKey };
  } catch {
    return { hour: now.getUTCHours(), dateKey: now.toISOString().slice(0, 10) };
  }
}

async function scheduleDigests(): Promise<void> {
  const now = new Date();
  const waiting = await db
    .selectDistinct({ user: users })
    .from(deliveries)
    .innerJoin(changes, eq(deliveries.changeId, changes.id))
    .innerJoin(watches, eq(changes.watchId, watches.id))
    .innerJoin(users, eq(watches.userId, users.id))
    .where(eq(deliveries.status, "digest"));

  for (const { user } of waiting) {
    const { hour, dateKey } = localParts(user.timezone, now);
    if (hour !== user.digestHour || user.lastDigestDate === dateKey) continue;
    await enqueue("digest", { userId: user.id, dateKey }, { dedupeKey: `digest:${user.id}:${dateKey}` });
  }
}

/** Targets with a render still in flight — including one that outlived its job timeout. */
const runningTargets = new Set<string>();

async function runCheckJob(job: Job): Promise<void> {
  const host = job.host ?? "unknown";
  const payload = job.payload as { targetId: string; force?: boolean };
  if (runningTargets.has(payload.targetId) || !gate.tryAcquire(host, Date.now())) {
    await release(job, Math.max(1_000, gate.waitMs(host, Date.now())));
    return;
  }
  runningTargets.add(payload.targetId);
  const check = runCheck(payload.targetId, { force: payload.force, attempt: job.attempts, maxAttempts: job.maxAttempts });
  // The lock lasts as long as the real work, not the timeout race, so retries never overlap it.
  check.catch(() => undefined).finally(() => runningTargets.delete(payload.targetId));
  try {
    const outcome = await withTimeout(check, config.jobTimeoutMs);
    // robots.txt refusals are our choice, not the host failing: don't feed the circuit breaker.
    const hostOk = outcome.result === "ok" || outcome.result === "not_modified" || outcome.result === "robots";
    gate.release(host, Date.now(), { ok: hostOk, retryAfterSec: outcome.retryAfterSec });
    await complete(job.id);
    log("check", `${host} → ${outcome.result}${outcome.changed ? ` · ${outcome.changed} changed` : ""} (${outcome.reason})`);
  } catch (error) {
    gate.release(host, Date.now(), { ok: false });
    const timedOut = error instanceof JobTimeoutError;
    const retryable = error instanceof RetryableCheckError || timedOut;
    if (timedOut && job.attempts >= job.maxAttempts) await markTimeout(payload.targetId).catch(() => undefined);
    await fail(job, error, retryable);
    log("check", `${host} failed (attempt ${job.attempts}/${job.maxAttempts}): ${(error as Error).message}`);
  }
}

async function runSideJob(job: Job): Promise<void> {
  const payload = job.payload as { changeId?: string; userId?: string; dateKey?: string };
  try {
    if (job.type === "summarize" && payload.changeId) await summarizeChange(payload.changeId);
    if (job.type === "notify" && payload.changeId) await notifyChange(payload.changeId);
    if (job.type === "digest" && payload.userId && payload.dateKey) {
      const sent = await sendDigest(payload.userId, payload.dateKey);
      log("digest", `${payload.userId}: ${sent} change(s)`);
    }
    await complete(job.id);
    if (job.type === "notify") log("notify", `change ${payload.changeId} delivered`);
  } catch (error) {
    await fail(job, error, true);
    log(job.type, `failed (attempt ${job.attempts}/${job.maxAttempts}): ${(error as Error).message}`);
  }
}

function track(promise: Promise<void>, onDone: () => void): void {
  const tracked = promise.finally(() => {
    onDone();
    inFlight.delete(tracked);
  });
  inFlight.add(tracked);
}

async function pump(): Promise<void> {
  while (running) {
    let started = false;
    if (checkSlots < config.checkConcurrency) {
      const job = await claim(
        ["check"],
        (j) => !runningTargets.has(String(j.payload.targetId)) && (!j.host || gate.waitMs(j.host, Date.now()) === 0),
      );
      if (job) {
        checkSlots++;
        track(runCheckJob(job), () => checkSlots--);
        started = true;
      }
    }
    if (sideSlots < SIDE_SLOTS) {
      const job = await claim(["summarize", "notify", "digest"], () => true);
      if (job) {
        sideSlots++;
        track(runSideJob(job), () => sideSlots--);
        started = true;
      }
    }
    if (!started) await new Promise((r) => setTimeout(r, IDLE_MS));
  }
}

function every(ms: number, name: string, fn: () => Promise<void>): NodeJS.Timeout {
  const tick = () => fn().catch((error) => log(name, `tick failed: ${(error as Error).message}`));
  void tick();
  return setInterval(tick, ms);
}

async function main(): Promise<void> {
  await dbReady;
  // Recover jobs leased by a previous worker that died mid-run.
  await db.update(jobs).set({ status: "queued", lockedUntil: null }).where(and(eq(jobs.status, "running"), ne(jobs.type, "digest")));
  log("worker", `started · ${config.checkConcurrency} render slots · ${config.domainGapMs / 1000}s per-host gap · confirm after ${config.confirmDelayMs / 1000}s`);

  const timers = [
    every(SCHEDULER_TICK_MS, "scheduler", scheduleDueTargets),
    every(DIGEST_TICK_MS, "digest", scheduleDigests),
    every(PRUNE_TICK_MS, "prune", () => pruneJobs()),
  ];

  const shutdown = async (signal: string) => {
    if (!running) return;
    running = false;
    log("worker", `${signal} received, finishing ${inFlight.size} job(s)…`);
    timers.forEach(clearInterval);
    await Promise.allSettled([...inFlight]);
    await closeBrowser();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await pump();
}

main().catch((error) => {
  console.error("Worker crashed:", error);
  process.exit(1);
});
