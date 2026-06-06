// 剧本变更包应用 — 参见 docs/specs/2026-06-06-scenario-system-design.md §5.2 / §G1
// CompanionChat LLM 返回 ScenarioPatch JSON，统一在这里不可变应用到 ScenarioDoc
import type {
  ScenarioDoc,
  ScenarioPatch,
  ScenarioEntry,
  ScenarioCategory,
  ScenarioCachePolicy,
  ScenarioCharacter,
  DarkPhase,
  BadEnding,
  ScenarioMeta,
} from '../types/scenario';

const SCENARIO_CATEGORIES_RUNTIME: ScenarioCategory[] = ['地点', '人物', '势力', '物品线索', '暗线', '秘密与解锁'];
const CACHE_POLICIES_RUNTIME: ScenarioCachePolicy[] = ['static_prefix', 'dynamic_suffix', 'auto'];

// 不可变应用 patch：每一段独立 reduce；返回新 doc；updatedAt 用当前 epoch ms
export function applyScenarioPatch(doc: ScenarioDoc, patch: ScenarioPatch): ScenarioDoc {
  let entries = doc.entries;
  let darkTimeline = doc.darkTimeline;
  let badEndings = doc.badEndings;
  let meta = doc.meta;
  let characters = doc.characters;

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

  return {
    ...doc,
    meta,
    characters,
    entries,
    darkTimeline,
    badEndings,
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

  return true;
}
