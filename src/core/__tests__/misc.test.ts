import { describe, expect, it } from "vitest";
import { findVolatileSelectors, previewSensitivity } from "../calibrate";
import { numberRuleFires, parseNumber } from "../numbers";
import { firedKeywords } from "../keywords";
import {
  backoffAt,
  clampInterval,
  effectiveInterval,
  formatInterval,
  MINUTE,
  nextCheckAt,
} from "../schedule";
import { DomainGate } from "../limiter";
import { isAllowedByRobots } from "../robots";
import { randomToken, sha256 } from "../hash";

describe("calibration", () => {
  const render = (clock: string, promo: string) => ({
    text: `Pricing\nPro $29\nServer time ${clock}\n${promo}`,
    elements: [
      { selector: "main", text: `Pricing Pro $29 Server time ${clock} ${promo}` },
      { selector: "main > p:nth-of-type(1)", text: "Pro $29" },
      { selector: "main > span.clock", text: `Server time ${clock}` },
      { selector: "main > div.promo", text: promo },
    ],
  });

  it("finds the deepest elements that change between back-to-back renders", () => {
    const renders = [render("a1", "Promo A"), render("b2", "Promo B"), render("c3", "Promo A")];
    expect(findVolatileSelectors(renders).sort()).toEqual(["main > div.promo", "main > span.clock"]);
    expect(findVolatileSelectors([renders[0]])).toEqual([]);
  });

  it("previews how many alerts each sensitivity would have produced", () => {
    const renders = [render("a1", "Promo A"), render("b2", "Promo B")];
    const volatile = findVolatileSelectors(renders);
    expect(previewSensitivity(renders, volatile)).toEqual({ low: 0, medium: 0, high: 0 });
    expect(previewSensitivity(renders, []).high).toBe(1);
  });
});

describe("parseNumber", () => {
  it.each([
    ["$1,299.00", 1299],
    ["€1.299,50", 1299.5],
    ["₹ 45,999", 45999],
    ["Price: 24", 24],
    ["12.5k followers", 12500],
    ["2.4M", 2_400_000],
    ["−3.5%", -3.5],
    ["1.234.567", 1234567],
    ["3,5", 3.5],
    ["4.5 12 reviews", 4.5],
    ["no digits", null],
  ])("parses %j", (input, expected) => expect(parseNumber(input)).toBe(expected));
});

describe("numberRuleFires", () => {
  it("handles any/above/below with crossing semantics", () => {
    expect(numberRuleFires({ op: "any" }, 10, 12)).toBe(true);
    expect(numberRuleFires({ op: "any" }, null, 12)).toBe(false);
    expect(numberRuleFires({ op: "any" }, 12, 12)).toBe(false);
    expect(numberRuleFires({ op: "below", value: 25 }, 29, 24)).toBe(true);
    expect(numberRuleFires({ op: "below", value: 25 }, 24, 23)).toBe(false);
    expect(numberRuleFires({ op: "above", value: 100 }, 90, 120)).toBe(true);
    expect(numberRuleFires({ op: "above" }, 90, 120)).toBe(false);
  });
});

describe("firedKeywords", () => {
  it("fires on transitions only", () => {
    const rules = [
      { mode: "appears" as const, text: "in stock" },
      { mode: "disappears" as const, text: "Sold out" },
      { mode: "appears" as const, text: "  " },
    ];
    const fired = firedKeywords(rules, "Widget\nSold out", "Widget\nIn stock now");
    expect(fired.map((f) => f.mode)).toEqual(["appears", "disappears"]);
    expect(fired[0].line).toBe("In stock now");
    expect(firedKeywords(rules, "In stock", "In stock")).toEqual([]);
  });
});

describe("schedule", () => {
  it("clamps intervals to 15 min – 24 h", () => {
    expect(clampInterval(1)).toBe(15);
    expect(clampInterval(5000)).toBe(1440);
    expect(clampInterval(Number.NaN)).toBe(60);
  });

  it("uses the most demanding watcher's interval", () => {
    expect(effectiveInterval([60, 15, 1440])).toBe(15);
    expect(effectiveInterval([])).toBeNull();
  });

  it("applies ±10% jitter", () => {
    expect(nextCheckAt(0, 60, () => 0)).toBe(54 * MINUTE);
    expect(nextCheckAt(0, 60, () => 1)).toBe(66 * MINUTE);
  });

  it("backs off exponentially and honors Retry-After", () => {
    expect(backoffAt(0, 15, 1)).toBe(15 * MINUTE);
    expect(backoffAt(0, 15, 3)).toBe(60 * MINUTE);
    expect(backoffAt(0, 15, 1, 3600)).toBe(3_600_000);
    expect(backoffAt(0, 720, 5)).toBe(1440 * MINUTE);
  });

  it("formats intervals", () => {
    expect(formatInterval(15)).toBe("15m");
    expect(formatInterval(120)).toBe("2h");
    expect(formatInterval(1440)).toBe("24h");
    expect(formatInterval(90)).toBe("1h 30m");
  });
});

describe("DomainGate", () => {
  it("allows one render at a time per host with a minimum gap", () => {
    const gate = new DomainGate({ minGapMs: 10_000, maxConcurrent: 1, breakerThreshold: 3, breakerCooldownMs: 60_000 });
    expect(gate.tryAcquire("a.com", 0)).toBe(true);
    expect(gate.tryAcquire("a.com", 1)).toBe(false);
    expect(gate.tryAcquire("b.com", 1)).toBe(true);
    gate.release("a.com", 2_000, { ok: true });
    expect(gate.tryAcquire("a.com", 5_000)).toBe(false);
    expect(gate.waitMs("a.com", 5_000)).toBe(5_000);
    expect(gate.tryAcquire("a.com", 10_000)).toBe(true);
  });

  it("honors Retry-After and opens the circuit after repeated failures", () => {
    const gate = new DomainGate({ minGapMs: 0, maxConcurrent: 1, breakerThreshold: 2, breakerCooldownMs: 60_000 });
    gate.tryAcquire("x.com", 0);
    gate.release("x.com", 0, { ok: false, retryAfterSec: 30 });
    expect(gate.waitMs("x.com", 1_000)).toBe(29_000);
    gate.tryAcquire("x.com", 30_000);
    gate.release("x.com", 30_000, { ok: false });
    expect(gate.waitMs("x.com", 31_000)).toBe(59_000);
    expect(gate.snapshot("x.com").failures).toBe(2);
  });
});

describe("robots.txt", () => {
  const robots = `
User-agent: *
Disallow: /private
Allow: /private/public
Disallow: /*.pdf$

User-agent: TripwireBot
User-agent: OtherBot
Disallow: /no-tripwire
`;
  it("prefers the group for our bot", () => {
    expect(isAllowedByRobots(robots, "/no-tripwire/page")).toBe(false);
    expect(isAllowedByRobots(robots, "/private/x")).toBe(true);
  });

  it("applies longest-match with wildcards for the * group", () => {
    expect(isAllowedByRobots(robots, "/private/x", "SomeBot")).toBe(false);
    expect(isAllowedByRobots(robots, "/private/public/y", "SomeBot")).toBe(true);
    expect(isAllowedByRobots(robots, "/files/a.pdf", "SomeBot")).toBe(false);
    expect(isAllowedByRobots(robots, "/files/a.pdf?x", "SomeBot")).toBe(true);
    expect(isAllowedByRobots("", "/anything")).toBe(true);
  });
});

describe("hash", () => {
  it("hashes deterministically and generates url-safe tokens", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
