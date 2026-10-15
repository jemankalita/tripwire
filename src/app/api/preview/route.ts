import { ok, parseJson, rateLimit, requireAuth, route } from "@/server/http";
import { previewSchema } from "@/server/schemas";
import { createPreview } from "@/server/previews";

export const maxDuration = 120;

export const POST = route(async (req) => {
  const { user } = await requireAuth(req);
  rateLimit(`preview:${user.id}`, 12, 10 * 60_000);
  const { url } = await parseJson(req, previewSchema);
  return ok({ preview: await createPreview(user.id, url) });
});
