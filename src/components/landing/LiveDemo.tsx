"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { normalizeLine } from "@/core/normalize";
import { MorphIcon, type Status } from "@/components/ui/status";

const PROMOS = ["Free shipping over $50", "Members save 10% today", "New colours just dropped"];
const START = Date.UTC(2026, 9, 15, 9, 12, 26);

type Page = { clock: number; price: number; inStock: boolean; promo: number; views: number; requestId: string };
type Phase = "idle" | "pending" | "confirmed";
type Verdict = { status: Status; text: string; noise: Array<{ raw: string; normalized: string }> };

const hex = () => Math.random().toString(16).slice(2, 10);
const money = (n: number) => `$${n.toFixed(2)}`;
const clockText = (ms: number) => `Server time ${new Date(ms).toISOString().slice(11, 19)}`;
const viewsText = (n: number) => `${n.toLocaleString("en-US")} people viewing`;

function nextPage(p: Page, patch: Partial<Page> = {}): Page {
  return {
    ...p,
    clock: p.clock + 17_000 + Math.floor(Math.random() * 40_000),
    promo: (p.promo + 1) % PROMOS.length,
    views: p.views + 3 + Math.floor(Math.random() * 60),
    requestId: hex(),
    ...patch,
  };
}

/** The noise lines whose raw text changed but whose normalized form did not. */
function noiseBetween(a: Page, b: Page): Verdict["noise"] {
  return [
    [clockText(a.clock), clockText(b.clock)],
    [viewsText(a.views), viewsText(b.views)],
    [`Request id ${a.requestId}`, `Request id ${b.requestId}`],
  ]
    .filter(([x, y]) => x !== y && normalizeLine(x) === normalizeLine(y))
    .map(([, y]) => ({ raw: y, normalized: normalizeLine(y) }));
}

/**
 * The live thing: a page that differs on every reload, watched by Tripwire.
 * Reload it and watch the noise get ignored; drop the price and watch a real
 * change get confirmed and alerted once. Uses Tripwire's real normalizer.
 */
export function LiveDemo() {
  const [page, setPage] = useState<Page>({ clock: START, price: 29, inStock: false, promo: 0, views: 1204, requestId: "3f2a9c1e" });
  const [phase, setPhase] = useState<Phase>("idle");
  const [counts, setCounts] = useState({ checks: 1, noise: 0, alerts: 0 });
  const [verdict, setVerdict] = useState<Verdict>({ status: "ok", text: "Baseline captured. Nothing to report.", noise: [] });
  const confirmedPrice = useRef(29);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const check = (prev: Page, next: Page, confirming: boolean) => {
    const noise = noiseBetween(prev, next);
    setCounts((c) => ({ ...c, checks: c.checks + 1, noise: c.noise + noise.length + 1 }));
    if (next.price === confirmedPrice.current) {
      setPhase("idle");
      setVerdict({ status: "ok", text: "Only noise changed, plus the promo banner, which calibration ignores.", noise });
      return;
    }
    if (!confirming) {
      setPhase("pending");
      setVerdict({ status: "pending", text: `Possible change: ${money(confirmedPrice.current)} → ${money(next.price)}. Rendering again to confirm…`, noise });
      timer.current = setTimeout(() => {
        const again = nextPage(next);
        setPage(again);
        check(next, again, true);
      }, 1300);
      return;
    }
    const from = confirmedPrice.current;
    confirmedPrice.current = next.price;
    setPhase("confirmed");
    setCounts((c) => ({ ...c, alerts: c.alerts + 1 }));
    setVerdict({ status: "changed", text: `Confirmed: ${money(from)} → ${money(next.price)}${next.inStock ? ", back in stock" : ""}. One alert sent.`, noise });
  };

  const reload = (patch: Partial<Page> = {}) => {
    if (phase === "pending") return;
    const next = nextPage(page, patch);
    setPage(next);
    check(page, next, false);
  };

  // Animate values only when they change after a reload, never on first paint.
  const animated = counts.checks > 1;

  return (
    <div className="@container flex h-full flex-col bg-[#f6f5f3] text-[#26251e]" data-ui>
      <div className="flex items-center justify-between gap-3 bg-[#ecebe8] px-3 py-2 text-[12px] text-[#5f5d55]">
        <span className="truncate">acmegear.example/trail-runner-2</span>
        <span className="shrink-0 tabular">
          {counts.checks} checks · {counts.noise} noise ignored · {counts.alerts} alert{counts.alerts === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 @[480px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0 bg-white">
          <div className="flex justify-between bg-[#15171c] px-3 py-1.5 text-[11.5px] text-[#f6f5f1]">
            <span>Acme Gear</span>
            <motion.span key={page.clock} initial={animated ? { opacity: 0.3 } : false} animate={{ opacity: 1 }} className="tabular">
              {clockText(page.clock)}
            </motion.span>
          </div>
          <div className="px-4 pt-3 pb-2">
            <p className="text-[19px] leading-tight font-semibold tracking-[-0.02em]">Trail Runner 2</p>
            <motion.p key={page.price} initial={animated ? { y: -6, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} className="mt-1 text-[18px] font-bold tabular">
              {money(page.price)}
            </motion.p>
            <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${page.inStock ? "bg-[#d9f7e8] text-[#0d6b44]" : "bg-[#ffe3e3] text-[#9f1d1d]"}`}>
              {page.inStock ? "In stock" : "Sold out"}
            </span>
            <motion.div key={page.promo} initial={animated ? { opacity: 0 } : false} animate={{ opacity: 1 }} className="relative mt-2.5 rounded-[6px] bg-[#fff3d6] px-2.5 py-1.5 text-[12px]">
              {PROMOS[page.promo]}
              <span className="absolute -top-2 right-1.5 rounded-[3px] bg-[#5d6270] px-1 text-[10.5px] text-white">auto-ignored</span>
            </motion.div>
            <p className="mt-2 text-[12px] text-[#5f5d55] tabular">{viewsText(page.views)}</p>
            <p className="mt-1 truncate text-[11px] text-[#6b695f]">Request id {page.requestId}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 p-3 text-[13px]">
          <div className="flex items-center gap-2">
            <span
              className={`flex size-7 items-center justify-center rounded-full ${
                verdict.status === "changed" ? "bg-[rgb(232_150_30/0.2)] text-[#a85f00]" : verdict.status === "pending" ? "bg-[rgb(36_86_214/0.12)] text-[#2456d6]" : "bg-[rgb(31_122_79/0.13)] text-[#1f7a4f]"
              }`}
            >
              <MorphIcon status={verdict.status} size={15} />
            </span>
            <span className="font-medium">{verdict.status === "changed" ? "Changed" : verdict.status === "pending" ? "Confirming" : "Watching"}</span>
          </div>
          <p className="leading-snug" aria-live="polite">
            {verdict.text}
          </p>
          <ul className="flex flex-col gap-1">
            <AnimatePresence initial={false} mode="popLayout">
              {verdict.noise.map((n) => (
                <motion.li key={n.raw} layout initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="rounded-[5px] bg-[#ecebe8] px-2 py-1 text-[11.5px] leading-tight">
                  <span className="block truncate text-[#85837a] line-through">{n.raw}</span>
                  <span className="block truncate">{n.normalized}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => reload()}
              disabled={phase === "pending"}
              className="h-8 rounded-[4px] bg-[#26251e] px-3 text-[12.5px] font-medium text-[#f6f5f3] transition-transform hover:bg-black active:scale-95 disabled:opacity-50"
            >
              Reload the page
            </button>
            <button
              type="button"
              onClick={() => reload({ price: Math.max(9, page.price - 5), inStock: true })}
              disabled={phase === "pending"}
              className="h-8 rounded-[4px] bg-[#2456d6] px-3 text-[12.5px] font-medium text-white transition-transform hover:bg-[#1b47b8] active:scale-95 disabled:opacity-50"
            >
              Drop the price
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
