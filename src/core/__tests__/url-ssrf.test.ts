import { afterEach, describe, expect, it, vi } from "vitest";
import { displayUrl, hostOf, normalizeUrl, UrlError } from "../url";
import { assertPublicHost, assertPublicUrl, isBlockedHostname, isPrivateIp } from "../ssrf";

describe("normalizeUrl", () => {
  it("maps cosmetic variants of the same page to one canonical URL", () => {
    const variants = [
      "https://Example.com/pricing/?b=2&a=1#plans",
      "example.com/pricing?a=1&b=2&utm_source=newsletter",
      "https://example.com:443//pricing?a=1&b=2&fbclid=xyz",
    ];
    const canonical = new Set(variants.map(normalizeUrl));
    expect([...canonical]).toEqual(["https://example.com/pricing?a=1&b=2"]);
  });

  it("keeps meaningful query params and the root slash", () => {
    expect(normalizeUrl("https://shop.io/?page=2")).toBe("https://shop.io/?page=2");
    expect(normalizeUrl("http://shop.io:80")).toBe("http://shop.io/");
  });

  it("rejects non-http schemes, credentials and junk", () => {
    expect(() => normalizeUrl("file:///etc/passwd")).toThrow(UrlError);
    expect(() => normalizeUrl("ftp://example.com")).toThrow(UrlError);
    expect(() => normalizeUrl("https://user:pw@example.com")).toThrow(/credentials/);
    expect(() => normalizeUrl("   ")).toThrow(UrlError);
    expect(() => normalizeUrl("not a url at all")).toThrow(UrlError);
    expect(() => normalizeUrl(`https://a.com/${"x".repeat(3000)}`)).toThrow(/too long/);
  });

  it("formats display URLs and hosts", () => {
    expect(displayUrl("https://www.example.com/a?b=1")).toBe("example.com/a?b=1");
    expect(displayUrl("https://example.com/")).toBe("example.com");
    expect(hostOf("https://sub.example.com/x")).toBe("sub.example.com");
  });
});

describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
    "2002:7f00:1::1",
    "2001:0:4136:e378::1",
    "not-an-ip",
  ])("blocks %s", (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows public %s",
    (ip) => expect(isPrivateIp(ip)).toBe(false),
  );
});

describe("host guards", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("blocks local hostnames", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("printer.local")).toBe(true);
    expect(isBlockedHostname("db.internal")).toBe(true);
    expect(isBlockedHostname("[::1]")).toBe(true);
    expect(isBlockedHostname("example.com")).toBe(false);
  });

  it("refuses private literal addresses and non-http URLs", async () => {
    vi.stubEnv("TRIPWIRE_ALLOW_PRIVATE", "0");
    await expect(assertPublicHost("127.0.0.1")).rejects.toThrow(/private/);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/not allowed/);
    await expect(assertPublicHost("8.8.8.8")).resolves.toBeUndefined();
  });

  it("allows private targets only when explicitly opted in during dev or test", async () => {
    vi.stubEnv("TRIPWIRE_ALLOW_PRIVATE", "1");
    vi.stubEnv("NODE_ENV", "development");
    await expect(assertPublicHost("127.0.0.1")).resolves.toBeUndefined();
    vi.stubEnv("NODE_ENV", "production");
    await expect(assertPublicHost("127.0.0.1")).rejects.toThrow();
    vi.stubEnv("NODE_ENV", ""); // an unset NODE_ENV (e.g. a bare worker process) is denied too
    await expect(assertPublicHost("127.0.0.1")).rejects.toThrow();
  });
});
