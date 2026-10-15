"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type MouseEvent } from "react";
import type { Preview } from "@/lib/api";
import { useElementWidth } from "@/lib/useElementWidth";
import { cn, Input, Segmented } from "@/components/ui/controls";

export type Selection = { watch: string[]; ignore: string[]; auto: string[]; number: string | null };
type Mode = "watch" | "ignore" | "number";
type Element = Preview["elements"][number];

const toggle = (list: string[], sel: string) => (list.includes(sel) ? list.filter((s) => s !== sel) : [...list, sel]);

function smallestAt(elements: Element[], x: number, y: number): Element | null {
  let best: Element | null = null;
  for (const el of elements) {
    const { box } = el;
    if (x < box.x || y < box.y || x > box.x + box.w || y > box.y + box.h) continue;
    if (!best || box.w * box.h < best.box.w * best.box.h) best = el;
  }
  return best;
}

const MODE_COPY: Record<Mode, string> = {
  watch: "Click the parts of the page you care about. Nothing selected means the whole page.",
  ignore: "Click anything that should never trigger an alert — banners, feeds, “recently viewed”.",
  number: "Click one number (a price, a count) to chart it over time and alert on thresholds.",
};

function Region({ el, scale, kind, label }: { el: Element; scale: number; kind: "watch" | "ignore" | "auto" | "number"; label: string }) {
  const style = { left: el.box.x * scale, top: el.box.y * scale, width: el.box.w * scale, height: el.box.h * scale };
  const look = {
    watch: "bg-accent/15 shadow-[inset_0_0_0_2px_var(--accent)]",
    ignore: "bg-[repeating-linear-gradient(135deg,rgb(93_98_112/0.32)_0_6px,transparent_6px_12px)] shadow-[inset_0_0_0_2px_var(--blocked)]",
    auto: "bg-[repeating-linear-gradient(135deg,rgb(93_98_112/0.22)_0_6px,transparent_6px_12px)] shadow-[inset_0_0_0_1.5px_var(--blocked)]",
    number: "bg-changed/15 shadow-[inset_0_0_0_2px_var(--changed)]",
  }[kind];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className={cn("pointer-events-none absolute rounded-[3px]", look)}
      style={style}
    >
      {/* Watched regions speak through their colour; the others carry a small tag. */}
      {kind !== "watch" && (
        <span className="absolute top-0.5 right-0.5 rounded-[3px] bg-ink/85 px-1 text-[10.5px] leading-4 font-medium whitespace-nowrap text-bg">{label}</span>
      )}
    </motion.div>
  );
}

/**
 * Visual region picker over a server-rendered screenshot. Third-party page
 * scripts never run in our origin; the element map comes from the render.
 */
export function Picker({ preview, value, onChange }: { preview: Preview; value: Selection; onChange: (v: Selection) => void }) {
  const [mode, setMode] = useState<Mode>("watch");
  const [hover, setHover] = useState<Element | null>(null);
  const [query, setQuery] = useState("");
  const [frame, width] = useElementWidth<HTMLDivElement>(640);
  const scale = width / preview.width;

  const bySelector = useMemo(() => new Map(preview.elements.map((e) => [e.selector, e])), [preview.elements]);

  const apply = (el: Element) => {
    const sel = el.selector;
    if (mode === "watch") onChange({ ...value, watch: toggle(value.watch, sel), ignore: value.ignore.filter((s) => s !== sel) });
    if (mode === "ignore") onChange({ ...value, ignore: toggle(value.ignore, sel), watch: value.watch.filter((s) => s !== sel) });
    if (mode === "number") onChange({ ...value, number: value.number === sel ? null : sel });
  };

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(smallestAt(preview.elements, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale));
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return preview.elements
      .filter((e) => e.text.toLowerCase().includes(q))
      .sort((a, b) => a.text.length - b.text.length)
      .slice(0, 8);
  }, [query, preview.elements]);

  const regions = [
    ...value.auto.map((s) => ({ s, kind: "auto" as const, label: "auto-ignored" })),
    ...value.ignore.map((s) => ({ s, kind: "ignore" as const, label: "ignored" })),
    ...value.watch.map((s) => ({ s, kind: "watch" as const, label: "watching" })),
    ...(value.number ? [{ s: value.number, kind: "number" as const, label: "tracked number" }] : []),
  ].filter((r) => bySelector.has(r.s));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          name="picker-mode"
          label="Picker mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "watch", label: "Watch" },
            { value: "ignore", label: "Ignore" },
            { value: "number", label: "Track number" },
          ]}
        />
        <p className="min-w-0 flex-1 text-[13px] text-muted">{MODE_COPY[mode]}</p>
      </div>

      <div className="relative max-h-[56vh] overflow-y-auto rounded-[10px] bg-surface p-2" data-ui>
        <div
          ref={frame}
          className={cn("relative w-full select-none", hover ? "cursor-pointer" : "cursor-crosshair")}
          style={{ height: preview.height * scale }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onClick={() => hover && apply(hover)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- screenshot blob, natural size known */}
          <img src={preview.screenshotUrl ?? ""} alt={`Screenshot of ${preview.title || preview.url}`} width={preview.width} height={preview.height} className="block w-full rounded-[4px]" draggable={false} />
          <AnimatePresence>
            {regions.map((r) => (
              <Region key={`${r.kind}-${r.s}`} el={bySelector.get(r.s)!} scale={scale} kind={r.kind} label={r.label} />
            ))}
          </AnimatePresence>
          {hover && (
            <div
              className="pointer-events-none absolute rounded-[3px] shadow-[inset_0_0_0_1.5px_var(--ink)] transition-all duration-75"
              style={{ left: hover.box.x * scale, top: hover.box.y * scale, width: hover.box.w * scale, height: hover.box.h * scale }}
            >
              <span className="absolute top-full left-0 mt-1 max-w-[280px] truncate rounded-[4px] bg-ink px-1.5 py-0.5 text-[11.5px] text-bg">
                {hover.tag} · {hover.text.slice(0, 60) || "image"}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Or find an element by its text…" aria-label="Find an element by its text" />
        {matches.length > 0 && (
          <ul className="absolute inset-x-0 top-11 z-10 rounded-[10px] bg-panel-2 p-1 shadow-float">
            {matches.map((m) => (
              <li key={m.selector}>
                <button
                  type="button"
                  onClick={() => {
                    apply(m);
                    setQuery("");
                  }}
                  className="flex w-full items-baseline gap-2 rounded-[6px] px-2.5 py-2 text-left text-sm hover:bg-ink/[0.06]"
                >
                  <span className="text-[12px] text-muted">{m.tag}</span>
                  <span className="truncate">{m.text.slice(0, 90)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 text-sm">
        {value.auto.length > 0 && (
          <p className="text-muted">
            <b className="font-medium text-ink">We’ll ignore {value.auto.length} region{value.auto.length === 1 ? "" : "s"}</b> that changed between our three test renders.{" "}
            <button type="button" className="text-accent hover:underline" onClick={() => onChange({ ...value, auto: [] })}>
              Watch them anyway
            </button>
          </p>
        )}
        <Chips label="Watching" items={value.watch} lookup={bySelector} onRemove={(s) => onChange({ ...value, watch: value.watch.filter((x) => x !== s) })} empty="The whole page" />
        {value.ignore.length > 0 && <Chips label="Ignoring" items={value.ignore} lookup={bySelector} onRemove={(s) => onChange({ ...value, ignore: value.ignore.filter((x) => x !== s) })} />}
        {value.number && <Chips label="Tracking" items={[value.number]} lookup={bySelector} onRemove={() => onChange({ ...value, number: null })} />}
      </div>
    </div>
  );
}

function Chips({
  label,
  items,
  lookup,
  onRemove,
  empty,
}: {
  label: string;
  items: string[];
  lookup: Map<string, Element>;
  onRemove: (s: string) => void;
  empty?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-muted">{label}</span>
      {items.length === 0 && empty && <span className="text-ink">{empty}</span>}
      {items.map((s) => (
        <span key={s} className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface py-0.5 pr-1 pl-2.5 text-[13px]" title={s}>
          <span className="max-w-[260px] truncate">{lookup.get(s)?.text.slice(0, 50) || s}</span>
          <button type="button" aria-label={`Remove ${label.toLowerCase()} region`} onClick={() => onRemove(s)} className="rounded-full p-0.5 text-muted hover:bg-ink/10 hover:text-ink">
            <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden>
              <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  );
}
