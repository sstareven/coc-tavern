// 剧本变更包应用 — 参见 docs/specs/2026-06-06-scenario-system-design.md §5.2 / §G1
// CompanionChat LLM 返回 ScenarioPatch JSON，统一在这里不可变应用到 ScenarioDoc
import type {
  ScenarioDoc,
  ScenarioPatch,
  ScenarioEntry,
  ScenarioCategory,
  ScenarioCachePolicy,
  ScenarioCharacter,
  ScenarioCustomSkill,
  DarkPhase,
  BadEnding,
  ScenarioMeta,
} from '../types/scenario';
import type { Occupation } from '../sillytavern/coc-data';
import { ALL_SKILLS } from '../sillytavern/coc-data';
import type { SkillCat } from '../sillytavern/coc-data';

const SCENARIO_CATEGORIES_RUNTIME: ScenarioCategory[] = ['地点', '人物', '势力', '物品线索', '暗线', '秘密与解锁'];
const CACHE_POLICIES_RUNTIME: ScenarioCachePolicy[] = ['static_prefix', 'dynamic_suffix', 'auto'];
const SKILL_CATS_RUNTIME: SkillCat[] = ['侦查系', '护理系', '运动系', '战斗系', '交涉系', '生活系'];
const ALL_SKILL_NAMES_RUNTIME: ReadonlySet<string> = new Set(ALL_SKILLS.map((s) => s.name));

// 不可变应用 patch：每一段独立 reduce；返回新 doc；updatedAt 用当前 epoch ms
export function applyScenarioPatch(doc: ScenarioDoc, patch: ScenarioPatch): ScenarioDoc {
  let entries = doc.entries;
  let darkTimeline = doc.darkTimeline;
  let badEndings = doc.badEndings;
  let meta = doc.meta;
  let characters = doc.characters;
  let customOccupations = doc.customOccupations;
  let customSkills = doc.customSkills;
  let skillBlacklist = doc.skillBlacklist;

  // 1) upsertEntries — 按 id upsert，否则 push 末尾
  if (patch.upsertEntries && patch.upsertEntries.length > 0) {
    const incoming = new Map<string, ScenarioEntry>();
    for (const e of patch.upsertEntries) incoming.set(e.id, e);
    const mapped = entries.map((e) => (incoming.has(e.id) ? (incoming.get(e.id) as ScenarioEntry) : e));
    const existedIds = new Set(entries.map((e) => e.id));
    const appended = patch.upsertEntries.filter((e) => !existedIds.has(e.id));
    entries = [...mapped, ...appended];
  }

  // 2) removeEntryIds
  if (patch.removeEntryIds && patch.removeEntryIds.length > 0) {
    const removeSet = new Set(patch.removeEntryIds);
    entries = entries.filter((e) => !removeSet.has(e.id));
  }

  // 3) recategorize — 按 id 改 category
  if (patch.recategorize && patch.recategorize.length > 0) {
    const catMap = new Map<string, ScenarioCategory>();
    for (const r of patch.recategorize) catMap.set(r.id, r.category);
    entries = entries.map((e) => (catMap.has(e.id) ? { ...e, category: catMap.get(e.id) as ScenarioCategory } : e));
  }

  // 4) setCachePolicies — 按 id 改 cachePolicy
  if (patch.setCachePolicies && patch.setCachePolicies.length > 0) {
    const cpMap = new Map<string, ScenarioCachePolicy>();
    for (const p of patch.setCachePolicies) cpMap.set(p.id, p.cachePolicy);
    entries = entries.map((e) =>
      cpMap.has(e.id) ? { ...e, cachePolicy: cpMap.get(e.id) as ScenarioCachePolicy } : e,
    );
  }

  // 5) upsertDarkTimeline — 按 id upsert
  if (patch.upsertDarkTimeline && patch.upsertDarkTimeline.length > 0) {
    const incoming = new Map<string, DarkPhase>();
    for (const p of patch.upsertDarkTimeline) incoming.set(p.id, p);
    const mapped = darkTimeline.map((p) => (incoming.has(p.id) ? (incoming.get(p.id) as DarkPhase) : p));
    const existedIds = new Set(darkTimeline.map((p) => p.id));
    const appended = patch.upsertDarkTimeline.filter((p) => !existedIds.has(p.id));
    darkTimeline = [...mapped, ...appended];
  }

  // 6) upsertBadEndings — 按 id upsert
  if (patch.upsertBadEndings && patch.upsertBadEndings.length > 0) {
    const incoming = new Map<string, BadEnding>();
    for (const b of patch.upsertBadEndings) incoming.set(b.id, b);
    const mapped = badEndings.map((b) => (incoming.has(b.id) ? (incoming.get(b.id) as BadEnding) : b));
    const existedIds = new Set(badEndings.map((b) => b.id));
    const appended = patch.upsertBadEndings.filter((b) => !existedIds.has(b.id));
    badEndings = [...mapped, ...appended];
  }

  // 7) patchMeta — 浅合并
  if (patch.patchMeta) {
    meta = { ...meta, ...patch.patchMeta };
  }

  // 8) patchCharacters — 按 id upsert
  if (patch.patchCharacters && patch.patchCharacters.length > 0) {
    const incoming = new Map<string, ScenarioCharacter>();
    for (const c of patch.patchCharacters) incoming.set(c.id, c);
    const mapped = characters.map((c) => (incoming.has(c.id) ? (incoming.get(c.id) as ScenarioCharacter) : c));
    const existedIds = new Set(characters.map((c) => c.id));
    const appended = patch.patchCharacters.filter((c) => !existedIds.has(c.id));
    characters = [...mapped, ...appended];
  }

  // 9) upsertOccupations — 按 name upsert(同 name 覆盖,异 name 追加)
  if (patch.upsertOccupations && patch.upsertOccupations.length > 0) {
    const incoming = new Map<string, Occupation>();
    for (const o of patch.upsertOccupations) incoming.set(o.name, o);
    const mapped = customOccupations.map((o) => (incoming.has(o.name) ? (incoming.get(o.name) as Occupation) : o));
    const existedNames = new Set(customOccupations.map((o) => o.name));
    const appended = patch.upsertOccupations.filter((o) => !existedNames.has(o.name));
    customOccupations = [...mapped, ...appended];
  }

  // 10) removeOccupationNames — 按 name 过滤
  if (patch.removeOccupationNames && patch.removeOccupationNames.length > 0) {
    const removeSet = new Set(patch.removeOccupationNames);
    customOccupations = customOccupations.filter((o) => !removeSet.has(o.name));
  }

  // 11) upsertCustomSkills — 按 name upsert
  if (patch.upsertCustomSkills && patch.upsertCustomSkills.length > 0) {
    const incoming = new Map<string, ScenarioCustomSkill>();
    for (const s of patch.upsertCustomSkills) incoming.set(s.name, s);
    const mapped = customSkills.map((s) => (incoming.has(s.name) ? (incoming.get(s.name) as ScenarioCustomSkill) : s));
    const existedNames = new Set(customSkills.map((s) => s.name));
    const appended = patch.upsertCustomSkills.filter((s) => !existedNames.has(s.name));
    customSkills = [...mapped, ...appended];
  }

  // 12) removeCustomSkillNames — 按 name 过滤
  if (patch.removeCustomSkillNames && patch.removeCustomSkillNames.length > 0) {
    const removeSet = new Set(patch.removeCustomSkillNames);
    customSkills = customSkills.filter((s) => !removeSet.has(s.name));
  }

  // 13) addToBlacklist — 集合并集(去重) + ALL_SKILLS 白名单过滤
  //     不变量:skillBlacklist 必须是 ALL_SKILLS 中实际存在的技能名,否则白勾(SkillsTab
  //     既看不见也无法清除,getScenarioSkillPool 也匹配不到任何 ALL_SKILLS 项)。LLM
  //     幻觉名字会在此被静默剔除,与 SkillsTab.cleanBlacklist 行为对齐(spec §6.5)。
  if (patch.addToBlacklist && patch.addToBlacklist.length > 0) {
    const union = new Set<string>(skillBlacklist);
    for (const n of patch.addToBlacklist) {
      if (ALL_SKILL_NAMES_RUNTIME.has(n)) union.add(n);
    }
    skillBlacklist = Array.from(union);
  }

  // 14) removeFromBlacklist — 集合差集(过滤掉不存在的项天然成立)
  if (patch.removeFromBlacklist && patch.removeFromBlacklist.length > 0) {
    const removeSet = new Set(patch.removeFromBlacklist);
    skillBlacklist = skillBlacklist.filter((n) => !removeSet.has(n));
  }

  return {
    ...doc,
    meta,
    characters,
    entries,
    darkTimeline,
    badEndings,
    customOccupations,
    customSkills,
    skillBlacklist,
    updatedAt: Date.now(),
  };
}

// ---- 校验：基本结构（不深检 CharacterSheet/枚举范围；那是 zod 层的事） ----
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && !Number.isNaN(x);
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';

function isEntryLike(x: unknown): x is ScenarioEntry {
  if (!isObj(x)) return false;
  if (!isStr(x.id) || !isStr(x.comment) || !isStr(x.keys) || !isStr(x.content)) return false;
  if (!isStr(x.category) || !SCENARIO_CATEGORIES_RUNTIME.includes(x.category as ScenarioCategory)) return false;
  if (!isBool(x.constant) || !isNum(x.position) || !isNum(x.priority)) return false;
  if (!isStr(x.cachePolicy) || !CACHE_POLICIES_RUNTIME.includes(x.cachePolicy as ScenarioCachePolicy)) return false;
  return true;
}

function isRecategorizeItem(x: unknown): boolean {
  return (
    isObj(x) && isStr(x.id) && isStr(x.category) && SCENARIO_CATEGORIES_RUNTIME.includes(x.category as ScenarioCategory)
  );
}

function isCachePolicyItem(x: unknown): boolean {
  return (
    isObj(x) &&
    isStr(x.id) &&
    isStr(x.cachePolicy) &&
    CACHE_POLICIES_RUNTIME.includes(x.cachePolicy as ScenarioCachePolicy)
  );
}

function isDarkPhaseLike(x: unknown): x is DarkPhase {
  return isObj(x) && isStr(x.id) && isNum(x.threshold) && isStr(x.title) && isStr(x.directorNote);
}

function isBadEndingLike(x: unknown): x is BadEnding {
  return isObj(x) && isStr(x.id) && isStr(x.condition) && isStr(x.narrative);
}

function isCharacterLike(x: unknown): x is ScenarioCharacter {
  return isObj(x) && isStr(x.id) && (x.role === 'protagonist' || x.role === 'optional' || x.role === 'locked_npc');
}

// Occupation 结构守卫:校验 name/crMin/crMax/skills(string[])
function isOccupationLike(x: unknown): x is Occupation {
  if (!isObj(x)) return false;
  if (!isStr(x.name) || !isNum(x.crMin) || !isNum(x.crMax)) return false;
  if (!Array.isArray(x.skills) || !x.skills.every(isStr)) return false;
  return true;
}

// ScenarioCustomSkill 结构守卫:校验 name/base/cat 含枚举校验
// 与 spec §6.5 "轻量结构校验"的妥协:cat 枚举校验代价低,但能挡掉 LLM 幻觉的 '奇幻系'
// 让脏 entry 入库后 UI 选择器无法编辑(SkillsTab 6 类下拉)。补此守卫与项目其它枚举
// 守卫(SCENARIO_CATEGORIES_RUNTIME/CACHE_POLICIES_RUNTIME)风格对齐。
function isCustomSkillLike(x: unknown): x is ScenarioCustomSkill {
  if (!isObj(x)) return false;
  if (!isStr(x.name)) return false;
  if (!(isNum(x.base) || x.base === 'DEX_HALF' || x.base === 'EDU')) return false;
  if (!isStr(x.cat) || !SKILL_CATS_RUNTIME.includes(x.cat as SkillCat)) return false;
  if (x.desc !== undefined && !isStr(x.desc)) return false;
  return true;
}

// 任一字段缺失即视为该字段不存在；任一字段存在但类型错则返回 false
export function validateScenarioPatch(p: unknown): p is ScenarioPatch {
  if (!isObj(p)) return false;
  const obj = p as Record<string, unknown>;

  if (obj.upsertEntries !== undefined) {
    if (!Array.isArray(obj.upsertEntries) || !obj.upsertEntries.every(isEntryLike)) return false;
  }
  if (obj.removeEntryIds !== undefined) {
    if (!Array.isArray(obj.removeEntryIds) || !obj.removeEntryIds.every(isStr)) return false;
  }
  if (obj.recategorize !== undefined) {
    if (!Array.isArray(obj.recategorize) || !obj.recategorize.every(isRecategorizeItem)) return false;
  }
  if (obj.setCachePolicies !== undefined) {
    if (!Array.isArray(obj.setCachePolicies) || !obj.setCachePolicies.every(isCachePolicyItem)) return false;
  }
  if (obj.upsertDarkTimeline !== undefined) {
    if (!Array.isArray(obj.upsertDarkTimeline) || !obj.upsertDarkTimeline.every(isDarkPhaseLike)) return false;
  }
  if (obj.upsertBadEndings !== undefined) {
    if (!Array.isArray(obj.upsertBadEndings) || !obj.upsertBadEndings.every(isBadEndingLike)) return false;
  }
  if (obj.patchMeta !== undefined) {
    if (!isObj(obj.patchMeta)) return false;
    // Partial<ScenarioMeta>: 不强校验枚举，仅保证类型对得上即可
    const m = obj.patchMeta as Partial<ScenarioMeta>;
    if (m.name !== undefined && !isStr(m.name)) return false;
    if (m.blurb !== undefined && !isStr(m.blurb)) return false;
    if (m.headcountHint !== undefined && !isStr(m.headcountHint)) return false;
    if (m.coverEmoji !== undefined && !isStr(m.coverEmoji)) return false;
    if (m.difficulty !== undefined && !isNum(m.difficulty)) return false;
  }
  if (obj.patchCharacters !== undefined) {
    if (!Array.isArray(obj.patchCharacters) || !obj.patchCharacters.every(isCharacterLike)) return false;
  }
  if (obj.upsertOccupations !== undefined) {
    if (!Array.isArray(obj.upsertOccupations) || !obj.upsertOccupations.every(isOccupationLike)) return false;
  }
  if (obj.removeOccupationNames !== undefined) {
    if (!Array.isArray(obj.removeOccupationNames) || !obj.removeOccupationNames.every(isStr)) return false;
  }
  if (obj.upsertCustomSkills !== undefined) {
    if (!Array.isArray(obj.upsertCustomSkills) || !obj.upsertCustomSkills.every(isCustomSkillLike)) return false;
  }
  if (obj.removeCustomSkillNames !== undefined) {
    if (!Array.isArray(obj.removeCustomSkillNames) || !obj.removeCustomSkillNames.every(isStr)) return false;
  }
  if (obj.addToBlacklist !== undefined) {
    if (!Array.isArray(obj.addToBlacklist) || !obj.addToBlacklist.every(isStr)) return false;
  }
  if (obj.removeFromBlacklist !== undefined) {
    if (!Array.isArray(obj.removeFromBlacklist) || !obj.removeFromBlacklist.every(isStr)) return false;
  }

  return true;
}
