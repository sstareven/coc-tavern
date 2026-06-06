import { create } from 'zustand';
import type { NpcProfile, NpcUpdate, COC7Characteristic } from '../types';
import { useSettingsStore } from './useSettingsStore';
import { useCharSheetStore } from './useCharSheetStore';
import { parseNpcDerived } from '../sillytavern/npc-derived';

export type { NpcUpdate };

// ── NPC 默认基础属性（确定性：同一 id 每次生成同一组，避免每次读档重掷）──
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** 据种子(NPC id)确定性生成一组 COC7e 基础属性：STR/CON/DEX/APP/POW=3d6×5，SIZ/INT/EDU=(2d6+6)×5。 */
function defaultCharacteristics(seed: string): Partial<Record<COC7Characteristic, number>> {
  const rng = mulberry32(hashStr(seed) || 1);
  const roll = (n: number, bonus = 0) => { let s = bonus; for (let i = 0; i < n; i++) s += Math.floor(rng() * 6) + 1; return s * 5; };
  return { STR: roll(3), CON: roll(3), DEX: roll(3), APP: roll(3), POW: roll(3), SIZ: roll(2, 6), INT: roll(2, 6), EDU: roll(2, 6) };
}
/** 缺基础属性的 NPC 补上确定性默认值（用户要求 NPC 都要有基础属性）。 */
function withDefaultChars(p: NpcProfile): NpcProfile {
  if (p.characteristics && Object.keys(p.characteristics).length > 0) return p;
  return { ...p, characteristics: defaultCharacteristics(p.id) };
}
/** 当前调查员名（调查员绝不应进入 NPC 名册）。 */
function investigatorName(): string {
  return useCharSheetStore.getState().sheet?.identity?.name?.trim() ?? '';
}

/** 折叠后默认保留的最近原始记忆条数（被 settings.npcMemoryKeep 覆盖） */
export const MEMORY_RECENT_KEEP = 6;
/** 原始记忆数 ≥ 此值时，注入端提示 AI 提供 memorySummary 折叠 */
export const MEMORY_FOLD_THRESHOLD = 10;
/** 安全兜底：memories 绝不超过此数，超出本地丢最旧 */
export const MEMORY_HARD_CAP = 14;

interface NpcStore {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;

  profiles: Record<string, NpcProfile>; // by id
  applyUpdates: (updates: NpcUpdate[]) => void;
  /** 战斗结算回写：把以 npc-<id> 为 id 的战斗员终值 hp 与昏迷/死亡/重伤状态写回对应 NPC 档案的 hpCurrent/status。 */
  applyCombatResult: (combatants: { id: string; hp: number; maxHp: number; flags?: { dead?: boolean; unconscious?: boolean; majorWound?: boolean } }[]) => void;
  getPresent: () => NpcProfile[];
  getAbsent: () => NpcProfile[];
  buildContextInjection: () => string;
  replaceAll: (profiles: NpcProfile[]) => void;
  clearAll: () => void;
}

/**
 * 严格按 trim 后逐字相等查 NPC id（BUG2 Part 1）。
 * 不再用双向 includes 做模糊归并——「霍尔姆斯先生」过去会被并到既有「霍尔姆斯」，
 * 导致新登场的同姓 NPC 不入名册、表面上看像「登场了却查不到」。
 * 真正的别名归并交给 {@link mergeAliases} 显式执行，不在每次 applyUpdates 自动触发。
 */
function findIdByName(profiles: Record<string, NpcProfile>, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  for (const [id, p] of Object.entries(profiles)) {
    if (p.name.trim() === trimmed) return id;
  }
  return null;
}

/**
 * 老档同名清理（迁移用）：trim 后逐字相等视为同一人，按 createdAt 早者保留，
 * 晚者把 memories 追加到早者后丢弃。仅在 replaceAll(load 时) 跑一次，避免数据残留。
 * 返回去重后的 profile 列表（保持原 id 不变）。
 */
export function dedupeProfilesByName(list: NpcProfile[]): NpcProfile[] {
  const byName = new Map<string, NpcProfile>();
  for (const p of list) {
    const key = p.name.trim();
    if (!key) continue;
    const exist = byName.get(key);
    if (!exist) {
      byName.set(key, p);
      continue;
    }
    // 早者保留（createdAt 小），晚者并入：合并 memories（去重保序）、保留早者其它字段。
    const [keep, drop] = exist.createdAt <= p.createdAt ? [exist, p] : [p, exist];
    const seen = new Set(keep.memories);
    const mergedMemories = [...keep.memories];
    for (const m of drop.memories) if (!seen.has(m)) { mergedMemories.push(m); seen.add(m); }
    byName.set(key, { ...keep, memories: mergedMemories, updatedAt: Math.max(keep.updatedAt, drop.updatedAt) });
  }
  return [...byName.values()];
}

/**
 * 显式别名归并工具（不在 applyUpdates 内自动触发）：把 src 名的 NPC 合到 target 名的 NPC，
 * memories 追加保序、其它字段以 target 为准（src 仅作为别名留痕被丢弃）。
 * 仅由 UI 操作或显式工具调用，避免「霍尔姆斯先生」被自动并到「霍尔姆斯」的回归。
 */
export function mergeAliases(
  profiles: Record<string, NpcProfile>,
  targetName: string,
  srcName: string,
): Record<string, NpcProfile> {
  const t = targetName.trim();
  const s = srcName.trim();
  if (!t || !s || t === s) return profiles;
  const targetEntry = Object.entries(profiles).find(([, p]) => p.name.trim() === t);
  const srcEntry = Object.entries(profiles).find(([, p]) => p.name.trim() === s);
  if (!targetEntry || !srcEntry) return profiles;
  const [tid, tprof] = targetEntry;
  const [sid, sprof] = srcEntry;
  if (tid === sid) return profiles;
  const seen = new Set(tprof.memories);
  const merged = [...tprof.memories];
  for (const m of sprof.memories) if (!seen.has(m)) { merged.push(m); seen.add(m); }
  const next = { ...profiles };
  next[tid] = { ...tprof, memories: merged, updatedAt: Date.now() };
  delete next[sid];
  return next;
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
      const investigator = investigatorName();
      // 清理历史脏数据：调查员本人绝不应在 NPC 名册里
      if (investigator) {
        for (const [pid, prof] of Object.entries(profiles)) {
          if (prof.name.trim() === investigator) delete profiles[pid];
        }
      }
      for (const u of updates) {
        if (!u.name?.trim()) continue;
        if (investigator && u.name.trim() === investigator) continue; // 调查员不入名册
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
        // 保护剧本预设 NPC 的 KP 暗线核心 hiddenBio 不被 LLM 主回合 npcUpdate 覆盖：
        // backstory(=publicBio) 与 innerThoughts(=hiddenBio) 是剧本作者写定的暗线骨架，
        // 主模型应只产生 favorabilityDelta/isPresent/addMemory/skills/status 等增量；
        // 这两个字段的覆盖会让预设 NPC 一回合后失去人设根基，故对锚定预设 NPC 跳过。
        const isPreset = p.isScenarioPreset === true;
        for (const f of SET_FIELDS) {
          if (isPreset && (f === 'backstory' || f === 'innerThoughts')) continue;
          const v = uRec[f as string];
          if (typeof v === 'string' && v.trim()) pRec[f as string] = v;
        }
        if (u.characteristics) p.characteristics = { ...(p.characteristics ?? {}), ...u.characteristics };
        if (u.skills) p.skills = { ...(p.skills ?? {}), ...u.skills };
        if (Array.isArray(u.possessions)) p.possessions = u.possessions;
        if (typeof u.favorabilityDelta === 'number') p.favorability = clampFav(p.favorability + u.favorabilityDelta);
        if (typeof u.isPresent === 'boolean') p.isPresent = u.isPresent;
        if (u.addMemory?.trim()) p.memories = [...p.memories, u.addMemory.trim()];
        if (u.memorySummary?.trim()) {
          p.memorySummary = u.memorySummary.trim();
          const keep = useSettingsStore.getState().npcMemoryKeep ?? MEMORY_RECENT_KEEP;
          if (p.memories.length > keep) p.memories = p.memories.slice(-keep);
        }
        // 安全兜底：即便 AI 未提供梗概，也绝不无限增长
        if (p.memories.length > MEMORY_HARD_CAP) p.memories = p.memories.slice(-MEMORY_HARD_CAP);
        p.updatedAt = now;
        const finalP = withDefaultChars(p); // 确保有基础属性
        // 当前 HP/SAN/MP 增量：max 由 parseNpcDerived 现算，钳制到 [0, max]（缺省当前值=max）。
        if (typeof u.hpDelta === 'number' || typeof u.sanDelta === 'number' || typeof u.mpDelta === 'number') {
          const d = parseNpcDerived(finalP);
          const clamp = (cur: number | undefined, max: number | undefined, delta: number): number => {
            const m = max ?? 0;
            const base = cur ?? m;
            return m > 0 ? Math.max(0, Math.min(m, base + delta)) : Math.max(0, base + delta);
          };
          if (typeof u.hpDelta === 'number') finalP.hpCurrent = clamp(finalP.hpCurrent, d.hp, u.hpDelta);
          if (typeof u.sanDelta === 'number') finalP.sanCurrent = clamp(finalP.sanCurrent, d.san, u.sanDelta);
          if (typeof u.mpDelta === 'number') finalP.mpCurrent = clamp(finalP.mpCurrent, d.mp, u.mpDelta);
        }
        profiles[id] = finalP;
      }
      return { profiles };
    });
  },

  applyCombatResult: (combatants) => {
    set((s) => {
      const profiles = { ...s.profiles };
      let changed = false;
      for (const c of combatants) {
        const m = /^npc-(.+)$/.exec(c.id); // 仅回写由名册 NPC 建场的战斗员(buildCombatantFromNpc 用 npc-<id>)
        if (!m) continue;
        const id = m[1];
        const p = profiles[id];
        if (!p) continue;
        const np: NpcProfile = { ...p, hpCurrent: Math.max(0, Math.min(c.maxHp, c.hp)), updatedAt: Date.now() };
        if (c.flags?.dead) np.status = '已死亡';
        else if (c.flags?.unconscious) np.status = '昏迷';
        else if (c.flags?.majorWound) np.status = '重伤';
        profiles[id] = np;
        changed = true;
      }
      return changed ? { profiles } : {};
    });
  },

  getPresent: () => Object.values(get().profiles).filter((p) => p.isPresent).sort((a, b) => b.updatedAt - a.updatedAt),
  getAbsent: () => Object.values(get().profiles).filter((p) => !p.isPresent).sort((a, b) => b.updatedAt - a.updatedAt),

  buildContextInjection: () => {
    const present = get().getPresent();
    if (present.length === 0) return '';
    const keep = useSettingsStore.getState().npcMemoryKeep ?? MEMORY_RECENT_KEEP;
    const lines = present.map((p) => {
      const fav = p.favorability > 30 ? '友好' : p.favorability < -30 ? '敌对' : '中立';
      const parts = [`- ${p.name}（${p.identity || '身份不明'}，对调查员好感度${p.favorability}/${fav}）`];
      if (p.personality) parts.push(`  性格：${p.personality}`);
      if (p.innerThoughts) parts.push(`  动机/秘密(KP视角)：${p.innerThoughts}`);
      if (p.memorySummary) parts.push(`  记忆梗概：${p.memorySummary}`);
      if (p.memories.length) parts.push(`  近期互动：${p.memories.slice(-3).join('；')}`);
      // 仅当原始记忆既达到折叠阈值、又确实超出保留窗口时才提示——避免 keep 调高(>阈值)时每回合反复催促折叠
      if (p.memories.length >= MEMORY_FOLD_THRESHOLD && p.memories.length > keep) parts.push(`  （"${p.name}"的互动记忆已较多，请本回合在其 npcUpdates 提供 memorySummary 浓缩既往关键互动以便归纳）`);
      return parts.join('\n');
    });
    return `[在场NPC——请严格按各自的身份、性格、动机、好感度与记忆一致地扮演]\n${lines.join('\n')}`;
  },

  replaceAll: (list) => set(() => {
    const investigator = investigatorName();
    // 老档同名条目按 createdAt 早者保留（BUG2 Part 1 迁移）——历史上 includes 双向匹配会把
    // 「霍尔姆斯先生」并到「霍尔姆斯」，但其它路径偶尔仍能落进同名档；读档时一次性去重。
    const deduped = dedupeProfilesByName(list);
    const profiles: Record<string, NpcProfile> = {};
    for (const p of deduped) {
      if (investigator && p.name.trim() === investigator) continue; // 调查员不入名册（清理历史脏数据）
      const fixed = withDefaultChars(p); // 缺基础属性则补确定性默认值
      profiles[fixed.id] = fixed;
    }
    return { profiles };
  }),
  clearAll: () => set({ profiles: {} }),
}));
