// relation-graph 纯函数测试 — spec §10.1 全部用例
// 覆盖: getRelations / canJoinParty / hasHostileEdge / detectPartyConflicts
// - 玩家陌生 NPC → 拒绝
// - 玩家好友 → 通过
// - 朋友的朋友 → 通过
// - 队里有 A,B 与 A 敌对 → 拒绝
// - 运行时 B 与 A 变敌对 → detectPartyConflicts 返回
// - mentor 单向边的反向查询正确
import { describe, it, expect } from 'vitest';
import {
  getRelations,
  canJoinParty,
  hasHostileEdge,
  detectPartyConflicts,
} from '../relation-graph';
import type {
  ScenarioDoc,
  ScenarioCharacter,
  ScenarioRelation,
} from '../../types/scenario';

// ── 构造工具 ──
function makeChar(
  id: string,
  relations: ScenarioRelation[] = [],
  overrides: Partial<ScenarioCharacter> = {},
): ScenarioCharacter {
  return {
    id,
    role: 'optional',
    sheet: {} as ScenarioCharacter['sheet'], // 测试不深检 sheet
    npcAttrs: {
      identityTag: id,
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
    relations,
    ...overrides,
  };
}

function makeDoc(characters: ScenarioCharacter[]): ScenarioDoc {
  return {
    id: 'scn_test',
    meta: {
      name: 't', type: '调查', durationHint: '1-2h',
      difficulty: 1, headcountHint: '1', sanLossHint: '低', blurb: '',
    },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters,
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: 0,
    updatedAt: 0,
  };
}

const PLAYER = 'player_self';

// ============================================================
describe('getRelations', () => {
  it('返回角色自身的出边集合(从 character.relations 直读)', () => {
    const a = makeChar('a', [
      { targetId: 'b', type: 'friend' },
      { targetId: 'c', type: 'enemy', note: '诬告案' },
    ]);
    const doc = makeDoc([a, makeChar('b'), makeChar('c')]);
    const out = getRelations(doc, 'a');
    expect(out.map((r) => r.targetId)).toEqual(['b', 'c']);
    expect(out[0].type).toBe('friend');
    expect(out[1].note).toBe('诬告案');
  });

  it('角色不存在返回空数组', () => {
    const doc = makeDoc([]);
    expect(getRelations(doc, 'missing')).toEqual([]);
  });

  it('角色无 relations 字段返回空数组', () => {
    const a = makeChar('a');
    delete (a as { relations?: ScenarioRelation[] }).relations;
    const doc = makeDoc([a]);
    expect(getRelations(doc, 'a')).toEqual([]);
  });
});

// ============================================================
describe('hasHostileEdge', () => {
  it('A→B 写 enemy → 有敌对边', () => {
    const doc = makeDoc([
      makeChar('a', [{ targetId: 'b', type: 'enemy' }]),
      makeChar('b'),
    ]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(true);
  });

  it('A→B 写 rival → 有敌对边', () => {
    const doc = makeDoc([
      makeChar('a', [{ targetId: 'b', type: 'rival' }]),
      makeChar('b'),
    ]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(true);
  });

  it('B→A 单向写 enemy → 反向查询也算有敌对边', () => {
    const doc = makeDoc([
      makeChar('a'),
      makeChar('b', [{ targetId: 'a', type: 'enemy' }]),
    ]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(true);
  });

  it('双方都没写 → 无敌对边', () => {
    const doc = makeDoc([makeChar('a'), makeChar('b')]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(false);
  });

  it('只有 friend 边 → 无敌对边', () => {
    const doc = makeDoc([
      makeChar('a', [{ targetId: 'b', type: 'friend' }]),
      makeChar('b'),
    ]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(false);
  });
});

// ============================================================
describe('canJoinParty', () => {
  it('玩家陌生 NPC(候选与玩家无任何边) → 拒绝', () => {
    const doc = makeDoc([makeChar('npc1')]);
    const res = canJoinParty(doc, 'npc1', [], PLAYER);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('stranger');
    }
  });

  it('玩家好友 → 通过(玩家→候选 friend 边)', () => {
    // 玩家在 doc.characters 里以 id=PLAYER 存在,持有一条 friend → npc1
    const player = makeChar(PLAYER, [{ targetId: 'npc1', type: 'friend' }]);
    const doc = makeDoc([player, makeChar('npc1')]);
    const res = canJoinParty(doc, 'npc1', [], PLAYER);
    expect(res.ok).toBe(true);
  });

  it('反向边: 候选→玩家 family → 也算通过', () => {
    const doc = makeDoc([
      makeChar(PLAYER),
      makeChar('npc1', [{ targetId: PLAYER, type: 'family' }]),
    ]);
    const res = canJoinParty(doc, 'npc1', [], PLAYER);
    expect(res.ok).toBe(true);
  });

  it('朋友的朋友 → 通过(玩家与候选陌生,但队里 A 是候选的朋友)', () => {
    const doc = makeDoc([
      makeChar(PLAYER),
      makeChar('a', [{ targetId: 'b', type: 'friend' }]),
      makeChar('b'),
    ]);
    // 队里有 a, b 申请入队,b 与 a 是朋友 → 通过
    const res = canJoinParty(doc, 'b', ['a'], PLAYER);
    expect(res.ok).toBe(true);
  });

  it('队里有 A, B 与 A 敌对 → 拒绝', () => {
    const doc = makeDoc([
      makeChar(PLAYER, [{ targetId: 'b', type: 'friend' }]), // 与玩家有 friend(满足 R1)
      makeChar('a'),
      makeChar('b', [{ targetId: 'a', type: 'enemy' }]),     // 但与队里 a 敌对
    ]);
    const res = canJoinParty(doc, 'b', ['a'], PLAYER);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('hostile');
      expect(res.hostileWith).toBe('a');
    }
  });

  it('队里有 A, B 与 A rival → 拒绝(rival 也算敌对)', () => {
    const doc = makeDoc([
      makeChar(PLAYER, [{ targetId: 'b', type: 'friend' }]),
      makeChar('a', [{ targetId: 'b', type: 'rival' }]),
      makeChar('b'),
    ]);
    const res = canJoinParty(doc, 'b', ['a'], PLAYER);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('hostile');
    }
  });

  it('玩家与候选敌对 → 拒绝(优先于 stranger)', () => {
    const doc = makeDoc([
      makeChar(PLAYER, [{ targetId: 'npc1', type: 'enemy' }]),
      makeChar('npc1'),
    ]);
    const res = canJoinParty(doc, 'npc1', [], PLAYER);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('hostile');
    }
  });

  it('候选 id 在 doc 中不存在 → 拒绝(unknown)', () => {
    const doc = makeDoc([makeChar(PLAYER)]);
    const res = canJoinParty(doc, 'ghost', [], PLAYER);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('unknown');
    }
  });

  it('与队内成员 acquaintance → 通过(非敌对边即可)', () => {
    const doc = makeDoc([
      makeChar(PLAYER),
      makeChar('a'),
      makeChar('b', [{ targetId: 'a', type: 'acquaintance' }]),
    ]);
    const res = canJoinParty(doc, 'b', ['a'], PLAYER);
    expect(res.ok).toBe(true);
  });
});

// ============================================================
describe('detectPartyConflicts', () => {
  it('队里两人无敌对 → 返回空', () => {
    const doc = makeDoc([
      makeChar('a', [{ targetId: 'b', type: 'friend' }]),
      makeChar('b'),
    ]);
    expect(detectPartyConflicts(doc, ['a', 'b'])).toEqual([]);
  });

  it('运行时 B 与 A 变敌对 → detectPartyConflicts 返回 B 应被踢', () => {
    const doc = makeDoc([
      makeChar('a'),
      makeChar('b', [{ targetId: 'a', type: 'enemy' }]),
    ]);
    const out = detectPartyConflicts(doc, ['a', 'b']);
    expect(out.length).toBeGreaterThan(0);
    // 后到者(数组靠后)被踢:b 在 partyIds 数组中位于 a 之后,优先踢 b
    expect(out[0].kickedId).toBe('b');
    expect(out[0].hostileWithId).toBe('a');
  });

  it('队三人 a/b/c, b↔c 敌对 → c 被踢(后到者)', () => {
    const doc = makeDoc([
      makeChar('a'),
      makeChar('b'),
      makeChar('c', [{ targetId: 'b', type: 'rival' }]),
    ]);
    const out = detectPartyConflicts(doc, ['a', 'b', 'c']);
    expect(out.map((x) => x.kickedId)).toContain('c');
  });

  it('空队伍 → 返回空', () => {
    const doc = makeDoc([]);
    expect(detectPartyConflicts(doc, [])).toEqual([]);
  });

  it('单人队伍 → 返回空(无可冲突对象)', () => {
    const doc = makeDoc([makeChar('a')]);
    expect(detectPartyConflicts(doc, ['a'])).toEqual([]);
  });
});

// ============================================================
describe('mentor 单向边的反向查询', () => {
  it("A 写 mentor→B(A 是 B 的导师),反查 B 视角能看到 A 是 mentor", () => {
    // mentor 在 hasHostileEdge 视角为非敌对,在 canJoinParty 视角应算合法非敌对边
    const doc = makeDoc([
      makeChar(PLAYER),
      makeChar('a', [{ targetId: 'b', type: 'mentor' }]),
      makeChar('b'),
    ]);
    // 队里 a 是 b 的导师 → b 想入队(玩家与 b 陌生) → 朋友的朋友规则通过
    const res = canJoinParty(doc, 'b', ['a'], PLAYER);
    expect(res.ok).toBe(true);
  });

  it('mentor 非敌对 → hasHostileEdge 返回 false', () => {
    const doc = makeDoc([
      makeChar('a', [{ targetId: 'b', type: 'mentor' }]),
      makeChar('b'),
    ]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(false);
  });
});
