import { ok, parseJson, rateLimit, requireAuth, route } from "@/server/http";
import { createWatchSchema } from "@/server/schemas";
import { createWatch, listWatches, serializeWatch } from "@/server/watches";

export const GET = route(async (req) => {
  const { user } = await requireAuth(req);
  return ok({ watches: await listWatches(user.id) });
});

export const POST = route(async (req) => {
  const { user } = await requireAuth(req);
  rateLimit(`create-watch:${user.id}`, 30, 60 * 60_000);
  const input = await parseJson(req, createWatchSchema);
  const { watch, target } = await createWatch(user.id, input);
  return ok({ watch: serializeWatch(watch, target) }, { status: 201 });
});
