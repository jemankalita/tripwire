import { measureChange } from "./diff";
import { isMeaningful, type Sensitivity } from "./decide";
import { normalizeText } from "./normalize";

export type CalibrationElement = { selector: string; text: string };
export type CalibrationRender = { text: string; elements: CalibrationElement[] };

const MAX_VOLATILE_TEXT = 400;

/**
 * Elements whose text differs between back-to-back renders of the same page are
 * volatile by definition (clocks, rotating promos, random IDs). We keep only the
 * deepest such elements, so ignoring them removes the noise and nothing else.
 */
export function findVolatileSelectors(renders: readonly CalibrationRender[]): string[] {
  if (renders.length < 2) return [];
  const maps = renders.map((r) => new Map(r.elements.map((e) => [e.selector, e.text.trim()])));
  const [first, ...rest] = maps;

  const volatile = [...first.entries()]
    .filter(([selector]) => rest.every((m) => m.has(selector)))
    .filter(([selector, text]) => rest.some((m) => m.get(selector) !== text))
    .filter(([, text]) => text.length <= MAX_VOLATILE_TEXT)
    .map(([selector]) => selector);

  return volatile.filter(
    (sel) => !volatile.some((other) => other !== sel && other.startsWith(`${sel} > `)),
  );
}

export type SensitivityPreview = Record<Sensitivity, number>;

/**
 * "Would have alerted N times during calibration" for each sensitivity level,
 * after noise normalization and with the auto-ignored regions removed.
 */
export function previewSensitivity(
  renders: readonly CalibrationRender[],
  volatileSelectors: readonly string[],
): SensitivityPreview {
  const volatileTexts = new Set(
    renders.flatMap((r) =>
      r.elements.filter((e) => volatileSelectors.includes(e.selector)).map((e) => e.text.trim()),
    ),
  );
  const clean = renders.map((r) =>
    normalizeText(
      r.text
        .split("\n")
        .filter((line) => ![...volatileTexts].some((t) => t && line.includes(t)))
        .join("\n"),
    ),
  );

  const measures = clean.slice(1).map((text, i) => measureChange(clean[i], text));
  const count = (s: Sensitivity) => measures.filter((m) => isMeaningful(m, s)).length;
  return { low: count("low"), medium: count("medium"), high: count("high") };
}
