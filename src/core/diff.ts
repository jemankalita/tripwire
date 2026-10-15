import { diffArrays, diffWordsWithSpace } from "diff";
import { sha256 } from "./hash";
import { normalizeLine, splitLines, tokenize } from "./normalize";

export type WordPart = { type: "same" | "add" | "del"; text: string };

export type DiffLine = {
  type: "ctx" | "add" | "del";
  text: string;
  oldNo?: number;
  newNo?: number;
  /** Word-level highlights, present when a removed line is paired with an added one. */
  words?: WordPart[];
};

export type Hunk = {
  lines: DiffLine[];
  added: number;
  removed: number;
  /** True when the hunk only differs in noise (timestamps, counters, tokens). */
  noise: boolean;
};

export type TextDiff = {
  hunks: Hunk[];
  added: number;
  removed: number;
  noiseHunks: number;
};

const DIFF_TIMEOUT_MS = 1500;

function toLines(oldLines: string[], newLines: string[]): DiffLine[] {
  const changes = diffArrays(oldLines, newLines, { timeout: DIFF_TIMEOUT_MS });
  if (!changes) {
    // Diff gave up (huge rewrite): present it as a full replacement.
    return [
      ...oldLines.map((text, i) => ({ type: "del" as const, text, oldNo: i + 1 })),
      ...newLines.map((text, i) => ({ type: "add" as const, text, newNo: i + 1 })),
    ];
  }

  const result: DiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;
  for (const change of changes) {
    for (const text of change.value) {
      if (change.added) result.push({ type: "add", text, newNo: newNo++ });
      else if (change.removed) result.push({ type: "del", text, oldNo: oldNo++ });
      else result.push({ type: "ctx", text, oldNo: oldNo++, newNo: newNo++ });
    }
  }
  return result;
}

/** Pair runs of removed/added lines and attach word-level highlights. */
function withWordHighlights(lines: DiffLine[]): DiffLine[] {
  const out = lines.map((l) => ({ ...l }));
  let i = 0;
  while (i < out.length) {
    if (out[i].type !== "del") {
      i++;
      continue;
    }
    const delStart = i;
    while (i < out.length && out[i].type === "del") i++;
    const addStart = i;
    while (i < out.length && out[i].type === "add") i++;
    const pairs = Math.min(addStart - delStart, i - addStart);
    for (let k = 0; k < pairs; k++) {
      const del = out[delStart + k];
      const add = out[addStart + k];
      const parts = diffWordsWithSpace(del.text, add.text);
      del.words = parts.filter((p) => !p.added).map((p) => ({ type: p.removed ? "del" : "same", text: p.value }));
      add.words = parts.filter((p) => !p.removed).map((p) => ({ type: p.added ? "add" : "same", text: p.value }));
    }
  }
  return out;
}

function isNoiseHunk(lines: DiffLine[]): boolean {
  const removed = lines.filter((l) => l.type === "del").map((l) => normalizeLine(l.text)).join("\n");
  const added = lines.filter((l) => l.type === "add").map((l) => normalizeLine(l.text)).join("\n");
  return removed === added;
}

export function diffTexts(oldText: string, newText: string, context = 3): TextDiff {
  const lines = withWordHighlights(toLines(splitLines(oldText), splitLines(newText)));
  const changed = lines.map((l, i) => (l.type === "ctx" ? -1 : i)).filter((i) => i >= 0);

  const ranges: Array<[number, number]> = [];
  for (const idx of changed) {
    const start = Math.max(0, idx - context);
    const end = Math.min(lines.length - 1, idx + context);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) ranges[ranges.length - 1] = [last[0], Math.max(last[1], end)];
    else ranges.push([start, end]);
  }

  const hunks: Hunk[] = ranges.map(([start, end]) => {
    const slice = lines.slice(start, end + 1);
    return {
      lines: slice,
      added: slice.filter((l) => l.type === "add").length,
      removed: slice.filter((l) => l.type === "del").length,
      noise: isNoiseHunk(slice),
    };
  });

  const meaningful = hunks.filter((h) => !h.noise);
  return {
    hunks,
    added: meaningful.reduce((n, h) => n + h.added, 0),
    removed: meaningful.reduce((n, h) => n + h.removed, 0),
    noiseHunks: hunks.length - meaningful.length,
  };
}

export type ChangeMeasure = {
  changedTokens: number;
  totalTokens: number;
  ratio: number;
};

/** Size of the change between two *normalized* texts, in whitespace tokens. */
export function measureChange(oldNorm: string, newNorm: string): ChangeMeasure {
  const a = tokenize(oldNorm);
  const b = tokenize(newNorm);
  const totalTokens = Math.max(a.length, b.length, 1);
  const changes = diffArrays(a, b, { timeout: DIFF_TIMEOUT_MS });
  const changedTokens = changes
    ? changes.filter((c) => c.added || c.removed).reduce((n, c) => n + c.value.length, 0)
    : a.length + b.length;
  return { changedTokens, totalTokens, ratio: changedTokens / totalTokens };
}

/**
 * Identity of a change: the sorted set of removed and added normalized lines.
 * The same edit seen twice (retries, flapping back) yields the same fingerprint.
 */
export function fingerprintChange(oldNorm: string, newNorm: string): string {
  const oldSet = new Set(oldNorm.split("\n"));
  const newSet = new Set(newNorm.split("\n"));
  const removed = [...oldSet].filter((l) => !newSet.has(l)).sort();
  const added = [...newSet].filter((l) => !oldSet.has(l)).sort();
  return sha256(`-${removed.join("\n")}\n+${added.join("\n")}`);
}

const MAX_SUMMARY_PAIRS = 2;

/** "was → now" phrases for edited lines (removed lines paired with the added lines that replace them). */
function editPhrases(hunk: Hunk): string[] {
  const dels = hunk.lines.filter((l) => l.type === "del");
  const adds = hunk.lines.filter((l) => l.type === "add");
  return dels.slice(0, adds.length).flatMap((del, i) => {
    const changes = diffArrays(tokenize(del.text), tokenize(adds[i].text)) ?? [];
    const was = changes.filter((c) => c.removed).flatMap((c) => c.value).join(" ");
    const now = changes.filter((c) => c.added).flatMap((c) => c.value).join(" ");
    return was && now && was.length < 60 && now.length < 60 ? [`“${was}” → “${now}”`] : [];
  });
}

/** One-line, AI-free fallback summary built from the meaningful hunks. */
export function heuristicSummary(diff: TextDiff): string {
  const meaningful = diff.hunks.filter((h) => !h.noise);
  const hunk = meaningful[0];
  if (!hunk) return "Only noise changed";
  const phrases = meaningful.flatMap(editPhrases);
  if (phrases.length) return phrases.slice(0, MAX_SUMMARY_PAIRS).join(" · ");
  const del = hunk.lines.find((l) => l.type === "del");
  const add = hunk.lines.find((l) => l.type === "add");
  const clip = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}…` : s);
  if (add && del) return `Changed: “${clip(add.text)}”`;
  if (add) return `Added: “${clip(add.text)}”`;
  if (del) return `Removed: “${clip(del.text)}”`;
  return `${diff.added} added, ${diff.removed} removed`;
}
