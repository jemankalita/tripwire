import { authenticate, createSession, publicUser } from "@/server/auth";
import { clientIp, HttpError, ok, parseJson, rateLimit, route, withSessionCookie } from "@/server/http";
import { loginSchema } from "@/server/schemas";

export const POST = route(async (req) => {
  const input = await parseJson(req, loginSchema);
  // Per-account limit independent of IP, plus a per-client limit.
  rateLimit(`login-email:${input.email.toLowerCase()}`, 10, 15 * 60_000);
  rateLimit(`login-ip:${clientIp(req)}`, 50, 15 * 60_000);
  const user = await authenticate(input.email, input.password);
  if (!user) throw new HttpError(401, "That email and password don't match");
  return withSessionCookie(ok({ user: publicUser(user) }), await createSession(user.id));
});
