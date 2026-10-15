"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { DiffResult, VisualResult } from "@/lib/api";
import { percent } from "@/lib/format";
import { useElementWidth } from "@/lib/useElementWidth";
import { Switch, Skeleton } from "@/components/ui/controls";

/* eslint-disable @next/next/no-img-element -- screenshots are content-addressed blobs with known sizes */

export function VisualDiffView({ visual, loading }: { visual?: VisualResult; loading: boolean }) {
  const [heat, setHeat] = useState(true);
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const scroller = useRef<HTMLDivElement>(null);
  if (!visual) return loading ? <Skeleton className="h-[480px]" /> : <p className="text-sm text-muted">No screenshots for these versions.</p>;
  const scale = width / (visual.width ?? 1280);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <b className="font-medium">{percent(visual.ratio)}</b> of pixels changed · {visual.boxes.length} region{visual.boxes.length === 1 ? "" : "s"}
        </p>
        <div className="w-56">
          <Switch checked={heat} onChange={setHeat} label="Heat map" />
        </div>
      </div>
      <div ref={scroller} className="max-h-[70vh] overflow-y-auto rounded-[8px] bg-surface" data-ui>
        <div ref={boxRef} className="relative">
          {/* Heat map = pixelmatch output: the page faded, changed pixels in colour. */}
          <img src={(heat && visual.diffUrl) || visual.afterUrl || ""} alt={heat ? "Changed pixels highlighted on the newer version" : "Newer version"} className="block w-full" />
          {visual.boxes.map((b, i) => (
            <div
              key={i}
              className="pointer-events-none absolute rounded-[3px] shadow-[inset_0_0_0_2px_var(--accent),0_0_0_3px_rgb(36_86_214/0.18)]"
              style={{ left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale }}
            />
          ))}
        </div>
      </div>
      {visual.boxes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visual.boxes.slice(0, 12).map((b, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scroller.current?.scrollTo({ top: Math.max(0, b.y * scale - 48), behavior: "smooth" })}
              className="rounded-full bg-surface px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:text-ink"
            >
              Region {i + 1} · y {Math.round(b.y)}px
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SideBySide({ diff }: { diff: DiffResult }) {
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) return;
    syncing.current = true;
    to.scrollTop = from.scrollTop;
    requestAnimationFrame(() => (syncing.current = false));
  };
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { ref: left, other: right, src: diff.from.screenshotUrl, label: "A · older" },
        { ref: right, other: left, src: diff.to.screenshotUrl, label: "B · newer" },
      ].map((side) => (
        <figure key={side.label} className="min-w-0">
          <figcaption className="mb-1.5 text-[12.5px] text-muted">{side.label}</figcaption>
          <div ref={side.ref} onScroll={() => sync(side.ref.current, side.other.current)} className="max-h-[70vh] overflow-y-auto rounded-[8px] bg-surface" data-ui>
            {side.src ? <img src={side.src} alt={side.label} className="block w-full" /> : <p className="p-6 text-sm text-muted">No screenshot</p>}
          </div>
        </figure>
      ))}
    </div>
  );
}

export function SliderCompare({ diff }: { diff: DiffResult }) {
  const [pos, setPos] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (e: PointerEvent) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - (e.shiftKey ? 10 : 2)));
    if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + (e.shiftKey ? 10 : 2)));
  };

  if (!diff.from.screenshotUrl || !diff.to.screenshotUrl) return <p className="text-sm text-muted">Screenshots unavailable.</p>;
  return (
    <div className="max-h-[70vh] overflow-y-auto rounded-[8px] bg-surface" data-ui>
      <div
        ref={frame}
        className="relative cursor-ew-resize touch-none select-none"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
      >
        <img src={diff.to.screenshotUrl} alt="Newer version" className="block w-full" draggable={false} />
        <img
          src={diff.from.screenshotUrl}
          alt="Older version"
          className="absolute inset-0 block w-full"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          draggable={false}
        />
        <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${pos}%` }}>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Before and after divider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            onKeyDown={onKey}
            className="sticky top-1/3 -ml-[15px] flex size-8 items-center justify-center rounded-full bg-accent text-accent-ink shadow-float"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path d="M9 7l-4 5 4 5M15 7l4 5-4 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <span className="absolute top-2 left-2 rounded-[4px] bg-ink px-1.5 py-0.5 text-[11.5px] text-bg">A · older</span>
        <span className="absolute top-2 right-2 rounded-[4px] bg-accent px-1.5 py-0.5 text-[11.5px] text-accent-ink">B · newer</span>
      </div>
    </div>
  );
}
