"use client";

import { useState } from "react";
import { useInbox } from "@/lib/api";
import { absoluteTime, relativeTime } from "@/lib/format";
import { cn, Skeleton } from "@/components/ui/controls";

/** Every email Tripwire sent — works with no SMTP configured, so alerts are visible in a demo. */
export function Inbox() {
  const { data, isLoading } = useInbox();
  const [selected, setSelected] = useState<string | null>(null);
  const emails = data?.emails ?? [];
  const current = emails.find((e) => e.id === selected) ?? emails[0];

  return (
    <div className="pt-8">
      <h1 className="text-[32px] leading-none font-medium tracking-[-0.035em]">Inbox</h1>
      <p className="mt-2 text-sm text-muted">Every email alert and digest we’ve sent you.</p>

      {isLoading ? (
        <Skeleton className="mt-8 h-96" />
      ) : emails.length === 0 ? (
        <p className="mt-10 rounded-[10px] bg-panel px-6 py-12 text-center text-muted">No emails yet. Alerts land here the moment a watched page really changes.</p>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <ul className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
            {emails.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSelected(e.id)}
                  aria-current={current?.id === e.id}
                  className={cn("w-full rounded-[8px] px-3 py-2.5 text-left transition-colors", current?.id === e.id ? "bg-accent-soft" : "hover:bg-panel")}
                >
                  <span className="block truncate text-sm font-medium">{e.subject}</span>
                  <span className="mt-0.5 block text-[12.5px] text-muted" title={absoluteTime(e.createdAt)}>
                    {e.to} · {relativeTime(e.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {current && (
            <article className="min-w-0 overflow-hidden rounded-[10px] bg-panel">
              <header className="px-5 py-4">
                <h2 className="text-lg font-medium">{current.subject}</h2>
                <p className="text-[13px] text-muted">
                  To {current.to} · {absoluteTime(current.createdAt)}
                </p>
              </header>
              {/* Rendered in a fully sandboxed frame: no scripts, no same-origin access. */}
              <iframe title={current.subject} sandbox="" srcDoc={current.html} className="h-[560px] w-full bg-white" />
            </article>
          )}
        </div>
      )}
    </div>
  );
}
