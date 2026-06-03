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
  buildContextInjection: (saveWorldMode?: boolean) => string;
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

  buildContextInjection: (saveWorldMode = false) => {
    const { entries, badEnding } = get();
    if (entries.length === 0 && !badEnding) return '';
    const recent = entries.slice(-5);
    const latest = recent.length ? recent[recent.length - 1] : null;

    // 拯救世界模式：灾厄对玩家公开化，作为明确的赛跑目标（不再是守秘人机密）。
    if (saveWorldMode) {
      const lines = ['[拯救世界·终局——灾厄已迫在眉睫，调查员已洞悉真相，须与暗线进度赛跑阻止它]'];
      if (badEnding) {
        lines.push(`若失败将降临的灾厄（调查员此刻已明确知晓，可在叙事与选项中直面）：${badEnding.description}`);
        lines.push('调查员所有行动都应服务于【阻止这一灾厄成形】；暗线 progress 即倒计时，越接近 100 越危急，75+ 时灾厄趋于不可逆。请据此营造紧迫感并给出指向「终结灾厄」的行动选项。');
      }
      if (latest) {
        lines.push(`当前危机进度: ${latest.progress}/100 (${latest.threatLevel})`);
        lines.push('最近发展:');
        for (const e of recent) { if (e.details) lines.push(`- ${e.details}`); }
      }
      return lines.join('\n');
    }

    // 常规模式：坏结局为守秘人机密，绝不向玩家透露。
    const lines = ['[暗线档案 — 仅限守秘人参考，绝对不可向调查员透露以下内容]'];
    if (badEnding) {
      lines.push(`本局注定的坏结局（暗线的终点，守秘人最高机密，绝不可向调查员泄露或写进叙事正文）：${badEnding.description}`);
      lines.push('暗线应每回合朝这一结局推进，progress 越高越接近；75+爆发时该结局趋于不可逆地降临。');
    }
    if (latest) {
      lines.push(`当前进度: ${latest.progress}/100 (${latest.threatLevel})`);
      lines.push('最近发展:');
      for (const e of recent) { if (e.details) lines.push(`- ${e.details}`); }
    }
    return lines.join('\n');
  },

  clearAll: () => set({ entries: [], badEnding: null }),
  replaceAll: (entries: DarkThreadEntry[]) => set({ entries }),
}));
