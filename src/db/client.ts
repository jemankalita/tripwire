import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

const BUSY_TIMEOUT_MS = 10_000;

const DEFAULT_URL = `file:${path.join(process.cwd(), "data", "tripwire.db").replace(/\\/g, "/")}`;

function databaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_URL;
}

function ensureDir(url: string): void {
  if (!url.startsWith("file:") || url.includes(":memory:")) return;
  fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
}

type Handle = { client: Client; db: Db; ready: Promise<void> };

// Survive Next.js dev hot reloads without opening a new connection each time.
const globalForDb = globalThis as unknown as { __tripwireDb?: Handle };

function open(): Handle {
  const url = databaseUrl();
  ensureDir(url);
  // `timeout` is the busy timeout applied to EVERY pooled connection (a PRAGMA would
  // only reach one of them), so the web app and worker wait for each other's writes
  // instead of failing with SQLITE_BUSY. Foreign keys are on by default per connection.
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN, timeout: BUSY_TIMEOUT_MS });
  const ready = (async () => {
    if (!url.startsWith("file:")) return;
    // WAL is stored in the database file itself, so setting it once covers every connection.
    await client.execute("PRAGMA journal_mode = WAL");
  })();
  return { client, db: drizzle(client, { schema }), ready };
}

const handle = globalForDb.__tripwireDb ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.__tripwireDb = handle;

export const db = handle.db;
export const dbReady = handle.ready;
export const rawClient = handle.client;
export { schema };
