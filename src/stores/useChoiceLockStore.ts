import { create } from 'zustand';

/**
 * 选项锁：按下一个会推进/掷骰的选项后立刻上锁，防止重复点击导致重掷或二次提交
 * （旧 bug：检定选项可连点，第二次重掷并记录第二次结果）。在一次提交结束(成功/失败/中止)
 * 或切换会话时解锁。
 */
interface ChoiceLockStore {
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useChoiceLockStore = create<ChoiceLockStore>()((set) => ({
  locked: false,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));
