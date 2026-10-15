import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { changes, numberPoints, versions, watches, type ChangeKind, type Snapshot, type Watch } from "@/db/schema";
import { decide } from "@/core/decide";
import { diffTexts, fingerprintChange, heuristicSummary, measureChange } from "@/core/diff";
import { newId, randomToken, sha256 } from "@/core/hash";
import { firedKeywords, type FiredKeyword } from "@/core/keywords";
import { normalizeText } from "@/core/normalize";
import { numberRuleFires, parseNumber } from "@/core/numbers";
import { enqueue } from "./queue";

const NUMBER_HEARTBEAT_MS = 6 * 60 * 60_000;

export async function latestVersion(watchId: string) {
  return db.query.versions.findFirst({
    where: eq(versions.watchId, watchId),
    orderBy: desc(versions.createdAt),
  });
}

function keywordSummary(fired: FiredKeyword[]): string {
  const first = fired[0];
  const verb = first.mode === "appears" ? "appeared" : "disappeared";
  const more = fired.length > 1 ? ` (+${fired.length - 1} more rule${fired.length > 2 ? "s" : ""})` : "";
  return `“${first.text}” ${verb}${more}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

type InsertChange = {
  watch: Watch;
  kind: ChangeKind;
  dedupeKey: string;
  summary: string;
  alert: boolean;
  fromVersionId?: string | null;
  toVersionId?: string | null;
  fingerprint?: string | null;
  added?: number;
  removed?: number;
  createdAt: number;
};

/** Insert a change once (UNIQUE(watch, dedupeKey)); returns its id only if newly created. */
async function insertChange(input: InsertChange): Promise<string | null> {
  const inserted = await db
    .insert(changes)
    .values({
      id: newId(),
      watchId: input.watch.id,
      kind: input.kind,
      fromVersionId: input.fromVersionId ?? null,
      toVersionId: input.toVersionId ?? null,
      dedupeKey: input.dedupeKey,
      fingerprint: input.fingerprint ?? null,
      summary: input.summary,
      added: input.added ?? 0,
      removed: input.removed ?? 0,
      shareToken: randomToken(),
      alerted: input.alert,
      createdAt: input.createdAt,
    })
    .onConflictDoNothing()
    .returning({ id: changes.id });
  return inserted[0]?.id ?? null;
}

async function trackNumber(w: Watch, snapshot: Snapshot, regionTexts: Record<string, string>, now: number): Promise<boolean> {
  if (!w.numberSelector) return false;
  const raw = regionTexts[w.numberSelector];
  const value = raw === undefined ? null : parseNumber(raw);
  if (value === null) return false;

  const last = await db.query.numberPoints.findFirst({
    where: eq(numberPoints.watchId, w.id),
    orderBy: desc(numberPoints.at),
  });
  if (!last || last.value !== value || now - last.at > NUMBER_HEARTBEAT_MS) {
    await db.insert(numberPoints).values({ id: newId(), watchId: w.id, value, at: now });
  }
  if (!w.numberRule || !last || !numberRuleFires(w.numberRule, last.value, value)) return false;

  const id = await insertChange({
    watch: w,
    kind: "number",
    dedupeKey: `number:${now}:${value}`,
    summary: `${formatNumber(last.value)} → ${formatNumber(value)}`,
    alert: true,
    createdAt: now,
  });
  if (id) await enqueue("notify", { changeId: id }, { dedupeKey: `notify:${id}` });
  return Boolean(id);
}

export type WatchEvaluation = { needsConfirm: boolean; changed: boolean };

/**
 * Apply one watch's view of a fresh snapshot to its alerting state machine,
 * recording versions and changes as the decision dictates.
 */
const sameConfig = (a: Watch, b: Watch) =>
  JSON.stringify([a.watchSelectors, a.ignoreSelectors, a.autoIgnoreSelectors, a.ignoreLines, a.numberSelector]) ===
  JSON.stringify([b.watchSelectors, b.ignoreSelectors, b.autoIgnoreSelectors, b.ignoreLines, b.numberSelector]);

export async function evaluateWatch(
  rendered: Watch,
  snapshot: Snapshot,
  rawView: string,
  regionTexts: Record<string, string>,
  now: number,
): Promise<WatchEvaluation> {
  // The render can take a while; the user may have edited, paused or deleted the watch meanwhile.
  // Use the fresh row's state, and skip if its regions changed (the forced re-check handles it).
  const w = await db.query.watches.findFirst({ where: eq(watches.id, rendered.id) });
  if (!w || w.paused || !sameConfig(w, rendered)) return { needsConfirm: false, changed: false };

  const norm = normalizeText(rawView, { ignoreLines: w.ignoreLines });
  const hash = sha256(norm);
  const current = await latestVersion(w.id);
  const currentNorm = current ? normalizeText(current.text, { ignoreLines: w.ignoreLines }) : "";
  const measure = current ? measureChange(currentNorm, norm) : { changedTokens: 0, totalTokens: 1, ratio: 0 };

  const decision = decide(w.state, { hash, measure, sensitivity: w.sensitivity });

  let newVersionId: string | null = null;
  if (decision.recordVersion) {
    newVersionId = newId();
    await db.insert(versions).values({ id: newVersionId, watchId: w.id, snapshotId: snapshot.id, hash, text: rawView, createdAt: now });
  }

  let changed = false;
  if (decision.kind === "confirmed" && current && newVersionId) {
    const diff = diffTexts(current.text, rawView);
    const fired = firedKeywords(w.keywordRules, current.text, rawView);
    const changeId = await insertChange({
      watch: w,
      kind: fired.length ? "keyword" : "content",
      dedupeKey: `content:${newVersionId}`,
      summary: fired.length ? keywordSummary(fired) : heuristicSummary(diff),
      alert: decision.alert && (!w.keywordOnly || fired.length > 0),
      fromVersionId: current.id,
      toVersionId: newVersionId,
      fingerprint: fingerprintChange(currentNorm, norm),
      added: diff.added,
      removed: diff.removed,
      createdAt: now,
    });
    if (changeId) await enqueue("summarize", { changeId }, { dedupeKey: `summarize:${changeId}` });
    changed = true;
  }

  const numberChanged = await trackNumber(w, snapshot, regionTexts, now);
  const anyChange = changed || numberChanged;

  await db
    .update(watches)
    .set({
      state: decision.next,
      ...(anyChange ? { lastChangedAt: now, unseen: sql`${watches.unseen} + 1` } : {}),
    })
    .where(eq(watches.id, w.id));

  return { needsConfirm: decision.needsConfirm, changed: anyChange };
}

/** Site down / back up. Deduped per outage so a long outage alerts once. */
export async function recordHealthEvent(w: Watch, kind: "down" | "up", reason: string, outageKey: string, now: number): Promise<void> {
  const id = await insertChange({
    watch: w,
    kind,
    dedupeKey: `${kind}:${outageKey}`,
    summary: kind === "down" ? `Unreachable — ${reason}` : "Back online",
    alert: !w.paused,
    createdAt: now,
  });
  if (id) await enqueue("notify", { changeId: id }, { dedupeKey: `notify:${id}` });
}
