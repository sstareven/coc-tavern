// src/stores/useOptionStagingStore.ts
//
// A1.8 — RightPage 选项检定 staging 浮层的轻量协调器。
//
// 流程：
//   1) fillInputBar 命中真检定 + shouldStage 通过 → 暂存 StagingTrigger 但不写 textarea
//   2) DiceAnimation 滚完动画 → GameView 检查 pending：若有则 open()，浮 OptionResolutionOverlay
//   3) 玩家点 推骰/扣幸运/直接落账 → resolve(outcome) → 写 textarea + stashRecord + 触发 auto-submit
//   4) 任何时候 cancel() 都会丢弃 pending（例：玩家点选项前换页/换会话）。
//
// 单一 pending 不堆栈 —— 翻页/重新选项会覆盖；与 useDiceStore.clearPending 的语义一致。

import { create } from 'zustand';
import type { StagingTrigger, StagingOutcome } from '../sillytavern/option-staging';

interface OptionStagingStore {
  pending: StagingTrigger | null;
  /** 唤起浮层（同时存下 trigger）；重复 open 会覆盖旧 trigger。 */
  open: (trigger: StagingTrigger) => void;
  /** 玩家选择已落定（推骰/幸运/直接落账三选一其一），交给外部副作用（写 textarea / stashRecord / auto-submit）。 */
  resolve: (outcome: StagingOutcome) => void;
  /** 浮层未结束就被打断（换页/换会话/再点选项）：丢弃 pending。 */
  cancel: () => void;
}

export const useOptionStagingStore = create<OptionStagingStore>((set) => ({
  pending: null,
  open: (trigger) => set({ pending: trigger }),
  resolve: () => set({ pending: null }),
  cancel: () => set({ pending: null }),
}));
