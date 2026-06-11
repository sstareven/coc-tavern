import { create } from 'zustand';
import type { Chase } from '../types';

interface ChaseStore {
  /** 进行中追逐；null = 未在追逐中。 */
  chase: Chase | null;
  /** 已被面板「看过/演出过」的追逐日志行数——区分新开追逐(从0起逐条动画)与读档恢复(全显不重播)。非持久化。 */
  seenLogLen: number;
  /** 进入追逐（新开追逐 → seenLogLen=0，面板从头逐条演出）。 */
  start: (c: Chase) => void;
  /** 整体写回（每步引擎结算后更新 store；持久化与 UI 据此渲染）。 */
  setChase: (c: Chase) => void;
  /** 标记日志已看到第 n 行（面板逐条揭示时调用，供翻页重挂载/读档判定）。 */
  markSeen: (n: number) => void;
  /** 追逐结束/固化进页之后清空。 */
  clearChase: () => void;
  /** 读档恢复（整段日志视为已看过 → 不重播）。 */
  replaceAll: (c: Chase | null) => void;
  /** 会话隔离清空。 */
  clearAll: () => void;
}

export const useChaseStore = create<ChaseStore>()((set) => ({
  chase: null,
  seenLogLen: 0,
  start: (c) => set({ chase: c, seenLogLen: 0 }),
  setChase: (c) => set({ chase: c }),
  markSeen: (n) => set((s) => (n > s.seenLogLen ? { seenLogLen: n } : {})),
  clearChase: () => set({ chase: null, seenLogLen: 0 }),
  replaceAll: (c) => set({ chase: c ?? null, seenLogLen: c?.log.length ?? 0 }),
  clearAll: () => set({ chase: null, seenLogLen: 0 }),
}));
