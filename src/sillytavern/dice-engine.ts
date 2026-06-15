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
 *   7. !SAN && target <= 50 && roll ≥ 96 → crit-failure (CoC7e p.88)
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
  if (!sanCheck && target <= 50 && roll >= 96) return 'crit-failure';
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

/** 推动检定不可用的技能门类（R4：战斗类与对抗反应类不许推动）。 */
export type PushSkillCategory =
  | 'fighting' | 'firearms' | 'dodge'
  | 'general' | 'knowledge' | 'investigation' | 'social'
  | 'language' | 'art' | 'science' | 'craft' | 'physical';

const PUSH_FORBIDDEN_CATEGORIES: ReadonlySet<PushSkillCategory> = new Set(['fighting', 'firearms', 'dodge']);

/**
 * R4 — 推动检定资格判定。仅当满足全部条件时允许推动：
 *   1) 技能门类不在战斗/射击/闪避禁用集
 *   2) 非 SAN 检定
 *   3) 非伤害骰
 *   4) 当前结果为 plain failure（成功类与大失败均不可推）
 */
export function isPushEligible(
  skillCategory: PushSkillCategory | string,
  resultType: DiceResultType,
  sanCheck: boolean,
  isDamageRoll: boolean,
): boolean {
  if (sanCheck) return false;
  if (isDamageRoll) return false;
  if (PUSH_FORBIDDEN_CATEGORIES.has(skillCategory as PushSkillCategory)) return false;
  return resultType === 'failure';
}

/**
 * COC 7e (p133-138) — 恐惧症/躁狂惩罚骰判定。
 * 当调查员患有恐惧症且当前场景涉及恐惧对象时，相关技能检定 +1 惩罚骰。
 * 返回应追加的惩罚骰数量（0 或 1）。
 */
export function checkPhobiaPenalty(
  _skillName: string,
  context: string | undefined,
  phobias: string[],
  manias: string[],
): number {
  if (!context) return 0;
  const ctx = context.toLowerCase();
  const allKeywords = [...phobias, ...manias];
  for (const kw of allKeywords) {
    // Strip common suffixes to get the core keyword
    const clean = kw.replace(/恐惧症|狂$/, '').toLowerCase();
    if (!clean) continue;
    // Direct match: context contains the full cleaned keyword
    if (ctx.includes(clean)) return 1;
    // Fuzzy CJK match: for compound keywords like 纵火 (arson), also try
    // progressively shorter suffixes down to 2 characters so that
    // 纵火 matches contexts mentioning 火焰 (flame) but single chars don't over-match.
    if (clean.length >= 2) {
      for (let i = 1; i < clean.length; i++) {
        const suffix = clean.slice(i);
        if (suffix.length < 2) break;
        if (ctx.includes(suffix)) return 1;
      }
    }
  }
  return 0;
}

export interface LuckApplyResult {
  finalRoll: number;
  appliedSpend: number;
  reason?: string;
}

/** 01 大成功 / 96-100 范围视为无法靠幸运扭转的极端骰点。 */
function isFumbleOrCrit(roll: number): boolean {
  return roll === 1 || roll >= 96;
}

/**
 * R7 — 把消耗的幸运点应用到一次普通检定上：
 *   - SAN/伤害/幸运自检：直接拒绝
 *   - 01 或 96–100：无法救援（无论目标值）
 *   - 否则 finalRoll = max(1, roll - spend)
 * 拒绝路径不扣点数（appliedSpend=0），调用方据此决定是否真正扣幸运。
 */
export function applyLuckToRoll(
  roll: number,
  _target: number,
  spend: number,
  sanCheck: boolean,
  isDamageRoll: boolean,
  isLuckRoll: boolean,
): LuckApplyResult {
  if (isLuckRoll) return { finalRoll: roll, appliedSpend: 0, reason: '幸运检定本身不可消耗幸运' };
  if (isDamageRoll) return { finalRoll: roll, appliedSpend: 0, reason: '伤害骰不可消耗幸运' };
  if (sanCheck) return { finalRoll: roll, appliedSpend: 0, reason: 'SAN 检定不可消耗幸运' };
  if (isFumbleOrCrit(roll)) {
    return { finalRoll: roll, appliedSpend: 0, reason: `01/96-100 不可被幸运扭转（roll=${roll}）` };
  }
  if (spend <= 0) return { finalRoll: roll, appliedSpend: 0 };
  const finalRoll = Math.max(1, roll - spend);
  return { finalRoll, appliedSpend: spend };
}
