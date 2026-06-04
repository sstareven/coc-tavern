/**
 * A2 重设 — useSanityBubbleStore: 跟踪当前页 SAN check 气泡的【已解决态】(in-memory)。
 *
 * 数据流:
 *   page.sanityCheckPrompts (来自 LLM, 随页持久化) → SanityBubble UI 渲染气泡
 *     ↓ 玩家点击 → SanityCheckPanel 跑判定 + 落 SAN op
 *     ↓ 关闭面板 → useSanityBubbleStore.markResolved(id)
 *
 * 为什么是 in-memory(不入 Dexie):
 *   "已解决"是当前会话的瞬时 UI 态——重启游戏后玩家自然把所有页气泡当成"已经历过";
 *   持久化反而带来"老存档读回但 resolved 未恢复 → 气泡复活"的混乱。简洁原则: 重启全清。
 *
 * 与 useChoiceLockStore 协同:
 *   有未解决气泡时, useChoiceLockStore 通过 sanityPending 锁住选项。
 *   SanityBubble 必须解决完才能继续点选项——这与 SAN check 是【非自愿】的语义一致(看见了就要面对)。
 *
 * 接 sessionLifecycle (per memory session-isolation-invariant):
 *   - clearAllGameState → reset()    新游戏 / 删会话
 *   - loadConversation  → reset()    切会话时把上一会话的解决态清掉(下一会话叙事的气泡得重新解决)
 *
 * 接 page-delete-rollback-snapshot-pattern:
 *   删页通过 reset() 重置——气泡列表本身随页(BookPage.sanityCheckPrompts)消失, resolved 也清掉
 *   防"老 id 解决了但其对应 page 已删, 新页面又出同 id 误判已解决"。
 */

import { create } from 'zustand';

interface SanityBubbleStore {
  /** 已点击解决的气泡 id 集合; 同一 id 在同一会话内只解决一次。 */
  resolved: Set<string>;
  /** 当前 LLM 输出但玩家未点的气泡 id 列表(按 page.sanityCheckPrompts 派生; 在 RightPage/LeftPage 渲染时由 setPending 喂)。 */
  pending: string[];
  /** 把当前页未解决的气泡 id 喂进来(每次切页 / 渲染时主动同步)。 */
  setPending: (ids: string[]) => void;
  /** 玩家点完一个气泡 → SAN check 已落账 → 标记已解决。 */
  markResolved: (id: string) => void;
  /** 是否所有 pending 气泡都已 resolved(供 useChoiceLockStore 判断解锁)。 */
  allClicked: () => boolean;
  /** 切会话/新游戏/删页 → 全清(resolved + pending)。 */
  reset: () => void;
}

export const useSanityBubbleStore = create<SanityBubbleStore>()((set, get) => ({
  resolved: new Set<string>(),
  pending: [],
  setPending: (ids) => set({ pending: ids }),
  markResolved: (id) => set((s) => {
    if (s.resolved.has(id)) return s; // 幂等
    const next = new Set(s.resolved);
    next.add(id);
    return { resolved: next };
  }),
  allClicked: () => {
    const s = get();
    if (s.pending.length === 0) return true;
    return s.pending.every((id) => s.resolved.has(id));
  },
  reset: () => set({ resolved: new Set(), pending: [] }),
}));
