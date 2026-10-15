import { desc, eq } from "drizzle-orm";
import { db, dbReady } from "@/db/client";
import { changes, targets, watches } from "@/db/schema";
import { config } from "@/server/config";

function xml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/** Per-page RSS feed: one item per detected change. The token is the capability. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  await dbReady;
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return new Response("Not found", { status: 404 });
  const watch = await db.query.watches.findFirst({ where: eq(watches.feedToken, token) });
  if (!watch) return new Response("Not found", { status: 404 });
  const target = await db.query.targets.findFirst({ where: eq(targets.id, watch.targetId) });
  const items = await db.select().from(changes).where(eq(changes.watchId, watch.id)).orderBy(desc(changes.createdAt)).limit(50);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${xml(`${watch.name} — Tripwire`)}</title>
  <link>${xml(target?.url ?? config.appUrl)}</link>
  <description>${xml(`Changes detected on ${target?.url ?? "this page"}`)}</description>
  <atom:link href="${xml(`${config.appUrl}/feeds/${token}`)}" rel="self" type="application/rss+xml"/>
  ${items
    .map(
      (c) => `<item>
    <title>${xml(c.aiSummary ?? c.summary)}</title>
    <link>${xml(`${config.appUrl}/share/${c.shareToken}`)}</link>
    <guid isPermaLink="false">${xml(c.id)}</guid>
    <pubDate>${new Date(c.createdAt).toUTCString()}</pubDate>
    <description>${xml(`${c.kind} · +${c.added} / −${c.removed} lines`)}</description>
  </item>`,
    )
    .join("\n  ")}
</channel>
</rss>`;
  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
