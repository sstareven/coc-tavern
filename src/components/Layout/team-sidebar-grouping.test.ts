import { describe, it, expect } from 'vitest';
import { groupNpcsByParty } from './team-sidebar-grouping';
import type { NpcProfile } from '../../types';

function mkNpc(over: Partial<NpcProfile>): NpcProfile {
  return {
    id: over.id ?? 'x', name: over.name ?? 'X',
    identity: '', favorability: 0,
    appearance: '', innerThoughts: '',
    memories: [], experience: '', backstory: '', possessions: [],
    isPresent: over.isPresent ?? false,
    createdAt: 0, updatedAt: 0,
    ...over,
  } as NpcProfile;
}

describe('groupNpcsByParty', () => {
  it('已入队 = isPresent && inParty', () => {
    const npcs = [
      mkNpc({ id: 'a', name: 'A', isPresent: true, inParty: true }),
      mkNpc({ id: 'b', name: 'B', isPresent: true, inParty: false }),
      mkNpc({ id: 'c', name: 'C', isPresent: false, inParty: true }),  // 缺席不算
      mkNpc({ id: 'd', name: 'D', isPresent: false, inParty: false }),
    ];
    const { party, presentOutside } = groupNpcsByParty(npcs);
    expect(party.map(n => n.id)).toEqual(['a']);
    expect(presentOutside.map(n => n.id)).toEqual(['b']);
  });

  it('按 name 字典序排序', () => {
    const npcs = [
      mkNpc({ id: '1', name: '丙', isPresent: true, inParty: true }),
      mkNpc({ id: '2', name: '甲', isPresent: true, inParty: true }),
      mkNpc({ id: '3', name: '乙', isPresent: true, inParty: false }),
      mkNpc({ id: '4', name: '丁', isPresent: true, inParty: false }),
    ];
    const { party, presentOutside } = groupNpcsByParty(npcs);
    expect(party.map(n => n.name)).toEqual(['丙', '甲']);
    expect(presentOutside.map(n => n.name)).toEqual(['丁', '乙']);
  });

  it('undefined inParty 视为非队', () => {
    const npcs = [
      mkNpc({ id: 'a', name: 'A', isPresent: true }), // 没设 inParty
    ];
    const { party, presentOutside } = groupNpcsByParty(npcs);
    expect(party).toHaveLength(0);
    expect(presentOutside).toHaveLength(1);
  });
});
