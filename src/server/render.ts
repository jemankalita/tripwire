import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import http from "node:http";
import https from "node:https";
import { chromium, type Browser, type BrowserContext, type Response } from "playwright";
import sharp from "sharp";
import { assertPublicHost, assertPublicUrl, BlockedTargetError, isPrivateIp, privateTargetsAllowed } from "@/core/ssrf";
import { BOT_NAME, isAllowedByRobots } from "@/core/robots";
import type { Box, PickerElement } from "@/db/schema";
import { config } from "./config";
import { AUTO_SCROLL_SCRIPT, EXTRACT_SCRIPT, FREEZE_CSS, SEED_RANDOM_SCRIPT } from "./extract";

export const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 ${BOT_NAME}/1.0 (+${config.appUrl}/bot)`;

const VIEWPORT = { width: 1280, height: 800 };

/** Third-party ad / tracker / analytics hosts: blocked at the network layer. */
const AD_HOSTS =
  /(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|googletagmanager\.com|google-analytics\.com|adservice\.google\.[a-z.]+|amazon-adsystem\.com|adnxs\.com|criteo\.(com|net)|taboola\.com|outbrain\.com|scorecardresearch\.com|quantserve\.com|hotjar\.com|clarity\.ms|segment\.(io|com)|mixpanel\.com|facebook\.net|ads-twitter\.com|adsrvr\.org|pubmatic\.com|rubiconproject\.com|openx\.net|moatads\.com|chartbeat\.(com|net)|nr-data\.net|fullstory\.com|optimizely\.com)$/i;

export type ViewSpec = { key: string; watch: string[]; ignore: string[] };

export type RenderRequest = {
  url: string;
  views?: ViewSpec[];
  boxSelectors?: string[];
  textSelectors?: string[];
  collect?: boolean;
  screenshot?: boolean;
};

export type RenderResult = {
  status: number | null;
  networkError: string | null;
  finalUrl: string;
  retryAfter: string | null;
  etag: string | null;
  lastModified: string | null;
  /** True when the document HTML itself contains most of the visible text (safe for 304 shortcuts). */
  serverRendered: boolean;
  title: string;
  text: string;
  html: string;
  views: Record<string, string>;
  boxes: Record<string, Box>;
  regionTexts: Record<string, string>;
  elements: PickerElement[];
  screenshot: Buffer | null;
  width: number;
  height: number;
  durationMs: number;
};

type Extracted = Pick<RenderResult, "title" | "text" | "html" | "views" | "boxes" | "regionTexts" | "elements"> & {
  docHeight: number;
};

const globalForBrowser = globalThis as unknown as { __tripwireBrowser?: Promise<Browser> };

async function getBrowser(): Promise<Browser> {
  const existing = globalForBrowser.__tripwireBrowser;
  if (existing) {
    const browser = await existing.catch(() => null);
    if (browser?.isConnected()) return browser;
  }
  const launching = chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-first-run"] });
  globalForBrowser.__tripwireBrowser = launching;
  return launching;
}

export async function closeBrowser(): Promise<void> {
  const existing = globalForBrowser.__tripwireBrowser;
  globalForBrowser.__tripwireBrowser = undefined;
  if (existing) await (await existing.catch(() => null))?.close().catch(() => undefined);
}

function startOfUtcDay(now: number): Date {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function cleanError(message: string): string {
  const net = message.match(/net::[A-Z_]+/);
  if (net) return net[0];
  if (/timeout/i.test(message)) return "Timed out loading the page";
  return message.split("\n")[0].slice(0, 200);
}

async function guardContext(context: BrowserContext): Promise<void> {
  const hostVerdicts = new Map<string, Promise<boolean>>();
  const hostIsPublic = (host: string) => {
    let verdict = hostVerdicts.get(host);
    if (!verdict) {
      verdict = assertPublicHost(host).then(() => true, () => false);
      hostVerdicts.set(host, verdict);
    }
    return verdict;
  };

  await context.route("**/*", async (route) => {
    const request = route.request();
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      return route.abort("blockedbyclient");
    }
    if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    if (url.protocol !== "http:" && url.protocol !== "https:") return route.abort("blockedbyclient");
    if (AD_HOSTS.test(url.hostname)) return route.abort("blockedbyclient");
    const type = request.resourceType();
    if (type === "media" || type === "websocket" || type === "eventsource") return route.abort("blockedbyclient");
    if (!(await hostIsPublic(url.hostname))) return route.abort("blockedbyclient");

    // Chromium follows redirects without routing them, so fetch every request
    // ourselves with redirects disabled and vet each Location hop first. The
    // browser then requests the next hop, which passes through this guard again.
    let response;
    try {
      response = await route.fetch({ maxRedirects: 0, timeout: config.navTimeoutMs });
    } catch {
      return route.abort("failed");
    }
    const location = response.headers()["location"];
    if (response.status() >= 300 && response.status() < 400 && location) {
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        return route.abort("blockedbyclient");
      }
      const allowedScheme = next.protocol === "http:" || next.protocol === "https:";
      if (!allowedScheme || !(await hostIsPublic(next.hostname))) return route.abort("blockedbyclient");
    }
    return route.fulfill({ response });
  });

  // context.route doesn't see WebSockets; monitoring never needs them, so refuse all.
  await context.routeWebSocket(() => true, (ws) => ws.close());
}

/** Redirects are not routed by Playwright, so re-validate every hop afterwards. */
async function assertRedirectChainPublic(response: Response): Promise<void> {
  for (let req: ReturnType<Response["request"]> | null = response.request(); req; req = req.redirectedFrom()) {
    await assertPublicHost(new URL(req.url()).hostname);
  }
}

function looksServerRendered(rawHtml: string, text: string): boolean {
  const lines = text.split("\n").filter((l) => l.length > 20).slice(0, 30);
  if (lines.length < 3) return false;
  const found = lines.filter((l) => rawHtml.includes(l.slice(0, 20))).length;
  return found / lines.length >= 0.7;
}

/**
 * Render a public page in headless Chromium with noise suppressed at the source:
 * frozen clock, seeded Math.random, ads/trackers blocked, animations off,
 * consent banners hidden. Returns text views, boxes and a screenshot.
 */
export async function render(req: RenderRequest): Promise<RenderResult> {
  const started = Date.now();
  await assertPublicUrl(req.url);
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    acceptDownloads: false,
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });

  const empty: RenderResult = {
    status: null,
    networkError: null,
    finalUrl: req.url,
    retryAfter: null,
    etag: null,
    lastModified: null,
    serverRendered: false,
    title: "",
    text: "",
    html: "",
    views: {},
    boxes: {},
    regionTexts: {},
    elements: [],
    screenshot: null,
    width: VIEWPORT.width,
    height: 0,
    durationMs: 0,
  };

  try {
    await guardContext(context);
    await context.clock.setFixedTime(startOfUtcDay(started));
    await context.addInitScript({ content: SEED_RANDOM_SCRIPT });
    const page = await context.newPage();
    page.setDefaultTimeout(config.navTimeoutMs);

    let response: Response | null;
    try {
      response = await page.goto(req.url, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
    } catch (error) {
      return { ...empty, networkError: cleanError((error as Error).message), durationMs: Date.now() - started };
    }
    if (response) {
      try {
        await assertRedirectChainPublic(response);
      } catch (error) {
        if (error instanceof BlockedTargetError) {
          return { ...empty, networkError: "Redirected to a private address", durationMs: Date.now() - started };
        }
        throw error;
      }
    }

    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    await page.addStyleTag({ content: FREEZE_CSS }).catch(() => undefined);
    await page.evaluate(AUTO_SCROLL_SCRIPT).catch(() => undefined);
    await page.waitForTimeout(400);

    const extracted = (await page.evaluate(
      `(${EXTRACT_SCRIPT})(${JSON.stringify({
        views: req.views ?? [],
        boxSelectors: req.boxSelectors ?? [],
        textSelectors: req.textSelectors ?? [],
        collect: Boolean(req.collect),
      })})`,
    )) as Extracted;

    const height = Math.max(1, Math.min(extracted.docHeight || VIEWPORT.height, config.maxScreenshotHeight));
    let screenshot: Buffer | null = null;
    if (req.screenshot !== false) {
      const raw = await page.screenshot({
        type: "png",
        fullPage: true,
        clip: { x: 0, y: 0, width: VIEWPORT.width, height },
        animations: "disabled",
        caret: "hide",
      });
      screenshot = await sharp(raw).png({ compressionLevel: 9 }).toBuffer();
    }

    const headers = response?.headers() ?? {};
    const rawHtml = response ? await response.text().catch(() => "") : "";
    return {
      status: response?.status() ?? null,
      networkError: null,
      finalUrl: page.url(),
      retryAfter: headers["retry-after"] ?? null,
      etag: headers["etag"] ?? null,
      lastModified: headers["last-modified"] ?? null,
      serverRendered: looksServerRendered(rawHtml, extracted.text),
      title: extracted.title,
      text: extracted.text,
      html: extracted.html,
      views: extracted.views,
      boxes: extracted.boxes,
      regionTexts: extracted.regionTexts,
      elements: extracted.elements,
      screenshot,
      width: VIEWPORT.width,
      height,
      durationMs: Date.now() - started,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * DNS lookup that re-checks the addresses at connect time, so a host can't pass
 * assertPublicHost and then rebind to a private address for the real request.
 */
function guardedLookup(hostname: string, options: LookupOptions, callback: (...args: unknown[]) => void): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as LookupAddress[];
    if (!privateTargetsAllowed() && (list.length === 0 || list.some((a) => isPrivateIp(a.address)))) {
      return callback(new BlockedTargetError(`${hostname} resolves to a private address`));
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

type SafeResponse = { status: number; headers: http.IncomingHttpHeaders; body: string };
type SafeInit = { method: "GET" | "HEAD"; headers?: Record<string, string>; timeoutMs: number; followRedirects: boolean; maxBytes?: number };

const MAX_SAFE_REDIRECTS = 3;

/** Small HTTP client for server-side fetches: pinned DNS checks, manual and vetted redirects, size cap. */
async function safeRequest(target: string, init: SafeInit, hops = 0): Promise<SafeResponse> {
  await assertPublicUrl(target);
  const url = new URL(target);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      { method: init.method, headers: { "User-Agent": USER_AGENT, ...init.headers }, lookup: guardedLookup as never, timeout: init.timeoutMs },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (init.followRedirects && status >= 300 && status < 400 && location && hops < MAX_SAFE_REDIRECTS) {
          res.resume();
          resolve(safeRequest(new URL(location, url).toString(), init, hops + 1));
          return;
        }
        if (init.method === "HEAD") {
          res.resume();
          resolve({ status, headers: res.headers, body: "" });
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
          if (init.maxBytes && body.length > init.maxBytes) req.destroy();
        });
        res.on("end", () => resolve({ status, headers: res.headers, body: body.slice(0, init.maxBytes) }));
        res.on("close", () => resolve({ status, headers: res.headers, body: body.slice(0, init.maxBytes) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
    req.end();
  });
}

/** Cheap pre-flight: a conditional HEAD that lets us skip the render entirely on 304. */
export async function conditionalUnchanged(url: string, etag: string | null, lastModified: string | null): Promise<boolean> {
  if (!etag && !lastModified) return false;
  try {
    const res = await safeRequest(url, {
      method: "HEAD",
      followRedirects: false,
      timeoutMs: 10_000,
      headers: {
        ...(etag ? { "If-None-Match": etag } : {}),
        ...(lastModified ? { "If-Modified-Since": lastModified } : {}),
      },
    });
    return res.status === 304;
  } catch {
    return false;
  }
}

const ROBOTS_TTL_MS = 24 * 60 * 60_000;
const robotsCache = new Map<string, { body: string; at: number }>();

export async function robotsAllows(url: string): Promise<boolean> {
  if (!config.respectRobots) return true;
  const target = new URL(url);
  const cached = robotsCache.get(target.origin);
  let body = cached && Date.now() - cached.at < ROBOTS_TTL_MS ? cached.body : null;
  if (body === null) {
    try {
      const res = await safeRequest(`${target.origin}/robots.txt`, { method: "GET", followRedirects: true, timeoutMs: 5_000, maxBytes: 500_000 });
      body = res.status >= 200 && res.status < 300 ? res.body : "";
    } catch {
      body = "";
    }
    robotsCache.set(target.origin, { body, at: Date.now() });
  }
  return isAllowedByRobots(body, `${target.pathname}${target.search}`);
}
