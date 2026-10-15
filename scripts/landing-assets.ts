/**
 * Produces the landing page's pictures from Tripwire's own output: real
 * headless-Chromium screenshots of the chaos site and a real visual diff.
 *   npm run landing:assets
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.TRIPWIRE_ALLOW_PRIVATE = "1";
process.env.BLOB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tripwire-landing-"));

const OUT = path.resolve("public", "landing");
const CROP_HEIGHT = 900;

async function main(): Promise<void> {
  const { createChaosServer } = await import("../chaos/app");
  const { render, closeBrowser } = await import("../src/server/render");
  const { visualDiff } = await import("../src/server/visualdiff");
  const { putBlob, getBlob } = await import("../src/server/storage");
  const sharp = (await import("sharp")).default;

  const chaos = createChaosServer();
  await new Promise<void>((resolve) => chaos.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(chaos.server.address() as AddressInfo).port}`;
  fs.mkdirSync(OUT, { recursive: true });

  const shot = async (pathname: string): Promise<Buffer> => {
    const out = await render({ url: `${base}${pathname}`, screenshot: true });
    if (!out.screenshot) throw new Error(`No screenshot for ${pathname}`);
    return out.screenshot;
  };
  const save = async (buf: Buffer, name: string, height = CROP_HEIGHT, left = 0, width?: number) => {
    const meta = await sharp(buf).metadata();
    await sharp(buf)
      .extract({ left, top: 0, width: width ?? (meta.width ?? 1280) - left, height: Math.min(height, meta.height ?? height) })
      .webp({ quality: 86 })
      .toFile(path.join(OUT, name));
    process.stdout.write(`✓ public/landing/${name}\n`);
  };

  try {
    const before = await shot("/price");
    chaos.state.price = 24;
    chaos.state.inStock = true;
    const after = await shot("/price");
    await save(before, "price-before.webp");
    await save(after, "price-after.webp");

    const diff = await visualDiff(await putBlob(before, "png"), await putBlob(after, "png"));
    const heat = diff ? await getBlob(diff.diffKey) : null;
    if (heat && diff) {
      const pad = 6;
      const outlines = diff.boxes
        .map((b) => `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + pad * 2}" height="${b.h + pad * 2}" rx="4" fill="none" stroke="#2456d6" stroke-width="3"/>`)
        .join("");
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${diff.width}" height="${diff.height}">${outlines}</svg>`);
      const composed = await sharp(heat).composite([{ input: svg }]).png().toBuffer();
      await save(composed, "price-heat.webp");
      process.stdout.write(`  visual diff: ${(diff!.ratio * 100).toFixed(2)}% of pixels, ${diff!.boxes.length} regions\n`);
    }

    await save(await shot("/timestamp"), "timestamp.webp", 760);
    // Tight crop so the challenge text reads at panel size.
    await save(await shot("/captcha"), "captcha.webp", 300, 220, 840);
  } finally {
    await closeBrowser();
    chaos.server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
