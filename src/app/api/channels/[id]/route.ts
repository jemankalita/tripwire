import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { channels } from "@/db/schema";
import { HttpError, ok, parseJson, requireAuth, route } from "@/server/http";
import { channelPatchSchema } from "@/server/schemas";
import { serializeChannel } from "@/server/channels";

type Params = { id: string };

export const PATCH = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { id } = await params;
  const patch = await parseJson(req, channelPatchSchema);
  const [channel] = await db
    .update(channels)
    .set(patch)
    .where(and(eq(channels.id, id), eq(channels.userId, user.id)))
    .returning();
  if (!channel) throw new HttpError(404, "Channel not found");
  return ok({ channel: serializeChannel(channel) });
});

export const DELETE = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { id } = await params;
  const deleted = await db
    .delete(channels)
    .where(and(eq(channels.id, id), eq(channels.userId, user.id)))
    .returning({ id: channels.id });
  if (!deleted.length) throw new HttpError(404, "Channel not found");
  return ok({ deleted: true });
});
