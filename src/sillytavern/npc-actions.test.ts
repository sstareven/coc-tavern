import { describe, expect, it } from 'vitest';
import { NPC_ACTIONS, NPC_ACTION_GROUPS, NPC_QUICK_ACTIONS, npcActionsByGroup } from './npc-actions';

describe('NPC_ACTIONS 目录', () => {
  it('快捷行=攻击/话术/偷窃', () => {
    expect(NPC_QUICK_ACTIONS.map((a) => a.id)).toEqual(['attack', 'talk', 'steal']);
  });
  it('攻击与 4 个战技为 combat，战技带 maneuver', () => {
    expect(NPC_ACTIONS.find((a) => a.id === 'attack')!.kind).toBe('combat');
    const maneuvers = NPC_ACTIONS.filter((a) => a.group === '战技');
    expect(maneuvers).toHaveLength(4);
    expect(maneuvers.every((a) => a.kind === 'combat' && a.maneuver)).toBe(true);
    expect(maneuvers.map((a) => a.maneuver).sort()).toEqual(['disarm', 'grapple', 'knockout', 'shove']);
  });
  it('check 动作均带 skill（治理技能）', () => {
    const checks = NPC_ACTIONS.filter((a) => a.kind === 'check');
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((a) => typeof a.skill === 'string' && a.skill.length > 0)).toBe(true);
  });
  it('分组顺序覆盖 更多▾ 的全部组', () => {
    for (const g of NPC_ACTION_GROUPS) {
      expect(npcActionsByGroup(g).length).toBeGreaterThan(0);
    }
  });
});
