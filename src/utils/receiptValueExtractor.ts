import { normalizeAmount } from "./amountNormalizer";
import { fuzzySearchInLines } from "./fuzzySearch";

/**
 * Extracts the first nearby number matching the label.
 */
export function extractValueNearLabel(
  lines: string[],
  labels: string[],
  range: number = 3
): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (fuzzySearchInLines(line, labels)) {
      // Try to parse amount from the same line
      const inlineAmount = normalizeAmount(line);
      if (inlineAmount !== null) return inlineAmount;

      // Otherwise look forward and backward up to N lines
      for (let j = 1; j <= range; j++) {
        const before = lines[i - j];
        const after = lines[i + j];

        if (after) {
          const afterAmount = normalizeAmount(after);
          if (afterAmount !== null) return afterAmount;
        }
        if (before) {
          const beforeAmount = normalizeAmount(before);
          if (beforeAmount !== null) return beforeAmount;
        }
      }
    }
  }
  return null;
}

/**
 * Extracts the KDV rate (e.g. from '%10')
 */
export function extractKdvRate(lines: string[]): number | null {
  for (const line of lines) {
    const match = line.match(/%\s?(\d{1,2})/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}