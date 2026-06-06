// 剧本系统类型 — 参见 docs/specs/2026-06-06-scenario-system-design.md §3
import type { CharacterSheet } from './index';
import type { Occupation, SkillCat } from '../sillytavern/coc-data';

// 当前 schema 版本号；migrateScenario 据此判断是否需要升级
export const CURRENT_SCENARIO_SCHEMA_VERSION = 1 as const;
const SUPPORTED_SCHEMA_VERSIONS: ReadonlyArray<number> = [1];

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

// NPC 三档:
// - protagonist  推荐视角(顶部出现在抽屉里,加金边)
// - optional     配角可玩(下沉到"配角视角"分区,玩家可越界玩)
// - locked_npc   剧本钉死不可选(反派/序章死者/关键 NPC),抽屉里不出现
export type ScenarioCharacterRole = 'protagonist' | 'optional' | 'locked_npc';

export interface ScenarioCharacter {
  id: string;
  role: ScenarioCharacterRole;
  sheet: CharacterSheet; // 完整复用现有 CharacterSheet
  npcAttrs: {
    identityTag: string;
    attitudeDefault: number; // -100~100
    relationshipDefault: string;
    locationDefault: string;
    publicBio: string; // 玩家可见
    hiddenBio: string; // 仅编辑模式可见
    // 角色卡 8 段背景(独立字段,编辑器拆开来编辑;makeNpc 也会拼回到 sheet.description
    // 供 LLM prompt 上下文用)。全部 optional 兼容老数据。
    description?: string;
    beliefs?: string;
    significantPeople?: string;
    meaningfulLocations?: string;
    treasuredPossessions?: string;
    traits?: string;
    injuries?: string;
    backgroundFears?: string;
    /** 随身物品自由文本(逗号/顿号/分号/换行分隔);进游戏 scenarioCharacterToNpc
     * 拆为 possessions 数组,TeamSidebar 武器列 + 战斗 weapons 派生。
     * 与 sheet.initialItemsRaw 同步存储。 */
    initialItemsRaw?: string;
  };
}

// 时代化技能定义:剧本可声明本时代特有技能(骑马/咒语吟唱/驾飞船),并入 ALL_SKILLS
export interface ScenarioCustomSkill {
  name: string;
  base: number | 'DEX_HALF' | 'EDU';
  cat: SkillCat;
  desc?: string;
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

  // 时代化职业/技能池:控制 CharCreator StepSkills 看到的下拉与技能网格
  // - customOccupations 非空 → 完全隔离,只显示本剧本职业(详见 scenario-pools.ts)
  // - customSkills 加入 ALL_SKILLS 后呈现(如"骑马/咒语吟唱")
  // - skillBlacklist 从 ALL_SKILLS 中剔除(如罗马剧本禁"汽车驾驶")
  customOccupations: Occupation[];
  customSkills: ScenarioCustomSkill[];
  skillBlacklist: string[];

  // 世界书级条目
  entries: ScenarioEntry[];

  // 仅编辑模式
  darkTimeline: DarkPhase[];
  badEndings: BadEnding[];
  authorNotes: string;

  schemaVersion: number;
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

  // 时代化职业/技能/技能黑名单变更 — 全部按 name 去重(同 name 覆盖,异 name 追加)
  upsertOccupations?: Occupation[];
  removeOccupationNames?: string[];
  upsertCustomSkills?: ScenarioCustomSkill[];
  removeCustomSkillNames?: string[];
  addToBlacklist?: string[];
  removeFromBlacklist?: string[];
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
  if (x.role !== 'protagonist' && x.role !== 'optional' && x.role !== 'locked_npc') return false;
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

// Occupation/customSkill 的轻量结构守卫:校验关键字段存在 + 类型正确,不深检 SkillCat 取值
// (CAT 由 coc-data 控制,外部 JSON 灌入只要是字符串即可,运行时显示按 catColor[?cat] 取色,缺色用 default)
function isOccupationLike(x: unknown): boolean {
  if (!isObj(x)) return false;
  return (
    isStr(x.name) &&
    isNum(x.crMin) &&
    isNum(x.crMax) &&
    Array.isArray(x.skills) &&
    x.skills.every(isStr)
  );
}

function isCustomSkillLike(x: unknown): boolean {
  if (!isObj(x)) return false;
  const baseOk = isNum(x.base) || x.base === 'DEX_HALF' || x.base === 'EDU';
  return isStr(x.name) && baseOk && isStr(x.cat);
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
  if (!Array.isArray(x.customOccupations) || !x.customOccupations.every(isOccupationLike)) return false;
  if (!Array.isArray(x.customSkills) || !x.customSkills.every(isCustomSkillLike)) return false;
  if (!isStrArr(x.skillBlacklist)) return false;
  if (!Array.isArray(x.entries) || !x.entries.every(isScenarioEntry)) return false;
  if (!Array.isArray(x.darkTimeline) || !x.darkTimeline.every(isDarkPhase)) return false;
  if (!Array.isArray(x.badEndings) || !x.badEndings.every(isBadEnding)) return false;
  if (!isStr(x.authorNotes)) return false;
  if (typeof x.schemaVersion !== 'number' || !SUPPORTED_SCHEMA_VERSIONS.includes(x.schemaVersion)) return false;
  if (!isNum(x.createdAt) || !isNum(x.updatedAt)) return false;
  return true;
}
