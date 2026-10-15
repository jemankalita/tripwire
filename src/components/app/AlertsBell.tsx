"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, useAlerts, useMe, type AppAlert } from "@/lib/api";
import { absoluteTime, relativeTime } from "@/lib/format";
import { cn } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";

const KIND: Record<AppAlert["kind"], { verb: string; tone: string; toast: "info" | "error" | "success" }> = {
  content: { verb: "changed", tone: "text-changed", toast: "info" },
  keyword: { verb: "matched a keyword", tone: "text-accent", toast: "info" },
  number: { verb: "number changed", tone: "text-changed", toast: "info" },
  down: { verb: "is unreachable", tone: "text-error", toast: "error" },
  up: { verb: "is back online", tone: "text-ok", toast: "success" },
};

const MAX_POPUPS_AT_ONCE = 3;

/**
 * In-app alerts: a bell with an unread count, a panel of recent alerts, and
 * optional pop-ups for alerts that arrive while Tripwire is open.
 */
export function AlertsBell({ popupsDefault }: { popupsDefault: boolean }) {
  const { data, mutate } = useAlerts();
  const { data: me } = useMe();
  const popups = me?.user.inAppPopups ?? popupsDefault;
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  // Alerts this tab already knows about. The first load primes it silently,
  // so pop-ups only appear for alerts that arrive while the page is open.
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!data) return;
    if (known.current === null) {
      known.current = new Set(data.alerts.map((a) => a.id));
      return;
    }
    const fresh = data.alerts.filter((a) => !known.current!.has(a.id));
    fresh.forEach((a) => known.current!.add(a.id));
    if (!popups) return;
    fresh
      .slice(0, MAX_POPUPS_AT_ONCE)
      .reverse()
      .forEach((a) =>
        toast({
          tone: KIND[a.kind].toast,
          title: `${a.watchName} ${KIND[a.kind].verb}`,
          description: a.summary,
          action: { label: "View", onClick: () => router.push(`/app/w/${a.watchId}`) },
        }),
      );
  }, [data, popups, toast, router]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = data?.unread ?? 0;

  const toggle = async () => {
    const opening = !open;
    setOpen(opening);
    if (!opening || unread === 0) return;
    // Keep the "new" dots visible while the panel is open, then mark everything read.
    setHighlight(new Set(data?.alerts.filter((a) => a.unread).map((a) => a.id)));
    await api("/api/alerts", { method: "POST" }).catch(() => undefined);
    await mutate();
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}
        title="Alerts"
        className="relative inline-flex size-8 items-center justify-center rounded-[6px] text-muted transition-[transform,background-color,color] duration-150 hover:bg-ink/[0.06] hover:text-ink active:scale-[0.94]"
      >
        <svg viewBox="0 0 24 24" className="size-[19px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", bounce: 0.4, duration: 0.35 }}
              className="absolute -top-0.5 -right-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-changed px-1 text-[10.5px] font-semibold text-bg tabular"
            >
              {unread > 9 ? "9+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Alerts"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute top-10 right-0 z-50 w-[min(400px,calc(100vw-24px))] origin-top-right overflow-hidden rounded-[12px] bg-panel-2 shadow-float"
          >
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
              <p className="text-[15px] font-medium">Alerts</p>
              <Link href="/app/settings" onClick={() => setOpen(false)} className="text-[12.5px] text-muted hover:text-ink">
                Alert settings
              </Link>
            </div>
            {!data?.alerts.length ? (
              <p className="px-4 pt-2 pb-6 text-sm text-muted">No alerts yet. When a watched page really changes, it shows up here.</p>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto p-1.5">
                {data.alerts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/app/w/${a.watchId}`}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 rounded-[8px] px-2.5 py-2.5 transition-colors hover:bg-ink/[0.05]"
                    >
                      <span
                        className={cn("mt-1.5 size-2 shrink-0 rounded-full", highlight.has(a.id) || a.unread ? "bg-changed" : "bg-transparent")}
                        aria-label={highlight.has(a.id) || a.unread ? "New" : undefined}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[13.5px] font-medium">{a.watchName}</span>
                          <span className="shrink-0 text-[12px] text-muted" title={absoluteTime(a.createdAt)}>
                            {relativeTime(a.createdAt)}
                          </span>
                        </span>
                        <span className={cn("block text-[12.5px]", KIND[a.kind].tone)}>{KIND[a.kind].verb}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink">{a.summary}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
