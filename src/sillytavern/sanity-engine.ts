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
  const indefiniteTriggered = input.dailyAccumulated + abs >= dailyThreshold && abs > 0;
  const newSan = input.oldSan + input.delta;
  const permanentTriggered = newSan <= 0;
  const alone = !input.hasCompanionsPresent || input.allCompanionsInsane;
  const boutMode: 'summary' | 'realtime' = alone ? 'summary' : 'realtime';
  return { intRollNeeded, indefiniteTriggered, permanentTriggered, boutMode };
}
