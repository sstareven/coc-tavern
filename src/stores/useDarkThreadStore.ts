import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

export interface DarkThreadEntry {
  id: string;
  timestamp: number;
  description: string;
  progress: number;
  threatLevel: string;
  details: string;
  foreshadowing: string;
}

interface DarkThreadStore {
  entries: DarkThreadEntry[];
  addEntry: (entry: Omit<DarkThreadEntry, 'id' | 'timestamp'>) => void;
  getRecentEntries: (n: number) => DarkThreadEntry[];
  buildContextInjection: () => string;
  clearAll: () => void;
}

export const useDarkThreadStore = create<DarkThreadStore>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (entry) =>
        set((s) => {
          const updated = [
            ...s.entries,
            { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
          ];
          return { entries: updated.length > 50 ? updated.slice(-50) : updated };
        }),

      getRecentEntries: (n) => {
        const { entries } = get();
        return entries.slice(-n);
      },

      buildContextInjection: () => {
        const { entries } = get();
        if (entries.length === 0) return '';
        const recent = entries.slice(-5);
        const latest = recent[recent.length - 1];
        const lines = [
          '[暗线档案 — 仅限守秘人参考，绝对不可向调查员透露以下内容]',
          `当前进度: ${latest.progress}/100 (${latest.threatLevel})`,
        ];
        if (latest.description) {
          lines.push(`暗线概述: ${latest.description}`);
        }
        lines.push('最近发展:');
        for (const e of recent) {
          if (e.details) lines.push(`- ${e.details}`);
        }
        return lines.join('\n');
      },

      clearAll: () => set({ entries: [] }),
    }),
    {
      name: 'coc_darkthread_v1',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) =>
        stripFunctions(state as unknown as Record<string, unknown>) as Partial<DarkThreadStore>,
    },
  ),
);
