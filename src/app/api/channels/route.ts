import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { channels } from "@/db/schema";
import { newId } from "@/core/hash";
import { serializeChannel } from "@/server/channels";
import { HttpError, ok, parseJson, rateLimit, requireAuth, route } from "@/server/http";
import { channelSchema } from "@/server/schemas";

const MAX_CHANNELS = 10;
const DEFAULT_LABELS = { email: "Email", discord: "Discord", telegram: "Telegram" } as const;

export const GET = route(async (req) => {
  const { user } = await requireAuth(req);
  const rows = await db.select().from(channels).where(eq(channels.userId, user.id)).orderBy(asc(channels.createdAt));
  return ok({ channels: rows.map(serializeChannel) });
});

export const POST = route(async (req) => {
  const { user } = await requireAuth(req);
  rateLimit(`add-channel:${user.id}`, 10, 60 * 60_000);
  const input = await parseJson(req, channelSchema);
  const existing = await db.select({ id: channels.id }).from(channels).where(eq(channels.userId, user.id));
  if (existing.length >= MAX_CHANNELS) throw new HttpError(422, `You can add up to ${MAX_CHANNELS} channels`);

  const config =
    input.type === "email" ? { email: input.email } : input.type === "discord" ? { webhookUrl: input.webhookUrl } : { chatId: input.chatId };
  const [channel] = await db
    .insert(channels)
    .values({
      id: newId(),
      userId: user.id,
      type: input.type,
      label: input.label || DEFAULT_LABELS[input.type],
      config,
      createdAt: Date.now(),
    })
    .returning();
  return ok({ channel: serializeChannel(channel) }, { status: 201 });
});
