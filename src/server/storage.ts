import fs from "node:fs/promises";
import path from "node:path";
import { sha256 } from "@/core/hash";

const ROOT = process.env.BLOB_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "blobs");
const BLOB_KEY = /^[a-f0-9]{64}\.(png|webp|jpg|json)$/;

export type BlobExt = "png" | "webp" | "jpg" | "json";

export function isBlobKey(key: string): boolean {
  return BLOB_KEY.test(key);
}

function blobPath(key: string): string {
  if (!isBlobKey(key)) throw new Error("Invalid blob key");
  return path.join(/* turbopackIgnore: true */ ROOT, key.slice(0, 2), key);
}

function derivedPath(name: string): string {
  if (!isBlobKey(name)) throw new Error("Invalid derived key");
  return path.join(/* turbopackIgnore: true */ ROOT, "derived", name);
}

async function writeAtomic(file: string, data: Buffer | string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data);
  try {
    await fs.rename(tmp, file);
  } catch (error) {
    // Another process wrote the same content-addressed file first: that's fine.
    await fs.rm(tmp, { force: true });
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "EPERM") throw error;
  }
}

/** Content-addressed: identical screenshots are stored once. */
export async function putBlob(data: Buffer, ext: BlobExt): Promise<string> {
  const key = `${sha256(data)}.${ext}`;
  const file = blobPath(key);
  try {
    await fs.access(file);
  } catch {
    await writeAtomic(file, data);
  }
  return key;
}

export async function getBlob(key: string): Promise<Buffer | null> {
  if (!isBlobKey(key)) return null;
  try {
    return await fs.readFile(blobPath(key));
  } catch {
    return null;
  }
}

export async function getDerived(name: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(derivedPath(name));
  } catch {
    return null;
  }
}

export async function putDerived(name: string, data: Buffer | string): Promise<void> {
  await writeAtomic(derivedPath(name), data);
}

export function blobUrl(key: string | null | undefined): string | null {
  return key ? `/api/blob/${key}` : null;
}
