/**
 * End-to-end: the critical user journey through the real UI, worker and chaos site.
 * Requires `npm run dev` (web + worker + chaos) to be running.
 *   npm run test:e2e
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const CHAOS = process.env.E2E_CHAOS ?? "http://127.0.0.1:4000";
const OUT = path.resolve(process.env.E2E_OUT ?? ".e2e");

let step = 0;
function log(message: string): void {
  step++;
  process.stdout.write(`  ${String(step).padStart(2)} ✓ ${message}\n`);
}

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
}

async function chaos(action: string): Promise<void> {
  await fetch(`${CHAOS}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ action }),
    redirect: "manual",
  });
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await chaos("reset");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  try {
    // Landing + its live demo
    await page.goto(BASE);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await shot(page, "01-landing");
    const demo = page.locator("[data-ui]").filter({ hasText: "Reload the page", visible: true }).first();
    await demo.getByRole("button", { name: "Reload the page" }).click();
    await demo.getByText("Only noise changed").waitFor();
    await demo.getByRole("button", { name: "Drop the price" }).click();
    await demo.getByText(/Confirmed: \$29\.00 → \$24\.00/).waitFor({ timeout: 6_000 });
    log("landing live demo ignores noise and confirms a price drop");
    await shot(page, "02-landing-demo");
    await shot(page, "03-landing-full", true);

    // Sign up
    await page.goto(`${BASE}/signup`);
    await page.getByLabel("Your name").fill("E2E Tester");
    await page.getByLabel("Email").fill(`e2e-${Date.now()}@tripwire.test`);
    await page.getByLabel("Password").fill("correct horse battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(`${BASE}/app`);
    await page.getByText("Paste the first page you want watched.").waitFor();
    log("signed up and landed on the empty dashboard");
    await shot(page, "04-dashboard-empty");

    // Add a watch: preview → picker → alerts
    await page.getByLabel("Page URL").fill(`${CHAOS}/price`);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Page address").waitFor();
    await page.getByRole("button", { name: "Load page" }).click();
    await page.getByRole("radiogroup", { name: "Picker mode" }).waitFor({ timeout: 90_000 });
    await page.getByText(/We’ll ignore \d+ region/).waitFor();
    log("preview rendered three times and auto-ignored volatile regions");
    await page.getByLabel("Find an element by its text").fill("$29");
    await page.getByRole("button", { name: /\$29\.00/ }).first().click();
    await page.getByLabel("Find an element by its text").fill("Sold out");
    await page.getByRole("button", { name: /Sold out/ }).first().click();
    await shot(page, "05-picker");
    await page.getByRole("dialog").getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Name").waitFor();
    await shot(page, "06-alert-settings");
    await page.getByRole("dialog").getByRole("button", { name: "Start watching" }).click();
    await page.waitForURL(/\/app\/w\//);
    log("created a watch on the price and stock regions");

    // Baseline arrives from the worker
    await page.getByText(/Baseline captured/).waitFor({ timeout: 90_000 });
    log("worker took the baseline snapshot");
    await shot(page, "07-detail-baseline");

    // A real change: confirmed by a second render, then alerted once
    await chaos("price-down");
    await chaos("toggle-stock");
    await page.getByRole("button", { name: "Check now" }).click();
    await page.getByText("Possible change spotted.").waitFor({ timeout: 90_000 });
    log("first render flagged a possible change and scheduled confirmation");
    await shot(page, "08-detail-confirming");
    await page.getByRole("heading", { name: "Versions" }).waitFor();
    await page.locator("mark").filter({ hasText: "24" }).first().waitFor({ timeout: 120_000 });
    log("confirmation render reproduced it: change recorded with a word-level diff");
    await shot(page, "09-detail-text-diff");
    await page.getByRole("radio", { name: "Visual" }).check();
    await page.getByText(/of pixels changed/).waitFor({ timeout: 30_000 });
    await shot(page, "10-detail-visual");
    await page.getByRole("radio", { name: "Slider" }).check();
    await shot(page, "11-detail-slider");
    log("visual heat map and slider comparisons render");

    // Inbox has exactly one alert email
    await page.goto(`${BASE}/app/inbox`);
    const alertEmail = page.getByRole("button", { name: /changed/ });
    await alertEmail.first().waitFor({ timeout: 60_000 });
    const count = await alertEmail.count();
    if (count !== 1) throw new Error(`Expected exactly one alert email, found ${count}`);
    log("exactly one alert email was delivered");
    await shot(page, "12-inbox");

    await page.goto(`${BASE}/app`);
    await page.getByRole("list", { name: "Watched pages" }).waitFor();
    await shot(page, "13-dashboard");
    log("dashboard lists the watch with its pulse line");

    // Phone widths
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const mobile = await phone.newPage();
    await mobile.goto(BASE);
    await shot(mobile, "14-landing-phone");
    await phone.close();
    log("landing renders at phone width");
  } catch (error) {
    await shot(page, "zz-failure", true).catch(() => undefined);
    throw error;
  } finally {
    await browser.close();
  }
  process.stdout.write(`\nE2E passed — screenshots in ${OUT}\n`);
}

main().catch((error) => {
  console.error(`\nE2E failed at step ${step + 1}:`, error instanceof Error ? error.message : error);
  process.exit(1);
});
