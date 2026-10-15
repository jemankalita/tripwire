import { ok, parseJson, requireAuth, route } from "@/server/http";
import { updateWatchSchema } from "@/server/schemas";
import { deleteWatch, getWatchDetail, serializeWatch, updateWatch } from "@/server/watches";

type Params = { id: string };

export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { id } = await params;
  return ok({ watch: await getWatchDetail(user.id, id) });
});

export const PATCH = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { id } = await params;
  const patch = await parseJson(req, updateWatchSchema);
  const { watch, target } = await updateWatch(user.id, id, patch);
  return ok({ watch: serializeWatch(watch, target) });
});

export const DELETE = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { id } = await params;
  await deleteWatch(user.id, id);
  return ok({ deleted: true });
});
