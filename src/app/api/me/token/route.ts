import { rotateApiToken } from "@/server/auth";
import { HttpError, ok, requireAuth, route } from "@/server/http";

/** Issue a fresh API token for the browser extension. Shown once; only its hash is stored. */
export const POST = route(async (req) => {
  const { user, via } = await requireAuth(req);
  if (via !== "session") throw new HttpError(403, "API tokens can only be issued from the web app");
  return ok({ token: await rotateApiToken(user.id) });
});
