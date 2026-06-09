import { create } from 'zustand';

/**
 * 选项锁：按下一个会推进/掷骰的选项后立刻上锁，防止重复点击导致重掷或二次提交
 * （旧 bug：检定选项可连点，第二次重掷并记录第二次结果）。在一次提交结束(成功/失败/中止)
 * 或切换会话时解锁。
 *
 * A2 重设: SAN 气泡的「未解决」状态由 useSanityBubbleStore 自己维护；选项 UI 直接
 * 订阅 sanityBubble 的 pending/resolved 在本地派生 sanityBlocked，与 locked 合并判定。
 */
interface ChoiceLockStore {
  /** 主提交锁(选项落账期间) */
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useChoiceLockStore = create<ChoiceLockStore>()((set) => ({
  locked: false,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));
