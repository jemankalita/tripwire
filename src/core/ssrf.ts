import { lookup } from "node:dns/promises";
import net from "node:net";

export class BlockedTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedTargetError";
  }
}

type Cidr = readonly [base: number, bits: number];

const PRIVATE_V4: readonly Cidr[] = [
  [ipv4ToInt("0.0.0.0"), 8],
  [ipv4ToInt("10.0.0.0"), 8],
  [ipv4ToInt("100.64.0.0"), 10],
  [ipv4ToInt("127.0.0.0"), 8],
  [ipv4ToInt("169.254.0.0"), 16],
  [ipv4ToInt("172.16.0.0"), 12],
  [ipv4ToInt("192.0.0.0"), 24],
  [ipv4ToInt("192.0.2.0"), 24],
  [ipv4ToInt("192.168.0.0"), 16],
  [ipv4ToInt("198.18.0.0"), 15],
  [ipv4ToInt("198.51.100.0"), 24],
  [ipv4ToInt("203.0.113.0"), 24],
  [ipv4ToInt("224.0.0.0"), 4],
  [ipv4ToInt("240.0.0.0"), 4],
];

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inCidr(ip: number, [base, bits]: Cidr): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

function isPrivateV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return PRIVATE_V4.some((cidr) => inCidr(value, cidr));
}

function expandV6(ip: string): number[] {
  const zoneless = ip.split("%")[0].toLowerCase();
  // An embedded dotted-quad tail (::ffff:1.2.3.4) becomes two hextets.
  const dotted = zoneless.match(/(\d+\.\d+\.\d+\.\d+)$/);
  const normalized = dotted
    ? zoneless.replace(dotted[1], (() => {
        const n = ipv4ToInt(dotted[1]);
        return `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
      })())
    : zoneless;
  const [head, tail] = normalized.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  const parts = tail === undefined ? headParts : [...headParts, ...Array(missing).fill("0"), ...tailParts];
  return parts.map((p) => parseInt(p || "0", 16));
}

function isPrivateV6(ip: string): boolean {
  const h = expandV6(ip);
  if (h.length !== 8 || h.some((x) => Number.isNaN(x))) return true; // unparseable → refuse
  const allZeroPrefix = (n: number) => h.slice(0, n).every((x) => x === 0);

  if (allZeroPrefix(8)) return true; // ::
  if (allZeroPrefix(7) && h[7] === 1) return true; // ::1
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((h[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentation

  const embeddedV4 = (hi: number, lo: number) =>
    `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;
  if (allZeroPrefix(5) && h[5] === 0xffff) return isPrivateV4(embeddedV4(h[6], h[7])); // v4-mapped
  if (allZeroPrefix(6)) return isPrivateV4(embeddedV4(h[6], h[7])); // v4-compatible
  if (h[0] === 0x64 && h[1] === 0xff9b) return isPrivateV4(embeddedV4(h[6], h[7])); // NAT64 (incl. 64:ff9b:1::/48)
  if (h[0] === 0x2002) return isPrivateV4(embeddedV4(h[1], h[2])); // 6to4
  if (h[0] === 0x2001 && h[1] === 0x0000) return true; // Teredo tunnels: refuse
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return true;
}

/** Local chaos/demo targets are allowed only outside production and only when opted in. */
export function privateTargetsAllowed(): boolean {
  // Default-deny: honoured only when the process explicitly says it is dev or test.
  const env = process.env.NODE_ENV;
  return process.env.TRIPWIRE_ALLOW_PRIVATE === "1" && (env === "development" || env === "test");
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost") return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  return net.isIP(host) !== 0 && isPrivateIp(host);
}

/**
 * Resolve the hostname and refuse anything that lands on a private, loopback,
 * link-local, metadata or otherwise non-public address. Called before every
 * navigation AND for every sub-request the headless browser makes (DNS rebinding).
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  if (privateTargetsAllowed()) return;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isBlockedHostname(host)) {
    throw new BlockedTargetError(`Refusing to fetch private address ${host}`);
  }
  if (net.isIP(host)) return;

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BlockedTargetError(`Could not resolve ${host}`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new BlockedTargetError(`${host} resolves to a private address`);
  }
}

export async function assertPublicUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BlockedTargetError(`Protocol ${parsed.protocol} is not allowed`);
  }
  await assertPublicHost(parsed.hostname);
}
