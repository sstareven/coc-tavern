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

/** 单次注入的 active 线索上限，超出只注入最近 N 条 */
const CLUE_INJECT_CAP = 15;

/** 仅在未归档线索中按名查找（精确优先，再宽松包含） */
function findActiveByName(clues: Clue[], name: string): number {
  const t = name.trim();
  const exact = clues.findIndex((c) => c.status !== 'archived' && c.name === t);
  if (exact >= 0) return exact;
  return clues.findIndex((c) => c.status !== 'archived' && (c.name.includes(t) || t.includes(c.name)));
}

export const useClueStore = create<ClueStore>()((set, get) => ({
  clues: [],

  addClues: (inputs) => {
    set((s) => {
      const clues = [...s.clues];
      for (const input of inputs) {
        if (!input.name) continue;

        // 演化：新线索声明 evolvesFrom 旧线索名 → 归档旧线索、上位新线索
        if (input.evolvesFrom?.trim()) {
          const newClue: Clue = {
            id: crypto.randomUUID(),
            name: input.name,
            summary: input.summary ?? '',
            discoveryNarrative: input.discoveryNarrative ?? '',
            foundAtPage: input.foundAtPage,
            relatedTo: input.relatedTo,
            tags: input.tags?.length ? input.tags : undefined,
            acquiredAt: Date.now(),
            status: 'active',
            tier: 'major',
          };
          const oldIdx = findActiveByName(clues, input.evolvesFrom);
          if (oldIdx >= 0) {
            clues[oldIdx] = { ...clues[oldIdx], status: 'archived', evolvedIntoId: newClue.id };
            newClue.evolvedFrom = clues[oldIdx].id;
          }
          clues.push(newClue);
          continue;
        }

        const idx = findActiveByName(clues, input.name);
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
            // 标签并集去重（保留旧标签、并入新标签）
            tags: input.tags?.length
              ? [...new Set([...(clues[idx].tags ?? []), ...input.tags])]
              : clues[idx].tags,
          };
        } else {
          clues.push({
            id: crypto.randomUUID(),
            name: input.name,
            summary: input.summary ?? '',
            discoveryNarrative: input.discoveryNarrative ?? '',
            foundAtPage: input.foundAtPage,
            relatedTo: input.relatedTo,
            tags: input.tags?.length ? input.tags : undefined,
            acquiredAt: Date.now(),
            status: 'active',
            tier: 'normal',
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
    const active = get().clues.filter((c) => c.status !== 'archived');
    if (active.length === 0) return '';
    const truncated = active.length > CLUE_INJECT_CAP;
    const list = truncated ? active.slice(-CLUE_INJECT_CAP) : active;
    const lines = list.map((c) => `- ${c.tier === 'major' ? '★' : ''}${c.name}：${c.summary}`);
    if (truncated) lines.push(`- （更早线索见线索库，共 ${active.length} 条）`);
    return `[已掌握线索]\n${lines.join('\n')}`;
  },

  clearAll: () => set({ clues: [] }),
  replaceAll: (clues: Clue[]) => set({ clues }),
}));
