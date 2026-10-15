"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { Ref } from "react";
import type { WatchSummary } from "@/lib/api";
import { formatInterval, relativeTime, absoluteTime } from "@/lib/format";
import { cn } from "@/components/ui/controls";
import { MorphIcon, STATUS_META } from "@/components/ui/status";
import { PulseLine } from "@/components/ui/PulseLine";

function Detail({ watch }: { watch: WatchSummary }) {
  if (watch.status === "error" || watch.status === "blocked") {
    return <span className={STATUS_META[watch.status].text}>{watch.statusReason ?? STATUS_META[watch.status].description}</span>;
  }
  if (watch.confirming) return <span className="breathe text-accent">Possible change — confirming with a second render</span>;
  if (watch.flapping) return <span className="text-changed">Alerts muted: this page changes on almost every load</span>;
  if (watch.status === "pending") return <span className="text-muted">Taking the first snapshot…</span>;
  if (watch.lastSummary) return <span className="text-ink">{watch.lastSummary}</span>;
  return <span className="text-muted">No changes yet</span>;
}

export function WatchRow({ watch, linkRef }: { watch: WatchSummary; linkRef?: Ref<HTMLAnchorElement> }) {
  const meta = STATUS_META[watch.status];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ type: "spring", bounce: 0, duration: 0.45 }}
    >
      <Link
        ref={linkRef}
        href={`/app/w/${watch.id}`}
        className={cn(
          "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 rounded-[10px] px-4 py-3.5 transition-colors duration-150",
          "lg:grid-cols-[minmax(0,1.5fr)_150px_minmax(0,1.5fr)_120px_24px]",
          watch.status === "changed" ? "bg-changed-soft hover:bg-changed-soft/80" : "hover:bg-panel focus-visible:bg-panel",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", meta.soft, meta.text)} title={meta.label}>
            <MorphIcon status={watch.status} size={16} />
            <span className="sr-only">{meta.label}</span>
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">
              {watch.name}
              {watch.unseen > 0 && (
                <span className="ml-2 rounded-full bg-changed px-1.5 py-0.5 align-[2px] text-[11.5px] font-semibold text-bg tabular">
                  {watch.unseen}
                </span>
              )}
            </p>
            <p className="truncate font-mono text-[12px] text-muted">{watch.displayUrl}</p>
          </div>
        </div>

        <div className="hidden lg:block">
          <PulseLine changes={watch.pulse.changes} failures={watch.pulse.failures} width={150} height={28} />
        </div>

        <div className="col-span-2 min-w-0 text-[13.5px] lg:col-span-1">
          <p className="truncate">
            <Detail watch={watch} />
          </p>
          <p className="text-[12.5px] text-muted" title={absoluteTime(watch.lastChangedAt)}>
            {watch.lastChangedAt ? `Changed ${relativeTime(watch.lastChangedAt)}` : `Added ${relativeTime(watch.createdAt)}`}
          </p>
        </div>

        <div className="hidden text-right text-[12.5px] text-muted lg:block">
          <p className="tabular" title={absoluteTime(watch.lastCheckedAt)}>
            {watch.lastCheckedAt ? `Checked ${relativeTime(watch.lastCheckedAt)}` : "Not checked yet"}
          </p>
          <p>
            Every {formatInterval(watch.intervalMin)}
            {watch.sharedWith > 0 && <span title="This page is fetched once for everyone watching it"> · shared</span>}
          </p>
        </div>

        <svg viewBox="0 0 24 24" className="hidden size-5 text-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink lg:block" aria-hidden>
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </motion.li>
  );
}
