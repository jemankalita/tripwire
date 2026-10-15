"use client";

import Link from "next/link";
import type { WatchDetail } from "@/lib/api";
import { absoluteTime, duration, relativeTime } from "@/lib/format";
import { cn } from "@/components/ui/controls";

type Check = WatchDetail["checks"][number];
type Event = WatchDetail["events"][number];

const RESULT: Record<Check["result"], { label: string; tone: string }> = {
  ok: { label: "OK", tone: "bg-ok-soft text-ok" },
  not_modified: { label: "304 · skipped", tone: "bg-ok-soft text-ok" },
  error: { label: "Error", tone: "bg-error-soft text-error" },
  blocked: { label: "Blocked", tone: "bg-blocked-soft text-blocked" },
  robots: { label: "robots.txt", tone: "bg-blocked-soft text-blocked" },
};

export function ChecksTable({ checks }: { checks: Check[] }) {
  if (!checks.length) return <p className="text-sm text-muted">No checks yet.</p>;
  return (
    <div className="overflow-x-auto rounded-[10px] bg-panel">
      <table className="w-full min-w-[640px] text-[13.5px]">
        <thead className="text-left text-[12.5px] text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">When</th>
            <th className="px-4 py-2.5 font-medium">Result</th>
            <th className="px-4 py-2.5 font-medium">Detail</th>
            <th className="px-4 py-2.5 text-right font-medium">Took</th>
            <th className="px-4 py-2.5 text-right font-medium" title="Watches served by this one fetch">
              Served
            </th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.id} className="odd:bg-panel-2/50">
              <td className="px-4 py-2 whitespace-nowrap" title={absoluteTime(c.startedAt)}>
                {relativeTime(c.startedAt)}
              </td>
              <td className="px-4 py-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap", RESULT[c.result].tone)}>{RESULT[c.result].label}</span>
                {c.confirm && <span className="ml-2 text-[12px] text-accent">confirmation</span>}
              </td>
              <td className="max-w-[320px] truncate px-4 py-2 text-muted">
                {c.httpStatus ? `HTTP ${c.httpStatus} · ` : ""}
                {c.reason}
              </td>
              <td className="px-4 py-2 text-right tabular text-muted">{duration(c.durationMs)}</td>
              <td className="px-4 py-2 text-right tabular text-muted">
                {c.watchers} watch{c.watchers === 1 ? "" : "es"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const KIND: Record<Event["kind"], { label: string; tone: string }> = {
  content: { label: "Changed", tone: "text-changed" },
  keyword: { label: "Keyword", tone: "text-accent" },
  number: { label: "Number", tone: "text-changed" },
  down: { label: "Down", tone: "text-error" },
  up: { label: "Recovered", tone: "text-ok" },
};

export function EventsList({ events }: { events: Event[] }) {
  if (!events.length) return <p className="text-sm text-muted">Nothing has happened yet. That’s usually good news.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-[8px] px-3 py-2.5 hover:bg-panel">
          <span className={cn("w-20 text-[12.5px] font-medium", KIND[e.kind].tone)}>{KIND[e.kind].label}</span>
          <span className="min-w-0 flex-1 text-[14px]">{e.summary}</span>
          <span className="text-[12.5px] text-muted" title={absoluteTime(e.createdAt)}>
            {relativeTime(e.createdAt)}
            {!e.alerted && " · not alerted"}
          </span>
          <Link href={e.shareUrl} className="text-[12.5px] text-accent hover:underline" target="_blank">
            Share link
          </Link>
        </li>
      ))}
    </ul>
  );
}
