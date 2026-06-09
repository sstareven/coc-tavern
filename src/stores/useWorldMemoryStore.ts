import { create } from 'zustand';
import { EMPTY_WORLD_MEMORY, type WorldMemory, type WorldMemoryUpdate } from '../types/npc-world-memory';

interface WorldMemoryStore {
  world: WorldMemory;
  pending: boolean;
  applyUpdate: (update: WorldMemoryUpdate, turn: number) => void;
  replace: (world: WorldMemory) => void;
  clear: () => void;
  setPending: (value: boolean) => void;
  buildContextInjection: () => string;
}

export const useWorldMemoryStore = create<WorldMemoryStore>()((set, get) => ({
  world: EMPTY_WORLD_MEMORY,
  pending: false,

  applyUpdate: (update, turn) =>
    set((s) => {
      const next: WorldMemory = { ...s.world };
      if (typeof update.darkThread === 'string' && update.darkThread.length > 0) {
        next.darkThread = update.darkThread;
      }
      if (update.keywordMeaningsUpsert && Object.keys(update.keywordMeaningsUpsert).length > 0) {
        next.keywordMeanings = { ...next.keywordMeanings };
        for (const [k, v] of Object.entries(update.keywordMeaningsUpsert)) {
          if (k && typeof v === 'string') next.keywordMeanings[k] = v;
        }
      }
      if (typeof update.atmosphere === 'string' && update.atmosphere.length > 0) {
        next.atmosphere = update.atmosphere;
      }
      if (Array.isArray(update.unrevealedReplace)) {
        next.unrevealed = [...update.unrevealedReplace];
      }
      if (typeof update.prose === 'string' && update.prose.length > 0) {
        next.prose = update.prose;
      }
      next.updatedAt = turn;
      return { world: next };
    }),

  replace: (world) => set({ world }),

  clear: () => set({ world: EMPTY_WORLD_MEMORY }),

  setPending: (value) => set({ pending: value }),

  buildContextInjection: () => {
    const { world } = get();
    const lines: string[] = [];
    if (world.darkThread) lines.push(`暗线：${world.darkThread}`);
    if (world.atmosphere) lines.push(`氛围：${world.atmosphere}`);
    if (world.unrevealed.length > 0) lines.push(`未触发节点：${world.unrevealed.join('; ')}`);
    if (world.prose) lines.push(`世界整体心思：${world.prose}`);
    if (lines.length === 0) return '';
    return ['### 世界心思', ...lines].join('\n');
  },
}));
