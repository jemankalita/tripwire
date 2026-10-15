"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { api, ApiError, useWatch } from "@/lib/api";
import { absoluteTime, formatInterval, relativeTime } from "@/lib/format";
import { Button, Segmented, Skeleton } from "@/components/ui/controls";
import { StatusPill } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { ChecksTable, EventsList } from "./Activity";
import { DiffViewer } from "./DiffViewer";
import { NumberChart } from "./NumberChart";
import { Timeline } from "./Timeline";
import { WatchSettingsSheet } from "./WatchSettingsSheet";

type LowerTab = "events" | "checks" | "numbers";

function Banner({ tone, children }: { tone: "accent" | "changed" | "error"; children: React.ReactNode }) {
  const look = { accent: "bg-accent-soft", changed: "bg-changed-soft", error: "bg-error-soft" }[tone];
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`mt-4 rounded-[10px] px-4 py-3 text-sm ${look}`}>
      {children}
    </motion.div>
  );
}

export function WatchDetailView({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, error, isLoading, mutate } = useWatch(id);
  const [picked, setPicked] = useState<{ from: string | null; to: string | null } | null>(null);
  const [lower, setLower] = useState<LowerTab>("events");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const w = data?.watch;

  // Until the user picks, compare the newest version with the one before it.
  const exists = (vid: string | null) => Boolean(vid && w?.versions.some((v) => v.id === vid));
  const toId = picked && exists(picked.to) ? picked.to : (w?.versions[0]?.id ?? null);
  const fromId = picked && exists(picked.from) ? picked.from : picked ? null : (w?.versions[1]?.id ?? null);
  const setFromId = (from: string | null) => setPicked((p) => ({ to: p?.to ?? toId, from }));

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="pt-16">
        <h1 className="text-2xl font-medium">This watch doesn’t exist</h1>
        <p className="mt-2 text-muted">It may have been deleted.</p>
        <Link href="/app" className="mt-6 inline-block text-accent hover:underline">
          Back to your watches
        </Link>
      </div>
    );
  }
  if (isLoading || !w) {
    return (
      <div className="space-y-4 pt-8">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-5 w-56" />
        <div className="grid gap-6 pt-6 lg:grid-cols-[300px_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const run = async (key: string, fn: () => Promise<unknown>, success: string, description?: string) => {
    setBusy(key);
    try {
      await fn();
      toast({ tone: "success", title: success, description });
      await mutate();
      await mutateGlobal("/api/watches");
    } catch (err) {
      toast({ tone: "error", title: "That didn’t work", description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api(`/api/watches/${w.id}`, { method: "DELETE" });
      await mutateGlobal("/api/watches");
      toast({ tone: "success", title: `Stopped watching ${w.name}` });
      router.push("/app");
    } catch (err) {
      toast({ tone: "error", title: "Couldn’t delete", description: (err as Error).message });
      setBusy(null);
    }
  };

  const copyFeed = async () => {
    const url = `${window.location.origin}${w.feedUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ tone: "success", title: "RSS link copied", description: "Paste it into any feed reader." });
    } catch {
      toast({ tone: "info", title: "RSS feed", description: url });
    }
  };

  const latestChange = w.events.find((e) => e.kind === "content" || e.kind === "keyword" || e.kind === "number");

  return (
    <div className="pt-6">
      <Link href="/app" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <span aria-hidden>←</span> All watches
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] leading-[1.05] font-medium tracking-[-0.035em]">{w.name}</h1>
            <StatusPill status={w.status} reason={w.statusReason} />
          </div>
          <a href={w.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block max-w-full truncate font-mono text-[13px] text-muted hover:text-accent">
            {w.displayUrl} ↗
          </a>
          {latestChange && (
            <p className="mt-3 max-w-2xl text-[18px] leading-snug text-ink">
              {latestChange.summary} <span className="text-[13px] text-muted">· {relativeTime(latestChange.createdAt)}</span>
            </p>
          )}
          <p className="mt-2 text-[13px] text-muted">
            Checked {relativeTime(w.lastCheckedAt)} · every {formatInterval(w.effectiveIntervalMin)}
            {w.effectiveIntervalMin !== w.intervalMin && ` (you asked for ${formatInterval(w.intervalMin)}; another watcher wants it sooner)`} · sensitivity {w.sensitivity}
            {w.sharedWith > 0 && ` · one fetch shared by ${w.sharedWith + 1} watchers`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            loading={busy === "check"}
            onClick={() => run("check", () => api(`/api/watches/${w.id}/check`, { method: "POST" }), "Check queued", "Results land here in a few seconds.")}
          >
            Check now
          </Button>
          <Button
            loading={busy === "pause"}
            onClick={() => run("pause", () => api(`/api/watches/${w.id}`, { method: "PATCH", body: { paused: !w.paused } }), w.paused ? "Resumed" : "Paused")}
          >
            {w.paused ? "Resume" : "Pause"}
          </Button>
          <Button onClick={copyFeed}>RSS</Button>
          <Button onClick={() => setSettingsOpen(true)}>Settings</Button>
          {confirmDelete ? (
            <Button variant="danger" loading={busy === "delete"} onClick={remove} onBlur={() => setConfirmDelete(false)} autoFocus>
              Confirm delete
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </header>

      <AnimatePresence>
        {w.confirming && (
          <Banner tone="accent">
            <span className="breathe font-medium">Possible change spotted.</span> We’re rendering the page a second time before alerting, so a one-off glitch never reaches you.
          </Banner>
        )}
        {w.flapping && (
          <Banner tone="changed">
            <b className="font-medium">Alerts are muted:</b> this page still changes on most checks after noise filtering. Open the latest diff and use “Ignore these lines”, or lower the sensitivity.
          </Banner>
        )}
        {(w.status === "error" || w.status === "blocked") && (
          <Banner tone="error">
            <b className="font-medium">{w.status === "blocked" ? "Blocked:" : "Unreachable:"}</b> {w.statusReason}. This isn’t treated as a change — content alerts resume when the page is back. We back off politely in the meantime.
          </Banner>
        )}
      </AnimatePresence>

      <div className="mt-8 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        {w.versions.length > 0 ? (
          <Timeline
            versions={w.versions}
            fromId={fromId}
            toId={toId}
            onSelect={(vid) => {
              const idx = w.versions.findIndex((v) => v.id === vid);
              setPicked({ to: vid, from: w.versions[idx + 1]?.id ?? null });
            }}
            onCompareFrom={setFromId}
          />
        ) : (
          <div className="rounded-[10px] bg-panel p-4 text-sm text-muted">No versions yet.</div>
        )}
        <div className="min-w-0">
          {fromId && toId ? (
            <DiffViewer watchId={w.id} fromId={fromId} toId={toId} onIgnored={() => mutate()} />
          ) : w.versions[0] ? (
            <div>
              <p className="mb-3 text-sm text-muted">
                Baseline captured {absoluteTime(w.versions[0].createdAt)}. When something meaningful changes, the diff appears here.
              </p>
              {w.versions[0].screenshotUrl && (
                <div className="max-h-[70vh] overflow-y-auto rounded-[10px] bg-surface" data-ui>
                  {/* eslint-disable-next-line @next/next/no-img-element -- screenshot blob */}
                  <img src={w.versions[0].screenshotUrl} alt={`Baseline of ${w.name}`} className="block w-full" />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[10px] bg-panel px-6 py-16 text-center">
              <p className="breathe font-medium">Taking the first snapshot…</p>
              <p className="mt-1 text-sm text-muted">A real browser is rendering the page. This usually takes a few seconds.</p>
            </div>
          )}
        </div>
      </div>

      <section className="mt-14" aria-label="History">
        <Segmented
          name="lower"
          label="History view"
          value={lower}
          onChange={setLower}
          options={[
            { value: "events", label: "Events" },
            { value: "checks", label: "Checks" },
            ...(w.config.numberSelector ? [{ value: "numbers" as const, label: "Tracked number" }] : []),
          ]}
        />
        <div className="mt-4">
          {lower === "events" && <EventsList events={w.events} />}
          {lower === "checks" && <ChecksTable checks={w.checks} />}
          {lower === "numbers" && <NumberChart points={w.numbers} rule={w.config.numberRule} label="Tracked number" />}
        </div>
      </section>

      <WatchSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} watch={w} onSaved={() => mutate()} />
    </div>
  );
}
