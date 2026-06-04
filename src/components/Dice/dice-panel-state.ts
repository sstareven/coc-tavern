// A1.5 — DicePanel 子状态机的纯逻辑层
// idle → rolled → luck-slider → committed
//                ↘ pushable → committed
//
// 把 UI 状态推导抽到这里, 是因为本仓 vitest 环境=node, 无 jsdom/RTL,
// 测组件 DOM 不可行——但状态机本身是纯函数, 可独立覆盖。
// DicePanel.tsx 直接 import 这里的 deriveUiStateAfterRoll / previewLuckResult。

import type { DiceMode, DiceResultType } from '../../types';
import { canStartPush } from '../../stores/useDiceStore';
import { determineResult } from '../../sillytavern/dice-engine';

export type DicePanelSubState = 'idle' | 'rolled' | 'luck-slider' | 'pushable' | 'committed';

/**
 * rollStaged 后立即调用，根据结果决定子状态。
 * - 失败 + 推骰资格 (canStartPush) → 'pushable' (推骰 / 直接落账二选一)
 * - 其他 → 'rolled' (花费幸运 / 直接落账二选一)
 */
export function deriveUiStateAfterRoll(ctx: {
  resultType: DiceResultType | null;
  sanCheck: boolean;
  mode: DiceMode;
}): DicePanelSubState {
  if (!ctx.resultType) return 'idle';
  if (canStartPush({
    resultType: ctx.resultType,
    sanCheck: ctx.sanCheck,
    mode: ctx.mode,
    alreadyPushed: false,
  })) {
    return 'pushable';
  }
  return 'rolled';
}

/**
 * 幸运 slider 实时预览：扣 spend 点后骰值会落到哪一级?
 * 与 useDiceStore.commitWithLuck 走的算路一致 (Math.max(1, originalRoll - spend) → determineResult)。
 * 仅用于 UI 文字预览，不动 store。
 */
export function previewLuckResult(
  originalRoll: number,
  spend: number,
  target: number,
  sanCheck: boolean,
): { previewRoll: number; previewResult: DiceResultType } {
  const previewRoll = Math.max(1, originalRoll - Math.max(0, spend));
  return { previewRoll, previewResult: determineResult(previewRoll, target, sanCheck) };
}

/**
 * 「确认扣点 / 直接落账」按钮文案：spend=0 → 直接落账; spend>0 → 确认扣 N 点幸运。
 * 抽出来便于测试覆盖 spend=0 的短路文案。
 */
export function commitButtonLabel(spend: number): string {
  if (spend <= 0) return '直接落账';
  return `确认扣 ${spend} 点幸运`;
}

/**
 * 幸运 slider 上限钳位：min(玩家剩余幸运, 原骰值-1)。
 * - 不允许扣到 finalRoll <= 0 (没意义), 故 originalRoll-1 是天花板
 * - 不允许超过当前 luck (扣不起)
 */
export function maxLuckSpend(originalRoll: number, currentLuck: number): number {
  return Math.max(0, Math.min(currentLuck, originalRoll - 1));
}
