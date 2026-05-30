import { describe, it, expect } from 'vitest';
import { parseDiceResultsFromInput } from './parse-dice-input';

describe('parseDiceResultsFromInput', () => {
  it('普通无加成骰子', () => {
    const r = parseDiceResultsFromInput('[侦查 d100=42/60 成功]\n抵近检查');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ skill: '侦查', roll: '42', target: '60', type: 'success' });
  });

  it('带奖励骰的困难成功 — 不应被误判为 failure（回归用例）', () => {
    const r = parseDiceResultsFromInput(
      "[侦查 d100=16/61 奖励骰 困难成功]\n进行侦查检定(普通, 奖励骰) <var name='lastCheck' value='侦查'/>",
    );
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('hard-success');
    expect(r[0].skill).toBe('侦查');
  });

  it('带惩罚骰的失败', () => {
    const r = parseDiceResultsFromInput('[攀爬 d100=66/30 惩罚骰 失败]');
    expect(r[0].type).toBe('failure');
  });

  it('带感叹号的大成功', () => {
    const r = parseDiceResultsFromInput('[幸运 d100=01/50 奖励骰 大成功！]');
    expect(r[0].type).toBe('crit-success');
  });

  it('无掷骰方括号 → 空数组', () => {
    expect(parseDiceResultsFromInput('我直接环顾四周')).toEqual([]);
  });

  it('多个掷骰', () => {
    const r = parseDiceResultsFromInput('[侦查 d100=10/60 极难成功] 然后 [聆听 d100=80/40 失败]');
    expect(r.map((x) => x.type)).toEqual(['extreme-success', 'failure']);
  });

  it('对抗检定 — 记录胜负与玩家个人成功等级', () => {
    const r = parseDiceResultsFromInput(
      '[侦查对抗 玩家d100=16/61(困难成功) vs 对手d100=45/50(失败) → 胜利]\n进行侦查对抗',
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      skill: '侦查对抗(胜利)',
      roll: '16',
      target: '61',
      type: 'hard-success',
    });
  });

  it('对抗失败 — 技能名记负，type 仍反映玩家个人掷骰', () => {
    const r = parseDiceResultsFromInput(
      '[力量对抗 玩家d100=55/60(成功) vs 对手d100=10/70(困难成功) → 失败]',
    );
    expect(r[0].skill).toBe('力量对抗(失败)');
    expect(r[0].type).toBe('success');
  });

  it('对抗与普通混排 — 各自正确解析，不互相污染', () => {
    const r = parseDiceResultsFromInput(
      '[侦查对抗 玩家d100=16/61(困难成功) vs 对手d100=45/50(失败) → 胜利] [聆听 d100=30/40 成功]',
    );
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.skill)).toEqual(['侦查对抗(胜利)', '聆听']);
    expect(r.map((x) => x.type)).toEqual(['hard-success', 'success']);
  });
});
