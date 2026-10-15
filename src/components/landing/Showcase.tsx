"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Hunk } from "@/core/diff";
import { AlertFragment, ChecksFragment, DiffFragment, NumberFragment, PickerFragment, UiCard } from "./Fragments";

type Panel = { name: string; lines: string; width: number; content: ReactNode };

/**
 * "Lit panel, dark row": real fragments in a snapping row on a dark field. Only
 * the centred panel is lit; its name and two lines sit beside it.
 */
export function Showcase({ priceHunk }: { priceHunk: Hunk }) {
  const panels: Panel[] = [
    {
      name: "Point at what matters",
      lines: "Click the price and the stock badge on Tripwire’s own screenshot. It saves them as CSS selectors and leaves the rest of the page alone.",
      width: 460,
      content: <PickerFragment />,
    },
    {
      name: "Six regions moved. Two mattered.",
      lines: "The heat map shows every pixel that changed. The text layer already knows the clock, the counter and the request id are noise.",
      width: 460,
      content: (
        <UiCard className="overflow-hidden p-2">
          <Image src="/landing/price-heat.webp" alt="A real visual diff: changed pixels in colour with six regions outlined" width={1280} height={900} className="block h-auto w-full rounded-[3px]" />
        </UiCard>
      ),
    },
    { name: "Read the change, not the page", lines: "Word-level highlights on the parts you watch. Noise-only edits fold away so you never scroll past a timestamp.", width: 420, content: <DiffFragment hunk={priceHunk} /> },
    { name: "One alert, wherever you are", lines: "Email, Discord or Telegram, each with a one-line summary and a link to the diff. A retry can never send it twice.", width: 400, content: <AlertFragment /> },
    { name: "Prices become a chart", lines: "Pick one number on the page. Tripwire charts it and can alert when it crosses a line you set.", width: 400, content: <NumberFragment /> },
    { name: "Every check, accounted for", lines: "Outages, CAPTCHA walls and 304s are logged as health, not changes, and one fetch serves everyone watching.", width: 460, content: <ChecksFragment /> },
  ];

  const scroller = useRef<HTMLDivElement>(null);
  const items = useRef<Array<HTMLDivElement | null>>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) setActive(Number((best.target as HTMLElement).dataset.index));
      },
      { root, threshold: [0.55, 0.8] },
    );
    items.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const go = (i: number) => {
    const el = items.current[Math.max(0, Math.min(panels.length - 1, i))];
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  return (
    <section id="ignores" aria-label="What Tripwire shows you" className="relative flex min-h-[96svh] flex-col justify-center bg-field py-20 text-field-ink">
      <div
        ref={scroller}
        className="flex snap-x snap-mandatory items-center gap-[clamp(32px,10vw,180px)] overflow-x-auto px-[calc(50vw-min(230px,43vw))] py-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        tabIndex={0}
        aria-label="Product fragments"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(active + 1);
          if (e.key === "ArrowLeft") go(active - 1);
        }}
      >
        {panels.map((p, i) => (
          <div
            key={p.name}
            ref={(el) => void (items.current[i] = el)}
            data-index={i}
            className="w-[min(86vw,var(--w))] shrink-0 snap-center transition-[opacity,transform] duration-500"
            style={{ ["--w" as string]: `${p.width}px`, opacity: i === active ? 1 : 0.28, transform: `scale(${i === active ? 1 : 0.94})` }}
            aria-hidden={i !== active}
            inert={i !== active}
          >
            {p.content}
          </div>
        ))}
      </div>

      <div className="mx-auto mt-8 flex w-full max-w-[1240px] flex-wrap items-start justify-between gap-6 px-8">
        <div className="min-h-[120px] max-w-[46ch]" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.div key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
              <h2 className="text-[30px] leading-tight font-medium tracking-[-0.03em]">{panels[active].name}</h2>
              <p className="mt-2 text-[17px] text-field-muted">{panels[active].lines}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Previous fragment" className="size-11 rounded-full bg-white/10 text-[17px] text-field-ink transition-[transform,background-color] hover:bg-white/20 active:scale-95 disabled:opacity-30">
            ←
          </button>
          <button type="button" onClick={() => go(active + 1)} disabled={active === panels.length - 1} aria-label="Next fragment" className="size-11 rounded-full bg-white/10 text-[17px] text-field-ink transition-[transform,background-color] hover:bg-white/20 active:scale-95 disabled:opacity-30">
            →
          </button>
        </div>
      </div>
    </section>
  );
}
