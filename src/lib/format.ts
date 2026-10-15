export { formatInterval } from "@/core/schedule";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return "never";
  const delta = now - ms;
  const future = delta < 0;
  const abs = Math.abs(delta);
  const wrap = (s: string) => (future ? `in ${s}` : `${s} ago`);
  if (abs < 45_000) return future ? "in a moment" : "just now";
  if (abs < HOUR) return wrap(`${Math.round(abs / MINUTE)}m`);
  if (abs < DAY) return wrap(`${Math.round(abs / HOUR)}h`);
  if (abs < 7 * DAY) return wrap(`${Math.round(abs / DAY)}d`);
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function absoluteTime(ms: number | null | undefined): string {
  if (!ms) return "Never";
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function duration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function percent(ratio: number | null | undefined): string {
  if (ratio == null) return "—";
  const p = ratio * 100;
  return `${p < 0.1 && p > 0 ? "<0.1" : p.toFixed(p < 10 ? 1 : 0)}%`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}
