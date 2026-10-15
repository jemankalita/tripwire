import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { outbox } from "@/db/schema";
import { ok, requireAuth, route } from "@/server/http";

/** In-app inbox: every email Tripwire sent this user (works without SMTP). */
export const GET = route(async (req) => {
  const { user } = await requireAuth(req);
  const rows = await db.select().from(outbox).where(eq(outbox.userId, user.id)).orderBy(desc(outbox.createdAt)).limit(100);
  return ok({
    emails: rows.map((r) => ({ id: r.id, to: r.to, subject: r.subject, html: r.html, text: r.text, createdAt: r.createdAt })),
  });
});
