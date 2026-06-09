import { create } from 'zustand';
import type { Clue, ClueInput } from '../types';

export type { ClueInput };

interface ClueStore {
  clues: Clue[];

  /** 应用 LLM 给出的一组线索：同名则更新（补全发现细节），否则新增。 */
  addClues: (inputs: ClueInput[]) => void;
  /** 归并：把指定（默认全部）active 线索归档（可回溯），用 1-3 条合成总结取代为新的 active。
   *  archiveIds 给出时只归档这些 id——避免归并 LLM 往返期间新发现的线索被一并误档。 */
  consolidateClues: (summaries: ClueInput[], archiveIds?: string[]) => void;
  /** 给某条 active 线索打「关键线索」标记（揭示了某真相支柱）。宽松名匹配。 */
  markClueKey: (name: string, pillarId: string) => void;
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
            // 演化保留关键性：旧线索若是关键线索，新线索继承其真相支柱
            if (clues[oldIdx].keyPillarId) newClue.keyPillarId = clues[oldIdx].keyPillarId;
          }
          clues.push(newClue);
          continue;
        }

        // 合成「推理线索」走精确名匹配：避免被既有线索的宽松包含匹配吞并
        // （如「推理：教团的真正目标」含子串「教团」会误判为更新而看不到新增）。
        const idx = input.synthesized
          ? clues.findIndex((c) => c.status !== 'archived' && c.name === input.name.trim())
          : findActiveByName(clues, input.name);
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
            // 合成线索保持/上位为 major 并带 synthesized 标记
            synthesized: input.synthesized || clues[idx].synthesized,
            tier: input.synthesized ? 'major' : clues[idx].tier,
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
            synthesized: input.synthesized || undefined,
            acquiredAt: Date.now(),
            status: 'active',
            // 整合产出的推理线索上位为 major，与发现线索区分
            tier: input.synthesized ? 'major' : 'normal',
          });
        }
      }
      return { clues };
    });
  },

  consolidateClues: (summaries, archiveIds) => set((s) => {
    // 1. 归档 active 线索（保留可回溯，显示在「历史线索」区）。
    //    给了 archiveIds 则只归档这些 id——防止归并 LLM 往返期间新加入的线索被误档而「消失」。
    const idSet = archiveIds ? new Set(archiveIds) : null;
    // 收集被归档的 active 关键线索的真相支柱 id —— 让总结线索继承关键性（N 由 keyClueStore 独立跟踪，此处仅保留展示标记）。
    const archivedKeyPillars = [...new Set(
      s.clues
        .filter((c) => c.status !== 'archived' && (!idSet || idSet.has(c.id)) && c.keyPillarId)
        .map((c) => c.keyPillarId as string),
    )];
    const clues = s.clues.map((c) =>
      (c.status !== 'archived' && (!idSet || idSet.has(c.id))) ? { ...c, status: 'archived' as const } : c
    );
    // 2. 加入 1-3 条合成总结作为新的 active（major + synthesized）；把被归档的关键支柱依次绑定到总结上。
    let pillarCursor = 0;
    for (const input of summaries) {
      const name = input.name?.trim();
      if (!name) continue;
      clues.push({
        id: crypto.randomUUID(),
        name,
        summary: input.summary ?? '',
        discoveryNarrative: input.discoveryNarrative ?? '',
        foundAtPage: input.foundAtPage,
        relatedTo: input.relatedTo,
        tags: input.tags?.length ? input.tags : undefined,
        synthesized: true,
        acquiredAt: Date.now(),
        status: 'active',
        tier: 'major',
        keyPillarId: pillarCursor < archivedKeyPillars.length ? archivedKeyPillars[pillarCursor++] : undefined,
      });
    }
    return { clues };
  }),

  markClueKey: (name, pillarId) => set((s) => {
    const idx = findActiveByName(s.clues, name);
    if (idx < 0 || s.clues[idx].keyPillarId === pillarId) return s;
    const clues = [...s.clues];
    clues[idx] = { ...clues[idx], keyPillarId: pillarId, tier: 'major' };
    return { clues };
  }),

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
