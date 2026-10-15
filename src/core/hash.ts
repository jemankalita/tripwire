import { createHash, randomBytes } from "node:crypto";

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** URL-safe random token for share links, RSS feeds, sessions and API keys. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** Short, URL-safe primary key. */
export function newId(): string {
  return randomToken(12);
}
