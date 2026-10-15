import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { publicUser } from "@/server/auth";
import { config } from "@/server/config";
import { ok, parseJson, requireAuth, route } from "@/server/http";
import { settingsSchema } from "@/server/schemas";

export const GET = route(async (req) => {
  const { user } = await requireAuth(req);
  return ok({
    user: publicUser(user),
    features: {
      ai: config.aiEnabled,
      smtp: Boolean(config.smtpUrl),
      telegram: Boolean(config.telegramBotToken),
      confirmDelayMs: config.confirmDelayMs,
    },
  });
});

export const PATCH = route(async (req) => {
  const { user } = await requireAuth(req);
  const patch = await parseJson(req, settingsSchema);
  const [updated] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
  return ok({ user: publicUser(updated) });
});
