import { describe, it, expect } from 'vitest';
import { parseAttackTarget } from './parse-attack-target';

describe('parseAttackTarget', () => {
  const partyNames = ['以利亚·霍尔姆斯', '哈丽特修女', '约翰'];

  it('识别「攻击 <队友名>」→ 返回 kind:attack + targetName', () => {
    const r = parseAttackTarget('攻击 以利亚·霍尔姆斯', partyNames);
    expect(r).toEqual({ kind: 'attack', targetName: '以利亚·霍尔姆斯' });
  });

  it('识别「向<队友名>开枪」→ 命中', () => {
    const r = parseAttackTarget('向哈丽特修女开枪', partyNames);
    expect(r).toEqual({ kind: 'attack', targetName: '哈丽特修女' });
  });

  it('识别「格斗对抗 <队友名>」→ 命中', () => {
    const r = parseAttackTarget('与约翰进行格斗对抗', partyNames);
    expect(r).toEqual({ kind: 'attack', targetName: '约翰' });
  });

  it('识别「推开 <队友名>」/「推搡」→ 命中', () => {
    expect(parseAttackTarget('推开约翰', partyNames)).toEqual({ kind: 'attack', targetName: '约翰' });
    expect(parseAttackTarget('推搡哈丽特修女', partyNames)).toEqual({ kind: 'attack', targetName: '哈丽特修女' });
  });

  it('识别「射击 <队友名>」/「射杀」→ 命中', () => {
    expect(parseAttackTarget('射击以利亚·霍尔姆斯', partyNames)).toEqual({ kind: 'attack', targetName: '以利亚·霍尔姆斯' });
    expect(parseAttackTarget('射杀约翰', partyNames)).toEqual({ kind: 'attack', targetName: '约翰' });
  });

  it('攻击非队友 NPC → 返回 null（不归攻击保护管）', () => {
    const r = parseAttackTarget('攻击 邪教徒', partyNames);
    expect(r).toBeNull();
  });

  it('非攻击动作（如「与<队友>交谈」）→ 返回 null', () => {
    const r = parseAttackTarget('与以利亚·霍尔姆斯交谈', partyNames);
    expect(r).toBeNull();
  });

  it('partyNames 为空 → 任何输入都返回 null', () => {
    expect(parseAttackTarget('攻击 以利亚·霍尔姆斯', [])).toBeNull();
  });

  it('队友名包含特殊正则字符（点号）能正确匹配', () => {
    const r = parseAttackTarget('攻击 以利亚·霍尔姆斯', ['以利亚·霍尔姆斯']);
    expect(r).toEqual({ kind: 'attack', targetName: '以利亚·霍尔姆斯' });
  });

  it('多名队友时，优先匹配更长的名字（防短名前缀误命中）', () => {
    const r = parseAttackTarget('攻击 约翰·肯特', ['约翰', '约翰·肯特']);
    expect(r).toEqual({ kind: 'attack', targetName: '约翰·肯特' });
  });
});
