import { create } from 'zustand';
import type { Encounter } from '../types';

interface CombatStore {
  /** 进行中战斗；null = 未在战斗中。 */
  encounter: Encounter | null;
  /** 已被面板「看过/演出过」的战斗日志行数——区分新开战(从0起逐条动画)与读档恢复(全显不重播)。非持久化。 */
  seenLogLen: number;
  /** 进入战斗（新开战 → seenLogLen=0，面板从头逐条骰子+打字演出）。 */
  start: (e: Encounter) => void;
  /** 整体写回（每步引擎结算后更新 store；持久化与 UI 据此渲染）。 */
  setEncounter: (e: Encounter) => void;
  /** 标记日志已看到第 n 行（面板逐条揭示时调用，供翻页重挂载/读档判定）。 */
  markSeen: (n: number) => void;
  /** 脱战/固化进页之后清空。 */
  clearCombat: () => void;
  /** 读档恢复（整段日志视为已看过 → 不重播）。 */
  replaceAll: (e: Encounter | null) => void;
  /** 会话隔离清空。 */
  clearAll: () => void;
}

export const useCombatStore = create<CombatStore>()((set) => ({
  encounter: null,
  seenLogLen: 0,
  start: (e) => set({ encounter: e, seenLogLen: 0 }),
  setEncounter: (e) => set({ encounter: e }),
  markSeen: (n) => set((s) => (n > s.seenLogLen ? { seenLogLen: n } : {})),
  clearCombat: () => set({ encounter: null, seenLogLen: 0 }),
  replaceAll: (e) => set({ encounter: e ?? null, seenLogLen: e?.log.length ?? 0 }),
  clearAll: () => set({ encounter: null, seenLogLen: 0 }),
}));
