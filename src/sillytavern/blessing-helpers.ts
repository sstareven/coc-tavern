// Blessing cheat system helper functions// pickRollForResult is defined in cheating-helpers.ts; this file provides damage-dice helpers.

/**
 * Generate all possible selectable values for a damage dice expression.
 *
 * @param expr dice expression like "1D6", "2D6+3", "1D4+1D6+2"
 * @returns sorted unique array of possible totals (max 20 items); empty array for invalid input
 *
 * Strategy:
 * - Pure integer -> [integer]
 * - Single die "NdM" -> [N*1, N*2, ..., N*M]
 * - Multi-dice "NdM+KdL+const" -> [min, min+1, ..., max] full range with granularity 1
 * - Results > 20 items -> equidistant sampling (keep first + last)
 */
export function getBlessingDamageOptions(expr: string): number[] {
  if (!expr || typeof expr !== "string") return [];
  const cleaned = expr.replace(/\s+/g, "").toUpperCase();
  if (!cleaned) return [];

  // Pure integer
  if (/^\d+$/.test(cleaned)) {
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) ? [n] : [];
  }

  // Split into +/- terms using a regex
  interface Term { count: number; sides: number; sign: 1 | -1 }
  const terms: Term[] = [];
  let constant = 0;

  const re = /([+-]?)(\d*)(D(\d+)|(\d+))/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    const fullSign = match[1] || "+";
    const sign: 1 | -1 = fullSign === "-" ? -1 : 1;
    const prefix = match[2];
    const hasD = match[3] !== undefined && match[4] !== undefined;
    if (hasD) {
      const count = prefix ? parseInt(prefix, 10) : 1;
      const sides = parseInt(match[4], 10);
      if (count >= 1 && count <= 100 && sides >= 1 && sides <= 1000) {
        terms.push({ count, sides, sign });
      }
    } else {
      const val = parseInt(match[5], 10);
      if (Number.isFinite(val)) {
        constant += sign * val;
      }
    }
  }

  // Only constant
  if (terms.length === 0) return clampNonNegative([constant]);

  // Single die (count=1, sides=M)
  if (terms.length === 1 && terms[0].count === 1) {
    const { sides, sign } = terms[0];
    const result: number[] = [];
    for (let i = 1; i <= sides; i++) {
      result.push(sign * i + constant);
    }
    return clampNonNegative([...new Set(result)].sort((a, b) => a - b));
  }

  // Multi-dice: compute min/max possible total
  let min = constant;
  let max = constant;
  for (const t of terms) {
    if (t.sign === 1) {
      min += t.count * 1;
      max += t.count * t.sides;
    } else {
      min -= t.count * t.sides;
      max -= t.count * 1;
    }
  }

  const range = max - min + 1;
  if (range <= 0) return clampNonNegative([min]);
  if (range <= 20) {
    const result: number[] = [];
    for (let i = min; i <= max; i++) result.push(i);
    return clampNonNegative(result);
  }

  // Over 20 items: equidistant sampling (keep first + last)
  const step = Math.max(1, Math.floor(range / 18));
  const result: number[] = [min];
  for (let v = min + step; v < max; v += step) result.push(v);
  result.push(max);
  return clampNonNegative([...new Set(result)].sort((a, b) => a - b));
}

/** Clamp to non-negative, fallback to [0] if all negative */
function clampNonNegative(values: number[]): number[] {
  const filtered = values.filter((v) => v >= 0);
  return filtered.length > 0 ? filtered : [0];
}

/**
 * Format a damage expression for display (uppercase, no spaces).
 * e.g. "2d6+3" -> "2D6+3"
 */
export function formatDamageExpr(expr: string): string {
  if (!expr) return "";
  return expr.replace(/\s+/g, "").toUpperCase();
}
