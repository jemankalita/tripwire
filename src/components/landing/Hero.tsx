"use client";

import Link from "next/link";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Hunk } from "@/core/diff";
import { AlertFragment, DiffFragment } from "./Fragments";
import { LiveDemo } from "./LiveDemo";

const GAP = 24;

function Frame({ children, active, fill }: { children: ReactNode; active: boolean; fill?: boolean }) {
  return (
    <div
      className="aspect-[16/10.5] w-[min(46vw,700px)] overflow-hidden rounded-[4px] bg-surface transition-[filter] duration-300"
      style={{ filter: active ? "none" : "saturate(0.6)" }}
      aria-hidden={!active}
      inert={!active}
    >
      <div className="flex h-full items-center justify-center p-[3%]">
        <div className={`w-full overflow-hidden rounded-[4px] ${fill ? "h-full" : "max-h-full"}`}>{children}</div>
      </div>
    </div>
  );
}

/**
 * "Sentence split by a frame": the headline holds its two edges while a reel of
 * working product fragments passes through the middle as you scroll.
 */
export function Hero({ priceHunk }: { priceHunk: Hunk }) {
  const section = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState(440);
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const frames: ReactNode[] = [
    <LiveDemo key="live" />,
    <DiffFragment key="diff" hunk={priceHunk} />,
    <AlertFragment key="alert" />,
  ];

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setFrameHeight(entry.contentRect.height));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const step = frameHeight + GAP;
  const y = useTransform(scrollYProgress, [0, 0.15, 0.4, 0.6, 0.85, 1], [0, 0, -step, -step, -2 * step, -2 * step]);
  useMotionValueEvent(scrollYProgress, "change", (p) => setActive(p < 0.28 ? 0 : p < 0.73 ? 1 : 2));

  return (
    <section ref={section} aria-label="Introduction" className="relative md:h-[250svh]">
      <div className="md:sticky md:top-0 md:h-svh md:overflow-hidden">
        {/* Phone: its own stacked composition. */}
        <div className="flex flex-col gap-5 px-4 pt-24 pb-14 md:hidden">
          <h1 className="text-[clamp(36px,10vw,52px)] leading-[0.95] font-medium tracking-[-0.05em]">
            Real changes,
            <br />
            <span className="block text-right">not noise.</span>
          </h1>
          <div className="overflow-hidden rounded-[4px] bg-surface p-2">
            <LiveDemo />
          </div>
          <p className="text-[17px] leading-[1.45]">
            Tripwire renders the pages you care about in a real browser, learns what changes on every load, and sends one alert when something meaningful moves.
          </p>
          <Link href="/signup" className="self-start rounded-[4px] bg-accent px-5 py-3 text-[15px] font-medium text-accent-ink transition-transform active:scale-[0.97]">
            Start watching, free
          </Link>
        </div>

        {/* Tablet and up: the split sentence and the reel. */}
        <div className="relative hidden h-full md:block">
          <h1 className="pointer-events-none absolute inset-x-8 top-1/2 z-10 flex -translate-y-1/2 justify-between text-[clamp(40px,4.4vw,68px)] leading-[0.92] font-medium tracking-[-0.05em]">
            <span>Real changes,</span>
            <span>not noise.</span>
          </h1>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2" style={{ marginTop: -frameHeight / 2 }}>
            <motion.div style={{ y: reduced ? 0 : y }} className="flex flex-col" >
              {frames.map((content, i) => (
                <div key={i} ref={i === 0 ? frame : undefined} style={{ marginBottom: GAP }}>
                  <Frame active={reduced || i === active} fill={i === 0}>
                    {content}
                  </Frame>
                </div>
              ))}
            </motion.div>
          </div>
          <div className="absolute bottom-8 left-8 z-10 max-w-[min(calc((100vw-min(46vw,700px))/2-64px),420px)]">
            <p className="text-[17px] leading-[1.45]">
              Tripwire renders the pages you care about in a real browser, learns what changes on every load, and sends one alert when something meaningful moves.
            </p>
            <Link href="/signup" className="mt-4 inline-block rounded-[4px] bg-accent px-5 py-3 text-[15px] font-medium text-accent-ink transition-[transform,background-color] hover:bg-accent-hover active:scale-[0.97]">
              Start watching, free
            </Link>
          </div>
          <p className="absolute right-8 bottom-8 z-10 max-w-[min(calc((100vw-min(46vw,700px))/2-64px),260px)] text-right text-[15px] text-muted">
            {["Try it: reload the page, then drop the price.", "The diff shows only what you chose to watch.", "One alert, with a sentence a person can read."][active]}
          </p>
        </div>
      </div>
    </section>
  );
}
