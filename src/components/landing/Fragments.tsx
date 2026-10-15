/**
 * True-size fragments of Tripwire's interface for the landing page. Each root
 * carries data-ui: inside it the product's own conventions apply.
 */
import Image from "next/image";
import type { Hunk } from "@/core/diff";
import { HunkTable } from "@/components/diff/DiffLines";
import { MorphIcon } from "@/components/ui/status";
import { PulseLine } from "@/components/ui/PulseLine";

const LIGHT = "[--bg:#f6f5f3] [--panel:#ecebe8] [--panel-2:#ffffff] [--surface:#e4e3df] [--ink:#26251e] [--muted:#5f5d55] [--faint:#85837a] [--changed:#a85f00] [--error:#c2362f] [--add-bg:#d4ecda] [--add-strong:#a6d8b3] [--add-ink:#14532d] [--del-bg:#f6dbd8] [--del-strong:#eeb0a9] [--del-ink:#7f1d1d] [--line-strong:rgb(38_37_30/0.2)]";

export function UiCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`${LIGHT} rounded-[4px] bg-[#f6f5f3] text-[#26251e] ${className}`} data-ui>
      {children}
    </div>
  );
}

export function DiffFragment({ hunk }: { hunk: Hunk }) {
  return (
    <UiCard className="p-3">
      <div className="mb-2 flex items-center justify-between text-[12.5px] text-[#5f5d55]">
        <span>Trail Runner 2 · watched: price, stock</span>
        <span>4 noise-only changes hidden</span>
      </div>
      <HunkTable hunk={hunk} />
    </UiCard>
  );
}

export function AlertFragment() {
  return (
    <UiCard className="p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-[#26251e] text-[13px] font-semibold text-[#f6f5f3]">T</span>
        <div className="leading-tight">
          <p className="text-[14px] font-semibold">Tripwire</p>
          <p className="text-[12px] text-[#5f5d55]">#price-watch · just now</p>
        </div>
      </div>
      <div /* taste-skill-ignore: inside a data-ui interface fragment */ className="mt-3 rounded-[4px] bg-white p-3 shadow-[inset_4px_0_0_#ffb020]">
        <p className="pl-2 text-[14px] font-semibold text-[#2456d6]">Trail Runner 2 changed</p>
        <p className="mt-1 pl-2 text-[14px]">Price dropped from $29.00 to $24.00 and it’s back in stock.</p>
        <p className="mt-2 pl-2 text-[12px] text-[#5f5d55]">acmegear.example/trail-runner-2 · +2 / −2 lines · 0.2% of pixels</p>
      </div>
    </UiCard>
  );
}

const PULSE = {
  changes: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  failures: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

export function WatchRowFragment() {
  return (
    <UiCard className="flex flex-col gap-1 p-2">
      {[
        { name: "Trail Runner 2", url: "acmegear.example/trail-runner-2", summary: "Price dropped from $29.00 to $24.00", status: "changed" as const, tone: "bg-[rgb(232_150_30/0.18)]" },
        { name: "Careers: Platform team", url: "jobs.example.org/platform", summary: "New role: Staff Engineer, Reliability", status: "ok" as const, tone: "" },
        { name: "City council notices", url: "council.example.gov/notices", summary: "Unreachable: server error (503)", status: "error" as const, tone: "" },
      ].map((row) => (
        <div key={row.name} className={`grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 rounded-[4px] px-3 py-2.5 ${row.tone}`}>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={row.status === "changed" ? "text-[#a85f00]" : row.status === "error" ? "text-[#c2362f]" : "text-[#1f7a4f]"}>
              <MorphIcon status={row.status} size={16} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium">{row.name}</p>
              <p className="truncate text-[12px] text-[#5f5d55]">{row.summary}</p>
            </div>
          </div>
          <PulseLine changes={row.status === "error" ? PULSE.changes.map(() => 0) : PULSE.changes} failures={row.status === "error" ? PULSE.failures : PULSE.changes.map(() => 0)} width={120} height={26} />
        </div>
      ))}
    </UiCard>
  );
}

export function ChecksFragment() {
  const rows = [
    ["2m ago", "OK", "#1f7a4f", "Possible change, confirming", "200 watches"],
    ["3m ago", "OK", "#1f7a4f", "Confirmation render · 1 changed", "200 watches"],
    ["1h ago", "304 · skipped", "#1f7a4f", "Not modified, no render needed", "200 watches"],
    ["2h ago", "Blocked", "#5d6270", "Bot challenge page", "200 watches"],
    ["3h ago", "Error", "#c2362f", "Server error (503) · retried", "200 watches"],
  ];
  return (
    <UiCard className="overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="text-left text-[12px] text-[#5f5d55]">
          <tr>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Result</th>
            <th className="px-3 py-2 font-medium">Detail</th>
            <th className="px-3 py-2 text-right font-medium">One fetch served</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([when, result, color, detail, served]) => (
            <tr key={when} className="odd:bg-white">
              <td className="px-3 py-1.5 whitespace-nowrap">{when}</td>
              <td className="px-3 py-1.5 font-medium whitespace-nowrap" style={{ color }}>
                {result}
              </td>
              <td className="px-3 py-1.5 text-[#5f5d55]">{detail}</td>
              <td className="px-3 py-1.5 text-right tabular">{served}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </UiCard>
  );
}

export function NumberFragment() {
  const values = [34, 34, 34, 31, 31, 29, 29, 29, 29, 24, 24];
  const w = 380;
  const h = 150;
  const x = (i: number) => 40 + (i / (values.length - 1)) * (w - 56);
  const y = (v: number) => 14 + ((36 - v) / 14) * (h - 40);
  const d = values.map((v, i) => (i === 0 ? `M${x(i)} ${y(v)}` : `H${x(i)} V${y(v)}`)).join(" ");
  return (
    <UiCard className="p-4">
      <p className="text-[12.5px] text-[#5f5d55]">
        Tracked number · <b className="text-[22px] font-medium tracking-[-0.03em] text-[#26251e] tabular">$24.00</b>
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full" role="img" aria-label="Price fell from $34 to $24 over two weeks, crossing the $25 alert line">
        <line x1={40} x2={w - 16} y1={y(25)} y2={y(25)} stroke="#a85f00" strokeDasharray="4 4" strokeWidth={1.5} />
        <text x={w - 16} y={y(25) - 6} textAnchor="end" fontSize="11" fill="#a85f00">
          alert below 25
        </text>
        {[24, 30, 36].map((v) => (
          <text key={v} x={32} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#5f5d55">
            {v}
          </text>
        ))}
        <path d={d} fill="none" stroke="#2456d6" strokeWidth={2} />
        <circle cx={x(9)} cy={y(24)} r={5} fill="#2456d6" stroke="#f6f5f3" strokeWidth={2} />
      </svg>
    </UiCard>
  );
}

export function RssFragment() {
  return (
    <UiCard className="p-4">
      <pre /* taste-skill-ignore: inside a data-ui interface fragment */ className="overflow-hidden font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-[#5f5d55]">
        <code>{`<item>
  <title>Price dropped from $29.00 to $24.00</title>
  <link>…/share/Xk2…</link>
  <pubDate>Thu, 15 Oct 2026 09:14:02 GMT</pubDate>
</item>`}</code>
      </pre>
    </UiCard>
  );
}

/** The real screenshot Tripwire took of the demo page, with the picker's regions drawn on it. */
export function PickerFragment({ priority = false }: { priority?: boolean }) {
  const regions = [
    { x: 254, y: 180, w: 104, h: 48, kind: "watch", label: "watching" },
    { x: 254, y: 244, w: 92, h: 46, kind: "watch", label: "watching" },
    { x: 254, y: 304, w: 770, h: 64, kind: "auto", label: "auto-ignored" },
    { x: 1004, y: 10, w: 258, h: 30, kind: "auto", label: "auto-ignored" },
  ];
  return (
    <UiCard className="overflow-hidden p-2">
      <div className="relative">
        <Image src="/landing/price-before.webp" alt="Tripwire’s own screenshot of a product page, with the price and stock selected" width={1280} height={900} priority={priority} className="block h-auto w-full rounded-[3px]" />
        {regions.map((r) => (
          <div
            key={`${r.x}-${r.y}`}
            /* taste-skill-ignore: inside a data-ui interface fragment */ className={`absolute rounded-[3px] ${r.kind === "watch" ? "bg-[rgb(36_86_214/0.14)] shadow-[inset_0_0_0_2px_#2456d6]" : "bg-[repeating-linear-gradient(135deg,rgb(93_98_112/0.3)_0_5px,transparent_5px_10px)] shadow-[inset_0_0_0_1.5px_#5d6270]"}`}
            style={{ left: `${(r.x / 1280) * 100}%`, top: `${(r.y / 900) * 100}%`, width: `${(r.w / 1280) * 100}%`, height: `${(r.h / 900) * 100}%` }}
          >
            <span className="absolute -top-4 left-0 rounded-[3px] bg-[#26251e] px-1 text-[10.5px] leading-4 whitespace-nowrap text-white">{r.label}</span>
          </div>
        ))}
      </div>
    </UiCard>
  );
}
