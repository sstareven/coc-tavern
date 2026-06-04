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

/**
 * 战斗是否「悬空孤儿」：encounter 锚定页(anchorPageId)已不在现存 pages 中
 * （删页/回溯/裁页移除了那一页）。这种战斗非空却任何页都渲染不出面板（面板隐形），
 * 又会被 enterCombat 守卫(`if(encounter)return`)与主管线 `!encounter` 门控当成「已在战斗中」，
 * 从而静默堵死所有进战入口（名册攻击/选项格斗/行动补写）。须在删页/读档时识别并清除。
 * 无 anchorPageId（老存档，按最新页显示）或 encounter 为空 → 非孤儿。
 */
export function isOrphanedEncounter(encounter: Encounter | null, pageIds: readonly string[]): boolean {
  if (!encounter?.anchorPageId) return false;
  return !pageIds.includes(encounter.anchorPageId);
}
