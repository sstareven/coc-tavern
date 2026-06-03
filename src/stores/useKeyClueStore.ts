import { create } from 'zustand';
import type { KeyPillar } from '../types';

/** 拯救世界系统的真相支柱目标数：揭示全部 3 个即开启 saveWorldMode。 */
export const KEY_CLUE_TARGET = 3;

interface KeyClueStore {
  /** 真相支柱：开局生成后固定为 3 条；未生成时为空数组。 */
  pillars: KeyPillar[];
  /** 拯救世界模式：揭示全部支柱后置 true，且不可逆（仅 markPillarUncovered 路径约束）。 */
  saveWorldMode: boolean;

  /** 写入支柱——仅当当前 pillars 为空时生效（幂等防重复生成覆盖）；各 pillar 的 uncovered 保持传入值。 */
  setPillars: (p: KeyPillar[]) => void;
  /** 精确按 pillarId 标记某支柱为已揭示；已揭示的不重复改；达标即 saveWorldMode=true（不回退）。 */
  markPillarUncovered: (pillarId: string, clueName: string) => void;
  /** 已揭示支柱数。 */
  uncoveredCount: () => number;
  /** 构造守秘人视角的机密注入文本（绝不向调查员泄露）；pillars 为空返回 ''。 */
  buildContextInjection: () => string;
  /** 读档恢复：按传入值整体替换 pillars 与 saveWorldMode。 */
  replaceAll: (pillars: KeyPillar[], saveWorldMode: boolean) => void;
  /** 清空：pillars=[]、saveWorldMode=false。 */
  clearAll: () => void;
}

export const useKeyClueStore = create<KeyClueStore>()((set, get) => ({
  pillars: [],
  saveWorldMode: false,

  setPillars: (p) => {
    // 幂等防覆盖：仅在当前为空时写入，避免重复生成把已揭示进度冲掉。
    if (get().pillars.length !== 0) return;
    set({ pillars: p.map((pillar) => ({ ...pillar })) });
  },

  markPillarUncovered: (pillarId, clueName) => {
    set((s) => {
      const idx = s.pillars.findIndex((pillar) => pillar.id === pillarId);
      // 找不到或已揭示：不动（避免重复改写揭示线索名）。
      if (idx < 0 || s.pillars[idx].uncovered) return {};
      const pillars = s.pillars.map((pillar, i) =>
        i === idx ? { ...pillar, uncovered: true, uncoveredByClue: clueName } : pillar
      );
      const uncovered = pillars.filter((pillar) => pillar.uncovered).length;
      // 达标即开启拯救世界模式；一旦为 true 不在此路径回退（与既有 saveWorldMode 取或）。
      const saveWorldMode = s.saveWorldMode || uncovered >= KEY_CLUE_TARGET;
      return { pillars, saveWorldMode };
    });
  },

  uncoveredCount: () => get().pillars.filter((p) => p.uncovered).length,

  buildContextInjection: () => {
    const { pillars } = get();
    if (pillars.length === 0) return '';
    const lines = ['[真相支柱档案 — 仅限守秘人，绝不可向调查员泄露支柱原文]'];
    for (const p of pillars) {
      const flag = p.uncovered ? '已揭示' : '未揭示';
      lines.push(`- [${flag}] ${p.title}：${p.secret}`);
    }
    lines.push('请让剧情逐步给玩家逼近【未揭示】支柱的线索。');
    return lines.join('\n');
  },

  replaceAll: (pillars, saveWorldMode) =>
    set({ pillars: pillars.map((p) => ({ ...p })), saveWorldMode }),

  clearAll: () => set({ pillars: [], saveWorldMode: false }),
}));
