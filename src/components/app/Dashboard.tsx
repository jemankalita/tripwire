"use client";

import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useWatches, type WatchSummary } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { Button, cn, Input, Kbd, Segmented, Skeleton } from "@/components/ui/controls";
import type { Status } from "@/components/ui/status";
import { isTypingTarget, useAppActions } from "./AppShell";
import { WatchRow } from "./WatchRow";

const DAY = 24 * 60 * 60_000;
const PRIORITY: Record<Status, number> = { changed: 0, error: 1, blocked: 2, pending: 3, ok: 4, paused: 5 };

type Filter = "all" | "changed" | "problems" | "paused";

function Ticker({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduced) {
      node.textContent = value.toLocaleString("en-US");
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => (node.textContent = Math.round(v).toLocaleString("en-US")),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduced]);
  return (
    <span ref={ref} className="tabular">
      {value}
    </span>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-[10px] bg-panel px-4 py-3.5">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={cn("mt-1 text-[32px] leading-none font-medium tracking-[-0.03em]", value > 0 && tone ? tone : "text-ink")}>
        <Ticker value={value} />
      </p>
    </div>
  );
}

function EmptyState() {
  const { openAddWatch } = useAppActions();
  const [url, setUrl] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    openAddWatch(url);
  };
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-10 rounded-[14px] bg-panel px-6 py-14 sm:px-12"
    >
      <h2 className="max-w-xl text-[28px] leading-tight font-medium tracking-[-0.03em]">Paste the first page you want watched.</h2>
      <p className="mt-2 max-w-xl text-muted">
        We render it three times, find what changes on every load, and only bother you when something real moves.
      </p>
      <form onSubmit={submit} className="mt-6 flex max-w-xl gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/pricing" aria-label="Page URL" autoFocus />
        <Button type="submit" variant="primary" size="lg" className="h-10">
          Continue
        </Button>
      </form>
      {process.env.NODE_ENV !== "production" && (
        <p className="mt-4 text-[13px] text-muted">
          Running locally? Try <button type="button" className="font-medium text-accent underline-offset-2 hover:underline" onClick={() => openAddWatch("http://127.0.0.1:4000/price")}>the chaos site’s product page</button>{" "}
          — then change its price at 127.0.0.1:4000/control.
        </p>
      )}
    </motion.section>
  );
}

/** Current time, refreshed every minute — keeps render pure. */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function sortWatches(list: WatchSummary[]): WatchSummary[] {
  return [...list].sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status] || (b.lastChangedAt ?? 0) - (a.lastChangedAt ?? 0) || a.name.localeCompare(b.name));
}

export function Dashboard() {
  const { data, error, isLoading } = useWatches();
  const { openAddWatch } = useAppActions();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const rowLinks = useRef<Array<HTMLAnchorElement | null>>([]);

  const now = useNow();
  const watches = useMemo(() => data?.watches ?? [], [data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byFilter = watches.filter((w) =>
      filter === "changed" ? w.status === "changed" : filter === "problems" ? w.status === "error" || w.status === "blocked" : filter === "paused" ? w.paused : true,
    );
    return sortWatches(q ? byFilter.filter((w) => `${w.name} ${w.displayUrl}`.toLowerCase().includes(q)) : byFilter);
  }, [watches, filter, query]);

  const stats = useMemo(
    () => ({
      active: watches.filter((w) => !w.paused).length,
      changedToday: watches.filter((w) => w.lastChangedAt && now - w.lastChangedAt < DAY).length,
      errors: watches.filter((w) => w.status === "error").length,
      blocked: watches.filter((w) => w.status === "blocked").length,
      shared: watches.filter((w) => w.sharedWith > 0).length,
    }),
    [watches, now],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey) return;
      if (e.key === "/") {
        e.preventDefault();
        search.current?.focus();
        return;
      }
      if (e.key !== "j" && e.key !== "k") return;
      const links = rowLinks.current.filter(Boolean) as HTMLAnchorElement[];
      if (!links.length) return;
      const current = links.indexOf(document.activeElement as HTMLAnchorElement);
      const next = e.key === "j" ? Math.min(links.length - 1, current + 1) : Math.max(0, current - 1);
      links[current === -1 ? 0 : next]?.focus();
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-none font-medium tracking-[-0.035em]">Watches</h1>
          <p className="mt-2 text-sm text-muted">
            {data ? `${pluralize(watches.length, "page")} · checked by one polite headless browser` : "Loading your pages…"}
          </p>
        </div>
        <Button variant="primary" onClick={() => openAddWatch()} icon={<span aria-hidden className="text-base leading-none">+</span>}>
          Add watch
          <span className="ml-1 hidden rounded-[4px] bg-accent-ink/20 px-1 text-[11.5px] sm:inline">N</span>
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-[10px] bg-error-soft px-4 py-3 text-sm text-error">
          Couldn’t load your watches: {error.message}
        </p>
      )}

      {isLoading && !data ? (
        <div className="mt-8 space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[86px]" />)}
          </div>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[68px]" />)}
        </div>
      ) : watches.length === 0 && data ? (
        <EmptyState />
      ) : (
        <>
          <section aria-label="Overview" className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Watching" value={stats.active} />
            <Kpi label="Changed in 24h" value={stats.changedToday} tone="text-changed" />
            <Kpi label="Errors" value={stats.errors} tone="text-error" />
            <Kpi label="Blocked" value={stats.blocked} tone="text-blocked" />
          </section>
          {stats.shared > 0 && (
            <p className="mt-3 text-[13px] text-muted">
              {pluralize(stats.shared, "of your pages is", "of your pages are")} also watched by other people — fetched once, shared by everyone.
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Segmented
              name="filter"
              label="Filter watches"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "changed", label: "Changed" },
                { value: "problems", label: "Problems" },
                { value: "paused", label: "Paused" },
              ]}
            />
            <div className="relative ml-auto w-full sm:w-72">
              <Input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or URL" aria-label="Filter by name or URL" className="h-9 pr-9" />
              <span className="pointer-events-none absolute top-2 right-2">
                <Kbd>/</Kbd>
              </span>
            </div>
          </div>

          <ul className="mt-3 flex flex-col gap-1" aria-label="Watched pages">
            <AnimatePresence initial={false}>
              {visible.map((w, i) => (
                <WatchRow key={w.id} watch={w} linkRef={(el) => void (rowLinks.current[i] = el)} />
              ))}
            </AnimatePresence>
          </ul>
          {visible.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">No watches match this filter.</p>}
          <p className="mt-6 hidden text-[12.5px] text-muted sm:block">
            <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>↵</Kbd> open · <Kbd>/</Kbd> filter · <Kbd>N</Kbd> add · <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> jump anywhere
          </p>
        </>
      )}
    </div>
  );
}
