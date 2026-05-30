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
});
