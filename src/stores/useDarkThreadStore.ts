import { create } from 'zustand';

export interface DarkThreadEntry {
  id: string;
  timestamp: number;
  progress: number;
  threatLevel: string;
  details: string;
  foreshadowing: string;
}

interface DarkThreadStore {
  entries: DarkThreadEntry[];
  addEntry: (entry: Omit<DarkThreadEntry, 'id' | 'timestamp'>) => void;
  buildContextInjection: () => string;
  clearAll: () => void;
  replaceAll: (entries: DarkThreadEntry[]) => void;
}

export const useDarkThreadStore = create<DarkThreadStore>()((set, get) => ({
  entries: [],

  addEntry: (entry) =>
    set((s) => {
      const updated = [
        ...s.entries,
        { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
      ];
      return { entries: updated.length > 50 ? updated.slice(-50) : updated };
    }),

  buildContextInjection: () => {
    const { entries } = get();
    if (entries.length === 0) return '';
    const recent = entries.slice(-5);
    const latest = recent[recent.length - 1];
    const lines = [
      '[暗线档案 — 仅限守秘人参考，绝对不可向调查员透露以下内容]',
      `当前进度: ${latest.progress}/100 (${latest.threatLevel})`,
      '最近发展:',
    ];
    for (const e of recent) {
      if (e.details) lines.push(`- ${e.details}`);
    }
    return lines.join('\n');
  },

  clearAll: () => set({ entries: [] }),
  replaceAll: (entries: DarkThreadEntry[]) => set({ entries }),
}));
