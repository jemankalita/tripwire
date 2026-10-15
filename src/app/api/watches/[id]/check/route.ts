import { ok, rateLimit, requireAuth, route } from "@/server/http";
import { checkNow } from "@/server/watches";

type Params = { id: string };

export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { id } = await params;
  rateLimit(`check-now:${id}`, 2, 60_000);
  return ok(await checkNow(user.id, id));
});
