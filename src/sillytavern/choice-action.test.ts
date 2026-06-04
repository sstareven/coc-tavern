import { describe, expect, it } from 'vitest';
import { buildNpcActionRequest, isHelplessNpc, buildExecutionNarrative } from './choice-action';
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

describe('isHelplessNpc — 失能判定（重伤/昏迷/濒死）', () => {
  it('重伤/昏迷/濒死 → true', () => {
    expect(isHelplessNpc({ status: '重伤' })).toBe(true);
    expect(isHelplessNpc({ status: '昏迷' })).toBe(true);
    expect(isHelplessNpc({ status: '濒死，奄奄一息' })).toBe(true);
  });
  it('活跃/已死亡/失踪/空 → false（已死亡不可再处决，失踪不在场）', () => {
    expect(isHelplessNpc({ status: '活跃' })).toBe(false);
    expect(isHelplessNpc({ status: '已死亡' })).toBe(false);
    expect(isHelplessNpc({ status: '失踪' })).toBe(false);
    expect(isHelplessNpc({ status: undefined })).toBe(false);
  });
});

describe('buildExecutionNarrative — 处决/制伏叙事（纯文本、无检定标记）', () => {
  const attack = NPC_ACTIONS.find((a) => a.id === 'attack')!;
  const grapple = NPC_ACTIONS.find((a) => a.id === 'grapple')!;
  const disarm = NPC_ACTIONS.find((a) => a.id === 'disarm')!;
  it('普通攻击 → 补刀了结', () => {
    const t = buildExecutionNarrative('康斯坦茨博士', '重伤', attack);
    expect(t).toContain('康斯坦茨博士');
    expect(t).toContain('身负重伤');
    expect(t).toContain('一击');
    expect(t).not.toContain('检定'); // 纯叙事,无检定标记
  });
  it('缴械 → 夺武器；其他战技 → 制伏控制', () => {
    expect(buildExecutionNarrative('马什', '昏迷', disarm)).toContain('夺下');
    expect(buildExecutionNarrative('马什', '昏迷', grapple)).toContain('制伏');
    expect(buildExecutionNarrative('马什', '昏迷', grapple)).toContain('昏迷倒地');
  });
});
