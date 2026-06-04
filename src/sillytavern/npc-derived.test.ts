import { describe, expect, it } from 'vitest';
import { parseNpcDerived } from './npc-derived';
import type { NpcProfile } from '../types';

function npc(over: Partial<NpcProfile>): NpcProfile {
  return {
    id: 'n', name: 'X', identity: '', favorability: 0, appearance: '', personality: '',
    innerThoughts: '', memories: [], experience: '', backstory: '', possessions: [],
    isPresent: true, createdAt: 0, updatedAt: 0, ...over,
  };
}

describe('parseNpcDerived', () => {
  it('从 derived 文本解析 HP/SAN/MP/DB/MOV', () => {
    const r = parseNpcDerived(npc({ derived: 'HP 12 / SAN 55 / MP 11 / DB +1D4 / MOV 8' }));
    expect(r.hp).toBe(12);
    expect(r.san).toBe(55);
    expect(r.mp).toBe(11);
    expect(r.db).toBe('1D4'); // 规范化：解析时去掉前导 +（与 buildAndDamageBonus 一致）
    expect(r.mov).toBe(8);
  });
  it('无 derived 时从 characteristics 推算', () => {
    const r = parseNpcDerived(npc({ characteristics: { STR: 70, CON: 60, SIZ: 70, POW: 50, DEX: 50, APP: 50, INT: 50, EDU: 50 } }));
    expect(r.hp).toBe(13);   // (60+70)/10
    expect(r.mp).toBe(10);   // 50/5
    expect(r.san).toBe(50);  // POW
    expect(r.build).toBe(1); // STR+SIZ=140 → +1D4/Build1
    expect(r.db).toBe('1D4');
    expect(r.mov).toBe(8);   // 默认
  });
  it('全缺则衍生多为 undefined（仅 mov 默认 8）', () => {
    const r = parseNpcDerived(npc({}));
    expect(r.hp).toBeUndefined();
    expect(r.san).toBeUndefined();
    expect(r.build).toBeUndefined();
    expect(r.mov).toBe(8);
  });
});
