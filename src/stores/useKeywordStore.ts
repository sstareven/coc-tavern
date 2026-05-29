import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

interface KeywordStore {
  keywords: Record<string, string>;
  addKeywords: (entries: Record<string, string>) => void;
  replaceAll: (keywords: Record<string, string>) => void;
}

export const useKeywordStore = create<KeywordStore>()(
  persist(
    (set) => ({
      keywords: {},
      addKeywords: (entries) => set((s) => {
        const merged = { ...s.keywords };
        for (const [k, v] of Object.entries(entries)) {
          if (k && v && !merged[k]) merged[k] = v;
        }
        return { keywords: merged };
      }),
      replaceAll: (keywords) => set({ keywords }),
    }),
    {
      name: 'coc_keywords_v1',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state) as Partial<KeywordStore>,
    },
  ),
);
