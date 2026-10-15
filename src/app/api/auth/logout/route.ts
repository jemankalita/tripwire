import { destroySession, readCookie, SESSION_COOKIE } from "@/server/auth";
import { clearSessionCookie, ok, route } from "@/server/http";

export const POST = route(async (req) => {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (token) await destroySession(token);
  return clearSessionCookie(ok({ signedOut: true }));
});
