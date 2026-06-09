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

// NPC 四档:
// - protagonist     推荐视角(顶部出现在抽屉里,加金边)
// - optional        配角可玩(下沉到"配角视角"分区,玩家可越界玩)
// - locked_npc      剧本钉死不可选(反派/序章死者/关键 NPC),抽屉里不出现
// - player_created  玩家自创卡(CharCreator 完成后固化进剧本),RosterPicker 分组「你创建的」
export type ScenarioCharacterRole = 'protagonist' | 'optional' | 'locked_npc' | 'player_created';

// 关系类型 — 8 枚举(spec §2.1)。
// 方向语义: A.relations[targetId=B, type='mentor'] 表示 "A 是 B 的导师"。
// 反向语义由 relation-graph 通过反查 characters[].relations 计算,作者不必两边都写。
// 类型对称性: family/lover/friend/colleague/rival/enemy/acquaintance 反向同义;
//             mentor 反向 = "学生"(仅 UI 显示用,语义上判定时与 mentor 等价)。
export type RelationType =
  | 'family'        // 亲属(父母/兄妹/亲戚)
  | 'lover'         // 恋人/配偶
  | 'friend'        // 朋友(含旧识/好友)
  | 'colleague'     // 同事/同行/同学
  | 'mentor'        // 师徒
  | 'rival'         // 竞争对手(敌对但相识,排斥同队)
  | 'enemy'         // 敌人(排斥同队)
  | 'acquaintance'; // 点头之交(最弱的"有关系")

export interface ScenarioRelation {
  targetId: string;       // 对方 ScenarioCharacter.id
  type: RelationType;
  note?: string;          // 自由文本: 进 lorebook 条目增色,不影响入队判定
}

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
  /** 出边集合(对其他 ScenarioCharacter.id 的有向关系); undefined/[] = 此角色无关系记录 */
  relations?: ScenarioRelation[];
  /** 开场是否在场; undefined/false = 走原 isPresent 默认逻辑(不自动建场) */
  presentAtStart?: boolean;
  /** 玩家自创卡用(role='player_created'); RosterPicker 按时间倒序分组排序 */
  createdAt?: number;
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

// 拯救路径里程碑 — spec §1.1
// delta: 推进点数(0-100 比例),LLM 命中里程碑时叠加到 RescuePathState.progress
// hint: 给 LLM 的命中判定提示(非玩家可见)
export interface RescueMilestone {
  id: string;
  name: string;
  delta: number;
  hint?: string;
}

// 拯救路径终局 — spec §1.1
// 每条 RescueEnding 表示一种正向结局形态,玩家行为推进它的 milestones → progress 满 100 锁定为最终结局。
// failureVariantId: 该路径推进失败时回落到哪个 BadEnding.id(可选,删 BadEnding 时由 reducer 清空)
export interface RescueEnding {
  id: string;
  name: string;
  description: string;
  unlockHint: string;
  milestones: RescueMilestone[];
  failureVariantId?: string;
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
  /** 拯救路径终局列表 — spec §1.1。
   *  未填则不启用拯救路径系统;有值时 RescueBar 显示,initFromScenario 据此种入 statData。 */
  rescueEndings?: RescueEnding[];
  authorNotes: string;

  schemaVersion: number;
  createdAt: number;
  updatedAt: number;

  /** 文生图覆盖配置(2026-06-08)。剧本作者可在剧本编辑器覆盖默认生图风格/prompt 模板/采样参数。
   *  三层 merge:settings.imageDefaults 基线 → scn.imageGen 覆盖 → 运行时 ImageRenderContext;
   *  全部 optional,未填字段沿用上一层。schemaVersion 不升(memory: beta-no-backward-compat)。 */
  imageGen?: ScenarioImageGen;
}

/** 10 种风格预设 key。custom 时优先用 stylePromptOverride 自填风格描述。 */
export type ScenarioImageStyle =
  | 'vintage_photo'  // 1920 复古胶片
  | 'oil_painting'   // 油画
  | 'ink_wash'       // 水墨
  | 'watercolor'     // 水彩
  | 'engraving'      // 铜版画
  | 'cinematic'      // 电影摄影
  | 'sepia_film'     // 怀旧胶片
  | 'photoreal'      // 写实
  | 'anime'          // 动漫
  | 'custom';        // 用户自填

/** 剧本侧生图覆盖层。全部 optional,与 settings.imageDefaults 三层 merge。 */
export interface ScenarioImageGen {
  /** 风格预设 key;'custom' 时优先用 stylePromptOverride。 */
  style?: ScenarioImageStyle;
  /** 'custom' style 下用户自填的风格描述 prompt。 */
  stylePromptOverride?: string;
  /** 正向 prompt 模板,支持 {{location}}/{{time}}/{{weather}}/{{characters}}/{{san}} 占位。 */
  promptTemplate?: string;
  /** 负面 prompt 追加项(与 settings 基线逗号合并去重,不是覆盖)。 */
  negativePromptAppend?: string;
  /** 风格锚定标签数组,末尾追加到 prompt。 */
  styleAnchors?: string[];
  /** 像素覆盖,留空走全局基线。 */
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  /** 模型 id 覆盖。 */
  modelOverride?: string;
  /** 三态:undefined=继承 settings;true=本剧本强开;false=本剧本强关。 */
  enabled?: boolean;
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
  /** 移除指定 id 的 character;与 patchCharacters 同 patch 时先移除再 upsert。 */
  removeCharacterIds?: string[];

  // 时代化职业/技能/技能黑名单变更 — 全部按 name 去重(同 name 覆盖,异 name 追加)
  upsertOccupations?: Occupation[];
  removeOccupationNames?: string[];
  upsertCustomSkills?: ScenarioCustomSkill[];
  removeCustomSkillNames?: string[];
  addToBlacklist?: string[];
  removeFromBlacklist?: string[];

  /** 文生图配置覆盖(浅合并;styleAnchors 整块替换;留空字段=保留原值)。 */
  patchImageGen?: Partial<ScenarioImageGen>;

  /** 拯救路径变更包 — spec §3.1。
   *  upsert: 按 id upsert(同 id 覆盖,异 id 追加;name 改变时 reducer 同步 rename statData 子键)
   *  removeIds: 按 id 过滤删除
   *  replaceAll: 整块替换(忽略 upsert/removeIds);CompanionChat 整段重写时用 */
  rescueEndings?: {
    upsert?: RescueEnding[];
    removeIds?: string[];
    replaceAll?: RescueEnding[];
  };
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

const REL_TYPES: readonly RelationType[] = ['family', 'lover', 'friend', 'colleague', 'mentor', 'rival', 'enemy', 'acquaintance'];

function isRelationType(x: unknown): x is RelationType {
  return isStr(x) && (REL_TYPES as readonly string[]).includes(x);
}

function isScenarioRelation(x: unknown): x is ScenarioRelation {
  if (!isObj(x)) return false;
  if (!isStr(x.targetId)) return false;
  if (!isRelationType(x.type)) return false;
  if (x.note !== undefined && !isStr(x.note)) return false;
  return true;
}

function isScenarioCharacter(x: unknown): x is ScenarioCharacter {
  if (!isObj(x)) return false;
  if (!isStr(x.id)) return false;
  if (x.role !== 'protagonist' && x.role !== 'optional' && x.role !== 'locked_npc' && x.role !== 'player_created') return false;
  if (!isObj(x.sheet)) return false; // 不深检 CharacterSheet，结构由上游保证
  if (!isObj(x.npcAttrs)) return false;
  const n = x.npcAttrs;
  if (!(
    isStr(n.identityTag) &&
    isNum(n.attitudeDefault) &&
    isStr(n.relationshipDefault) &&
    isStr(n.locationDefault) &&
    isStr(n.publicBio) &&
    isStr(n.hiddenBio)
  )) return false;
  // 新字段守卫: 全部 optional, 给出就深检
  if (x.relations !== undefined) {
    if (!Array.isArray(x.relations)) return false;
    if (!x.relations.every(isScenarioRelation)) return false;
  }
  if (x.presentAtStart !== undefined && !isBool(x.presentAtStart)) return false;
  if (x.createdAt !== undefined && !isNum(x.createdAt)) return false;
  return true;
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

function isRescueMilestoneLike(x: unknown): x is RescueMilestone {
  if (!isObj(x)) return false;
  if (!isStr(x.id) || !isStr(x.name) || !isNum(x.delta)) return false;
  if (x.hint !== undefined && !isStr(x.hint)) return false;
  return true;
}

function isRescueEndingLike(x: unknown): x is RescueEnding {
  if (!isObj(x)) return false;
  if (!isStr(x.id) || !isStr(x.name) || !isStr(x.description) || !isStr(x.unlockHint)) return false;
  if (!Array.isArray(x.milestones) || !x.milestones.every(isRescueMilestoneLike)) return false;
  if (x.failureVariantId !== undefined && !isStr(x.failureVariantId)) return false;
  return true;
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
  if (x.rescueEndings !== undefined) {
    if (!Array.isArray(x.rescueEndings) || !x.rescueEndings.every(isRescueEndingLike)) return false;
  }
  if (!isStr(x.authorNotes)) return false;
  if (typeof x.schemaVersion !== 'number' || !SUPPORTED_SCHEMA_VERSIONS.includes(x.schemaVersion)) return false;
  if (!isNum(x.createdAt) || !isNum(x.updatedAt)) return false;
  if (x.imageGen !== undefined && !isImageGenLike(x.imageGen)) return false;
  return true;
}

const VALID_IMAGE_STYLES: ScenarioImageStyle[] = [
  'vintage_photo', 'oil_painting', 'ink_wash', 'watercolor', 'engraving',
  'cinematic', 'sepia_film', 'photoreal', 'anime', 'custom',
];

export function isImageGenLike(x: unknown): x is ScenarioImageGen {
  if (!isObj(x)) return false;
  if (x.style !== undefined && !VALID_IMAGE_STYLES.includes(x.style as ScenarioImageStyle)) return false;
  if (x.stylePromptOverride !== undefined && !isStr(x.stylePromptOverride)) return false;
  if (x.promptTemplate !== undefined && !isStr(x.promptTemplate)) return false;
  if (x.negativePromptAppend !== undefined && !isStr(x.negativePromptAppend)) return false;
  if (x.styleAnchors !== undefined && !isStrArr(x.styleAnchors)) return false;
  if (x.width !== undefined && !isNum(x.width)) return false;
  if (x.height !== undefined && !isNum(x.height)) return false;
  if (x.steps !== undefined && !isNum(x.steps)) return false;
  if (x.cfgScale !== undefined && !isNum(x.cfgScale)) return false;
  if (x.sampler !== undefined && !isStr(x.sampler)) return false;
  if (x.modelOverride !== undefined && !isStr(x.modelOverride)) return false;
  if (x.enabled !== undefined && typeof x.enabled !== 'boolean') return false;
  return true;
}
