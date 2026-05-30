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

export interface DiceExprResult {
  /** 规范化后的表达式（去空白、大写 D），如 "1D6+2" */
  expr: string;
  /** 总点数 */
  total: number;
  /** 各骰子的单独结果（跨所有骰子项） */
  rolls: number[];
}

/**
 * 求值多面骰表达式（伤害骰/理智损失骰等），支持多项相加减：
 *   "1D6"、"1D3+1"、"1D10+1D4+2"、"2D6-1"、纯常数 "3"。
 * 无法解析时返回 null。d/D 不区分大小写。
 */
export function rollDiceExpr(expr: string): DiceExprResult | null {
  const clean = (expr || '').replace(/\s+/g, '').toUpperCase();
  if (!clean) return null;
  const termRe = /([+-]?)(\d*D\d+|\d+)/g;
  let m: RegExpExecArray | null;
  let total = 0;
  const rolls: number[] = [];
  let consumed = 0;
  let matched = false;
  while ((m = termRe.exec(clean)) !== null) {
    matched = true;
    const sign = m[1] === '-' ? -1 : 1;
    const term = m[2];
    const dm = term.match(/^(\d*)D(\d+)$/);
    if (dm) {
      const count = dm[1] ? parseInt(dm[1], 10) : 1;
      const sides = parseInt(dm[2], 10);
      if (count <= 0 || count > 100 || sides <= 0 || sides > 1000) return null;
      for (let i = 0; i < count; i++) {
        const r = 1 + Math.floor(Math.random() * sides);
        rolls.push(r);
        total += sign * r;
      }
    } else {
      total += sign * parseInt(term, 10);
    }
    consumed += m[0].length;
  }
  if (!matched || consumed !== clean.length) return null;
  return { expr: clean, total, rolls };
}
