import type { DiceResultType } from '../types';

/**
 * Generate a random d10 value (0–9).
 * inspired by SillyTavern's dice implementation
 */
export const randD10 = (): number => Math.floor(Math.random() * 10);

/**
 * Combine tens and ones into a d100 value.
 * COC convention: (0, 0) = 100, otherwise t*10 + o.
 */
export const d100 = (tens: number, ones: number): number =>
  (tens === 0 && ones === 0) ? 100 : tens * 10 + ones;

/**
 * COC 7th Edition five-tier result determination.
 *
 * Priority order (first match wins):
 *   1. roll === 100              → crit-failure
 *   2. SAN check && roll >= 96   → crit-failure (mythos madness)
 *   3. roll === 1                → crit-success
 *   4. roll ≤ target / 5         → extreme-success
 *   5. roll ≤ target / 2         → hard-success
 *   6. roll ≤ target             → success
 *   7. !SAN && target < 50 && roll ≥ 96 → crit-failure (low-skill botch)
 *   8. otherwise                 → failure
 */
export function determineResult(
  roll: number,
  target: number,
  sanCheck: boolean,
): DiceResultType {
  const fifth = Math.floor(target / 5);
  const half = Math.floor(target / 2);

  if (roll === 100) return 'crit-failure';
  if (sanCheck && roll >= 96) return 'crit-failure';
  if (roll === 1) return 'crit-success';
  if (roll <= fifth) return 'extreme-success';
  if (roll <= half) return 'hard-success';
  if (roll <= target) return 'success';
  if (!sanCheck && target < 50 && roll >= 96) return 'crit-failure';
  return 'failure';
}
