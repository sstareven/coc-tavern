/**
 * useNarrationStore — 跨子调用「待落本页」旁白队列(in-memory)。
 *
 * 数据流:
 *   party-relation-evaluator / 后续脱队/事件评估器 → append(line)
 *     ↓
 *   useChatPipeline 提交 newPage 前 → drainPending() → newPage.narration = lines
 *     ↓
 *   随 BookPage.narration 一起持久化, RightPage 读取展示
 *
 * 为什么 in-memory(不入 Dexie):
 *   旁白只在【本回合写本页】这一个瞬时阶段使用; 一旦页落库就跟随 page.narration 永久化。
 *   重启游戏不应残留上回合未消费的旁白。
 *
 * 接 sessionLifecycle:
 *   - clearAllGameState / loadConversation / deleteSession → clearPending()
 */

import { create } from 'zustand';

interface NarrationStore {
  /** 待落入本回合 newPage.narration 的旁白行(按 append 顺序)。 */
  pending: string[];
  /** 评估器/脱队联动追加一条旁白。 */
  append: (line: string) => void;
  /** 取出 pending 并清空——useChatPipeline 提交 newPage 前调用。 */
  drainPending: () => string[];
  /** 切会话/新游戏/删会话 → 清空。 */
  clearPending: () => void;
}

export const useNarrationStore = create<NarrationStore>()((set, get) => ({
  pending: [],
  append: (line) =>
    set((s) => ({
      pending: line.trim() ? [...s.pending, line.trim()] : s.pending,
    })),
  drainPending: () => {
    const cur = get().pending;
    if (cur.length === 0) return [];
    set({ pending: [] });
    return cur;
  },
  clearPending: () => set({ pending: [] }),
}));
