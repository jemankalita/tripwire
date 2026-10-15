import { ok, parseJson, requireAuth, route } from "@/server/http";
import { ignoreLinesSchema } from "@/server/schemas";
import { ignoreLines } from "@/server/watches";

type Params = { id: string };

export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { id } = await params;
  const { lines } = await parseJson(req, ignoreLinesSchema);
  return ok(await ignoreLines(user.id, id, lines));
});
