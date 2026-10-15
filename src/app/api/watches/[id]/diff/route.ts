import { HttpError, ok, requireAuth, route } from "@/server/http";
import { diffBetween } from "@/server/watches";

type Params = { id: string };

export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { id } = await params;
  const search = new URL(req.url).searchParams;
  const from = search.get("from");
  const to = search.get("to");
  if (!from || !to) throw new HttpError(400, "Pick two versions to compare");
  return ok(await diffBetween(user.id, id, from, to));
});
