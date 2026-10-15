// Thousands may be grouped with commas, dots, apostrophes or non-breaking/thin spaces — not plain spaces,
// so "4.5 12 reviews" reads as 4.5, not 4.512.
const NUMBER = /[-−]?\d[\d.,'  ]*\d|[-−]?\d/;
const SUFFIX = /^\s*([kmb])\b/i;
const MULTIPLIER: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/**
 * Extract the first number from text, handling currency symbols, thousands
 * separators in either convention (1,299.00 / 1.299,00) and k/m/b suffixes.
 */
export function parseNumber(text: string): number | null {
  const match = text.match(NUMBER);
  if (!match || match.index === undefined) return null;

  const raw = match[0].replace(/[   ']/g, "").replace("−", "-");
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");

  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = /^-?\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(/,/g, ".");
  } else if ((raw.match(/\./g) ?? []).length > 1) {
    normalized = raw.replace(/\./g, "");
  } else {
    normalized = raw;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  const rest = text.slice(match.index + match[0].length);
  const suffix = rest.match(SUFFIX)?.[1]?.toLowerCase();
  return suffix ? value * MULTIPLIER[suffix] : value;
}

export type NumberRule = { op: "any" | "above" | "below"; value?: number };

export function numberRuleFires(rule: NumberRule, previous: number | null, current: number): boolean {
  if (previous === current) return false;
  switch (rule.op) {
    case "any":
      return previous !== null;
    case "above":
      return rule.value !== undefined && current > rule.value && (previous === null || previous <= rule.value);
    case "below":
      return rule.value !== undefined && current < rule.value && (previous === null || previous >= rule.value);
  }
}
