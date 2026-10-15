import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { changes, users, watches } from "@/db/schema";
import { ok, requireAuth, route } from "@/server/http";

const RECENT_ALERTS = 30;

/**
 * In-app alert feed: the same alerts sent to email/Discord/Telegram, newest
 * first, with an unread count for the bell.
 */
export const GET = route(async (req) => {
  const { user } = await requireAuth(req);
  const seenAt = user.alertsSeenAt ?? 0;
  const mine = and(eq(watches.userId, user.id), eq(changes.alerted, true));

  const [rows, [{ unread }]] = await Promise.all([
    db
      .select({
        id: changes.id,
        kind: changes.kind,
        summary: changes.summary,
        aiSummary: changes.aiSummary,
        createdAt: changes.createdAt,
        watchId: watches.id,
        watchName: watches.name,
      })
      .from(changes)
      .innerJoin(watches, eq(changes.watchId, watches.id))
      .where(mine)
      .orderBy(desc(changes.createdAt))
      .limit(RECENT_ALERTS),
    db
      .select({ unread: sql<number>`count(*)` })
      .from(changes)
      .innerJoin(watches, eq(changes.watchId, watches.id))
      .where(and(mine, gt(changes.createdAt, seenAt))),
  ]);

  return ok(
    {
      alerts: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        watchId: r.watchId,
        watchName: r.watchName,
        summary: r.aiSummary ?? r.summary,
        createdAt: r.createdAt,
        unread: r.createdAt > seenAt,
      })),
      unread: Number(unread),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});

/** Mark every alert as read. */
export const POST = route(async (req) => {
  const { user } = await requireAuth(req);
  await db.update(users).set({ alertsSeenAt: Date.now() }).where(eq(users.id, user.id));
  return ok({ unread: 0 });
});
