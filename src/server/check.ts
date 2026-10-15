import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { checks, snapshots, targets, watches, type CheckResultValue, type Target, type Watch } from "@/db/schema";
import { classifyCheck, type Classification } from "@/core/classify";
import { newId, sha256 } from "@/core/hash";
import { normalizeText } from "@/core/normalize";
import { backoffAt, HOUR, nextCheckAt } from "@/core/schedule";
import { config } from "./config";
import { evaluateWatch, recordHealthEvent } from "./evaluate";
import { conditionalUnchanged, render, robotsAllows, type RenderResult, type ViewSpec } from "./render";
import { putBlob } from "./storage";

export class RetryableCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableCheckError";
  }
}

export type CheckOptions = { confirm?: boolean; force?: boolean; attempt?: number; maxAttempts?: number };
export type CheckOutcome = { result: CheckResultValue; reason: string; retryAfterSec?: number; changed: number };

export function viewSpecFor(w: Watch): ViewSpec {
  return { key: w.id, watch: w.watchSelectors, ignore: [...w.ignoreSelectors, ...w.autoIgnoreSelectors] };
}

const unique = <T,>(items: T[]) => [...new Set(items)];

type CheckRow = {
  startedAt: number;
  result: CheckResultValue;
  reason: string;
  httpStatus?: number | null;
  contentHash?: string | null;
  snapshotId?: string | null;
  confirm?: boolean;
  watchers: number;
};

async function insertCheck(target: Target, row: CheckRow): Promise<void> {
  await db.insert(checks).values({
    id: newId(),
    targetId: target.id,
    startedAt: row.startedAt,
    durationMs: Date.now() - row.startedAt,
    httpStatus: row.httpStatus ?? null,
    result: row.result,
    reason: row.reason,
    contentHash: row.contentHash ?? null,
    snapshotId: row.snapshotId ?? null,
    confirm: row.confirm ?? false,
    watchers: row.watchers,
  });
}

/** Q1: outages and CAPTCHAs update health, never content. Alert after N consecutive failures. */
async function markFailure(target: Target, active: Watch[], cls: Classification, now: number): Promise<void> {
  const failures = target.consecutiveFailures + 1;
  const shouldAlert = failures >= config.failuresBeforeHealthAlert && !target.healthAlerted;
  await db
    .update(targets)
    .set({
      status: cls.result === "ok" ? "error" : cls.result,
      statusReason: cls.reason,
      consecutiveFailures: failures,
      lastCheckedAt: now,
      nextCheckAt: backoffAt(now, target.intervalMin, failures, cls.retryAfterSec),
      healthAlerted: target.healthAlerted || shouldAlert,
    })
    .where(eq(targets.id, target.id));
  if (shouldAlert) {
    const outageKey = String(target.lastOkAt ?? target.createdAt);
    for (const w of active) await recordHealthEvent(w, "down", cls.reason, outageKey, now);
  }
}

async function storeSnapshot(target: Target, out: RenderResult, contentHash: string, now: number) {
  const find = () =>
    db.query.snapshots.findFirst({
      where: and(eq(snapshots.targetId, target.id), eq(snapshots.contentHash, contentHash)),
    });
  const existing = await find();
  if (existing) return existing;

  const screenshotKey = out.screenshot ? await putBlob(out.screenshot, "png") : null;
  await db
    .insert(snapshots)
    .values({
      id: newId(),
      targetId: target.id,
      contentHash,
      title: out.title,
      text: out.text,
      views: out.views,
      boxes: out.boxes,
      screenshotKey,
      width: out.width,
      height: out.height,
      createdAt: now,
    })
    .onConflictDoNothing();
  const stored = await find();
  if (!stored) throw new Error("Snapshot insert failed");
  return stored;
}

/** A check that ran out of time on its final attempt counts as a failed check (an outage, not silence). */
export async function markTimeout(targetId: string): Promise<void> {
  const target = await db.query.targets.findFirst({ where: eq(targets.id, targetId) });
  if (!target) return;
  const active = await db.query.watches.findMany({ where: and(eq(watches.targetId, targetId), eq(watches.paused, false)) });
  const now = Date.now();
  await insertCheck(target, { startedAt: now, result: "error", reason: "Timed out", watchers: active.length });
  await markFailure(target, active, { result: "error", reason: "Timed out" }, now);
}

/** One check of one Target, shared by every watch on it (Q2: one fetch, N watchers). */
export async function runCheck(targetId: string, opts: CheckOptions = {}): Promise<CheckOutcome> {
  const startedAt = Date.now();
  const target = await db.query.targets.findFirst({ where: eq(targets.id, targetId) });
  if (!target) return { result: "error", reason: "Target no longer exists", changed: 0 };

  const active = await db.query.watches.findMany({
    where: and(eq(watches.targetId, targetId), eq(watches.paused, false)),
  });
  if (active.length === 0) {
    await db.update(targets).set({ nextCheckAt: startedAt + 24 * HOUR }).where(eq(targets.id, targetId));
    return { result: "ok", reason: "No active watches", changed: 0 };
  }

  if (!(await robotsAllows(target.url))) {
    const cls: Classification = { result: "blocked", reason: "Disallowed by robots.txt" };
    await insertCheck(target, { startedAt, result: "robots", reason: cls.reason, watchers: active.length });
    await markFailure(target, active, cls, startedAt);
    return { result: "robots", reason: cls.reason, changed: 0 };
  }

  // A watch that has no baseline yet, or is confirming a possible change, needs a real render.
  const needsRender = Boolean(opts.confirm) || active.some((w) => w.state.pendingHash !== null || w.state.currentHash === null);
  if (!needsRender && !opts.force && (await conditionalUnchanged(target.url, target.etag, target.lastModified))) {
    await insertCheck(target, { startedAt, result: "not_modified", reason: "304 Not Modified", httpStatus: 304, watchers: active.length });
    // A 304 proves the site is reachable again: clear any outage state.
    await db
      .update(targets)
      .set({
        status: "ok",
        statusReason: null,
        consecutiveFailures: 0,
        healthAlerted: false,
        lastOkAt: startedAt,
        lastCheckedAt: startedAt,
        nextCheckAt: nextCheckAt(startedAt, target.intervalMin),
      })
      .where(eq(targets.id, target.id));
    if (target.healthAlerted) {
      const outageKey = String(target.lastOkAt ?? target.createdAt);
      for (const w of active) await recordHealthEvent(w, "up", "Back online", outageKey, startedAt);
    }
    return { result: "not_modified", reason: "304 Not Modified", changed: 0 };
  }

  const out = await render({
    url: target.url,
    views: active.map(viewSpecFor),
    boxSelectors: unique(active.flatMap((w) => w.watchSelectors)),
    textSelectors: unique(active.map((w) => w.numberSelector).filter((s): s is string => Boolean(s))),
    screenshot: true,
  });

  const cls = classifyCheck({
    status: out.status,
    networkError: out.networkError,
    title: out.title,
    text: out.text,
    html: out.html,
    retryAfter: out.retryAfter,
    previousLength: target.lastTextLength,
  });

  if (cls.result !== "ok") {
    await insertCheck(target, { startedAt, result: cls.result, reason: cls.reason, httpStatus: out.status, confirm: opts.confirm, watchers: active.length });
    if (cls.result === "error" && (opts.attempt ?? 1) < (opts.maxAttempts ?? 1)) {
      throw new RetryableCheckError(cls.reason);
    }
    await markFailure(target, active, cls, startedAt);
    return { result: cls.result, reason: cls.reason, retryAfterSec: cls.retryAfterSec, changed: 0 };
  }

  const now = Date.now();
  const viewHashes = active
    .map((w) => `${w.id}:${sha256(normalizeText(out.views[w.id] ?? "", { ignoreLines: w.ignoreLines }))}`)
    .sort();
  const contentHash = sha256(viewHashes.join("\n"));
  const snapshot = await storeSnapshot(target, out, contentHash, now);

  if (target.healthAlerted) {
    const outageKey = String(target.lastOkAt ?? target.createdAt);
    for (const w of active) await recordHealthEvent(w, "up", "Back online", outageKey, now);
  }

  let needsConfirm = false;
  let changed = 0;
  for (const w of active) {
    const evaluation = await evaluateWatch(w, snapshot, out.views[w.id] ?? "", out.regionTexts, now);
    needsConfirm ||= evaluation.needsConfirm;
    if (evaluation.changed) changed++;
  }

  await db
    .update(targets)
    .set({
      status: "ok",
      statusReason: null,
      consecutiveFailures: 0,
      healthAlerted: false,
      lastCheckedAt: now,
      lastOkAt: now,
      ...(changed > 0 ? { lastChangedAt: now } : {}),
      etag: out.serverRendered ? out.etag : null,
      lastModified: out.serverRendered ? out.lastModified : null,
      lastTextLength: out.text.length,
      title: out.title || target.title,
      currentSnapshotId: snapshot.id,
      nextCheckAt: needsConfirm ? now + config.confirmDelayMs : nextCheckAt(now, target.intervalMin),
    })
    .where(eq(targets.id, target.id));

  await insertCheck(target, {
    startedAt,
    result: "ok",
    reason: needsConfirm ? "Possible change — confirming" : "OK",
    httpStatus: out.status,
    contentHash,
    snapshotId: snapshot.id,
    confirm: opts.confirm,
    watchers: active.length,
  });

  return { result: "ok", reason: "OK", changed };
}
