import http from "node:http";
import { randomUUID, randomBytes } from "node:crypto";

/**
 * "Chaos" fixture site: pages that misbehave in every way the real web does.
 * Used by the integration tests and as the live demo target.
 */
export type ChaosState = {
  price: number;
  inStock: boolean;
  down: boolean;
  views: number;
  hits: number;
};

const PROMOS = ["Free shipping over $50", "Members save 10% today", "New colours just dropped"];

function page(title: string, body: string, extraHead = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>${extraHead}
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 16px/1.55 system-ui, -apple-system, Segoe UI, sans-serif; color: #15171c; background: #f6f5f1; }
  header.nav { display: flex; justify-content: space-between; padding: 14px 28px; background: #15171c; color: #f6f5f1; font-size: 14px; }
  main { max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 40px; letter-spacing: -0.02em; margin: 0 0 8px; }
  .price { font-size: 28px; font-weight: 700; }
  .stock { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #ffe3e3; color: #9f1d1d; font-weight: 600; }
  .stock.in { background: #d9f7e8; color: #0d6b44; }
  .promo { margin: 24px 0; padding: 16px 20px; background: #fff3d6; border-radius: 10px; }
  .card { background: #fff; border: 1px solid #e4e1d8; border-radius: 12px; padding: 20px 24px; margin: 16px 0; }
  footer { margin-top: 48px; color: #6b7280; font-size: 13px; }
  a { color: #9a5b00; }
  button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid #c9c4b6; background: #fff; cursor: pointer; }
</style></head><body>${body}</body></html>`;
}

function relative(): string {
  const n = 1 + Math.floor(Math.random() * 59);
  return `${n} minute${n === 1 ? "" : "s"} ago`;
}

function send(res: http.ServerResponse, status: number, html: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(html);
}

function readForm(req: http.IncomingMessage): Promise<URLSearchParams> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(new URLSearchParams(body)));
  });
}

const SCENARIOS: Array<[string, string]> = [
  ["/price", "Product page — the price and stock only change when you say so (see /control). Noise: clock, view counter, rotating promo, request id."],
  ["/timestamp", "Different on every load: ISO time, relative time, UUID, CSRF token, view counter. Should never alert."],
  ["/rotating", "A banner that cycles through three variants. Calibration should auto-ignore it."],
  ["/captcha", "A Cloudflare-style challenge page served with HTTP 200. Must be classified as BLOCKED, not a change."],
  ["/flaky", "Alternates 503 (Retry-After: 30) and a normal page."],
  ["/ratelimit", "Always 429 with Retry-After: 120."],
  ["/status", "Status page — returns 500 while the outage toggle is on."],
  ["/private", "Disallowed by robots.txt. Tripwire must not fetch it."],
  ["/spa", "Content rendered client-side by JavaScript."],
  ["/control", "Demo control panel: change the price, toggle stock, toggle the outage."],
];

export function createChaosServer(initial: Partial<ChaosState> = {}) {
  const state: ChaosState = { price: 29, inStock: false, down: false, views: 1200, hits: 0, ...initial };
  let rotation = 0;
  let flaky = 0;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://chaos.local");
    state.hits++;
    state.views += 1 + Math.floor(Math.random() * 7);
    const clock = new Date().toISOString();

    switch (url.pathname) {
      case "/":
        return send(res, 200, page("Chaos site", `<main><h1>Chaos site</h1><p>Every page here misbehaves on purpose.</p>${SCENARIOS.map(
          ([href, text]) => `<div class="card"><a href="${href}"><b>${href}</b></a><p>${text}</p></div>`,
        ).join("")}</main>`));

      case "/moved":
        res.writeHead(302, { Location: "/price" });
        return res.end();

      case "/robots.txt":
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end("User-agent: *\nDisallow: /private\n");

      case "/price": {
        const promo = PROMOS[rotation++ % PROMOS.length];
        return send(res, 200, page("Trail Runner 2 — Acme Gear", `
<header class="nav"><span>Acme Gear</span><span class="clock">Server time ${clock}</span></header>
<main>
  <h1>Trail Runner 2</h1>
  <p class="price" id="price">$${state.price.toFixed(2)}</p>
  <p><span class="stock ${state.inStock ? "in" : ""}" id="stock">${state.inStock ? "In stock" : "Sold out"}</span></p>
  <div class="promo" id="promo">${promo}</div>
  <div class="card"><h2>Details</h2><p>Lightweight trail shoe with a 6 mm drop, recycled mesh upper and a grippy lugged outsole.</p></div>
  <p class="views">${state.views.toLocaleString("en-US")} people viewing</p>
  <footer>Request id ${randomUUID()} · Rendered ${relative()}</footer>
</main>`));
      }

      case "/timestamp":
        return send(res, 200, page("Live dashboard", `
<main>
  <h1>Live dashboard</h1>
  <div class="card"><p>Generated at ${clock}</p><p>Last updated ${relative()}</p></div>
  <div class="card"><p>Session ${randomUUID()}</p><p>csrf ${randomBytes(18).toString("base64url")}</p><p>build ${randomBytes(10).toString("hex")}</p></div>
  <div class="card"><p>${state.views.toLocaleString("en-US")} views</p><p>Followers: ${(state.views / 10).toFixed(0)}</p></div>
  <p>The quarterly report is available below. Nothing on this page actually changes.</p>
</main>`));

      case "/rotating": {
        const variant = PROMOS[rotation++ % PROMOS.length];
        return send(res, 200, page("Weekly newsletter", `
<main>
  <div class="promo" id="banner">${variant}</div>
  <h1>Weekly newsletter</h1>
  <div class="card"><p>Issue #42 covers caching strategies, queue design and polite crawling.</p></div>
</main>`));
      }

      case "/captcha":
        return send(res, 200, page("Just a moment...", `
<main><h1>Checking your browser before accessing the site.</h1>
<div id="cf-chl-widget" class="cf-challenge"></div>
<p>This process is automatic. Ray ID: ${randomBytes(8).toString("hex")}</p></main>`));

      case "/flaky":
        flaky++;
        if (flaky % 2 === 1) return send(res, 503, page("Unavailable", "<main><h1>503</h1></main>"), { "Retry-After": "30" });
        return send(res, 200, page("Flaky", "<main><h1>Flaky service</h1><p>Sometimes up, sometimes down, always the same content.</p></main>"));

      case "/ratelimit":
        return send(res, 429, page("Too many requests", "<main><h1>Slow down</h1></main>"), { "Retry-After": "120" });

      case "/status":
        if (state.down) return send(res, 500, page("Error", "<main><h1>Internal Server Error</h1></main>"));
        return send(res, 200, page("Status", `<main><h1>Acme status</h1><div class="card"><p>All systems operational.</p><p>Checked ${clock}</p></div></main>`));

      case "/private":
        return send(res, 200, page("Private", "<main><h1>Robots should not be here</h1></main>"));

      case "/spa":
        return send(res, 200, page("SPA", `<main><h1>Single page app</h1><div id="app">Loading…</div></main>
<script>setTimeout(() => { document.getElementById("app").innerHTML = "<div class='card'><p>Rendered by JavaScript</p><p class='price'>$${state.price.toFixed(2)}</p></div>"; }, 150);</script>`));

      case "/control":
        if (req.method === "POST") {
          const form = await readForm(req);
          const action = form.get("action");
          if (action === "price-down") state.price = Math.max(1, state.price - 5);
          if (action === "price-up") state.price += 5;
          if (action === "toggle-stock") state.inStock = !state.inStock;
          if (action === "toggle-down") state.down = !state.down;
          if (action === "reset") Object.assign(state, { price: 29, inStock: false, down: false });
          res.writeHead(303, { Location: "/control" });
          return res.end();
        }
        return send(res, 200, page("Chaos control", `<main><h1>Demo control panel</h1>
<div class="card"><p>Price <b>$${state.price.toFixed(2)}</b> · ${state.inStock ? "In stock" : "Sold out"} · Outage <b>${state.down ? "ON" : "off"}</b></p>
<form method="post">${[
  ["price-down", "Drop price $5"],
  ["price-up", "Raise price $5"],
  ["toggle-stock", "Toggle stock"],
  ["toggle-down", "Toggle outage (/status)"],
  ["reset", "Reset"],
].map(([value, label]) => `<button name="action" value="${value}">${label}</button>`).join(" ")}</form></div>
<p>Requests served: ${state.hits}</p></main>`));

      default:
        return send(res, 404, page("Not found", "<main><h1>404</h1></main>"));
    }
  });

  return { server, state };
}
