import type { DiceResultType } from '../types';
import { determineResult } from './dice-engine';

/**
 * 从目标档位反推一个 d100 点数，保证 determineResult() 返回同一档。
 * 如果某档位在当前目标值下没有合法点数，返回 null。
 *
 * 边界：
 * - 大成功固定返回 1
 * - 极难成功需要 target >= 5（否则 fifth = 0，不合法）
 * - 困难成功需要 target / 5 < target / 2（即 target >= 3）
 * - 成功需要 target >= 1（但最小 target 是 1 时 half = 0，不可用）
 * - 失败需要 target + 1 <= 最大合法失败值（避开大失败区）
 * - 大失败：SAN 检定允许 96-100，普通检定 target < 50 时 96-100 也是大失败区
 */
export function pickRollForResult(
  type: DiceResultType,
  target: number,
  sanCheck: boolean,
): number | null {
  const fifth = Math.floor(target / 5);
  const half = Math.floor(target / 2);

  switch (type) {
    case 'crit-success':
      return 1;

    case 'extreme-success': {
      // 需要 fifth >= 1（即 target >= 5）且有一个值在 1..fifth 且不为 1
      if (fifth < 2) return null; // 没有合法的非大成功极难值
      return 2; // 保证在 1..fifth 范围内且不为 1
    }

    case 'hard-success': {
      // 需要区间 (fifth, half] 内且不为 1（crit-success）
      const lo = Math.max(fifth + 1, 2);
      if (half < lo) return null;
      return lo;
    }

    case 'success': {
      // 需要区间 (half, target] 内且不为 1（crit-success）
      const lo = Math.max(half + 1, 2);
      if (target < lo) return null;
      return lo;
    }

    case 'failure': {
      const minFail = target + 1;
      let maxFail: number;
      if (sanCheck) {
        // SAN 检定：96-100 是大失败区，所以失败上限是 95
        maxFail = 95;
      } else if (target < 50) {
        // 普通检定 target < 50：96-100 是大失败区
        maxFail = 95;
      } else {
        // 普通检定 target >= 50：只有 100 是大失败
        maxFail = 99;
      }
      if (minFail > maxFail) return null;
      return minFail;
    }

    case 'crit-failure': {
      if (sanCheck) return 96;
      if (target < 50) return 100;
      return 100; // target >= 50 时只有 100 是大失败
    }
  }
}

/**
 * 验证：将 pickRollForResult 的结果喂给 determineResult，确保一致。
 * 用于测试和调试。
 */
export function verifyPickRoll(
  type: DiceResultType,
  target: number,
  sanCheck: boolean,
): { roll: number | null; verifyType: string | null; match: boolean } {
  const roll = pickRollForResult(type, target, sanCheck);
  if (roll === null) return { roll: null, verifyType: null, match: false };
  const verifyType = determineResult(roll, target, sanCheck);
  return { roll, verifyType, match: verifyType === type };
}

/**
 * 为伤害骰表达式生成所有可能的可选值。
 * 单骰 1D6 → [1,2,3,4,5,6]
 * 多骰 1D4+1D6 → [2..10]
 * 纯常数 3 → [3]
 * 限制最多 30 个选项以免 UI 过载。
 */
export function getBlessingDamageOptions(expr: string): number[] {
  const clean = (expr || '').replace(/\s+/g, '').toUpperCase();
  if (!clean) return [];

  const terms: { sign: number; count: number; sides: number }[] = [];
  let constTotal = 0;
  const termRe = /([+-]?)(\d*D\d+|\d+)/g;
  let m: RegExpExecArray | null;

  while ((m = termRe.exec(clean)) !== null) {
    const sign = m[1] === '-' ? -1 : 1;
    const term = m[2];
    const dm = term.match(/^(\d*)D(\d+)$/);
    if (dm) {
      const count = dm[1] ? parseInt(dm[1], 10) : 1;
      const sides = parseInt(dm[2], 10);
      if (count > 0 && count <= 100 && sides > 0 && sides <= 1000) {
        terms.push({ sign, count, sides });
      }
    } else {
      constTotal += sign * parseInt(term, 10);
    }
  }

  if (terms.length === 0) {
    // 纯常数
    return [constTotal];
  }

  // 计算所有骰子的总最小值和最大值
  let min = constTotal;
  let max = constTotal;
  for (const t of terms) {
    if (t.sign > 0) {
      min += t.count * 1;
      max += t.count * t.sides;
    } else {
      min -= t.count * t.sides;
      max -= t.count * 1;
    }
  }

  // 限制选项数量
  const range = max - min + 1;
  if (range > 30) {
    // 间隔取样
    const step = Math.ceil(range / 30);
    const result: number[] = [];
    for (let v = min; v <= max; v += step) {
      result.push(v);
    }
    if (result[result.length - 1] !== max) result.push(max);
    return result;
  }

  const result: number[] = [];
  for (let v = min; v <= max; v++) {
    result.push(v);
  }
  return result;
}
