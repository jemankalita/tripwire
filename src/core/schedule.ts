export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export const MIN_INTERVAL_MIN = 15;
export const MAX_INTERVAL_MIN = 24 * 60;
export const INTERVAL_PRESETS_MIN = [15, 30, 60, 120, 360, 720, 1440] as const;
export const JITTER = 0.1;

export function clampInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return 60;
  return Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, Math.round(minutes)));
}

/** A Target is checked as often as its most demanding active watcher asks. */
export function effectiveInterval(watchIntervalsMin: readonly number[]): number | null {
  if (watchIntervalsMin.length === 0) return null;
  return clampInterval(Math.min(...watchIntervalsMin));
}

/** Spread checks out so 1,000 watches created at 9:00 don't all fire at 9:15. */
export function nextCheckAt(now: number, intervalMin: number, random: () => number = Math.random): number {
  const base = intervalMin * MINUTE;
  const jitter = (random() * 2 - 1) * JITTER * base;
  return Math.round(now + base + jitter);
}

/** Exponential backoff for failing targets, never faster than the normal interval. */
export function backoffAt(now: number, intervalMin: number, consecutiveFailures: number, retryAfterSec?: number): number {
  const factor = 2 ** Math.min(Math.max(consecutiveFailures - 1, 0), 4);
  const base = Math.min(intervalMin * factor, MAX_INTERVAL_MIN) * MINUTE;
  const retryAfter = (retryAfterSec ?? 0) * 1000;
  return now + Math.max(base, retryAfter);
}

export function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 60 === 0) return minutes === 1440 ? "24h" : `${minutes / 60}h`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
