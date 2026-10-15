"use client";

import { motion } from "motion/react";
import type { WatchDetail } from "@/lib/api";
import { absoluteTime, relativeTime, shortTime } from "@/lib/format";
import { cn } from "@/components/ui/controls";

type Version = WatchDetail["versions"][number];

function Badge({ children, tone }: { children: string; tone: "a" | "b" }) {
  return (
    <span
      className={cn(
        "inline-flex size-5 items-center justify-center rounded-[4px] text-[11px] font-semibold",
        tone === "b" ? "bg-accent text-accent-ink" : "bg-ink text-bg",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Version rail. Click a version to view it (B); use "Compare from here" to set
 * the other side (A). The rail is the watch's change history at a glance.
 */
export function Timeline({
  versions,
  fromId,
  toId,
  onSelect,
  onCompareFrom,
}: {
  versions: Version[];
  fromId: string | null;
  toId: string | null;
  onSelect: (id: string) => void;
  onCompareFrom: (id: string) => void;
}) {
  return (
    <nav aria-label="Versions" className="lg:sticky lg:top-20 lg:self-start">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-medium">Versions</h2>
        <span className="text-[12.5px] text-muted tabular">{versions.length}</span>
      </div>
      <ol className="relative flex max-h-[70vh] flex-col gap-1 overflow-y-auto pr-1">
        {versions.map((v, i) => {
          const isTo = v.id === toId;
          const isFrom = v.id === fromId;
          const baseline = i === versions.length - 1;
          return (
            <motion.li key={v.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
              <div className={cn("group relative rounded-[8px] transition-colors", isTo ? "bg-accent-soft" : isFrom ? "bg-surface" : "hover:bg-panel")}>
                <button type="button" onClick={() => onSelect(v.id)} className="block w-full rounded-[8px] px-3 py-2.5 pr-12 text-left" aria-pressed={isTo}>
                  <span className="flex items-center gap-2 text-[12.5px] text-muted">
                    <span className={cn("size-2 shrink-0 rounded-full", baseline ? "bg-faint" : v.change?.kind === "keyword" ? "bg-accent" : "bg-changed")} />
                    <time dateTime={new Date(v.createdAt).toISOString()} title={absoluteTime(v.createdAt)}>
                      {i < 3 ? relativeTime(v.createdAt) : shortTime(v.createdAt)}
                    </time>
                    {v.change && (
                      <span className="ml-auto tabular">
                        <span className="text-add-ink dark:text-ok">+{v.change.added}</span> <span className="text-del-ink dark:text-error">−{v.change.removed}</span>
                      </span>
                    )}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[13.5px] text-ink">{baseline ? "Baseline snapshot" : (v.change?.summary ?? "Version recorded")}</span>
                </button>
                <span className="absolute top-2.5 right-2.5 flex gap-1">
                  {isFrom && <Badge tone="a">A</Badge>}
                  {isTo && <Badge tone="b">B</Badge>}
                </span>
                {!isTo && !isFrom && (
                  <button
                    type="button"
                    onClick={() => onCompareFrom(v.id)}
                    className="absolute right-2 bottom-2 rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    Compare from here
                  </button>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </nav>
  );
}
