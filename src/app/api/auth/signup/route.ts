import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { channels, users } from "@/db/schema";
import { newId } from "@/core/hash";
import { createSession, createUser, publicUser } from "@/server/auth";
import { clientIp, HttpError, ok, parseJson, rateLimit, route, withSessionCookie } from "@/server/http";
import { signupSchema } from "@/server/schemas";

export const POST = route(async (req) => {
  rateLimit(`signup:${clientIp(req)}`, 10, 60 * 60_000);
  const input = await parseJson(req, signupSchema);
  if (await db.query.users.findFirst({ where: eq(users.email, input.email.toLowerCase()) })) {
    throw new HttpError(409, "An account with this email already exists — sign in instead");
  }
  const user = await createUser(input);
  // Email alerts work out of the box: default channel is the account email.
  await db.insert(channels).values({
    id: newId(),
    userId: user.id,
    type: "email",
    label: "Account email",
    config: { email: user.email },
    createdAt: Date.now(),
  });
  return withSessionCookie(ok({ user: publicUser(user) }, { status: 201 }), await createSession(user.id));
});
