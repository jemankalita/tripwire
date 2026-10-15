import { describe, expect, it } from "vitest";
import { classifyCheck, parseRetryAfter } from "../classify";

const page = "Welcome to the store. ".repeat(100);

describe("classifyCheck — outages and CAPTCHAs are never changes", () => {
  it("treats a normal 200 page as ok", () => {
    expect(classifyCheck({ status: 200, title: "Store", text: page, html: "<html>" }).result).toBe("ok");
  });

  it.each([
    [{ networkError: "net::ERR_NAME_NOT_RESOLVED" }, "error"],
    [{ status: 500 }, "error"],
    [{ status: 503, retryAfter: "120" }, "error"],
    [{ status: 404 }, "error"],
    [{ status: 418 }, "error"],
    [{ status: 403 }, "blocked"],
    [{ status: 401 }, "blocked"],
    [{ status: 429, retryAfter: "60" }, "blocked"],
  ] as const)("classifies %j as %s", (input, expected) => {
    expect(classifyCheck({ ...input, text: page }).result).toBe(expected);
  });

  it("passes Retry-After through", () => {
    expect(classifyCheck({ status: 429, retryAfter: "90" }).retryAfterSec).toBe(90);
  });

  it("detects Cloudflare challenge pages even with status 200", () => {
    const r = classifyCheck({ status: 200, title: "Just a moment...", text: "Checking your browser", html: '<div id="cf-chl-widget">' });
    expect(r.result).toBe("blocked");
  });

  it("does not flag a healthy Cloudflare-fronted page that loads challenge-platform scripts", () => {
    const html = '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>';
    expect(classifyCheck({ status: 200, title: "Store", text: page, html }).result).toBe("ok");
  });

  it("detects CAPTCHA walls by markers + short content", () => {
    const r = classifyCheck({ status: 200, title: "Verify", text: "Please complete the security check to continue.", html: '<div class="g-recaptcha">' });
    expect(r.result).toBe("blocked");
  });

  it("does not flag a long page that merely embeds a reCAPTCHA form", () => {
    const r = classifyCheck({ status: 200, title: "Contact us", text: page, html: '<div class="g-recaptcha">' });
    expect(r.result).toBe("ok");
  });

  it("flags a challenge title when content collapsed against the last snapshot", () => {
    const r = classifyCheck({ status: 200, title: "Access Denied", text: "x".repeat(2000), html: "", previousLength: 50_000 });
    expect(r.result).toBe("blocked");
  });

  it("treats an empty render as an error", () => {
    expect(classifyCheck({ status: 200, text: "  " }).result).toBe("error");
  });
});

describe("parseRetryAfter", () => {
  it("parses seconds and HTTP dates", () => {
    const now = Date.parse("2026-10-15T10:00:00Z");
    expect(parseRetryAfter("30", now)).toBe(30);
    expect(parseRetryAfter("Thu, 15 Oct 2026 10:02:00 GMT", now)).toBe(120);
    expect(parseRetryAfter("garbage", now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });
});
