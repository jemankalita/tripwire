"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { api, useDiff, useVisual } from "@/lib/api";
import { absoluteTime } from "@/lib/format";
import { Button, Segmented, Skeleton } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { HunkTable } from "@/components/diff/DiffLines";
import { isTypingTarget } from "../AppShell";
import { SideBySide, SliderCompare, VisualDiffView } from "./VisualViews";

type Tab = "text" | "visual" | "side" | "slider";
const TABS: Tab[] = ["text", "visual", "side", "slider"];

export function DiffViewer({ watchId, fromId, toId, onIgnored }: { watchId: string; fromId: string; toId: string; onIgnored: () => void }) {
  const [tab, setTab] = useState<Tab>("text");
  const [layout, setLayout] = useState<"inline" | "split">("inline");
  const [showNoise, setShowNoise] = useState(false);
  const [ignoring, setIgnoring] = useState<number | null>(null);
  const reduced = useReducedMotion();
  const toast = useToast();
  const { data: diff, error, isLoading } = useDiff(watchId, fromId, toId);
  const { data: visual, isLoading: visualLoading } = useVisual(watchId, fromId, toId, tab === "visual");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.key !== "d") return;
      setTab((t) => TABS[(TABS.indexOf(t) + 1) % TABS.length]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ignoreHunk = async (index: number) => {
    const hunk = diff?.diff.hunks[index];
    if (!hunk) return;
    const lines = hunk.lines.filter((l) => l.type !== "ctx").map((l) => l.text);
    setIgnoring(index);
    try {
      await api(`/api/watches/${watchId}/ignore`, { method: "POST", body: { lines } });
      toast({ tone: "success", title: "Those lines are now ignored", description: "Future changes to them won’t alert you." });
      onIgnored();
    } catch (err) {
      toast({ tone: "error", title: "Couldn’t update ignore rules", description: (err as Error).message });
    } finally {
      setIgnoring(null);
    }
  };

  const hunks = diff?.diff.hunks ?? [];
  const visibleHunks = hunks.map((h, i) => ({ h, i })).filter(({ h }) => showNoise || !h.noise);

  return (
    <section aria-label="Changes between versions" className="relative min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          name="diff-tab"
          label="Diff view"
          value={tab}
          onChange={setTab}
          options={[
            { value: "text", label: "Text" },
            { value: "visual", label: "Visual" },
            { value: "side", label: "Side by side" },
            { value: "slider", label: "Slider" },
          ]}
        />
        {diff && (
          <p className="text-[12.5px] text-muted">
            <span className="inline-flex size-4 items-center justify-center rounded-[3px] bg-ink text-[10.5px] font-semibold text-bg">A</span> {absoluteTime(diff.from.createdAt)} →{" "}
            <span className="inline-flex size-4 items-center justify-center rounded-[3px] bg-accent text-[10.5px] font-semibold text-accent-ink">B</span> {absoluteTime(diff.to.createdAt)}
          </p>
        )}
      </div>

      <div className="relative mt-4 overflow-hidden">
        {!reduced && (
          <motion.div
            key={`${fromId}-${toId}-${tab}`}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-accent/10 shadow-[0_2px_0_var(--accent)]"
            initial={{ y: -100, opacity: 1 }}
            animate={{ y: 900, opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        {error && <p className="rounded-[8px] bg-error-soft px-4 py-3 text-sm text-error">{error.message}</p>}
        {isLoading && !diff && <Skeleton className="h-80" />}

        {diff && tab === "text" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <span>
                <b className="font-medium text-add-ink dark:text-ok">+{diff.diff.added}</b> <b className="font-medium text-del-ink dark:text-error">−{diff.diff.removed}</b> lines
              </span>
              {diff.diff.noiseHunks > 0 && (
                <button type="button" onClick={() => setShowNoise((s) => !s)} className="text-accent hover:underline">
                  {showNoise ? "Hide" : "Show"} {diff.diff.noiseHunks} noise-only change{diff.diff.noiseHunks === 1 ? "" : "s"}
                </button>
              )}
              <span className="ml-auto">
                <Segmented
                  name="diff-layout"
                  label="Diff layout"
                  size="sm"
                  value={layout}
                  onChange={setLayout}
                  options={[
                    { value: "inline", label: "Inline" },
                    { value: "split", label: "Split" },
                  ]}
                />
              </span>
            </div>
            {visibleHunks.length === 0 ? (
              <p className="rounded-[8px] bg-panel px-4 py-8 text-center text-sm text-muted">
                {hunks.length ? "Only noise differs between these versions." : "These versions have identical text."}
              </p>
            ) : (
              visibleHunks.map(({ h, i }) => (
                <HunkTable
                  key={i}
                  hunk={h}
                  layout={layout}
                  actions={
                    !h.noise && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[12px]" loading={ignoring === i} onClick={() => ignoreHunk(i)}>
                        Ignore these lines
                      </Button>
                    )
                  }
                />
              ))
            )}
          </div>
        )}
        {tab === "visual" && <VisualDiffView visual={visual} loading={visualLoading} />}
        {diff && tab === "side" && <SideBySide diff={diff} />}
        {diff && tab === "slider" && <SliderCompare diff={diff} />}
      </div>
    </section>
  );
}
