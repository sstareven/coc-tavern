import { describe, it, expect } from 'vitest';
import { groupRoster } from '../roster-engine';
import type { ScenarioDoc, ScenarioCharacter } from '../../types/scenario';

function makeChar(id: string, role: ScenarioCharacter['role'], createdAt?: number): ScenarioCharacter {
  return {
    id,
    role,
    sheet: undefined as unknown as ScenarioCharacter['sheet'],
    npcAttrs: {
      identityTag: '',
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
    createdAt,
  };
}

function makeScn(chars: ScenarioCharacter[]): ScenarioDoc {
  const now = Date.now();
  return {
    id: 'scn-test',
    builtin: false,
    meta: { name: 't', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '', sanLossHint: '低', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: chars,
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

describe('groupRoster', () => {
  it('scn 缺失返回三段空数组', () => {
    expect(groupRoster(undefined)).toEqual({ protagonists: [], optionals: [], userCreated: [] });
  });

  it('按 role 分三段，locked_npc 不出现在任何一段', () => {
    const scn = makeScn([
      makeChar('p1', 'protagonist'),
      makeChar('o1', 'optional'),
      makeChar('l1', 'locked_npc'),
      makeChar('u1', 'player_created', 1000),
    ]);
    const g = groupRoster(scn);
    expect(g.protagonists.map((r) => r.c.id)).toEqual(['p1']);
    expect(g.optionals.map((r) => r.c.id)).toEqual(['o1']);
    expect(g.userCreated.map((r) => r.c.id)).toEqual(['u1']);
  });

  it('保留 scn.characters 原序 idx（不被分组打乱）', () => {
    const scn = makeScn([
      makeChar('a', 'optional'),       // idx 0
      makeChar('b', 'protagonist'),     // idx 1
      makeChar('c', 'protagonist'),     // idx 2
      makeChar('d', 'optional'),        // idx 3
    ]);
    const g = groupRoster(scn);
    expect(g.protagonists.map((r) => r.idx)).toEqual([1, 2]);
    expect(g.optionals.map((r) => r.idx)).toEqual([0, 3]);
  });

  it('userCreated 按 createdAt 倒序，缺失 createdAt 视为 0 排最后', () => {
    const scn = makeScn([
      makeChar('old', 'player_created', 1000),
      makeChar('new', 'player_created', 5000),
      makeChar('mid', 'player_created', 3000),
      makeChar('none', 'player_created'), // undefined createdAt
    ]);
    const g = groupRoster(scn);
    expect(g.userCreated.map((r) => r.c.id)).toEqual(['new', 'mid', 'old', 'none']);
  });

  it('空 scn.characters 三段都是空数组（不是 undefined）', () => {
    const g = groupRoster(makeScn([]));
    expect(g.protagonists).toEqual([]);
    expect(g.optionals).toEqual([]);
    expect(g.userCreated).toEqual([]);
  });
});
