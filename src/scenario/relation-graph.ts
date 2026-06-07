// relation-graph: 关系图纯函数(无副作用, 可单测)
// spec §4.1 边语义 + §4.2 三大判定规则
// - getRelations:           读 character.relations 出边
// - hasHostileEdge:         判定两点之间是否存在敌对边(enemy/rival, 任一方向)
// - canJoinParty:           R1 准入 + R2 排斥(玩家或队内任一与候选有非敌对边即通过)
// - detectPartyConflicts:   扫描小队找新出现的敌对边对, 返回后到者应被踢
//
// 关系类型语义(spec §4.1):
// - 非敌对边: family / lover / friend / colleague / mentor / acquaintance
// - 敌对边:   enemy / rival(算"有关系"但排斥同队)
// - 无边:     陌生(留白即可)
//
// 方向性: A.relations[targetId=B, type='mentor'] 表示 "A 是 B 的导师"。
// 反向查询: 当判定"X 与 Y 是否有边"时,任一方向存在即算有(单向边语义补全)。

import type {
  ScenarioDoc,
  ScenarioCharacter,
  ScenarioRelation,
  RelationType,
} from '../types/scenario';

/** 敌对边类型(排斥同队)。 */
const HOSTILE_TYPES: ReadonlySet<RelationType> = new Set<RelationType>(['enemy', 'rival']);

/** 判某种类型是否为敌对。 */
function isHostileType(t: RelationType): boolean {
  return HOSTILE_TYPES.has(t);
}

/** 按 id 取角色(找不到返回 undefined)。 */
function findChar(doc: ScenarioDoc, id: string): ScenarioCharacter | undefined {
  return doc.characters.find((c) => c.id === id);
}

/**
 * 取角色出边集合(从 doc.characters[id].relations 直读)。
 * - 角色不存在 → []
 * - 角色无 relations → []
 */
export function getRelations(doc: ScenarioDoc, charId: string): ScenarioRelation[] {
  const c = findChar(doc, charId);
  if (!c) return [];
  return c.relations ?? [];
}

/**
 * 判两点之间是否存在敌对边(任一方向 enemy/rival 都算)。
 * 用于 R2 排斥判定与 R4 自动脱队检测。
 */
export function hasHostileEdge(doc: ScenarioDoc, aId: string, bId: string): boolean {
  if (aId === bId) return false;
  // A→B 出边
  for (const r of getRelations(doc, aId)) {
    if (r.targetId === bId && isHostileType(r.type)) return true;
  }
  // B→A 出边(反向语义补全)
  for (const r of getRelations(doc, bId)) {
    if (r.targetId === aId && isHostileType(r.type)) return true;
  }
  return false;
}

/**
 * 判两点之间是否存在任一非敌对边(任一方向)。
 * R1 准入: 候选与(玩家 或 队内任一成员)至少存在一条非敌对边。
 */
function hasNonHostileEdge(doc: ScenarioDoc, aId: string, bId: string): boolean {
  if (aId === bId) return false;
  for (const r of getRelations(doc, aId)) {
    if (r.targetId === bId && !isHostileType(r.type)) return true;
  }
  for (const r of getRelations(doc, bId)) {
    if (r.targetId === aId && !isHostileType(r.type)) return true;
  }
  return false;
}

/**
 * canJoinParty 返回结果。
 * - ok=true:  通过
 * - ok=false: reason=stranger(无任何非敌对边) / hostile(与某成员敌对) / unknown(候选 id 不存在)
 */
export type CanJoinPartyResult =
  | { ok: true }
  | { ok: false; reason: 'stranger' | 'hostile' | 'unknown'; hostileWith?: string };

/**
 * R1 准入 + R2 排斥(spec §4.2):
 * - R2 优先: 候选与玩家或队内任一成员有敌对边 → 拒绝(hostile)
 * - R1: 候选与(玩家 或 队内任一成员)至少存在一条非敌对边 → 通过
 *       否则 → 拒绝(stranger)
 *
 * @param doc          剧本文档(关系图单一真源)
 * @param candidateId  申请入队的角色 id(必须在 doc.characters 中存在)
 * @param partyIds     当前已在队的角色 id 列表(不含玩家)
 * @param playerId     玩家在剧本中的 id(走 newChar 模式时是自创卡 id,走 preset 模式时是所选角色 id)
 */
export function canJoinParty(
  doc: ScenarioDoc,
  candidateId: string,
  partyIds: string[],
  playerId: string,
): CanJoinPartyResult {
  if (!findChar(doc, candidateId)) {
    return { ok: false, reason: 'unknown' };
  }

  // R2 排斥优先(敌对边出现就直接拒绝, 不再看 R1)
  if (hasHostileEdge(doc, candidateId, playerId)) {
    return { ok: false, reason: 'hostile', hostileWith: playerId };
  }
  for (const pid of partyIds) {
    if (hasHostileEdge(doc, candidateId, pid)) {
      return { ok: false, reason: 'hostile', hostileWith: pid };
    }
  }

  // R1 准入: 与玩家或队内任一成员存在非敌对边即可
  if (hasNonHostileEdge(doc, candidateId, playerId)) return { ok: true };
  for (const pid of partyIds) {
    if (hasNonHostileEdge(doc, candidateId, pid)) return { ok: true };
  }

  return { ok: false, reason: 'stranger' };
}

/** 脱队冲突: 后到者(partyIds 数组靠后)被踢。 */
export interface PartyConflict {
  kickedId: string;
  hostileWithId: string;
}

/**
 * R4 自动脱队检测(spec §4.2):
 * 扫描 partyIds 两两组合,若任一对存在敌对边 → 返回靠后者应被踢。
 *
 * 排序规则: partyIds 数组顺序即"入队顺序",后入队者优先被踢(直觉:谁后来谁离开)。
 * 同一回合多对冲突全部返回,调用方负责依次执行 leaveParty。
 */
export function detectPartyConflicts(
  doc: ScenarioDoc,
  partyIds: string[],
): PartyConflict[] {
  const out: PartyConflict[] = [];
  for (let i = 0; i < partyIds.length; i++) {
    for (let j = i + 1; j < partyIds.length; j++) {
      const a = partyIds[i];
      const b = partyIds[j];
      if (hasHostileEdge(doc, a, b)) {
        out.push({ kickedId: b, hostileWithId: a });
      }
    }
  }
  return out;
}
