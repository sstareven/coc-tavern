import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';

interface ReadingModeStore {
  /** 沉浸阅读开关:true 时隐藏 TopBar / 剧本+队伍胶囊条 / StatusBar / PageBanner, 让卷轴最大化。 */
  immersive: boolean;
  toggleImmersive: () => void;
  setImmersive: (v: boolean) => void;
  /** 手机端顶部信息折叠开关:true 时收起剧本+队伍胶囊条 + StatusBar, 但保留 MobileTabBar 导航。
   *  桌面端不使用此字段(桌面有 fixed 侧边把手不需要)。 */
  topCollapsed: boolean;
  toggleTopCollapsed: () => void;
}

export const useReadingModeStore = create<ReadingModeStore>()(
  persist(
    (set) => ({
      immersive: false,
      toggleImmersive: () => set((s) => ({ immersive: !s.immersive })),
      setImmersive: (v) => set({ immersive: v }),
      topCollapsed: false,
      toggleTopCollapsed: () => set((s) => ({ topCollapsed: !s.topCollapsed })),
    }),
    {
      name: 'coc_reading_mode_v1',
      storage: createJSONStorage(createDexieStorage),
    },
  ),
);
