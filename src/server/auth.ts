import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users, type User } from "@/db/schema";
import { newId, randomToken, sha256 } from "@/core/hash";

export const SESSION_COOKIE = "tw_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
const KEY_LENGTH = 64;
const API_TOKEN_PREFIX = "tw_";
const DUMMY_HASH = `scrypt$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(KEY_LENGTH).toString("base64")}`;

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createUser(input: { email: string; name: string; password: string }): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      id: newId(),
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: await hashPassword(input.password),
      createdAt: Date.now(),
    })
    .returning();
  return user;
}

export async function authenticate(email: string, password: string): Promise<User | null> {
  const user = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
  // Always run scrypt so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return user && ok ? user : null;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomToken(32);
  const now = Date.now();
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt: now + SESSION_TTL_MS, createdAt: now });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function userFromSessionToken(token: string | undefined | null): Promise<User | null> {
  if (!token) return null;
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, Date.now())),
  });
  if (!session) return null;
  return (await db.query.users.findFirst({ where: eq(users.id, session.userId) })) ?? null;
}

export async function userFromApiToken(token: string): Promise<User | null> {
  if (!token.startsWith(API_TOKEN_PREFIX)) return null;
  return (await db.query.users.findFirst({ where: eq(users.apiTokenHash, sha256(token)) })) ?? null;
}

/** Issues a new API token (for the browser extension); only its hash is stored. */
export async function rotateApiToken(userId: string): Promise<string> {
  const token = `${API_TOKEN_PREFIX}${randomToken(24)}`;
  await db.update(users).set({ apiTokenHash: sha256(token) }).where(eq(users.id, userId));
  return token;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export type AuthResult = { user: User; via: "session" | "token" };

export async function authenticateRequest(req: Request): Promise<AuthResult | null> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (bearer) {
    const user = await userFromApiToken(bearer);
    return user ? { user, via: "token" } : null;
  }
  const user = await userFromSessionToken(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  return user ? { user, via: "session" } : null;
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    digestHour: user.digestHour,
    timezone: user.timezone,
    inAppPopups: user.inAppPopups,
    hasApiToken: Boolean(user.apiTokenHash),
  };
}
