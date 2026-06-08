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
  buildContextInjection: (currentLocationName?: string) => string;
  /** 地图自检合并地点时,把 NPC.locationName 中匹配 from 的统一改为 to。
   *  对齐 useLocationElementStore.renameLocation 的语义。 */
  renameLocation: (from: string, to: string) => void;
  replaceAll: (profiles: NpcProfile[]) => void;
  joinParty: (npcId: string) => void;
  leaveParty: (npcId: string) => void;
  getParty: () => NpcProfile[];
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
  'locationName',
];

const IMPORTANCE_VALUES = new Set<NpcProfile['importance']>(['核心', '重要', '路人']);
function normalizeImportance(v: unknown, fallback: NpcProfile['importance']): NpcProfile['importance'] {
  if (typeof v !== 'string') return fallback;
  const t = v.trim();
  if (IMPORTANCE_VALUES.has(t as NpcProfile['importance'])) return t as NpcProfile['importance'];
  // 兼容 LLM 偶发非标准词:'主要/关键' → '核心';'次要/常驻/支线' → '重要';'群众/过客/普通' → '路人'。
  if (t === '主要' || t === '关键') return '核心';
  if (t === '次要' || t === '常驻' || t === '支线') return '重要';
  if (t === '群众' || t === '过客' || t === '普通') return '路人';
  return fallback;
}

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
        // 防 LLM 抢权:inParty 仅玩家 UI/canJoinParty 通道可写。
        delete (u as unknown as Record<string, unknown>).inParty;
        if (investigator && u.name.trim() === investigator) continue; // 调查员不入名册
        const now = Date.now();
        let id = findIdByName(profiles, u.name);
        let p: NpcProfile;
        if (id) {
          p = { ...profiles[id] };
        } else {
          // 剧本注入路径会指定固定 id（scenarioCharacterToNpc 用剧本 character.id）；
          // 主回合 LLM 增量则不带 id，由系统生成 UUID。
          id = u.id ?? crypto.randomUUID();
          p = {
            id, name: u.name.trim(), identity: '', favorability: 0,
            appearance: '', personality: '', innerThoughts: '',
            memories: [], experience: '', backstory: '', possessions: [],
            isPresent: u.isPresent ?? true, createdAt: now, updatedAt: now,
            // 新增字段默认值: locationName 取 u.locationName 或空串;
            // importance 取 u.importance 钳制结果,默认 '重要' — 安全侧:LLM 不显式判定时
            // 保持 NPC 可见,避免新 NPC 因默认值意外退到「过路 NPC」桶导致身份/记忆/动机丢失。
            // 仅 LLM 显式写 '路人' 才降级。剧本预设 NPC (isScenarioPreset) 同走 '重要' 默认。
            locationName: typeof u.locationName === 'string' ? u.locationName.trim() : '',
            importance: normalizeImportance(u.importance, '重要'),
            // 剧本预设锚点必须在「新建」这一回合就落到 profile 上；
            // 老版本只看 SET_FIELDS 字符串字段，把这两个字段丢了 → isPreset 永远 false，
            // 接踵而来的 npcUpdate 直接把 hiddenBio/publicBio 覆盖成空，KP 暗线骨架瞬间塌掉。
            ...(u.isScenarioPreset === true ? { isScenarioPreset: true } : {}),
            ...(typeof u.scenarioHiddenBio === 'string' && u.scenarioHiddenBio.trim()
              ? { scenarioHiddenBio: u.scenarioHiddenBio }
              : {}),
          };
        }
        // 直接覆盖的文本字段
        const uRec = u as unknown as Record<string, unknown>;
        const pRec = p as unknown as Record<string, unknown>;
        // 保护剧本预设 NPC 的 KP 暗线核心 hiddenBio 不被 LLM 主回合 npcUpdate 覆盖：
        // backstory(=publicBio) 与 innerThoughts(=hiddenBio) 是剧本作者写定的暗线骨架，
        // 主模型应只产生 favorabilityDelta/isPresent/addMemory/skills/status 等增量；
        // 但若作者刻意留空（想让 LLM 在首次登场时填入初印象），则首次写入仍应放行，
        // 故 guard 只在「目标字段已非空」时跳过覆盖。
        const isPreset = p.isScenarioPreset === true;
        for (const f of SET_FIELDS) {
          if (
            isPreset
            && (f === 'backstory' || f === 'innerThoughts')
            && typeof pRec[f as string] === 'string'
            && (pRec[f as string] as string).trim()
          ) continue;
          const v = uRec[f as string];
          if (typeof v === 'string' && v.trim()) pRec[f as string] = v;
        }
        if (u.characteristics) p.characteristics = { ...(p.characteristics ?? {}), ...u.characteristics };
        if (u.skills) p.skills = { ...(p.skills ?? {}), ...u.skills };
        if (Array.isArray(u.possessions)) p.possessions = u.possessions;
        if (typeof u.favorabilityDelta === 'number') p.favorability = clampFav(p.favorability + u.favorabilityDelta);
        if (typeof u.isPresent === 'boolean') p.isPresent = u.isPresent;
        // 重要性钳制:LLM 偶发写"主要/次要/群众"等非标准词,normalizeImportance 转标准 3 值;
        // 不允许通过 npcUpdate 把已有 NPC 的 importance 静默回退到 fallback——传 undefined 时保持原值。
        if (u.importance !== undefined) {
          p.importance = normalizeImportance(u.importance, p.importance);
        }
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

  buildContextInjection: (currentLocationName) => {
    const all = Object.values(get().profiles);
    if (all.length === 0) return '';
    const keep = useSettingsStore.getState().npcMemoryKeep ?? MEMORY_RECENT_KEEP;
    const curLoc = currentLocationName?.trim() ?? '';

    // 重要 NPC (核心/重要): 不论是否在场都注入完整身份/位置/介绍/记忆。
    // 路人: 仅 isPresent=true 且 locationName 匹配当前地点(或地点缺失=兼容老数据)时,注入简略身份+位置行。
    const importantList = all
      .filter((p) => p.importance === '核心' || p.importance === '重要')
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const passersList = all
      .filter((p) => p.importance === '路人' && p.isPresent)
      .filter((p) => !curLoc || !p.locationName || p.locationName.trim() === curLoc)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (importantList.length === 0 && passersList.length === 0) return '';

    const formatImportant = (p: NpcProfile): string => {
      const fav = p.favorability > 30 ? '友好' : p.favorability < -30 ? '敌对' : '中立';
      const loc = p.locationName?.trim() ? `,所在地点:${p.locationName.trim()}` : '';
      const presence = p.isPresent ? '在场' : '离场';
      const parts = [`- ${p.name}（${p.importance}·${presence}·${p.identity || '身份不明'}${loc},对调查员好感度${p.favorability}/${fav}）`];
      if (p.personality) parts.push(`  性格：${p.personality}`);
      if (p.innerThoughts) parts.push(`  动机/秘密(KP视角)：${p.innerThoughts}`);
      if (p.memorySummary) parts.push(`  记忆梗概：${p.memorySummary}`);
      if (p.memories.length) parts.push(`  近期互动：${p.memories.slice(-3).join('；')}`);
      // 仅当原始记忆既达到折叠阈值、又确实超出保留窗口时才提示——避免 keep 调高(>阈值)时每回合反复催促折叠
      if (p.memories.length >= MEMORY_FOLD_THRESHOLD && p.memories.length > keep) parts.push(`  （"${p.name}"的互动记忆已较多，请本回合在其 npcUpdates 提供 memorySummary 浓缩既往关键互动以便归纳）`);
      return parts.join('\n');
    };
    const formatPasser = (p: NpcProfile): string => {
      const loc = p.locationName?.trim() ? `,${p.locationName.trim()}` : '';
      return `- ${p.name}（${p.identity || '身份不明'}${loc}）`;
    };

    const sections: string[] = [];
    if (importantList.length > 0) {
      sections.push(
        `[重要NPC——核心与重要角色,无论是否在场都需在剧情中保持身份/位置/动机一致;若该 NPC 当前地点与调查员一致即视为在场,可直接互动]\n${importantList.map(formatImportant).join('\n')}`,
      );
    }
    if (passersList.length > 0) {
      const locLabel = curLoc ? `当前地点「${curLoc}」` : '当前场景';
      sections.push(
        `[${locLabel}的过路 NPC ——仅在场时出现,身份与位置如下;无需深入扮演]\n${passersList.map(formatPasser).join('\n')}`,
      );
    }

    // 伙伴/在场角色行动硬约束:仅在有队友或在场核心/重要 NPC 时挂载,空场景零增量。
    // 队友(★)= getParty 返回的 isPresent && inParty;在场重要 NPC(·)= importantList 中 isPresent 但不在队友列表。
    const partyList = all.filter((p) => p.isPresent && p.inParty)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const partyIdSet = new Set(partyList.map((p) => p.id));
    const presentImportantList = importantList
      .filter((p) => p.isPresent && !partyIdSet.has(p.id));
    if (partyList.length > 0 || presentImportantList.length > 0) {
      const lines: string[] = [];
      for (const p of partyList) lines.push(`- ★ ${p.name}`);
      for (const p of presentImportantList) lines.push(`- · ${p.name}`);
      sections.push(
        [
          '[在场角色行动·硬约束]',
          '本回合 leftContent / rightContent 中,以下角色【必须】至少有一处可观察的具体动作或对话(★=玩家小队队友;·=在场的核心/重要 NPC):',
          lines.join('\n'),
          '要求:①每个上述角色至少出现一次具体动作(肢体/移动/查看/操作物件)或台词,不可仅被名字提及或仅作为背景陈设;②他们的当回合行动应能【约束、辅助、对抗、干扰】调查员的潜在选项,生成的 choices 必须将这些角色当下的状态与意图纳入前提(例如队友若已在突进,选项中至少有一条与其协同或制止);③遵守姿态/状态条件的物理约束,倒下/昏迷/被束缚者不能做该状态下物理上不可能的事;④队友身份(inParty)由玩家在 UI 手动管理,严禁通过 npcUpdates 改写 inParty 字段。',
        ].join('\n'),
      );
    }

    return sections.join('\n\n');
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
      // 老存档兜底:新字段 locationName/importance 若缺失,设为安全默认 — 不写迁移代码(beta-no-backward-compat),
      // 但 zustand persist 老存档加载时该字段仍可能是 undefined,这里在内存里补上以满足 NpcProfile 类型约束。
      const withNew: NpcProfile = {
        ...fixed,
        locationName: typeof fixed.locationName === 'string' ? fixed.locationName : '',
        importance: IMPORTANCE_VALUES.has(fixed.importance) ? fixed.importance : '重要',
      };
      profiles[withNew.id] = withNew;
    }
    return { profiles };
  }),

  joinParty: (npcId) => {
    set((s) => {
      const p = s.profiles[npcId];
      if (!p) return {};
      return { profiles: { ...s.profiles, [npcId]: { ...p, inParty: true, updatedAt: Date.now() } } };
    });
  },

  leaveParty: (npcId) => {
    set((s) => {
      const p = s.profiles[npcId];
      if (!p) return {};
      return { profiles: { ...s.profiles, [npcId]: { ...p, inParty: false, updatedAt: Date.now() } } };
    });
  },

  getParty: () => Object.values(get().profiles)
    .filter((p) => p.isPresent && p.inParty)
    .sort((a, b) => b.updatedAt - a.updatedAt),

  renameLocation: (from, to) => set((s) => {
    const f = from?.trim(); const t = to?.trim();
    if (!f || !t || f === t) return {};
    let changed = false;
    const profiles: Record<string, NpcProfile> = {};
    for (const [pid, p] of Object.entries(s.profiles)) {
      if (p.locationName?.trim() === f) {
        profiles[pid] = { ...p, locationName: t, updatedAt: Date.now() };
        changed = true;
      } else {
        profiles[pid] = p;
      }
    }
    return changed ? { profiles } : {};
  }),

  clearAll: () => set({ profiles: {} }),
}));
