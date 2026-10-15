import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { previews, targets, watches } from "@/db/schema";
import { findVolatileSelectors, previewSensitivity, type CalibrationRender } from "@/core/calibrate";
import { classifyCheck } from "@/core/classify";
import { newId } from "@/core/hash";
import { assertPublicUrl } from "@/core/ssrf";
import { normalizeUrl } from "@/core/url";
import { HttpError } from "./http";
import { render, robotsAllows, type RenderResult } from "./render";
import { blobUrl, putBlob } from "./storage";

const CALIBRATION_RENDERS = 3;
const MAX_VOLATILE = 30;

/**
 * Render a page three times back-to-back. The first render powers the visual
 * picker; comparing all three reveals regions that change on every load, which
 * are pre-marked as ignored before the watch even exists.
 */
export async function createPreview(userId: string, rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  await assertPublicUrl(url);
  if (!(await robotsAllows(url))) {
    throw new HttpError(422, "This site's robots.txt asks automated tools not to visit this page.");
  }

  const renders: RenderResult[] = [];
  for (let i = 0; i < CALIBRATION_RENDERS; i++) {
    const out = await render({ url, collect: true, screenshot: i === 0 });
    if (i === 0) {
      const cls = classifyCheck({ status: out.status, networkError: out.networkError, title: out.title, text: out.text, html: out.html });
      if (cls.result !== "ok") throw new HttpError(422, `We couldn't load that page: ${cls.reason}.`);
    }
    renders.push(out);
  }

  const calibration: CalibrationRender[] = renders.map((r) => ({
    text: r.text,
    elements: r.elements.map((e) => ({ selector: e.selector, text: e.text })),
  }));
  const volatileSelectors = findVolatileSelectors(calibration).slice(0, MAX_VOLATILE);
  const sensitivity = previewSensitivity(calibration, volatileSelectors);

  const first = renders[0];
  if (!first.screenshot) throw new Error("Preview render produced no screenshot");
  const screenshotKey = await putBlob(first.screenshot, "png");
  const elements = first.elements.filter((e) => e.box.y < first.height);

  const id = newId();
  await db.insert(previews).values({
    id,
    userId,
    url,
    title: first.title || null,
    screenshotKey,
    width: first.width,
    height: first.height,
    elements,
    volatileSelectors,
    sensitivityPreview: sensitivity,
    createdAt: Date.now(),
  });

  const existingTarget = await db.query.targets.findFirst({ where: eq(targets.url, url) });
  const watchers = existingTarget
    ? Number((await db.select({ n: sql<number>`count(*)` }).from(watches).where(eq(watches.targetId, existingTarget.id)))[0]?.n ?? 0)
    : 0;

  return {
    id,
    url,
    title: first.title,
    screenshotUrl: blobUrl(screenshotKey),
    width: first.width,
    height: first.height,
    elements,
    volatileSelectors,
    sensitivityPreview: sensitivity,
    existingWatchers: watchers,
    renderMs: renders.reduce((n, r) => n + r.durationMs, 0),
  };
}
