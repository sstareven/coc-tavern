/**
 * COC7e 法术施放引擎 (p148-151)：POW 对抗施法。
 * 对目标施法需 施法者 POW vs 目标 POW 的对抗检定。
 * 纯逻辑，不依赖 React / Zustand。
 */

import { d100WithDice, successLevel, type SuccessLevel, type Rng } from './combat-engine';

/** 成功等级排序（越大越好）。combat-engine 有同表但未导出，此处自建。 */
const LEVEL_RANK: Record<SuccessLevel, number> = {
  fumble: 0, fail: 1, success: 2, hard: 3, extreme: 4, critical: 5,
};

export interface SpellCastResult {
  /** 施法是否成功（POW 对抗胜出） */
  success: boolean;
  /** 施法者的 d100 掷骰值 */
  casterRoll: number;
  /** 施法者的成功等级 */
  casterLevel: SuccessLevel;
  /** 目标的 d100 掷骰值 */
  targetRoll: number;
  /** 目标的成功等级 */
  targetLevel: SuccessLevel;
  /** 实际消耗的 MP（成功=法术全额，失败=1） */
  mpSpent: number;
  /** 理智值损失 */
  sanLost: number;
  /** 以 HP 代偿的 MP 不足部分 */
  hpSacrificed: number;
}

/**
 * 解算 POW 对抗施法。
 *
 * COC7e 规则：
 * - 施法者与目标各掷 d100 对 POW，比较成功等级。
 * - 施法者等级 > 目标等级 → 成功；平手 → 防御方（目标）胜。
 * - 成功消耗法术全额 MP；失败仍消耗 1 MP。
 * - MP 不足时若允许 HP 代偿，可牺牲 HP（不可牺牲最后 1 点）。
 * - SAN 消耗与成败无关，始终扣除。
 */
export function resolveSpellCast(
  casterPow: number,
  targetPow: number,
  spell: { mpCost: number; sanCost: number },
  casterMp: number,
  casterHp: number,
  allowHpSacrifice: boolean,
  rng: Rng = Math.random,
): SpellCastResult {
  // 施法者掷骰
  const cRoll = d100WithDice(0, 0, rng);
  const cLevel = successLevel(cRoll.finalRoll, casterPow);

  // 目标掷骰
  const tRoll = d100WithDice(0, 0, rng);
  const tLevel = successLevel(tRoll.finalRoll, targetPow);

  // 对抗比较：施法者等级严格大于目标等级才算成功（平手防御方胜）
  const cR = LEVEL_RANK[cLevel];
  const tR = LEVEL_RANK[tLevel];
  const success = cR > tR;

  // MP 消耗：成功付全额，失败付 1
  const mpNeeded = success ? spell.mpCost : 1;
  let mpSpent = Math.min(mpNeeded, casterMp);
  let hpSacrificed = 0;
  if (mpSpent < mpNeeded && allowHpSacrifice) {
    // 以 HP 代偿不足部分，但不可牺牲最后 1 点 HP
    hpSacrificed = Math.min(mpNeeded - mpSpent, casterHp - 1);
    mpSpent += hpSacrificed;
  }

  return {
    success,
    casterRoll: cRoll.finalRoll,
    casterLevel: cLevel,
    targetRoll: tRoll.finalRoll,
    targetLevel: tLevel,
    mpSpent,
    sanLost: spell.sanCost,
    hpSacrificed,
  };
}
