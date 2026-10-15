/**
 * End-to-end pipeline tests against the local chaos site with real headless
 * Chromium renders. Each block maps to one of the brief's core questions.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tripwire-it-"));
process.env.DATABASE_URL = `file:${path.join(tmp, "test.db").replace(/\\/g, "/")}`;
process.env.BLOB_DIR = path.join(tmp, "blobs");
process.env.TRIPWIRE_ALLOW_PRIVATE = "1";
process.env.RESPECT_ROBOTS = "1";

type Mods = {
  db: typeof import("@/db/client");
  schema: typeof import("@/db/schema");
  orm: typeof import("drizzle-orm");
  check: typeof import("@/server/check");
  watches: typeof import("@/server/watches");
  previews: typeof import("@/server/previews");
  auth: typeof import("@/server/auth");
  summarize: typeof import("@/server/summarize");
  notify: typeof import("@/server/notify");
  render: typeof import("@/server/render");
};

let m: Mods;
let base: string;
let chaos: ReturnType<typeof import("../chaos/app").createChaosServer>;
let userId: string;

beforeAll(async () => {
  const { createChaosServer } = await import("../chaos/app");
  chaos = createChaosServer();
  await new Promise<void>((resolve) => chaos.server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(chaos.server.address() as AddressInfo).port}`;

  m = {
    db: await import("@/db/client"),
    schema: await import("@/db/schema"),
    orm: await import("drizzle-orm"),
    check: await import("@/server/check"),
    watches: await import("@/server/watches"),
    previews: await import("@/server/previews"),
    auth: await import("@/server/auth"),
    summarize: await import("@/server/summarize"),
    notify: await import("@/server/notify"),
    render: await import("@/server/render"),
  };
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  await m.db.dbReady;
  await migrate(m.db.db, { migrationsFolder: path.resolve("drizzle") });

  const user = await m.auth.createUser({ email: "demo@tripwire.test", name: "Demo", password: "correct horse battery" });
  userId = user.id;
  await m.db.db.insert(m.schema.channels).values({
    id: "email-channel",
    userId,
    type: "email",
    label: "Email",
    config: { email: user.email },
    createdAt: Date.now(),
  });
}, 120_000);

afterAll(async () => {
  await m?.render.closeBrowser();
  await new Promise((resolve) => chaos?.server.close(resolve));
});

type WatchInput = import("@/server/schemas").CreateWatchInput;

const defaults: Omit<WatchInput, "url" | "previewId" | "name"> = {
  intervalMin: 60,
  sensitivity: "medium",
  watchSelectors: [],
  ignoreSelectors: [],
  autoIgnoreSelectors: [],
  keywordRules: [],
  keywordOnly: false,
  numberSelector: null,
  numberRule: null,
  digest: false,
};

async function watchOn(pathname: string, extra: Partial<typeof defaults> = {}, owner = userId) {
  const { watch, target } = await m.watches.createWatch(owner, { url: `${base}${pathname}`, ...defaults, ...extra });
  return { watchId: watch.id, targetId: target.id };
}

async function count(table: "changes" | "versions", watchId: string): Promise<number> {
  const { eq } = m.orm;
  const t = table === "changes" ? m.schema.changes : m.schema.versions;
  return (await m.db.db.select({ id: t.id }).from(t).where(eq(t.watchId, watchId))).length;
}

describe("Q3 — pages that differ on every load never alert", () => {
  it("normalizes timestamps, relative times, tokens and counters away", async () => {
    const { watchId, targetId } = await watchOn("/timestamp");
    for (let i = 0; i < 4; i++) expect((await m.check.runCheck(targetId)).result).toBe("ok");
    expect(await count("changes", watchId)).toBe(0);
    expect(await count("versions", watchId)).toBe(1); // baseline only
  });

  it("calibration auto-ignores a rotating banner", async () => {
    const preview = await m.previews.createPreview(userId, `${base}/rotating`);
    expect(preview.volatileSelectors).toContain("#banner");
    const { watchId, targetId } = await watchOn("/rotating", { autoIgnoreSelectors: preview.volatileSelectors });
    for (let i = 0; i < 4; i++) await m.check.runCheck(targetId);
    expect(await count("changes", watchId)).toBe(0);
  });
});

describe("Real changes are confirmed, summarized and alerted exactly once", () => {
  it("detects a price drop only after a confirmation render", async () => {
    const preview = await m.previews.createPreview(userId, `${base}/price`);
    const { watchId, targetId } = await watchOn("/price", {
      autoIgnoreSelectors: preview.volatileSelectors,
      numberSelector: "#price",
      numberRule: { op: "below", value: 25 },
    });
    await m.check.runCheck(targetId); // baseline
    chaos.state.price = 24;
    await m.check.runCheck(targetId); // pending — not yet alerted
    expect(await count("changes", watchId)).toBe(1); // only the number rule fired immediately

    await m.check.runCheck(targetId); // confirmation
    await m.check.runCheck(targetId); // steady state
    const { eq, and } = m.orm;
    const contentChanges = await m.db.db
      .select()
      .from(m.schema.changes)
      .where(and(eq(m.schema.changes.watchId, watchId), eq(m.schema.changes.kind, "content")));
    expect(contentChanges).toHaveLength(1);
    expect(contentChanges[0].summary).toContain("$24.00");

    // Summarize → notify, then notify again: still exactly one email.
    await m.summarize.summarizeChange(contentChanges[0].id);
    await m.notify.notifyChange(contentChanges[0].id);
    await m.notify.notifyChange(contentChanges[0].id);
    const sent = await m.db.db
      .select()
      .from(m.schema.deliveries)
      .where(eq(m.schema.deliveries.changeId, contentChanges[0].id));
    expect(sent).toHaveLength(1);
    expect(sent[0].status).toBe("sent");
    const emails = await m.db.db.select().from(m.schema.outbox);
    expect(emails.filter((e) => e.subject.includes("changed"))).toHaveLength(1);
  });

  it("fires keyword-only alerts when a phrase appears", async () => {
    chaos.state.inStock = false;
    const preview = await m.previews.createPreview(userId, `${base}/price`);
    const { watchId, targetId } = await watchOn("/price", {
      autoIgnoreSelectors: preview.volatileSelectors,
      watchSelectors: ["#stock"],
      keywordRules: [{ mode: "appears", text: "In stock" }],
      keywordOnly: true,
    });
    await m.check.runCheck(targetId);
    chaos.state.inStock = true;
    await m.check.runCheck(targetId);
    await m.check.runCheck(targetId);
    const { eq } = m.orm;
    const rows = await m.db.db.select().from(m.schema.changes).where(eq(m.schema.changes.watchId, watchId));
    expect(rows.map((r) => r.kind)).toEqual(["keyword"]);
    expect(rows[0].alerted).toBe(true);
  });
});

describe("Q1 — outages and CAPTCHAs are not changes", () => {
  it("classifies a challenge page as blocked and raises one health alert", async () => {
    const { watchId, targetId } = await watchOn("/captcha");
    for (let i = 0; i < 4; i++) expect((await m.check.runCheck(targetId)).result).toBe("blocked");
    expect(await count("versions", watchId)).toBe(0);
    const { eq } = m.orm;
    const events = await m.db.db.select().from(m.schema.changes).where(eq(m.schema.changes.watchId, watchId));
    expect(events.map((e) => e.kind)).toEqual(["down"]);
  });

  it("an outage and recovery produce down/up events but no content change", async () => {
    const { watchId, targetId } = await watchOn("/status");
    await m.check.runCheck(targetId);
    chaos.state.down = true;
    for (let i = 0; i < 3; i++) expect((await m.check.runCheck(targetId)).result).toBe("error");
    chaos.state.down = false;
    await m.check.runCheck(targetId);
    const { eq } = m.orm;
    const events = await m.db.db.select().from(m.schema.changes).where(eq(m.schema.changes.watchId, watchId));
    expect(events.map((e) => e.kind).sort()).toEqual(["down", "up"]);
  });
});

describe("Q2 — 200 watchers of one URL cost one fetch", () => {
  it("evaluates every watch from a single render", async () => {
    const owners = await Promise.all(
      [0, 1, 2, 3].map((i) => m.auth.createUser({ email: `crowd${i}@tripwire.test`, name: `Crowd ${i}`, password: "correct horse battery" })),
    );
    let targetId = "";
    for (const owner of owners) {
      for (let i = 0; i < 50; i++) targetId = (await watchOn("/spa", {}, owner.id)).targetId;
    }
    const before = chaos.state.hits;
    await m.check.runCheck(targetId);
    const { eq, desc } = m.orm;
    const [latest] = await m.db.db
      .select()
      .from(m.schema.checks)
      .where(eq(m.schema.checks.targetId, targetId))
      .orderBy(desc(m.schema.checks.startedAt))
      .limit(1);
    expect(latest.watchers).toBe(200);
    expect(chaos.state.hits - before).toBeLessThanOrEqual(2); // the page (+ robots.txt is cached)
  }, 180_000);
});

describe("Browser extension", () => {
  it("picks regions whose selectors the server render resolves", async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      // Stand-in for the extension runtime: capture what the picker would send.
      await page.addInitScript(() => {
        (window as unknown as { chrome: unknown }).chrome = {
          runtime: { sendMessage: (msg: unknown) => ((window as unknown as { __picked: unknown }).__picked = msg) },
        };
      });
      await page.goto(`${base}/price`);
      await page.addScriptTag({ path: path.resolve("extension/picker.js") });
      await page.hover("#price");
      await page.click("#price");
      await page.keyboard.press("Enter");
      const picked = (await page.evaluate(() => (window as unknown as { __picked: { watch: string[] } }).__picked)) as { watch: string[] };
      expect(picked.watch).toEqual(["#price"]);

      const { watchId, targetId } = await watchOn("/price", { watchSelectors: picked.watch });
      await m.check.runCheck(targetId);
      const { eq } = m.orm;
      const [version] = await m.db.db.select().from(m.schema.versions).where(eq(m.schema.versions.watchId, watchId));
      expect(version.text.trim()).toMatch(/^\$\d+\.\d{2}$/);
    } finally {
      await browser.close();
    }
  });

  it("authenticates API calls with a bearer token and rejects bad ones", async () => {
    const token = await m.auth.rotateApiToken(userId);
    const ok = await m.auth.authenticateRequest(new Request("http://x/api/watches", { headers: { authorization: `Bearer ${token}` } }));
    expect(ok?.user.id).toBe(userId);
    expect(ok?.via).toBe("token");
    const bad = await m.auth.authenticateRequest(new Request("http://x/api/watches", { headers: { authorization: "Bearer tw_not-a-real-token-123456" } }));
    expect(bad).toBeNull();
  });
});

describe("Email delivery", () => {
  it("delivers through Resend's HTTPS API when RESEND_API_KEY is set, and keeps an inbox copy", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const realFetch = globalThis.fetch;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    }) as typeof fetch;
    try {
      expect(m.notify.emailProvider()).toBe("resend");
      await m.notify.sendEmail({ userId, to: "me@example.com", subject: "Resend check", html: "<p>hi</p>", text: "hi" });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.resend.com/emails");
      expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
      const body = JSON.parse(String(calls[0].init.body));
      expect(body).toMatchObject({ to: ["me@example.com"], subject: "Resend check", from: "Tripwire <onboarding@resend.dev>" });
      const { eq } = m.orm;
      const copies = await m.db.db.select().from(m.schema.outbox).where(eq(m.schema.outbox.subject, "Resend check"));
      expect(copies).toHaveLength(1);
    } finally {
      globalThis.fetch = realFetch;
      vi.unstubAllEnvs();
    }
  });

  it("does not record an inbox copy when the provider rejects the email (so a retry can't duplicate it)", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("domain not verified", { status: 403 })) as typeof fetch;
    try {
      await expect(m.notify.sendEmail({ userId, to: "x@example.com", subject: "Rejected", html: "", text: "" })).rejects.toThrow(/Resend responded 403/);
      const { eq } = m.orm;
      expect(await m.db.db.select().from(m.schema.outbox).where(eq(m.schema.outbox.subject, "Rejected"))).toHaveLength(0);
    } finally {
      globalThis.fetch = realFetch;
      vi.unstubAllEnvs();
    }
  });
});

describe("Redirects", () => {
  it("follows each redirect hop through the request guard", async () => {
    const { watchId, targetId } = await watchOn("/moved");
    expect((await m.check.runCheck(targetId)).result).toBe("ok");
    const { eq } = m.orm;
    const [version] = await m.db.db.select().from(m.schema.versions).where(eq(m.schema.versions.watchId, watchId));
    expect(version.text).toContain("Trail Runner 2");
  });
});

describe("Q4 — politeness", () => {
  it("honors robots.txt", async () => {
    const { targetId } = await watchOn("/private");
    expect((await m.check.runCheck(targetId)).result).toBe("robots");
  });

  it("backs off for Retry-After on 429", async () => {
    const { targetId } = await watchOn("/ratelimit");
    const outcome = await m.check.runCheck(targetId);
    expect(outcome.result).toBe("blocked");
    expect(outcome.retryAfterSec).toBe(120);
    const { eq } = m.orm;
    const target = await m.db.db.query.targets.findFirst({ where: eq(m.schema.targets.id, targetId) });
    expect(target!.nextCheckAt).toBeGreaterThanOrEqual(Date.now() + 115_000);
  });
});
