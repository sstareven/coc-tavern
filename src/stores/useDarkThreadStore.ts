import { create } from 'zustand';

export interface DarkThreadEntry {
  id: string;
  timestamp: number;
  progress: number;
  threatLevel: string;
  details: string;
  foreshadowing: string;
}

/** 本局注定的「坏结局」。开局由 LLM 据情境生成、对玩家完全隐藏；暗线逐步逼近此结局。 */
export interface BadEnding {
  description: string;
  createdAt: number;
}

interface DarkThreadStore {
  entries: DarkThreadEntry[];
  /** 单例：本局坏结局（守秘人机密）。null 表示尚未生成。 */
  badEnding: BadEnding | null;
  addEntry: (entry: Omit<DarkThreadEntry, 'id' | 'timestamp'>) => void;
  setBadEnding: (ending: BadEnding | null) => void;
  buildContextInjection: () => string;
  clearAll: () => void;
  replaceAll: (entries: DarkThreadEntry[]) => void;
}

export const useDarkThreadStore = create<DarkThreadStore>()((set, get) => ({
  entries: [],
  badEnding: null,

  addEntry: (entry) =>
    set((s) => {
      const updated = [
        ...s.entries,
        { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
      ];
      return { entries: updated.length > 50 ? updated.slice(-50) : updated };
    }),

  setBadEnding: (ending) => set({ badEnding: ending }),

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

  clearAll: () => set({ entries: [], badEnding: null }),
  replaceAll: (entries: DarkThreadEntry[]) => set({ entries }),
}));
