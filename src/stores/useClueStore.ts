import { create } from 'zustand';
import type { Clue, ClueInput } from '../types';

export type { ClueInput };

interface ClueStore {
  clues: Clue[];

  /** 应用 LLM 给出的一组线索：同名则更新（补全发现细节），否则新增。 */
  addClues: (inputs: ClueInput[]) => void;
  removeClue: (name: string) => void;
  buildContextInjection: () => string;
  clearAll: () => void;
  replaceAll: (clues: Clue[]) => void;
}

function findByName(clues: Clue[], name: string): number {
  const exact = clues.findIndex((c) => c.name === name);
  if (exact >= 0) return exact;
  return clues.findIndex((c) => c.name.includes(name) || name.includes(c.name));
}

export const useClueStore = create<ClueStore>()((set, get) => ({
  clues: [],

  addClues: (inputs) => {
    set((s) => {
      const clues = [...s.clues];
      for (const input of inputs) {
        if (!input.name) continue;
        const idx = findByName(clues, input.name);
        if (idx >= 0) {
          // 更新：补全/覆盖非空字段
          clues[idx] = {
            ...clues[idx],
            summary: input.summary || clues[idx].summary,
            discoveryNarrative: input.discoveryNarrative
              ? (clues[idx].discoveryNarrative
                  ? `${clues[idx].discoveryNarrative}\n${input.discoveryNarrative}`
                  : input.discoveryNarrative)
              : clues[idx].discoveryNarrative,
            foundAtPage: clues[idx].foundAtPage ?? input.foundAtPage,
            relatedTo: input.relatedTo?.length ? input.relatedTo : clues[idx].relatedTo,
          };
        } else {
          clues.push({
            id: crypto.randomUUID(),
            name: input.name,
            summary: input.summary ?? '',
            discoveryNarrative: input.discoveryNarrative ?? '',
            foundAtPage: input.foundAtPage,
            relatedTo: input.relatedTo,
            acquiredAt: Date.now(),
          });
        }
      }
      return { clues };
    });
  },

  removeClue: (name) => set((s) => {
    const idx = findByName(s.clues, name);
    if (idx < 0) return s;
    const clues = [...s.clues];
    clues.splice(idx, 1);
    return { clues };
  }),

  buildContextInjection: () => {
    const { clues } = get();
    if (clues.length === 0) return '';
    const lines = clues.map((c) => `- ${c.name}：${c.summary}`);
    return `[已掌握线索]\n${lines.join('\n')}`;
  },

  clearAll: () => set({ clues: [] }),
  replaceAll: (clues: Clue[]) => set({ clues }),
}));
