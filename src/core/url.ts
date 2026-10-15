export class UrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlError";
  }
}

const TRACKING_PARAM =
  /^(utm_[a-z_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|ref_src|ref_url|si)$/i;

const MAX_URL_LENGTH = 2048;

/**
 * Canonicalize a URL so that every user watching "the same page" maps to one Target:
 * lowercased host, default port dropped, fragment dropped, tracking params removed,
 * remaining query params sorted, duplicate/trailing slashes collapsed.
 */
export function normalizeUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new UrlError("Enter a URL");
  if (raw.length > MAX_URL_LENGTH) throw new UrlError("URL is too long");

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UrlError("That doesn't look like a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlError("Only http and https pages can be watched");
  }
  if (url.username || url.password) {
    throw new UrlError("URLs with embedded credentials aren't allowed — public pages only");
  }
  if (!url.hostname.includes(".") && url.hostname !== "localhost") {
    throw new UrlError("Enter a full domain, like example.com");
  }

  const canonical = new URL(url.toString());
  canonical.hash = "";
  canonical.hostname = canonical.hostname.toLowerCase().replace(/\.$/, "");
  const isDefaultPort =
    (canonical.protocol === "http:" && canonical.port === "80") ||
    (canonical.protocol === "https:" && canonical.port === "443");
  if (isDefaultPort) canonical.port = "";

  const params = [...canonical.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  canonical.search = new URLSearchParams(params).toString();

  const path = canonical.pathname.replace(/\/{2,}/g, "/");
  canonical.pathname = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

  return canonical.toString();
}

export function hostOf(url: string): string {
  return new URL(url).hostname;
}

export function displayUrl(url: string): string {
  const u = new URL(url);
  const path = u.pathname === "/" ? "" : u.pathname;
  return `${u.hostname.replace(/^www\./, "")}${path}${u.search}`;
}
