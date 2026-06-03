import { create } from 'zustand';
import type { Encounter } from '../types';

interface CombatStore {
  /** 进行中战斗；null = 未在战斗中。 */
  encounter: Encounter | null;
  /** 进入战斗。 */
  start: (e: Encounter) => void;
  /** 整体写回（每步引擎结算后更新 store；持久化与 UI 据此渲染）。 */
  setEncounter: (e: Encounter) => void;
  /** 脱战/固化进页之后清空。 */
  clearCombat: () => void;
  /** 读档恢复。 */
  replaceAll: (e: Encounter | null) => void;
  /** 会话隔离清空。 */
  clearAll: () => void;
}

export const useCombatStore = create<CombatStore>()((set) => ({
  encounter: null,
  start: (e) => set({ encounter: e }),
  setEncounter: (e) => set({ encounter: e }),
  clearCombat: () => set({ encounter: null }),
  replaceAll: (e) => set({ encounter: e ?? null }),
  clearAll: () => set({ encounter: null }),
}));
