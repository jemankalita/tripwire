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

  // The lit panel is whichever one is closest to the row's centre — derived from the
  // scroll position itself, so the text, the highlight and the arrows always agree.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      const centre = root.scrollLeft + root.clientWidth / 2;
      let closest = 0;
      let best = Infinity;
      items.current.forEach((el, i) => {
        if (!el) return;
        const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - centre);
        if (distance < best) {
          best = distance;
          closest = i;
        }
      });
      setActive(closest);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const go = (i: number) => {
    const root = scroller.current;
    const el = items.current[Math.max(0, Math.min(panels.length - 1, i))];
    if (!root || !el) return;
    // Scroll only the row (never the page) so the target panel sits exactly in the centre.
    root.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - root.clientWidth / 2, behavior: "smooth" });
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
