export type CheckResult = "ok" | "error" | "blocked";

export type Classification = {
  result: CheckResult;
  reason: string;
  /** Seconds the site asked us to wait (429/503 Retry-After). */
  retryAfterSec?: number;
};

export type ClassifyInput = {
  status?: number | null;
  networkError?: string | null;
  title?: string;
  text?: string;
  html?: string;
  retryAfter?: string | null;
  /** Length of the last good snapshot's text, to spot challenge pages that replace content. */
  previousLength?: number | null;
};

// Interstitial markers. Cloudflare also injects /cdn-cgi/challenge-platform/ scripts
// into healthy pages, so these only count alongside a short or collapsed page.
const CHALLENGE_MARKERS = /cf-chl|cf_chl_opt|__cf_chl|ddos-guard|_incapsula_resource|captcha-delivery\.com/i;
const CAPTCHA_MARKERS = /g-recaptcha|recaptcha\/api|hcaptcha|h-captcha|px-captcha|perimeterx|datadome|arkoselabs|funcaptcha|turnstile/i;
const CHALLENGE_TITLE =
  /just a moment|attention required|access denied|are you a (?:human|robot)|verify(?:ing)? you are (?:a )?human|security check|pardon our interruption|bot (?:check|verification)|request blocked|one more step/i;

const MIN_TEXT_LENGTH = 20;
const SHORT_PAGE = 1500;
const COLLAPSE_RATIO = 0.2;

export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.round((date - now) / 1000));
}

/**
 * Decide whether a check result is a real page (ok), an outage (error) or a
 * bot wall / CAPTCHA (blocked). Only "ok" results are ever diffed, so outages
 * and challenges can never be mistaken for content changes.
 */
export function classifyCheck(input: ClassifyInput): Classification {
  const { status, networkError, title = "", text = "", html = "", previousLength } = input;

  if (networkError) return { result: "error", reason: networkError };

  if (status === 429 || status === 503) {
    const retryAfterSec = parseRetryAfter(input.retryAfter);
    return status === 429
      ? { result: "blocked", reason: "Rate limited by the site (429)", retryAfterSec }
      : { result: "error", reason: "Site unavailable (503)", retryAfterSec };
  }
  if (status === 401 || status === 407) return { result: "blocked", reason: `Login required (${status})` };
  if (status === 403 || status === 451) return { result: "blocked", reason: `Access denied (${status})` };
  if (status && status >= 500) return { result: "error", reason: `Server error (${status})` };
  if (status === 404 || status === 410) return { result: "error", reason: `Page not found (${status})` };
  if (status && status >= 400) return { result: "error", reason: `HTTP ${status}` };

  const trimmed = text.trim();
  const titleLooksLikeChallenge = CHALLENGE_TITLE.test(title);
  const isShort = trimmed.length < SHORT_PAGE;
  const collapsed = previousLength != null && previousLength > 0 && trimmed.length < previousLength * COLLAPSE_RATIO;

  if (CHALLENGE_MARKERS.test(html) && (isShort || collapsed || titleLooksLikeChallenge)) {
    return { result: "blocked", reason: "Bot challenge page" };
  }

  if (titleLooksLikeChallenge && (isShort || collapsed)) return { result: "blocked", reason: "Bot challenge page" };
  if (CAPTCHA_MARKERS.test(html) && (isShort || collapsed || titleLooksLikeChallenge)) {
    return { result: "blocked", reason: "CAPTCHA wall" };
  }
  if (trimmed.length < MIN_TEXT_LENGTH) return { result: "error", reason: "Page rendered empty" };

  return { result: "ok", reason: "OK" };
}
