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

  it('暗骰技能(心理学)不进 diceResults', () => {
    expect(parseDiceResultsFromInput('[心理学 d100=42/60 成功]\n看穿他的神情')).toEqual([]);
  });

  it('心理学与普通检定混排时只跳过心理学', () => {
    const r = parseDiceResultsFromInput('[心理学 d100=42/60 成功] [侦查 d100=30/55 困难成功]');
    expect(r).toHaveLength(1);
    expect(r[0].skill).toBe('侦查');
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

  it('孤注一掷成功 — 不应被 (孤注一掷) 后缀污染成 failure (Bug #1 回归)', () => {
    // Bug: split(/\s+/).pop() 会取到末尾的 "(孤注一掷)" 当 label,LABEL_TO_TYPE 查不到 → fallback failure
    const r = parseDiceResultsFromInput('[听力 d100=85/30 成功 (孤注一掷)]');
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('success');
    expect(r[0].roll).toBe('85');
  });

  it('孤注一掷失败 — 仍是 failure (不要把成功的回归改飞)', () => {
    const r = parseDiceResultsFromInput('[听力 d100=72/30 失败 (孤注一掷)]');
    expect(r[0].type).toBe('failure');
  });

  it('孤注一掷大成功 — 带感叹号的 label 仍正确', () => {
    const r = parseDiceResultsFromInput('[幸运 d100=01/50 大成功！ (孤注一掷)]');
    expect(r[0].type).toBe('crit-success');
  });

  it('幸运补救后缀 (幸运扣N点) 也要剥掉再取 label', () => {
    const r = parseDiceResultsFromInput('[侦查 d100=55/60 成功 (幸运扣5点)]');
    expect(r[0].type).toBe('success');
    expect(r[0].roll).toBe('55');
  });

  it('奖励骰 + 孤注一掷成功 — 两层修饰均不污染', () => {
    const r = parseDiceResultsFromInput('[攀爬 d100=22/40 奖励骰 困难成功 (孤注一掷)]');
    expect(r[0].type).toBe('hard-success');
  });

  it('嵌套圆括号注解 — 孤注一掷+幸运补救层级嵌套不应回退到 failure (Bug #8 回归)', () => {
    // 旧 regex `\([^()]*\)` 禁止括号内嵌括号,只剥内层 → 残留 `困难成功(孤注一掷` 查不到 → failure
    const r = parseDiceResultsFromInput('[侦查 d100=15/60 困难成功(孤注一掷(幸运扣2点))]');
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('hard-success');
  });

  it('嵌套圆括号 + 普通成功', () => {
    const r = parseDiceResultsFromInput('[侦查 d100=30/60 成功(孤注一掷(幸运扣2点))]');
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('success');
  });

  it('未闭合的尾部 ( — 也应剥掉再查 label (Bug #8 回归)', () => {
    // 旧 regex 完全不匹配,整段 `成功(有奖励骰` 进 LABEL_TO_TYPE → undefined → failure
    const r = parseDiceResultsFromInput('[侦查 d100=42/60 成功(有奖励骰]');
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('success');
    expect(r[0].roll).toBe('42');
  });

  it('未闭合 + 带感叹号大成功', () => {
    const r = parseDiceResultsFromInput('[幸运 d100=01/50 大成功！(漏写右括号]');
    expect(r[0].type).toBe('crit-success');
  });
});
