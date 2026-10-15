import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { sha256 } from "@/core/hash";
import type { Box } from "@/db/schema";
import { getBlob, getDerived, putBlob, putDerived } from "./storage";

export type VisualDiff = {
  ratio: number;
  boxes: Box[];
  diffKey: string;
  width: number;
  height: number;
};

const CELL = 24;
const MAX_BOXES = 40;
const DIFF_COLOR: [number, number, number] = [255, 92, 92];
const DIFF_COLOR_ALT: [number, number, number] = [61, 220, 151];

async function toCanvas(buf: Buffer, width: number, height: number): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = Math.min(meta.width ?? width, width);
  const h = Math.min(meta.height ?? height, height);
  const cropped = await sharp(buf).extract({ left: 0, top: 0, width: w, height: h }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: "#ffffff" } })
    .composite([{ input: cropped, top: 0, left: 0 }])
    .ensureAlpha()
    .raw()
    .toBuffer();
}

/** Flood-fill the coarse grid of changed cells into highlight boxes. */
function clusterBoxes(mask: Uint8Array, cols: number, rows: number): Box[] {
  const seen = new Uint8Array(mask.length);
  const boxes: Box[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let minX = cols, minY = rows, maxX = 0, maxY = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % cols;
      const y = Math.floor(idx / cols);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
        }
      }
    }
    boxes.push({ x: minX * CELL, y: minY * CELL, w: (maxX - minX + 1) * CELL, h: (maxY - minY + 1) * CELL });
  }
  return boxes.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, MAX_BOXES);
}

/**
 * Pixel diff between two screenshots: changed-pixel ratio, highlight boxes and a
 * heat-map image. Results are cached by the (before, after) pair.
 */
export async function visualDiff(beforeKey: string, afterKey: string): Promise<VisualDiff | null> {
  const cacheName = `${sha256(`${beforeKey}|${afterKey}`)}.json`;
  const cached = await getDerived(cacheName);
  if (cached) return JSON.parse(cached.toString("utf8")) as VisualDiff;

  const [before, after] = await Promise.all([getBlob(beforeKey), getBlob(afterKey)]);
  if (!before || !after) return null;

  const [ma, mb] = await Promise.all([sharp(before).metadata(), sharp(after).metadata()]);
  const width = Math.max(ma.width ?? 0, mb.width ?? 0);
  const height = Math.max(ma.height ?? 0, mb.height ?? 0);
  if (!width || !height) return null;

  const [a, b] = await Promise.all([toCanvas(before, width, height), toCanvas(after, width, height)]);
  const out = Buffer.alloc(width * height * 4);
  const changedPixels = pixelmatch(a, b, out, width, height, {
    threshold: 0.12,
    includeAA: false,
    alpha: 0.2,
    diffColor: DIFF_COLOR,
    diffColorAlt: DIFF_COLOR_ALT,
  });

  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const mask = new Uint8Array(cols * rows);
  const matches = (o: number, c: [number, number, number]) => out[o] === c[0] && out[o + 1] === c[1] && out[o + 2] === c[2];
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (matches(o, DIFF_COLOR) || matches(o, DIFF_COLOR_ALT)) {
      mask[Math.floor(Math.floor(i / width) / CELL) * cols + Math.floor((i % width) / CELL)] = 1;
    }
  }

  const diffPng = await sharp(out, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  const result: VisualDiff = {
    ratio: changedPixels / (width * height),
    boxes: clusterBoxes(mask, cols, rows),
    diffKey: await putBlob(diffPng, "png"),
    width,
    height,
  };
  await putDerived(cacheName, JSON.stringify(result));
  return result;
}
