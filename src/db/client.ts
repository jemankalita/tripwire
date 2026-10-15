import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

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
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const ready = (async () => {
    if (!url.startsWith("file:")) return;
    // Web app and worker share one SQLite file: WAL + busy timeout let them coexist.
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
    await client.execute("PRAGMA foreign_keys = ON");
  })();
  return { client, db: drizzle(client, { schema }), ready };
}

const handle = globalForDb.__tripwireDb ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.__tripwireDb = handle;

export const db = handle.db;
export const dbReady = handle.ready;
export const rawClient = handle.client;
export { schema };
