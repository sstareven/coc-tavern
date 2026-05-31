import { describe, it, expect } from 'vitest';
import { applyCharsheetRedirect, isCharsheetPath } from './mvu-charsheet-redirect';
import type { CharacterSheet } from '../types';

function sheet(): CharacterSheet {
  return {
    characteristics: { 力量: 50 },
    secondary: { hp: { current: 10, max: 12 }, san: { current: 60, max: 80 }, mp: { current: 8, max: 8 }, luck: 55 },
    skills: { 侦查: { base: 25, current: 40 } },
    identity: { name: '调查员', occupation: '记者', age: 30, gender: '男', residence: '', birthplace: '' },
    greeting: '', description: '', personality: '', scenario: '', personaDescription: '',
  } as unknown as CharacterSheet;
}

describe('isCharsheetPath', () => {
  it('调查员.* 路径归角色卡', () => {
    expect(isCharsheetPath('调查员.生命值.当前')).toBe(true);
    expect(isCharsheetPath('调查员.技能.侦查')).toBe(true);
  });
  it('非调查员路径不归角色卡', () => {
    expect(isCharsheetPath('世界.时间')).toBe(false);
    expect(isCharsheetPath('剧情.阶段')).toBe(false);
  });
});

describe('applyCharsheetRedirect — replace', () => {
  it('生命值.当前 写入 secondary.hp.current', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.生命值.当前', 'replace', 8);
    expect(next?.secondary.hp.current).toBe(8);
  });
  it('理智值.当前 写入 san.current,数字字符串强转', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.理智值.当前', 'replace', '45');
    expect(next?.secondary.san.current).toBe(45);
  });
  it('幸运 写入 secondary.luck', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.幸运', 'replace', 70);
    expect(next?.secondary.luck).toBe(70);
  });
  it('技能.侦查 写入 skills.侦查.current', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.技能.侦查', 'replace', 55);
    expect(next?.skills.侦查.current).toBe(55);
  });
  it('未知技能 → 新建 skill(current=value, base=0)', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.技能.攀爬', 'replace', 30);
    expect(next?.skills.攀爬).toEqual({ base: 0, current: 30 });
  });
});

describe('applyCharsheetRedirect — delta', () => {
  it('生命值.当前 delta -3', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.生命值.当前', 'delta', -3);
    expect(next?.secondary.hp.current).toBe(7);
  });
  it('理智值.当前 delta -5(数字字符串)', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.理智值.当前', 'delta', '-5');
    expect(next?.secondary.san.current).toBe(55);
  });
  it('技能 delta', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.技能.侦查', 'delta', 10);
    expect(next?.skills.侦查.current).toBe(50);
  });
});

describe('applyCharsheetRedirect — 不可识别 / 不可写', () => {
  it('未知调查员子路径 → 返回 null(不消费,留给 statData/告警)', () => {
    expect(applyCharsheetRedirect(sheet(), '调查员.未知字段', 'replace', 1)).toBeNull();
  });
  it('remove/insert/move 对角色卡数值无意义 → 返回 null', () => {
    expect(applyCharsheetRedirect(sheet(), '调查员.生命值.当前', 'remove', undefined)).toBeNull();
  });
  it('非数字 value 的 replace → 返回 null(角色卡数值字段只接受数字)', () => {
    expect(applyCharsheetRedirect(sheet(), '调查员.生命值.当前', 'replace', '不是数字')).toBeNull();
  });
});
