"use client";

import Image from "next/image";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AlertFragment, PickerFragment, UiCard } from "./Fragments";

const STEPS = [
  { title: "Paste a link.", line: "Any public page. We render it three times in a real browser before you pick anything." },
  { title: "Then pick the parts you care about.", line: "Regions that changed between our test renders are already greyed out for you." },
  { title: "Get one alert when it really changes.", line: "Every change is rendered a second time before you hear about it, so a glitch never reaches you." },
];

function Statement({ index, onActive, active }: { index: number; onActive: (i: number) => void; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);
  return (
    <div ref={ref} className="flex min-h-[60svh] flex-col justify-center md:min-h-[80svh]">
      <p className={`text-[clamp(24px,2.1vw,30px)] leading-[1.15] font-medium tracking-[-0.03em] transition-colors duration-300 ${active ? "text-ink" : "text-muted"}`}>{STEPS[index].title}</p>
      <p className={`mt-3 max-w-[40ch] text-[17px] transition-colors duration-300 ${active ? "text-ink" : "text-muted"}`}>{STEPS[index].line}</p>
    </div>
  );
}

function UrlState() {
  return (
    <UiCard className="p-5">
      <p className="text-[13px] font-medium">Page address</p>
      <div /* taste-skill-ignore: inside a data-ui interface fragment */ className="mt-2 flex h-10 items-center rounded-[4px] bg-white px-3 text-[14px] shadow-[inset_0_0_0_2px_#2456d6]">acmegear.example/trail-runner-2</div>
      <ul className="mt-4 flex flex-col gap-2 text-[13px]">
        {["Opening the page in a headless browser", "Rendering it again to spot what changes on every load", "Third render, comparing all three"].map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${i < 2 ? "bg-[#1f7a4f]" : "breathe bg-[#2456d6]"}`} />
            <span className={i < 2 ? "text-[#5f5d55]" : ""}>{s}</span>
          </li>
        ))}
      </ul>
      <Image src="/landing/timestamp.webp" alt="One of the test renders: a dashboard full of timestamps and counters" width={1280} height={760} className="mt-5 block h-auto w-full rounded-[3px] opacity-90" />
    </UiCard>
  );
}

function ResultState() {
  return (
    <div className="flex flex-col gap-3">
      <AlertFragment />
      <UiCard className="overflow-hidden p-2">
        <Image src="/landing/price-after.webp" alt="Tripwire’s screenshot of the page after the price drop" width={1280} height={900} className="block h-auto w-full rounded-[3px]" />
      </UiCard>
    </div>
  );
}

/** Pinned fragment, changing state: one stage, three statements. */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const states = [<UrlState key="url" />, <PickerFragment key="pick" />, <ResultState key="result" />];

  return (
    <section id="how" aria-label="How it works" className="mx-auto grid max-w-[1376px] gap-x-12 px-4 py-[clamp(96px,14vw,200px)] sm:px-8 md:grid-cols-12">
      <div className="md:col-span-5">
        <h2 className="text-[30px] font-medium tracking-[-0.02em]">Three steps, one alert</h2>
        {STEPS.map((_, i) => (
          <Statement key={i} index={i} active={active === i} onActive={setActive} />
        ))}
      </div>
      <div className="order-first md:order-none md:col-span-7">
        <div className="sticky top-[10svh] flex min-h-[46svh] items-center rounded-[4px] bg-surface p-[clamp(12px,3vw,40px)] md:top-[14svh] md:min-h-[72svh]">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              className="w-full"
              initial={{ opacity: 0, y: 20, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {states[active]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
