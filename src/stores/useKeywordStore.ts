import { create } from 'zustand';

interface KeywordStore {
  keywords: Record<string, string>;
  addKeywords: (entries: Record<string, string>) => void;
  replaceAll: (keywords: Record<string, string>) => void;
}

export const useKeywordStore = create<KeywordStore>()((set) => ({
  keywords: {},
  addKeywords: (entries) => set((s) => {
    const merged = { ...s.keywords };
    for (const [k, v] of Object.entries(entries)) {
      if (k && v && !merged[k]) merged[k] = v;
    }
    return { keywords: merged };
  }),
  replaceAll: (keywords) => set({ keywords }),
}));
