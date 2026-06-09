import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';

interface ReadingModeStore {
  /** 沉浸阅读开关:true 时隐藏 TopBar / 剧本+队伍胶囊条 / StatusBar / PageBanner, 让卷轴最大化。 */
  immersive: boolean;
  toggleImmersive: () => void;
  setImmersive: (v: boolean) => void;
}

export const useReadingModeStore = create<ReadingModeStore>()(
  persist(
    (set) => ({
      immersive: false,
      toggleImmersive: () => set((s) => ({ immersive: !s.immersive })),
      setImmersive: (v) => set({ immersive: v }),
    }),
    {
      name: 'coc_reading_mode_v1',
      storage: createJSONStorage(createDexieStorage),
    },
  ),
);
