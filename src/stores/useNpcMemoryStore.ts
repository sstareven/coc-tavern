import { create } from 'zustand';
import {
  type NpcMemory,
  type NpcMemoryUpdate,
  type EmotionEnum,
  normalizeEmotion,
  EMPTY_NPC_MEMORY,
} from '../types/npc-world-memory';

export type { NpcMemory, NpcMemoryUpdate, EmotionEnum };

interface ApplyUpdatesOpts {
  findIdByName: (name: string) => string | null;
  isScenarioPreset?: (id: string) => boolean;
}

interface BuildInjectionOpts {
  currentLocationName?: string | null;
  coreIds: string[];
  importantIdsByLocation: Record<string, string[]>;
  absentImportantIds: string[];
  nameOf: (id: string) => string;
}

interface NpcMemoryStore {
  memories: Record<string, NpcMemory>;
  pendingCardIds: string[];

  applyUpdates: (updates: NpcMemoryUpdate[], turn: number, opts: ApplyUpdatesOpts) => void;
  replaceAll: (memories: Record<string, NpcMemory>) => void;
  clearAll: () => void;
  setMemory: (id: string, memory: NpcMemory) => void;
  addPending: (id: string) => void;
  removePending: (id: string) => void;
  buildContextInjection: (opts: BuildInjectionOpts) => string;
}

function clampTrust(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

/** secrets 合并：保留原顺序，新增项按 LLM 给出的顺序追加；用 Set 仅做存在性检测。 */
function mergeSecrets(existing: string[], add: string[]): string[] {
  const seen = new Set(existing);
  const next = [...existing];
  for (const s of add) {
    const t = typeof s === 'string' ? s.trim() : '';
    if (!t || seen.has(t)) continue;
    seen.add(t);
    next.push(t);
  }
  return next;
}

/** relationshipsUpsert：同 target 覆盖该项 emotion/note，新 target 追加。 */
function upsertRelationships(
  existing: NpcMemory['relationships'],
  upserts: NpcMemoryUpdate['relationshipsUpsert'],
): NpcMemory['relationships'] {
  if (!upserts || upserts.length === 0) return existing;
  const next = existing.map((r) => ({ ...r }));
  for (const r of upserts) {
    const target = typeof r?.target === 'string' ? r.target.trim() : '';
    if (!target) continue;
    const emotion = normalizeEmotion(r.emotion);
    const note = typeof r.note === 'string' ? r.note : '';
    const idx = next.findIndex((x) => x.target === target);
    if (idx >= 0) {
      next[idx] = { target, emotion, note };
    } else {
      next.push({ target, emotion, note });
    }
  }
  return next;
}

function formatRelationship(r: NpcMemory['relationships'][number]): string {
  return `对 ${r.target}（${r.emotion}）：${r.note}`;
}

function formatFull(name: string, m: NpcMemory): string {
  const lines = [`**${name}**`];
  lines.push(`目标：${m.goal}`);
  lines.push(`下一步：${m.nextMove}`);
  lines.push(`情绪/信任：${m.emotionToPC} / ${m.trustOnPC}`);
  if (m.secrets.length > 0) lines.push(`秘密：${m.secrets.join('; ')}`);
  if (m.relationships.length > 0) {
    lines.push(`关系：\n${m.relationships.map((r) => `- ${formatRelationship(r)}`).join('\n')}`);
  }
  if (m.prose.trim()) lines.push(`心思：${m.prose}`);
  return lines.join('\n');
}

function formatBrief(name: string, m: NpcMemory): string {
  return [
    `**${name}**`,
    `目标：${m.goal}`,
    `下一步：${m.nextMove}`,
    `情绪：${m.emotionToPC}`,
  ].join('\n');
}

export const useNpcMemoryStore = create<NpcMemoryStore>()((set, get) => ({
  memories: {},
  pendingCardIds: [],

  applyUpdates: (updates, turn, opts) => {
    set((s) => {
      const memories = { ...s.memories };
      for (const u of updates) {
        if (!u || typeof u.name !== 'string') continue;
        const id = opts.findIdByName(u.name);
        if (!id) continue;
        const isPreset = opts.isScenarioPreset?.(id) === true;
        const cur: NpcMemory = memories[id] ?? { ...EMPTY_NPC_MEMORY };
        const next: NpcMemory = { ...cur };

        // 是否本回合 update 实际改了任何字段; 若 LLM 在 name 字段提到了 NPC 但所有
        // 字段都为空/未变, 不应 bump updatedAt — 否则 useChatPipeline 的 NPC stale
        // 触发条件 (turn - updatedAt >= NPC_REFRESH_INTERVAL) 永远不命中。
        let changed = false;

        // 剧本预设 NPC 的 goal/nextMove/prose 非空时受保护——这三项是作者写定的暗线骨架，
        // 主回合 LLM 增量只能在尚未填充时初始化；secrets/relationships 仍可累积。
        if (typeof u.goal === 'string' && u.goal.trim()) {
          if (!(isPreset && next.goal.trim())) { next.goal = u.goal; changed = true; }
        }
        if (typeof u.nextMove === 'string' && u.nextMove.trim()) {
          if (!(isPreset && next.nextMove.trim())) { next.nextMove = u.nextMove; changed = true; }
        }
        if (typeof u.prose === 'string' && u.prose.trim()) {
          if (!(isPreset && next.prose.trim())) { next.prose = u.prose; changed = true; }
        }
        if (typeof u.trustOnPC === 'number') {
          const c = clampTrust(u.trustOnPC);
          if (c !== next.trustOnPC) { next.trustOnPC = c; changed = true; }
        }
        if (u.emotionToPC !== undefined) {
          const e = normalizeEmotion(u.emotionToPC);
          if (e !== next.emotionToPC) { next.emotionToPC = e; changed = true; }
        }
        if (Array.isArray(u.secretsAdd) && u.secretsAdd.length > 0) {
          const merged = mergeSecrets(next.secrets, u.secretsAdd);
          if (merged.length !== next.secrets.length) { next.secrets = merged; changed = true; }
        }
        if (Array.isArray(u.relationshipsUpsert) && u.relationshipsUpsert.length > 0) {
          next.relationships = upsertRelationships(next.relationships, u.relationshipsUpsert);
          changed = true;
        }

        if (changed) next.updatedAt = turn;
        memories[id] = next;
      }
      return { memories };
    });
  },

  replaceAll: (memories) => set({ memories: { ...memories } }),

  clearAll: () => set({ memories: {}, pendingCardIds: [] }),

  setMemory: (id, memory) => set((s) => ({
    memories: { ...s.memories, [id]: { ...memory, emotionToPC: normalizeEmotion(memory.emotionToPC), trustOnPC: clampTrust(memory.trustOnPC) } },
  })),

  addPending: (id) => set((s) => (
    s.pendingCardIds.includes(id) ? {} : { pendingCardIds: [...s.pendingCardIds, id] }
  )),

  removePending: (id) => set((s) => (
    s.pendingCardIds.includes(id)
      ? { pendingCardIds: s.pendingCardIds.filter((x) => x !== id) }
      : {}
  )),

  buildContextInjection: (opts) => {
    const { memories } = get();
    if (Object.keys(memories).length === 0) return '';
    const curLoc = opts.currentLocationName?.trim() ?? '';
    const coreIds = opts.coreIds.filter((id) => memories[id]);
    const presentImportantIds = curLoc
      ? (opts.importantIdsByLocation[curLoc] ?? []).filter((id) => memories[id] && !coreIds.includes(id))
      : [];
    const absentImportantIds = opts.absentImportantIds.filter(
      (id) => memories[id] && !coreIds.includes(id) && !presentImportantIds.includes(id),
    );

    const sections: string[] = [];
    if (coreIds.length > 0) {
      const lines = coreIds.map((id) => formatFull(opts.nameOf(id), memories[id]));
      sections.push(`### 核心 NPC 心智档案\n${lines.join('\n\n')}`);
    }
    if (presentImportantIds.length > 0) {
      const lines = presentImportantIds.map((id) => formatFull(opts.nameOf(id), memories[id]));
      sections.push(`### 在场重要 NPC 心智档案\n${lines.join('\n\n')}`);
    }
    if (absentImportantIds.length > 0) {
      const lines = absentImportantIds.map((id) => formatBrief(opts.nameOf(id), memories[id]));
      sections.push(`### 不在场重要 NPC 概要\n${lines.join('\n\n')}`);
    }
    return sections.join('\n\n');
  },
}));
