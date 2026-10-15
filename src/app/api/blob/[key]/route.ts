import { getBlob, isBlobKey } from "@/server/storage";

const TYPES: Record<string, string> = { png: "image/png", webp: "image/webp", jpg: "image/jpeg" };

/**
 * Screenshots are content-addressed by SHA-256 (unguessable 256-bit keys), so
 * the key itself acts as a capability — the same model as a signed URL.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ext = key.split(".").pop() ?? "";
  if (!isBlobKey(key) || !TYPES[ext]) return new Response("Not found", { status: 404 });
  const data = await getBlob(key);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[ext],
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
