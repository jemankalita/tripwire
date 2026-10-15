import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, dbReady } from "@/db/client";
import { changes, snapshots, targets, versions, watches } from "@/db/schema";
import { diffTexts } from "@/core/diff";
import { displayUrl } from "@/core/url";
import { blobUrl } from "@/server/storage";
import { HunkTable } from "@/components/diff/DiffLines";
import { Wordmark } from "@/components/ui/Wordmark";

export const metadata: Metadata = { title: "Change", robots: { index: false, follow: false } };

async function loadSide(versionId: string | null) {
  if (!versionId) return null;
  const version = await db.query.versions.findFirst({ where: eq(versions.id, versionId) });
  if (!version) return null;
  const snapshot = await db.query.snapshots.findFirst({ where: eq(snapshots.id, version.snapshotId) });
  return { version, screenshot: blobUrl(snapshot?.screenshotKey) };
}

/** Public, read-only view of one change — the link every alert points to. */
export default async function SharePage({ params }: PageProps<"/share/[token]">) {
  await dbReady;
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const change = await db.query.changes.findFirst({ where: eq(changes.shareToken, token) });
  if (!change) notFound();
  const watch = await db.query.watches.findFirst({ where: eq(watches.id, change.watchId) });
  const target = watch ? await db.query.targets.findFirst({ where: eq(targets.id, watch.targetId) }) : undefined;
  if (!watch || !target) notFound();

  const [from, to] = await Promise.all([loadSide(change.fromVersionId), loadSide(change.toVersionId)]);
  const diff = from && to ? diffTexts(from.version.text, to.version.text) : null;
  const when = new Date(change.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-24 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        <Wordmark />
        <Link href="/signup" className="text-sm font-medium text-accent hover:underline">
          Watch your own pages
        </Link>
      </header>

      <section className="pt-10">
        <p className="text-sm text-muted">
          {watch.name} · {when} UTC
        </p>
        <h1 className="mt-2 max-w-3xl text-[clamp(28px,3.4vw,44px)] leading-[1.05] font-medium tracking-[-0.04em]">{change.aiSummary ?? change.summary}</h1>
        <a href={target.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-mono text-[13px] text-muted hover:text-accent">
          {displayUrl(target.url)} ↗
        </a>
      </section>

      {diff ? (
        <>
          <section className="mt-10 flex flex-col gap-3" aria-label="Text changes">
            <p className="text-sm">
              <b className="font-medium text-add-ink">+{diff.added}</b> <b className="font-medium text-del-ink">−{diff.removed}</b> lines
              {diff.noiseHunks > 0 && <span className="text-muted"> · {diff.noiseHunks} noise-only change(s) hidden</span>}
            </p>
            {diff.hunks.filter((h) => !h.noise).map((h, i) => (
              <HunkTable key={i} hunk={h} />
            ))}
          </section>
          {(from?.screenshot || to?.screenshot) && (
            <section className="mt-12 grid gap-4 md:grid-cols-2" aria-label="Screenshots">
              {[
                { label: "Before", src: from?.screenshot },
                { label: "After", src: to?.screenshot },
              ].map((s) => (
                <figure key={s.label}>
                  <figcaption className="mb-2 text-sm text-muted">{s.label}</figcaption>
                  <div className="max-h-[70vh] overflow-y-auto rounded-[10px] bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element -- content-addressed screenshot */}
                    {s.src ? <img src={s.src} alt={`${s.label} screenshot of ${watch.name}`} className="block w-full" /> : <p className="p-6 text-sm text-muted">Unavailable</p>}
                  </div>
                </figure>
              ))}
            </section>
          )}
        </>
      ) : (
        <p className="mt-10 rounded-[10px] bg-panel px-6 py-10 text-muted">
          {change.kind === "down" ? "The page could not be reached. This is a health alert, not a content change." : change.kind === "up" ? "The page is reachable again." : "Details for this event aren’t available."}
        </p>
      )}
    </div>
  );
}
