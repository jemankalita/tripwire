import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { channels } from "@/db/schema";
import { HttpError, ok, rateLimit, requireAuth, route } from "@/server/http";
import { sendTestAlert } from "@/server/notify";

type Params = { id: string };

export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { id } = await params;
  rateLimit(`test-channel:${id}`, 5, 60_000);
  rateLimit(`test-channel-user:${user.id}`, 10, 60 * 60_000);
  const channel = await db.query.channels.findFirst({ where: and(eq(channels.id, id), eq(channels.userId, user.id)) });
  if (!channel) throw new HttpError(404, "Channel not found");
  try {
    await sendTestAlert(channel);
  } catch (error) {
    throw new HttpError(502, `Test failed: ${(error as Error).message}`);
  }
  return ok({ sent: true });
});
