import { create } from 'zustand';
import { useSanityBubbleStore } from './useSanityBubbleStore';

/**
 * 选项锁：按下一个会推进/掷骰的选项后立刻上锁，防止重复点击导致重掷或二次提交
 * （旧 bug：检定选项可连点，第二次重掷并记录第二次结果）。在一次提交结束(成功/失败/中止)
 * 或切换会话时解锁。
 *
 * A2 重设: 加 sanityPending 锁(只读派生): 当 useSanityBubbleStore.pending 含未点气泡时,
 * isLocked() 返回 true, 选项 UI 一并置灰。所有气泡 resolved → 自动解锁。
 * 不需要单独的 setSanityPending action — pending 数组本身就是单源真理。
 */
interface ChoiceLockStore {
  /** 主提交锁(选项落账期间) */
  locked: boolean;
  lock: () => void;
  unlock: () => void;
  /** 综合锁: locked || 有未解决 SAN 气泡。给 RightPage/ChoiceButton 读, 不写。 */
  isLocked: () => boolean;
}

export const useChoiceLockStore = create<ChoiceLockStore>()((set, get) => ({
  locked: false,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
  isLocked: () => {
    if (get().locked) return true;
    // 直接读气泡 store: 有未解决气泡时锁住选项。
    return !useSanityBubbleStore.getState().allClicked();
  },
}));
