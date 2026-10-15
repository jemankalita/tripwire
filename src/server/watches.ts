import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  changes,
  checks,
  numberPoints,
  previews,
  snapshots,
  targets,
  versions,
  watches,
  type Change,
  type Target,
  type Watch,
} from "@/db/schema";
import { INITIAL_STATE } from "@/core/decide";
import { diffTexts } from "@/core/diff";
import { newId, randomToken, sha256 } from "@/core/hash";
import { normalizeLine, normalizeText } from "@/core/normalize";
import { effectiveInterval, HOUR } from "@/core/schedule";
import { assertPublicUrl } from "@/core/ssrf";
import { displayUrl, hostOf, normalizeUrl } from "@/core/url";
import { config } from "./config";
import { HttpError } from "./http";
import { enqueue } from "./queue";
import type { CreateWatchInput, UpdateWatchInput } from "./schemas";
import { blobUrl } from "./storage";
import { visualDiff } from "./visualdiff";

const MAX_WATCHES_PER_USER = 100;
const PULSE_BUCKETS = 28;
const PULSE_BUCKET_MS = 12 * HOUR;

export type WatchStatus = "ok" | "changed" | "error" | "blocked" | "pending" | "paused";

function statusOf(w: Watch, t: Target): WatchStatus {
  if (w.paused) return "paused";
  if (t.status === "error" || t.status === "blocked") return t.status;
  if (t.status === "pending") return "pending";
  return w.unseen > 0 ? "changed" : "ok";
}

export function serializeWatch(w: Watch, t: Target) {
  return {
    id: w.id,
    name: w.name,
    url: t.url,
    displayUrl: displayUrl(t.url),
    host: t.host,
    status: statusOf(w, t),
    statusReason: t.statusReason,
    paused: w.paused,
    intervalMin: w.intervalMin,
    effectiveIntervalMin: t.intervalMin,
    sensitivity: w.sensitivity,
    lastCheckedAt: t.lastCheckedAt,
    lastChangedAt: w.lastChangedAt,
    nextCheckAt: t.nextCheckAt,
    unseen: w.unseen,
    flapping: w.state.flapping,
    confirming: w.state.pendingHash !== null,
    digest: w.digest,
    keywordOnly: w.keywordOnly,
    createdAt: w.createdAt,
  };
}

export type WatchSummary = ReturnType<typeof serializeWatch> & {
  sharedWith: number;
  lastSummary: string | null;
  thumbUrl: string | null;
  pulse: { changes: number[]; failures: number[] };
};

export async function requireWatch(userId: string, id: string): Promise<{ watch: Watch; target: Target }> {
  const [row] = await db
    .select({ watch: watches, target: targets })
    .from(watches)
    .innerJoin(targets, eq(watches.targetId, targets.id))
    .where(and(eq(watches.id, id), eq(watches.userId, userId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Watch not found");
  return row;
}

function bucketOf(at: number, since: number): number {
  return Math.min(PULSE_BUCKETS - 1, Math.max(0, Math.floor((at - since) / PULSE_BUCKET_MS)));
}

export async function listWatches(userId: string): Promise<WatchSummary[]> {
  const rows = await db
    .select({ watch: watches, target: targets })
    .from(watches)
    .innerJoin(targets, eq(watches.targetId, targets.id))
    .where(eq(watches.userId, userId))
    .orderBy(desc(watches.createdAt));
  if (rows.length === 0) return [];

  const watchIds = rows.map((r) => r.watch.id);
  const targetIds = [...new Set(rows.map((r) => r.target.id))];
  const snapshotIds = rows.map((r) => r.target.currentSnapshotId).filter((s): s is string => Boolean(s));
  const since = Date.now() - PULSE_BUCKETS * PULSE_BUCKET_MS;

  const [shareCounts, recentChanges, latestChanges, failures, snaps] = await Promise.all([
    db
      .select({ targetId: watches.targetId, n: sql<number>`count(*)` })
      .from(watches)
      .where(inArray(watches.targetId, targetIds))
      .groupBy(watches.targetId),
    db
      .select({ watchId: changes.watchId, createdAt: changes.createdAt })
      .from(changes)
      .where(and(inArray(changes.watchId, watchIds), gte(changes.createdAt, since), inArray(changes.kind, ["content", "keyword", "number"]))),
    db
      .select({ watchId: changes.watchId, summary: changes.summary, aiSummary: changes.aiSummary, createdAt: changes.createdAt })
      .from(changes)
      .where(and(inArray(changes.watchId, watchIds), inArray(changes.kind, ["content", "keyword", "number"])))
      .orderBy(desc(changes.createdAt))
      .limit(500),
    db
      .select({ targetId: checks.targetId, startedAt: checks.startedAt })
      .from(checks)
      .where(and(inArray(checks.targetId, targetIds), gte(checks.startedAt, since), inArray(checks.result, ["error", "blocked", "robots"]))),
    snapshotIds.length
      ? db.select({ id: snapshots.id, key: snapshots.screenshotKey }).from(snapshots).where(inArray(snapshots.id, snapshotIds))
      : Promise.resolve([]),
  ]);

  const shared = new Map(shareCounts.map((s) => [s.targetId, Number(s.n)]));
  const thumbs = new Map(snaps.map((s) => [s.id, s.key]));
  const latest = new Map<string, string>();
  for (const c of latestChanges) if (!latest.has(c.watchId)) latest.set(c.watchId, c.aiSummary ?? c.summary);

  return rows.map(({ watch, target }) => {
    const changeBuckets = Array<number>(PULSE_BUCKETS).fill(0);
    const failureBuckets = Array<number>(PULSE_BUCKETS).fill(0);
    for (const c of recentChanges) if (c.watchId === watch.id) changeBuckets[bucketOf(c.createdAt, since)]++;
    for (const f of failures) if (f.targetId === target.id) failureBuckets[bucketOf(f.startedAt, since)]++;
    return {
      ...serializeWatch(watch, target),
      sharedWith: Math.max(0, (shared.get(target.id) ?? 1) - 1),
      lastSummary: latest.get(watch.id) ?? null,
      thumbUrl: blobUrl(target.currentSnapshotId ? thumbs.get(target.currentSnapshotId) : null),
      pulse: { changes: changeBuckets, failures: failureBuckets },
    };
  });
}

function serializeChange(c: Change) {
  return {
    id: c.id,
    kind: c.kind,
    summary: c.aiSummary ?? c.summary,
    heuristicSummary: c.summary,
    fromVersionId: c.fromVersionId,
    toVersionId: c.toVersionId,
    added: c.added,
    removed: c.removed,
    visualRatio: c.visualRatio,
    alerted: c.alerted,
    shareUrl: `/share/${c.shareToken}`,
    createdAt: c.createdAt,
  };
}

export async function getWatchDetail(userId: string, id: string) {
  const { watch, target } = await requireWatch(userId, id);

  const [versionRows, changeRows, checkRows, points, sharedCount] = await Promise.all([
    db
      .select({ id: versions.id, createdAt: versions.createdAt, snapshotId: versions.snapshotId, key: snapshots.screenshotKey, height: snapshots.height })
      .from(versions)
      .innerJoin(snapshots, eq(versions.snapshotId, snapshots.id))
      .where(eq(versions.watchId, watch.id))
      .orderBy(desc(versions.createdAt))
      .limit(200),
    db.select().from(changes).where(eq(changes.watchId, watch.id)).orderBy(desc(changes.createdAt)).limit(200),
    db.select().from(checks).where(eq(checks.targetId, target.id)).orderBy(desc(checks.startedAt)).limit(60),
    db.select({ value: numberPoints.value, at: numberPoints.at }).from(numberPoints).where(eq(numberPoints.watchId, watch.id)).orderBy(asc(numberPoints.at)).limit(1000),
    db.select({ n: sql<number>`count(*)` }).from(watches).where(eq(watches.targetId, target.id)),
  ]);

  if (watch.unseen > 0) await db.update(watches).set({ unseen: 0 }).where(eq(watches.id, watch.id));

  const changeByVersion = new Map(changeRows.filter((c) => c.toVersionId).map((c) => [c.toVersionId!, c]));
  return {
    ...serializeWatch(watch, target),
    sharedWith: Math.max(0, Number(sharedCount[0]?.n ?? 1) - 1),
    config: {
      watchSelectors: watch.watchSelectors,
      ignoreSelectors: watch.ignoreSelectors,
      autoIgnoreSelectors: watch.autoIgnoreSelectors,
      ignoreLines: watch.ignoreLines,
      keywordRules: watch.keywordRules,
      numberSelector: watch.numberSelector,
      numberRule: watch.numberRule,
    },
    feedUrl: `/feeds/${watch.feedToken}`,
    versions: versionRows.map((v) => {
      const change = changeByVersion.get(v.id);
      return {
        id: v.id,
        createdAt: v.createdAt,
        screenshotUrl: blobUrl(v.key),
        height: v.height,
        change: change ? serializeChange(change) : null,
      };
    }),
    events: changeRows.map(serializeChange),
    checks: checkRows.map((c) => ({
      id: c.id,
      startedAt: c.startedAt,
      durationMs: c.durationMs,
      result: c.result,
      reason: c.reason,
      httpStatus: c.httpStatus,
      watchers: c.watchers,
      confirm: c.confirm,
    })),
    numbers: points,
  };
}

async function versionPair(watchId: string, fromId: string, toId: string) {
  const rows = await db
    .select({ version: versions, snapshot: snapshots })
    .from(versions)
    .innerJoin(snapshots, eq(versions.snapshotId, snapshots.id))
    .where(and(eq(versions.watchId, watchId), inArray(versions.id, [fromId, toId])));
  const from = rows.find((r) => r.version.id === fromId);
  const to = rows.find((r) => r.version.id === toId);
  if (!from || !to) throw new HttpError(404, "Version not found");
  return { from, to };
}

export async function diffBetween(userId: string, watchId: string, fromId: string, toId: string) {
  const { watch } = await requireWatch(userId, watchId);
  const { from, to } = await versionPair(watch.id, fromId, toId);
  const side = (r: typeof from) => ({
    id: r.version.id,
    createdAt: r.version.createdAt,
    screenshotUrl: blobUrl(r.snapshot.screenshotKey),
    width: r.snapshot.width,
    height: r.snapshot.height,
  });
  return {
    from: side(from),
    to: side(to),
    diff: diffTexts(from.version.text, to.version.text),
    regions: Object.entries(to.snapshot.boxes)
      .filter(([sel]) => watch.watchSelectors.includes(sel))
      .map(([selector, box]) => ({ selector, box })),
  };
}

export async function visualBetween(userId: string, watchId: string, fromId: string, toId: string) {
  const { watch } = await requireWatch(userId, watchId);
  const { from, to } = await versionPair(watch.id, fromId, toId);
  const a = from.snapshot.screenshotKey;
  const b = to.snapshot.screenshotKey;
  if (!a || !b) throw new HttpError(404, "No screenshots for these versions");
  if (a === b) return { ratio: 0, boxes: [], diffUrl: null, width: from.snapshot.width, height: from.snapshot.height, beforeUrl: blobUrl(a), afterUrl: blobUrl(b) };
  const visual = await visualDiff(a, b);
  if (!visual) throw new HttpError(404, "Screenshots are no longer available");
  return { ...visual, diffUrl: blobUrl(visual.diffKey), beforeUrl: blobUrl(a), afterUrl: blobUrl(b) };
}

async function recomputeTarget(targetId: string): Promise<void> {
  const active = await db
    .select({ intervalMin: watches.intervalMin })
    .from(watches)
    .where(and(eq(watches.targetId, targetId), eq(watches.paused, false)));
  const interval = effectiveInterval(active.map((a) => a.intervalMin));
  if (interval !== null) await db.update(targets).set({ intervalMin: interval }).where(eq(targets.id, targetId));
}

export async function scheduleCheck(target: Target, opts: { force?: boolean; delayMs?: number } = {}): Promise<void> {
  await enqueue(
    "check",
    { targetId: target.id, force: Boolean(opts.force) },
    { host: target.host, dedupeKey: `check:${target.id}`, runAt: Date.now() + (opts.delayMs ?? 0) },
  );
}

export async function createWatch(userId: string, input: CreateWatchInput) {
  const url = normalizeUrl(input.url);
  await assertPublicUrl(url);

  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(watches).where(eq(watches.userId, userId));
  if (Number(n) >= MAX_WATCHES_PER_USER) throw new HttpError(422, `You can watch up to ${MAX_WATCHES_PER_USER} pages`);

  const preview = input.previewId
    ? await db.query.previews.findFirst({ where: and(eq(previews.id, input.previewId), eq(previews.userId, userId)) })
    : undefined;

  const now = Date.now();
  await db
    .insert(targets)
    .values({ id: newId(), url, host: hostOf(url), nextCheckAt: now, intervalMin: input.intervalMin, createdAt: now })
    .onConflictDoNothing();
  const target = await db.query.targets.findFirst({ where: eq(targets.url, url) });
  if (!target) throw new Error("Target upsert failed");

  const id = newId();
  await db.insert(watches).values({
    id,
    userId,
    targetId: target.id,
    name: input.name || preview?.title?.slice(0, 120) || displayUrl(url),
    intervalMin: input.intervalMin,
    sensitivity: input.sensitivity,
    watchSelectors: input.watchSelectors,
    ignoreSelectors: input.ignoreSelectors,
    autoIgnoreSelectors: input.autoIgnoreSelectors,
    ignoreLines: [],
    keywordRules: input.keywordRules,
    keywordOnly: input.keywordOnly,
    numberSelector: input.numberSelector,
    numberRule: input.numberRule,
    digest: input.digest,
    paused: false,
    state: INITIAL_STATE,
    feedToken: randomToken(),
    createdAt: now,
  });

  await recomputeTarget(target.id);
  await scheduleCheck(target);
  return requireWatch(userId, id);
}

const SELECTOR_FIELDS = ["watchSelectors", "ignoreSelectors", "autoIgnoreSelectors"] as const;

export async function updateWatch(userId: string, id: string, patch: UpdateWatchInput) {
  const { watch, target } = await requireWatch(userId, id);
  const selectorsChanged = SELECTOR_FIELDS.some(
    (f) => patch[f] !== undefined && JSON.stringify(patch[f]) !== JSON.stringify(watch[f]),
  );
  const resumed = patch.paused === false && watch.paused;

  await db
    .update(watches)
    .set({
      ...patch,
      // A new region definition starts a new baseline instead of alerting on the switch.
      ...(selectorsChanged ? { state: INITIAL_STATE } : {}),
    })
    .where(eq(watches.id, watch.id));

  await recomputeTarget(target.id);
  if (selectorsChanged || resumed) await scheduleCheck(target, { force: true });
  return requireWatch(userId, id);
}

/** "Ignore this hunk": add normalized lines to the watch's ignore list and re-baseline its hash. */
export async function ignoreLines(userId: string, id: string, lines: string[]) {
  const { watch } = await requireWatch(userId, id);
  const additions = lines.map(normalizeLine).filter((l) => l.length > 0);
  const ignore = [...new Set([...watch.ignoreLines, ...additions])].slice(0, 500);

  const latest = await db.query.versions.findFirst({ where: eq(versions.watchId, watch.id), orderBy: desc(versions.createdAt) });
  const currentHash = latest ? sha256(normalizeText(latest.text, { ignoreLines: ignore })) : watch.state.currentHash;
  await db
    .update(watches)
    .set({ ignoreLines: ignore, state: { ...watch.state, currentHash, pendingHash: null } })
    .where(eq(watches.id, watch.id));
  return { ignoreLines: ignore };
}

export async function deleteWatch(userId: string, id: string): Promise<void> {
  const { watch, target } = await requireWatch(userId, id);
  await db.delete(watches).where(eq(watches.id, watch.id));
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(watches).where(eq(watches.targetId, target.id));
  if (Number(n) === 0) await db.delete(targets).where(eq(targets.id, target.id));
  else await recomputeTarget(target.id);
}

export async function checkNow(userId: string, id: string): Promise<{ queued: true; confirmDelayMs: number }> {
  const { target } = await requireWatch(userId, id);
  await scheduleCheck(target, { force: true });
  return { queued: true, confirmDelayMs: config.confirmDelayMs };
}
