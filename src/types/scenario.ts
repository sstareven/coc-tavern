// 剧本系统类型 — 参见 docs/specs/2026-06-06-scenario-system-design.md §3
import type { CharacterSheet } from './index';

// 固定 6 类分类（与编辑器 tab 一一对应）
export const SCENARIO_CATEGORIES = ['地点', '人物', '势力', '物品线索', '暗线', '秘密与解锁'] as const;
export type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

// 缓存策略 — 复用 worldbook-ds-cache-optimization；auto 由 LLM/检测器决定
export type ScenarioCachePolicy = 'static_prefix' | 'dynamic_suffix' | 'auto';

export interface ScenarioEntry {
  id: string;
  category: ScenarioCategory;
  comment: string; // 标题
  keys: string; // 触发关键词（逗号分隔，与 lorebook 同语义）
  content: string; // 可含 EJS <% %>
  constant: boolean; // true 常驻 / false keyword 触发
  position: 0 | 1 | 2 | 3 | 4;
  priority: number; // 挂载到 lorebook 时 +1000 防与 coc_lore 撞键
  cachePolicy: ScenarioCachePolicy;
  hidden?: boolean; // 编辑模式独有的「未解锁/伏笔」条目；玩家模式视为禁用
}

export interface ScenarioCharacter {
  id: string;
  role: 'protagonist_candidate' | 'npc_only';
  sheet: CharacterSheet; // 完整复用现有 CharacterSheet
  npcAttrs: {
    identityTag: string;
    attitudeDefault: number; // -100~100
    relationshipDefault: string;
    locationDefault: string;
    publicBio: string; // 玩家可见
    hiddenBio: string; // 仅编辑模式可见
  };
}

export interface DarkPhase {
  id: string;
  threshold: number; // 0~100 暗线进度门槛
  title: string;
  triggers: string[]; // 触发事件
  directorNote: string; // 守秘人 LLM 导演词
  autoUnlockKeys: string[]; // 进入此 phase 自动写 /剧情/已解锁/<key>: true
}

export interface BadEnding {
  id: string;
  condition: string; // 自然语言条件
  narrative: string;
  accelerators: string[]; // 加速触发的玩家行为
}

export interface ScenarioMeta {
  name: string;
  type: '调查' | '战斗' | '玩职' | '剧本' | '混合';
  durationHint: '1-2h' | '3-5h' | '长期连载';
  difficulty: 1 | 2 | 3 | 4 | 5;
  headcountHint: string;
  sanLossHint: '低' | '中' | '高' | '极高';
  blurb: string;
  coverEmoji?: string;
}

export interface ScenarioDoc {
  id: string;
  builtin?: boolean; // 内置剧本：不可删，编辑 = 自动 fork 新 id
  meta: ScenarioMeta;

  // 玩家可见
  prologueSeed: string; // 喂给 LLM 扩写首页的种子文本
  recommendedSkills: string[];
  recommendedOccupations: string[];
  characters: ScenarioCharacter[];

  // 世界书级条目
  entries: ScenarioEntry[];

  // 仅编辑模式
  darkTimeline: DarkPhase[];
  badEndings: BadEnding[];
  authorNotes: string;

  schemaVersion: 1;
  createdAt: number;
  updatedAt: number;
}

// CompanionChat LLM 返回的统一变更包
export interface ScenarioPatch {
  upsertEntries?: ScenarioEntry[];
  removeEntryIds?: string[];
  recategorize?: Array<{ id: string; category: ScenarioCategory }>;
  setCachePolicies?: Array<{ id: string; cachePolicy: ScenarioCachePolicy }>;
  upsertDarkTimeline?: DarkPhase[];
  upsertBadEndings?: BadEnding[];
  patchMeta?: Partial<ScenarioMeta>;
  patchCharacters?: ScenarioCharacter[];
}

// ---- 类型守卫（手写，不引 zod） ----
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && !Number.isNaN(x);
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);

function isScenarioCategory(x: unknown): x is ScenarioCategory {
  return isStr(x) && (SCENARIO_CATEGORIES as readonly string[]).includes(x);
}

function isCachePolicy(x: unknown): x is ScenarioCachePolicy {
  return x === 'static_prefix' || x === 'dynamic_suffix' || x === 'auto';
}

function isScenarioEntry(x: unknown): x is ScenarioEntry {
  if (!isObj(x)) return false;
  return (
    isStr(x.id) &&
    isScenarioCategory(x.category) &&
    isStr(x.comment) &&
    isStr(x.keys) &&
    isStr(x.content) &&
    isBool(x.constant) &&
    isNum(x.position) &&
    [0, 1, 2, 3, 4].includes(x.position as number) &&
    isNum(x.priority) &&
    isCachePolicy(x.cachePolicy)
  );
}

function isScenarioCharacter(x: unknown): x is ScenarioCharacter {
  if (!isObj(x)) return false;
  if (!isStr(x.id)) return false;
  if (x.role !== 'protagonist_candidate' && x.role !== 'npc_only') return false;
  if (!isObj(x.sheet)) return false; // 不深检 CharacterSheet，结构由上游保证
  if (!isObj(x.npcAttrs)) return false;
  const n = x.npcAttrs;
  return (
    isStr(n.identityTag) &&
    isNum(n.attitudeDefault) &&
    isStr(n.relationshipDefault) &&
    isStr(n.locationDefault) &&
    isStr(n.publicBio) &&
    isStr(n.hiddenBio)
  );
}

function isDarkPhase(x: unknown): x is DarkPhase {
  if (!isObj(x)) return false;
  return (
    isStr(x.id) &&
    isNum(x.threshold) &&
    isStr(x.title) &&
    isStrArr(x.triggers) &&
    isStr(x.directorNote) &&
    isStrArr(x.autoUnlockKeys)
  );
}

function isBadEnding(x: unknown): x is BadEnding {
  if (!isObj(x)) return false;
  return isStr(x.id) && isStr(x.condition) && isStr(x.narrative) && isStrArr(x.accelerators);
}

function isScenarioMeta(x: unknown): x is ScenarioMeta {
  if (!isObj(x)) return false;
  const okType = ['调查', '战斗', '玩职', '剧本', '混合'].includes(x.type as string);
  const okDur = ['1-2h', '3-5h', '长期连载'].includes(x.durationHint as string);
  const okSan = ['低', '中', '高', '极高'].includes(x.sanLossHint as string);
  return (
    isStr(x.name) &&
    okType &&
    okDur &&
    isNum(x.difficulty) &&
    [1, 2, 3, 4, 5].includes(x.difficulty as number) &&
    isStr(x.headcountHint) &&
    okSan &&
    isStr(x.blurb)
  );
}

export function isValidScenarioDoc(x: unknown): x is ScenarioDoc {
  if (!isObj(x)) return false;
  if (!isStr(x.id)) return false;
  if (!isScenarioMeta(x.meta)) return false;
  if (!isStr(x.prologueSeed)) return false;
  if (!isStrArr(x.recommendedSkills)) return false;
  if (!isStrArr(x.recommendedOccupations)) return false;
  if (!Array.isArray(x.characters) || !x.characters.every(isScenarioCharacter)) return false;
  if (!Array.isArray(x.entries) || !x.entries.every(isScenarioEntry)) return false;
  if (!Array.isArray(x.darkTimeline) || !x.darkTimeline.every(isDarkPhase)) return false;
  if (!Array.isArray(x.badEndings) || !x.badEndings.every(isBadEnding)) return false;
  if (!isStr(x.authorNotes)) return false;
  if (x.schemaVersion !== 1) return false;
  if (!isNum(x.createdAt) || !isNum(x.updatedAt)) return false;
  return true;
}
