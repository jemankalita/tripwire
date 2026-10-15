"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Reveal, RevealItem } from "./Reveal";

function UtcClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().slice(11, 16));
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, []);
  return <span className="tabular">{now ?? "--:--"}</span>;
}

const tile = "rounded-[4px] p-5 sm:p-6";

export function Closing() {
  return (
    <>
      <section aria-label="Get started" className="mx-auto max-w-[1376px] px-4 pt-[16svh] pb-[14svh] sm:px-8 md:pl-[calc(18%+32px)]">
        <Reveal className="max-w-[34ch]">
          <RevealItem>
            <p className="text-[22px] leading-[1.45]">Paste the first page you want watched and see what Tripwire would have ignored on it.</p>
          </RevealItem>
          <RevealItem>
            <Link
              href="/signup"
              className="mt-6 inline-flex h-11 items-center rounded-[4px] bg-accent px-[18px] text-[15px] font-medium text-accent-ink transition-[transform,background-color] hover:bg-accent-hover active:scale-[0.97]"
            >
              Start watching
            </Link>
          </RevealItem>
        </Reveal>
      </section>

      <footer className="grid grid-cols-2 gap-1.5 p-2 sm:p-3 md:grid-cols-12 md:gap-2">
        <div className={`${tile} order-1 col-span-2 flex h-40 items-center justify-center bg-ink text-bg md:order-none md:col-span-8 md:row-start-2 md:h-[320px]`}>
          <span className="text-[clamp(56px,9vw,150px)] leading-none font-medium tracking-[-0.06em]">Tripwire</span>
        </div>
        <Link
          href="/signup"
          className={`${tile} group relative order-2 col-span-2 flex h-40 flex-col justify-between bg-accent text-accent-ink transition-colors hover:bg-accent-hover md:order-none md:col-span-4 md:row-start-2 md:h-[320px]`}
        >
          <span className="text-[30px] leading-tight font-medium tracking-[-0.03em]">Watch your first page</span>
          <svg viewBox="0 0 48 48" className="size-12 self-end transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" aria-hidden>
            <path d="M12 36L36 12M18 12h18v18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="square" />
          </svg>
        </Link>
        <div className={`${tile} order-5 col-span-2 flex min-h-[200px] flex-col justify-between bg-surface md:order-none md:col-span-4 md:h-[220px]`}>
          <p className="text-[22px] leading-snug tracking-[-0.02em]">Tripwire tells you when a page really changes, and stays quiet when it doesn’t.</p>
          <p className="text-[15px] text-muted">Built for vinnovateIT · 2026 · Public pages only, no stored credentials.</p>
        </div>
        <nav aria-label="Footer" className={`${tile} order-3 bg-surface md:order-none md:col-span-3 md:h-[220px]`}>
          <ul className="flex flex-col gap-2 text-[17px]">
            <li><Link href="/login" className="hover:text-accent">Sign in</Link></li>
            <li><Link href="/signup" className="hover:text-accent">Create an account</Link></li>
            <li><a href="#how" className="hover:text-accent">How it works</a></li>
            <li><Link href="/bot" className="hover:text-accent">Bot policy</Link></li>
          </ul>
        </nav>
        <div className={`${tile} order-6 flex flex-col justify-between bg-surface md:order-none md:col-span-2 md:h-[220px]`}>
          <p className="text-[17px]">Checks run around the clock.</p>
          <p className="text-[17px] text-muted">
            UTC <UtcClock />
          </p>
        </div>
        <div className={`${tile} order-4 flex flex-col justify-end bg-surface md:order-none md:col-span-3 md:h-[220px]`}>
          <Link href="/bot" className="text-[22px] leading-snug tracking-[-0.02em] hover:text-accent">
            TripwireBot policy
          </Link>
        </div>
      </footer>
    </>
  );
}
