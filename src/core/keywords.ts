export type KeywordRule = {
  mode: "appears" | "disappears";
  text: string;
};

export type FiredKeyword = KeywordRule & { line?: string };

function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function lineWith(text: string, needle: string): string | undefined {
  return text.split("\n").find((l) => contains(l, needle));
}

/** Rules that transitioned between the previous and current version. */
export function firedKeywords(rules: readonly KeywordRule[], before: string, after: string): FiredKeyword[] {
  return rules
    .filter((r) => r.text.trim().length > 0)
    .filter((r) =>
      r.mode === "appears"
        ? !contains(before, r.text) && contains(after, r.text)
        : contains(before, r.text) && !contains(after, r.text),
    )
    .map((r) => ({ ...r, line: lineWith(r.mode === "appears" ? after : before, r.text) }));
}
