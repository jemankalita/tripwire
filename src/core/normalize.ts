/**
 * Noise normalizers. Volatile fragments (timestamps, relative times, counters,
 * random tokens) are replaced with stable placeholders so that two renders of
 * an unchanged page produce identical text — and an identical hash.
 */

const MONTHS =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAYS =
  "(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const UNITS = "(?:sec(?:ond)?|min(?:ute)?|hr|hour|day|week|month|year)s?";
const COUNTER_NOUNS =
  "(?:views?|likes?|comments?|replies|followers?|subscribers?|watching|visitors?|reads?|shares?|downloads?|online|users? online|people (?:viewing|online|here)|reactions?|stars?|plays?)";

type Rule = readonly [pattern: RegExp, replacement: string];

export const NOISE_RULES: readonly Rule[] = [
  // ISO 8601 date-times and dates
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/gi, "‹datetime›"],
  [/\b\d{4}-\d{2}-\d{2}\b/g, "‹date›"],
  [/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, "‹date›"],
  // "Oct 15, 2026", "15 October 2026", "October 2026", optionally prefixed by weekday
  [new RegExp(`\\b(?:${WEEKDAYS},?\\s+)?${MONTHS}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, "gi"), "‹date›"],
  [new RegExp(`\\b(?:${WEEKDAYS},?\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTHS}\\.?(?:,?\\s+\\d{4})?\\b`, "gi"), "‹date›"],
  [new RegExp(`\\b${MONTHS}\\.?\\s+\\d{4}\\b`, "gi"), "‹date›"],
  // Clock times: 14:05, 2:05:09 pm
  [/\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?(?:\s*(?:utc|gmt|[ecmpa][sd]t|bst|cest?|eest?|ist|jst|kst|aest|aedt|nzst|nzdt))?\b/gi, "‹time›"],
  // Relative times: "5 minutes ago", "an hour ago", "3h ago", "just now"
  [new RegExp(`\\b(?:\\d+|a|an|one|a few)\\s+${UNITS}\\s+ago\\b`, "gi"), "‹ago›"],
  [/\b\d+\s*[smhdw]\s+ago\b/gi, "‹ago›"],
  [/\b(?:just now|moments ago|a moment ago|seconds ago)\b/gi, "‹ago›"],
  [new RegExp(`\\bin\\s+\\d+\\s+${UNITS}\\b`, "gi"), "‹in›"],
  // Unix timestamps (seconds / milliseconds)
  [/\b1[6-9]\d{8}(?:\d{3})?\b/g, "‹ts›"],
  // UUIDs, long hex, random base64-ish tokens (must mix letters and digits)
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "‹id›"],
  [/\b[0-9a-f]{16,}\b/gi, "‹hex›"],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g, "‹token›"],
  // Counters: "1,234 views", "12.5k followers", "Views: 1,234"
  [new RegExp(`\\b\\d[\\d,.\\s]*[kKmM]?\\+?\\s*${COUNTER_NOUNS}\\b`, "gi"), "‹count›"],
  [new RegExp(`\\b${COUNTER_NOUNS}\\s*[:：]?\\s*\\d[\\d,.]*[kKmM]?\\b`, "gi"), "‹count›"],
];

// Bounds regex work on pathological single-line pages (minified text, data dumps).
const MAX_LINE = 4000;

export function normalizeLine(line: string): string {
  const collapsed = line.slice(0, MAX_LINE).replace(/[  -​  　\t ]+/g, " ").trim();
  return NOISE_RULES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), collapsed);
}

export interface NormalizeOptions {
  /** Normalized lines the user explicitly chose to ignore ("ignore this hunk"). */
  ignoreLines?: readonly string[];
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => l.length > 0);
}

export function normalizeText(text: string, options: NormalizeOptions = {}): string {
  const ignore = new Set(options.ignoreLines ?? []);
  return splitLines(text)
    .map(normalizeLine)
    .filter((l) => l.length > 0 && !ignore.has(l))
    .join("\n");
}

export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}
