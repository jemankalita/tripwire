"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "./controls";

export type Status = "ok" | "changed" | "error" | "blocked" | "pending" | "paused";

/**
 * Every glyph is the same five-point polyline, so state changes morph from one
 * shape to the next instead of swapping icons.
 */
const PATHS: Record<Status, string> = {
  ok: "M4 12.5 L6.75 15.25 L9.5 18 L14.75 12 L20 6",
  changed: "M3 13 L8.5 13 L11.5 5.5 L15 18.5 L21 13",
  error: "M6.5 6.5 L17.5 17.5 L12 12 L17.5 6.5 L6.5 17.5",
  blocked: "M7 7 L17 7 L17 17 L7 17 L7 7",
  pending: "M5 12 L8.5 12 L12 12 L15.5 12 L19 12",
  paused: "M5 12 L8.5 12 L12 12 L15.5 12 L19 12",
};

export const STATUS_META: Record<Status, { label: string; text: string; soft: string; description: string }> = {
  ok: { label: "Watching", text: "text-ok", soft: "bg-ok-soft", description: "Checked recently, no unseen changes" },
  changed: { label: "Changed", text: "text-changed", soft: "bg-changed-soft", description: "A meaningful change you haven't opened yet" },
  error: { label: "Error", text: "text-error", soft: "bg-error-soft", description: "The page failed to load (outage, timeout or HTTP error)" },
  blocked: { label: "Blocked", text: "text-blocked", soft: "bg-blocked-soft", description: "Bot wall, CAPTCHA, login or robots.txt" },
  pending: { label: "First check", text: "text-accent", soft: "bg-accent-soft", description: "Waiting for its first check" },
  paused: { label: "Paused", text: "text-muted", soft: "bg-ink/[0.06]", description: "Not being checked" },
};

export function MorphIcon({ status, size = 16, className }: { status: Status; size?: number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className={cn(status === "pending" && "breathe", className)}
    >
      <motion.path
        initial={false}
        animate={{ d: PATHS[status] }}
        transition={reduced ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatusPill({ status, reason, className }: { status: Status; reason?: string | null; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      title={reason ?? meta.description}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full pr-2.5 pl-2 text-[12.5px] font-medium whitespace-nowrap transition-colors duration-300",
        meta.soft,
        meta.text,
        className,
      )}
    >
      <MorphIcon status={status} size={14} />
      {meta.label}
    </span>
  );
}
