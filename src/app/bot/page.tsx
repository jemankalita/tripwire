import type { Metadata } from "next";
import { Wordmark } from "@/components/ui/Wordmark";

export const metadata: Metadata = { title: "About TripwireBot" };

const RULES = [
  ["One fetch per page, however many people watch it.", "Watches of the same URL share a single render. Two hundred watchers cost a site exactly one request per interval."],
  ["Never more often than every 15 minutes.", "And spread out with random jitter so checks don’t arrive in bursts."],
  ["One request at a time per host, ten seconds apart.", "A per-host gate queues everything else."],
  ["We back off when asked.", "429 and 503 responses with Retry-After are honoured; repeated failures open a circuit breaker for 30 minutes."],
  ["robots.txt is respected.", "Disallowed paths are never fetched and the watch shows as blocked."],
  ["Conditional requests first.", "When a page sends ETag or Last-Modified headers, we ask before rendering and skip the render on 304."],
  ["Public pages only.", "No logins, no stored credentials, no private network addresses."],
];

export default function BotPage() {
  return (
    <div className="mx-auto max-w-[760px] px-5 pb-24">
      <header className="flex h-16 items-center">
        <Wordmark />
      </header>
      <h1 className="mt-12 text-[clamp(32px,4vw,52px)] leading-[1.02] font-medium tracking-[-0.045em]">TripwireBot is a polite visitor.</h1>
      <p className="mt-4 text-lg text-muted">
        It fetches public pages on behalf of people who asked to be told when they change. If it visits your site, this is how it behaves.
      </p>
      <dl className="mt-12 flex flex-col gap-8">
        {RULES.map(([title, body]) => (
          <div key={title}>
            <dt className="text-[19px] font-medium tracking-[-0.02em]">{title}</dt>
            <dd className="mt-1 text-muted">{body}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-14 text-muted">
        To stop visits entirely, add <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[14px]">User-agent: TripwireBot</code> and{" "}
        <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[14px]">Disallow: /</code> to your robots.txt.
      </p>
    </div>
  );
}
