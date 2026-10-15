import Image from "next/image";
import type { ReactNode } from "react";
import { normalizeLine } from "@/core/normalize";
import { MorphIcon } from "@/components/ui/status";
import { RssFragment, UiCard } from "./Fragments";
import { Reveal, RevealItem } from "./Reveal";

const NOISY = ["Generated at 2026-10-15T09:31:07Z", "Last updated 12 minutes ago", "csrf Zx9Kq2Lm8Np4Rt6Vw1Yb3Cd5Ef", "12,431 views"];

const HOSTS = [
  ["acmegear.example", "rendering", "#2456d6"],
  ["acmegear.example", "waits 10s", "#5f5d55"],
  ["jobs.example.org", "rendering", "#2456d6"],
  ["council.example.gov", "backing off · Retry-After 120s", "#a85f00"],
  ["news.example.net", "304 · skipped", "#1f7a4f"],
] as const;

type Module = { title: string; body: [string, string]; panel: ReactNode };

const MODULES: Module[] = [
  {
    title: "An outage is not a change.",
    body: [
      "Every render is classified before it is compared. A 503, a timeout, a Cloudflare challenge or a CAPTCHA wall becomes a health status, never a diff.",
      "If a page stays down for three checks you get one “unreachable” alert, and one more when it recovers.",
    ],
    panel: (
      <UiCard className="relative overflow-hidden p-2">
        <Image src="/landing/captcha.webp" alt="Tripwire’s screenshot of a bot-challenge page served with HTTP 200" width={840} height={300} className="block h-auto w-full rounded-[3px]" />
        <span className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-[#e9eaee] px-2.5 py-1 text-[12.5px] font-medium text-[#5d6270]">
          <MorphIcon status="blocked" size={14} /> Blocked · Bot challenge page
        </span>
      </UiCard>
    ),
  },
  {
    title: "Two hundred watchers, one request.",
    body: [
      "Everyone watching the same address shares a single render. Each person’s regions, ignore rules and sensitivity are applied to that one snapshot.",
      "The site sees one polite visitor, at the most frequent interval anyone asked for.",
    ],
    panel: (
      <UiCard className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-[13px] text-[#5f5d55]">acmegear.example/trail-runner-2</p>
          <p className="mt-1 text-[15px] font-medium">Checked 2m ago · OK</p>
        </div>
        <div className="text-right">
          <p className="text-[34px] leading-none font-medium tracking-[-0.04em] tabular">1</p>
          <p className="text-[12.5px] text-[#5f5d55]">fetch served 200 watches</p>
        </div>
      </UiCard>
    ),
  },
  {
    title: "Pages that change on every load stay quiet.",
    body: [
      "The browser’s clock is frozen and its random numbers seeded. Timestamps, counters and tokens are normalized away, and regions that differed between our test renders are ignored.",
      "Whatever survives must appear again in a confirmation render. Pages that still flap get muted, never spammed.",
    ],
    panel: (
      <UiCard className="flex flex-col gap-1.5 p-4">
        {NOISY.map((line) => (
          <div key={line} className="grid grid-cols-2 gap-3 rounded-[4px] bg-white px-3 py-1.5 text-[13px]">
            <span className="truncate text-[#85837a] line-through">{line}</span>
            <span className="truncate">{normalizeLine(line)}</span>
          </div>
        ))}
      </UiCard>
    ),
  },
  {
    title: "Gentle on the sites you watch.",
    body: [
      "One request at a time per host, ten seconds apart, never more often than every fifteen minutes, spread out with jitter.",
      "We honour robots.txt, Retry-After and 304 Not Modified, and step back for half an hour when a site keeps failing.",
    ],
    panel: (
      <UiCard className="flex flex-col gap-1 p-3">
        {HOSTS.map(([host, state, color], i) => (
          <div key={i} className="flex items-center justify-between rounded-[4px] px-2 py-1.5 text-[13px] odd:bg-white">
            <span>{host}</span>
            <span style={{ color }}>{state}</span>
          </div>
        ))}
      </UiCard>
    ),
  },
  {
    title: "A sentence, not a wall of red and green.",
    body: [
      "Claude reads the diff and writes the headline your alert leads with. When it can’t, a plain summary takes its place.",
      "Keyword rules and number thresholds alert on exactly the thing you care about: “In stock” appearing, a price dropping below 25, and nothing else.",
    ],
    panel: (
      <UiCard className="p-5">
        <p className="text-[13px] text-[#5f5d55]">Trail Runner 2 · just now</p>
        <p className="mt-2 text-[20px] leading-snug tracking-[-0.02em]">Price dropped from $29.00 to $24.00 and it’s back in stock.</p>
      </UiCard>
    ),
  },
  {
    title: "Every page has its own feed.",
    body: ["Each watch gets a private RSS link and every change a shareable diff page, so a teammate can see exactly what moved without an account.", "A daily digest batches quiet pages into one email at the hour you pick."],
    panel: <RssFragment />,
  },
];

/** "Small proof beside text": the brief's hard questions, each answered with a fragment. */
export function Features() {
  return (
    <section aria-labelledby="features-heading" className="mx-auto max-w-[1376px] px-4 pb-[clamp(96px,12vw,180px)] sm:px-8">
      <div className="md:pl-[18%]">
        <h2 id="features-heading" className="mb-16 text-[30px] font-medium tracking-[-0.02em]">
          Built for the real web
        </h2>
        <div className="flex flex-col gap-[clamp(64px,8vw,112px)]">
          {MODULES.map((m) => (
            <Reveal key={m.title} className="grid max-w-[880px] gap-5 md:grid-cols-[minmax(0,440px)_minmax(0,1fr)] md:gap-8">
              <RevealItem>{m.panel}</RevealItem>
              <RevealItem>
                <h3 className="text-[22px] leading-tight font-medium tracking-[-0.02em]">{m.title}</h3>
                <p className="mt-2 text-[17px] text-ink">{m.body[0]}</p>
                <p className="mt-2 text-[17px] text-muted">{m.body[1]}</p>
              </RevealItem>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
