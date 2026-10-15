import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, type Job, type JobType } from "@/db/schema";
import { newId } from "@/core/hash";

const LEASE_MS = 120_000;
const RETRY_BASE_MS = 30_000;
const CLAIM_BATCH = 200;

export type EnqueueOptions = {
  runAt?: number;
  host?: string | null;
  dedupeKey?: string;
  maxAttempts?: number;
};

/** Add a job. With a dedupeKey, a job already queued or running is reused (no duplicates). */
export async function enqueue(type: JobType, payload: Record<string, unknown>, opts: EnqueueOptions = {}): Promise<string> {
  const now = Date.now();
  if (opts.dedupeKey) {
    const existing = await db.query.jobs.findFirst({
      where: and(eq(jobs.dedupeKey, opts.dedupeKey), inArray(jobs.status, ["queued", "running"])),
    });
    if (existing) {
      // Merge into the queued job: run it as early as either request wants, and keep any `force` flag.
      if (existing.status === "queued") {
        const merged = { ...existing.payload, ...payload, ...(existing.payload.force || payload.force ? { force: true } : {}) };
        const runAt = opts.runAt !== undefined ? Math.min(opts.runAt, existing.runAt) : existing.runAt;
        await db.update(jobs).set({ runAt, payload: merged }).where(eq(jobs.id, existing.id));
      }
      return existing.id;
    }
  }
  const id = newId();
  await db.insert(jobs).values({
    id,
    type,
    payload,
    status: "queued",
    host: opts.host ?? null,
    dedupeKey: opts.dedupeKey ?? null,
    maxAttempts: opts.maxAttempts ?? 3,
    runAt: opts.runAt ?? now,
    createdAt: now,
  });
  return id;
}

const claimable = (now: number) =>
  or(
    and(eq(jobs.status, "queued"), lte(jobs.runAt, now)),
    and(eq(jobs.status, "running"), lt(jobs.lockedUntil, now)), // lease expired: worker crashed
  );

/**
 * Atomically lease the next runnable job of the given types. `canRun` lets the
 * caller skip jobs whose host is currently rate-limited.
 */
export async function claim(types: JobType[], canRun: (job: Job) => boolean, now = Date.now()): Promise<Job | null> {
  // A job whose lease keeps expiring is crashing the worker: retire it instead of reclaiming forever.
  await db
    .update(jobs)
    .set({ status: "failed", finishedAt: now, lastError: "Lease expired after the last attempt (worker crashed or hung)", lockedUntil: null })
    .where(and(eq(jobs.status, "running"), lt(jobs.lockedUntil, now), sql`${jobs.attempts} >= ${jobs.maxAttempts}`));

  const candidates = await db
    .select()
    .from(jobs)
    .where(and(inArray(jobs.type, types), claimable(now)))
    .orderBy(asc(jobs.runAt))
    .limit(CLAIM_BATCH);

  for (const job of candidates) {
    if (!canRun(job)) continue;
    const [leased] = await db
      .update(jobs)
      .set({ status: "running", lockedUntil: now + LEASE_MS, attempts: sql`${jobs.attempts} + 1` })
      .where(and(eq(jobs.id, job.id), claimable(now)))
      .returning();
    if (leased) return leased;
  }
  return null;
}

export async function complete(id: string): Promise<void> {
  await db.update(jobs).set({ status: "done", finishedAt: Date.now(), lockedUntil: null }).where(eq(jobs.id, id));
}

export async function fail(job: Job, error: unknown, retryable: boolean, delayMs?: number): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const canRetry = retryable && job.attempts < job.maxAttempts;
  const backoff = delayMs ?? RETRY_BASE_MS * 4 ** Math.max(0, job.attempts - 1);
  await db
    .update(jobs)
    .set(
      canRetry
        ? { status: "queued", runAt: Date.now() + backoff, lastError: message, lockedUntil: null }
        : { status: "failed", finishedAt: Date.now(), lastError: message, lockedUntil: null },
    )
    .where(eq(jobs.id, job.id));
}

/** Put a leased job back without spending an attempt (e.g. host became busy). */
export async function release(job: Job, delayMs: number): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "queued", runAt: Date.now() + delayMs, lockedUntil: null, attempts: Math.max(0, job.attempts - 1) })
    .where(eq(jobs.id, job.id));
}

export async function pruneJobs(olderThanMs = 7 * 24 * 60 * 60_000): Promise<void> {
  await db
    .delete(jobs)
    .where(and(inArray(jobs.status, ["done", "failed"]), lt(jobs.createdAt, Date.now() - olderThanMs)));
}

export async function queueStats(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: jobs.status, count: sql<number>`count(*)` })
    .from(jobs)
    .groupBy(jobs.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}
