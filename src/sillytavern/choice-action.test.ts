import { describe, expect, it } from 'vitest';
import { buildNpcActionRequest } from './choice-action';
import { NPC_ACTIONS, type NpcAction } from './npc-actions';

describe('buildNpcActionRequest', () => {
  it('check 动作 → checkText 含「进行{skill}检定(普通)」，text 为纯叙事', () => {
    const talk = NPC_ACTIONS.find((a) => a.id === 'talk')!;
    const req = buildNpcActionRequest('阿尔伯特', talk);
    expect(req.checkText).toContain('进行话术检定(普通)');
    expect(req.text).toContain('阿尔伯特');
    expect(req.text).not.toContain('进行'); // 提交文本不带检定标记
  });

  it('难度透传到检定标记', () => {
    const a: NpcAction = { id: 'x', label: '潜入', group: '调查', kind: 'check', skill: '潜行', difficulty: '困难' };
    expect(buildNpcActionRequest('守卫', a).checkText).toContain('进行潜行检定(困难)');
  });

  it('combat/无 skill 动作 → text===checkText 且不含检定标记', () => {
    const attack = NPC_ACTIONS.find((a) => a.id === 'attack')!;
    const req = buildNpcActionRequest('野兽', attack);
    expect(req.text).toBe(req.checkText);
    expect(req.checkText).not.toContain('检定');
  });

  it('未知 id 回落「对{npc}{label}」', () => {
    const a: NpcAction = { id: 'zzz', label: '行礼', group: '社交', kind: 'check', skill: '礼仪' };
    expect(buildNpcActionRequest('夫人', a).text).toBe('对夫人行礼');
  });
});
