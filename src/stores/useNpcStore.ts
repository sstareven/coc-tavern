import { create } from 'zustand';
import type { NpcProfile, NpcUpdate } from '../types';

export type { NpcUpdate };

interface NpcStore {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;

  profiles: Record<string, NpcProfile>; // by id
  applyUpdates: (updates: NpcUpdate[]) => void;
  getPresent: () => NpcProfile[];
  getAbsent: () => NpcProfile[];
  buildContextInjection: () => string;
  replaceAll: (profiles: NpcProfile[]) => void;
  clearAll: () => void;
}

function findIdByName(profiles: Record<string, NpcProfile>, name: string): string | null {
  const trimmed = name.trim();
  for (const [id, p] of Object.entries(profiles)) {
    if (p.name === trimmed) return id;
  }
  // 宽松包含匹配兜底
  for (const [id, p] of Object.entries(profiles)) {
    if (p.name.includes(trimmed) || trimmed.includes(p.name)) return id;
  }
  return null;
}

function clampFav(n: number): number {
  return Math.max(-100, Math.min(100, n));
}

const SET_FIELDS: (keyof NpcProfile)[] = [
  'identity', 'faction', 'gender', 'appearanceAge', 'derived',
  'appearance', 'personality', 'innerThoughts', 'experience', 'backstory', 'status',
];

export const useNpcStore = create<NpcStore>()((set, get) => ({
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),

  profiles: {},

  applyUpdates: (updates) => {
    set((s) => {
      const profiles = { ...s.profiles };
      for (const u of updates) {
        if (!u.name?.trim()) continue;
        const now = Date.now();
        let id = findIdByName(profiles, u.name);
        let p: NpcProfile;
        if (id) {
          p = { ...profiles[id] };
        } else {
          id = crypto.randomUUID();
          p = {
            id, name: u.name.trim(), identity: '', favorability: 0,
            appearance: '', personality: '', innerThoughts: '',
            memories: [], experience: '', backstory: '', possessions: [],
            isPresent: u.isPresent ?? true, createdAt: now, updatedAt: now,
          };
        }
        // 直接覆盖的文本字段
        const uRec = u as unknown as Record<string, unknown>;
        const pRec = p as unknown as Record<string, unknown>;
        for (const f of SET_FIELDS) {
          const v = uRec[f as string];
          if (typeof v === 'string' && v.trim()) pRec[f as string] = v;
        }
        if (u.characteristics) p.characteristics = { ...(p.characteristics ?? {}), ...u.characteristics };
        if (u.skills) p.skills = { ...(p.skills ?? {}), ...u.skills };
        if (Array.isArray(u.possessions)) p.possessions = u.possessions;
        if (typeof u.favorabilityDelta === 'number') p.favorability = clampFav(p.favorability + u.favorabilityDelta);
        if (typeof u.isPresent === 'boolean') p.isPresent = u.isPresent;
        if (u.addMemory?.trim()) p.memories = [...p.memories, u.addMemory.trim()].slice(-30);
        p.updatedAt = now;
        profiles[id] = p;
      }
      return { profiles };
    });
  },

  getPresent: () => Object.values(get().profiles).filter((p) => p.isPresent).sort((a, b) => b.updatedAt - a.updatedAt),
  getAbsent: () => Object.values(get().profiles).filter((p) => !p.isPresent).sort((a, b) => b.updatedAt - a.updatedAt),

  buildContextInjection: () => {
    const present = get().getPresent();
    if (present.length === 0) return '';
    const lines = present.map((p) => {
      const fav = p.favorability > 30 ? '友好' : p.favorability < -30 ? '敌对' : '中立';
      const parts = [`- ${p.name}（${p.identity || '身份不明'}，对调查员好感度${p.favorability}/${fav}）`];
      if (p.personality) parts.push(`  性格：${p.personality}`);
      if (p.innerThoughts) parts.push(`  内心想法(KP视角)：${p.innerThoughts}`);
      if (p.memories.length) parts.push(`  近期互动：${p.memories.slice(-3).join('；')}`);
      return parts.join('\n');
    });
    return `[在场NPC——请严格按各自的身份、性格、动机、好感度与记忆一致地扮演]\n${lines.join('\n')}`;
  },

  replaceAll: (list) => set({ profiles: Object.fromEntries(list.map((p) => [p.id, p])) }),
  clearAll: () => set({ profiles: {} }),
}));
