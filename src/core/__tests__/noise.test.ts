import { describe, expect, it } from "vitest";
import { normalizeLine, normalizeText, tokenize } from "../normalize";
import { diffTexts, fingerprintChange, heuristicSummary, measureChange } from "../diff";
import { sha256 } from "../hash";

describe("normalizeLine", () => {
  it.each([
    ["Updated 2026-10-15T09:31:07Z", "Updated ‹datetime›"],
    ["Published 2026-10-15", "Published ‹date›"],
    ["Posted 15/10/2026", "Posted ‹date›"],
    ["Wed, Oct 15, 2026", "‹date›"],
    ["15 October 2026", "‹date›"],
    ["Last sync 14:05:09 UTC", "Last sync ‹time›"],
    ["Edited 5 minutes ago", "Edited ‹ago›"],
    ["Edited an hour ago", "Edited ‹ago›"],
    ["3h ago", "‹ago›"],
    ["Refreshed just now", "Refreshed ‹ago›"],
    ["Ends in 3 days", "Ends ‹in›"],
    ["ts=1760520000", "ts=‹ts›"],
    ["req 3f2a9c1e-77b0-4e7a-9d2b-0c1f5e6a7b8c", "req ‹id›"],
    ["build a1b2c3d4e5f60718293a", "build ‹hex›"],
    ["csrf Zx9Kq2Lm8Np4Rt6Vw1Yb3Cd5Ef", "csrf ‹token›"],
    ["12,431 views", "‹count›"],
    ["Followers: 1.2k", "‹count›"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizeLine(input)).toBe(expected);
  });

  it("does not swallow ordinary words after a time", () => {
    expect(normalizeLine("Doors 9:00 start")).toBe("Doors ‹time› start");
    expect(normalizeLine("Meeting 7:30 PST")).toBe("Meeting ‹time›");
  });

  it("leaves meaningful content alone", () => {
    expect(normalizeLine("Pro plan $29 / month")).toBe("Pro plan $29 / month");
    expect(normalizeLine("You may cancel anytime")).toBe("You may cancel anytime");
    expect(normalizeLine("Version 2.4 released")).toBe("Version 2.4 released");
  });
});

describe("normalizeText", () => {
  const a = "Pricing\n\nPro  $29\nUpdated 3 minutes ago\n1,204 people viewing";
  const b = "Pricing\nPro $29\nUpdated 7 minutes ago\n1,377 people viewing";

  it("makes two noisy renders of an unchanged page hash identically", () => {
    expect(sha256(normalizeText(a))).toBe(sha256(normalizeText(b)));
  });

  it("drops user-ignored lines", () => {
    expect(normalizeText("Keep\nPromo: 20% off", { ignoreLines: ["Promo: 20% off"] })).toBe("Keep");
  });

  it("tokenizes on whitespace", () => {
    expect(tokenize(" a  b\nc ")).toEqual(["a", "b", "c"]);
  });
});

describe("diffTexts", () => {
  it("produces hunks with word highlights and context", () => {
    const oldText = ["Header", "Pro plan $29", "Footer"].join("\n");
    const newText = ["Header", "Pro plan $24", "Footer"].join("\n");
    const diff = diffTexts(oldText, newText);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
    expect(diff.hunks).toHaveLength(1);
    const add = diff.hunks[0].lines.find((l) => l.type === "add");
    expect(add?.words?.filter((w) => w.type === "add").map((w) => w.text)).toEqual(["24"]);
    expect(heuristicSummary(diff)).toBe("“$29” → “$24”");
  });

  it("flags hunks that only differ by noise", () => {
    const diff = diffTexts("A\nUpdated 2 minutes ago\nB", "A\nUpdated 9 minutes ago\nB");
    expect(diff.noiseHunks).toBe(1);
    expect(diff.added).toBe(0);
    expect(heuristicSummary(diff)).toBe("Only noise changed");
  });

  it("splits distant changes into separate hunks", () => {
    const base = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const changed = base.map((l, i) => (i === 2 || i === 25 ? `${l} edited` : l));
    expect(diffTexts(base.join("\n"), changed.join("\n")).hunks).toHaveLength(2);
  });

  it("names up to two edits in the summary", () => {
    const diff = diffTexts("$29.00\nSold out\nBlue\nLarge", "$24.00\nIn stock\nRed\nSmall");
    expect(heuristicSummary(diff)).toBe("“$29.00” → “$24.00” · “Sold out” → “In stock”");
  });

  it("summarizes pure additions and removals", () => {
    expect(heuristicSummary(diffTexts("A", "A\nNew job: Staff Engineer"))).toBe("Added: “New job: Staff Engineer”");
    expect(heuristicSummary(diffTexts("A\nSold out", "A"))).toBe("Removed: “Sold out”");
  });
});

describe("measureChange / fingerprintChange", () => {
  it("counts changed tokens", () => {
    const m = measureChange("Pro plan $29", "Pro plan $24");
    expect(m.changedTokens).toBe(2);
    expect(m.totalTokens).toBe(3);
  });

  it("fingerprints the same edit identically regardless of surrounding order", () => {
    expect(fingerprintChange("a\nb\nc", "a\nB\nc")).toBe(fingerprintChange("x\nb", "x\nB"));
    expect(fingerprintChange("a\nb", "a\nB")).not.toBe(fingerprintChange("a\nb", "a\nC"));
  });
});
