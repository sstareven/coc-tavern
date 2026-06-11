/**
 * 理智损失评估（R6）。纯函数，无副作用：调用方提供输入、得到一组布尔判定与 boutMode 建议。
 *  - intRollNeeded: |delta| ≥ 5（单次事件）触发 INT 检定，过 → 临时疯狂候选。
 *  - indefiniteTriggered: 当日累计含本次绝对值 ≥ floor(sanMax/5)（RAW 1/5 规则）。
 *  - permanentTriggered: 本次扣损后 san 触底（≤ 0）。
 *  - boutMode: 独行或同伴皆已疯 → summary；否则 realtime（同伴可旁观）。
 *
 * 该模块零 import 副作用、零 store 依赖，供 A2.4 post-settle evaluator 与未来工具脚本共用。
 */
export interface SanLossInput {
  oldSan: number;
  /** 通常为负数（损失）；为 0 视为无理智事件，evaluator 应跳过该次评估。 */
  delta: number;
  sanMax: number;
  /** 当日累计已损失 SAN（不含本次）。 */
  dailyAccumulated: number;
  hasCompanionsPresent: boolean;
  allCompanionsInsane: boolean;
}

export interface SanLossEvaluation {
  intRollNeeded: boolean;
  indefiniteTriggered: boolean;
  permanentTriggered: boolean;
  boutMode: 'summary' | 'realtime';
}

export function evaluateSanLoss(input: SanLossInput): SanLossEvaluation {
  const abs = Math.abs(input.delta);
  const dailyThreshold = Math.floor(input.sanMax / 5);
  const intRollNeeded = abs >= 5;
  const indefiniteTriggered =
    // sanMax=0 时 dailyThreshold=0,任意 abs>0 都会撞到 ≥0,会把第一次扣 SAN 误判为不定性疯狂;
    // 实际未配置 SAN(EmptySheet/迁移空字段)时不应触发。
    dailyThreshold > 0 && input.dailyAccumulated + abs >= dailyThreshold && abs > 0;
  const newSan = input.oldSan + input.delta;
  const permanentTriggered = newSan <= 0;
  const alone = !input.hasCompanionsPresent || input.allCompanionsInsane;
  const boutMode: 'summary' | 'realtime' = alone ? 'summary' : 'realtime';
  return { intRollNeeded, indefiniteTriggered, permanentTriggered, boutMode };
}

/* ------------------------------------------------------------------ */
/*  rollPsychoanalysis — 心理分析恢复 SAN (COC7e)                       */
/* ------------------------------------------------------------------ */

/**
 * 心理治疗（精神分析）检定。
 * - 由具有「精神分析」技能的 NPC（或自我治疗）发起。
 * - 成功时恢复 1D3 SAN（上限 sanMax）。
 * - selfTherapy 时技能减半（hard difficulty）。
 */
export function rollPsychoanalysis(
  analystSkill: number,
  currentSan: number,
  sanMax: number,
  selfTherapy: boolean = false,
  rng: () => number = Math.random,
  hpRng: () => number = Math.random,
): { recovered: number; roll: number; success: boolean } {
  const effectiveSkill = selfTherapy ? Math.floor(analystSkill / 2) : analystSkill;
  const roll = Math.floor(rng() * 100) + 1;
  const success = roll <= effectiveSkill;
  if (!success || currentSan >= sanMax) return { recovered: 0, roll, success };
  const d3 = Math.floor(hpRng() * 3) + 1;
  return { recovered: Math.min(d3, sanMax - currentSan), roll, success };
}
