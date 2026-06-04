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
    expect(next?.sheet.secondary.hp.current).toBe(8);
  });
  it('理智值.当前 写入 san.current,数字字符串强转', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.理智值.当前', 'replace', '45');
    expect(next?.sheet.secondary.san.current).toBe(45);
  });
  it('幸运 写入 secondary.luck', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.幸运', 'replace', 70);
    expect(next?.sheet.secondary.luck).toBe(70);
  });
  it('技能.侦查 写入 skills.侦查.current', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.技能.侦查', 'replace', 55);
    expect(next?.sheet.skills.侦查.current).toBe(55);
  });
  it('未知技能 → 新建 skill(current=value, base=0, ticked=false)', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.技能.攀爬', 'replace', 30);
    expect(next?.sheet.skills.攀爬).toEqual({ base: 0, current: 30, ticked: false });
  });
});

describe('applyCharsheetRedirect — delta', () => {
  it('生命值.当前 delta -3', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.生命值.当前', 'delta', -3);
    expect(next?.sheet.secondary.hp.current).toBe(7);
  });
  it('理智值.当前 delta -5(数字字符串)', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.理智值.当前', 'delta', '-5');
    expect(next?.sheet.secondary.san.current).toBe(55);
  });
  it('技能 delta', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.技能.侦查', 'delta', 10);
    expect(next?.sheet.skills.侦查.current).toBe(50);
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

describe('applyCharsheetRedirect — 姿态 / 状态条件', () => {
  function s2(): CharacterSheet {
    return { ...sheet(), posture: '站立', statusConditions: [] } as CharacterSheet;
  }
  it('replace 姿态', () => {
    const next = applyCharsheetRedirect(s2(), '调查员.姿态', 'replace', '倒下');
    expect(next?.sheet.posture).toBe('倒下');
  });
  it('insert 状态条件（对象）', () => {
    const next = applyCharsheetRedirect(s2(), '调查员.状态条件', 'insert', { 名称: '身体着火', 严重度: 'severe', 描述: '全身燃烧' });
    expect(next?.sheet.statusConditions).toEqual([{ name: '身体着火', severity: 'severe', description: '全身燃烧' }]);
  });
  it('insert 同名状态覆盖旧的', () => {
    const base = { ...s2(), statusConditions: [{ name: '中毒', severity: 'minor' as const, description: '旧' }] } as CharacterSheet;
    const next = applyCharsheetRedirect(base, '调查员.状态条件', 'insert', { name: '中毒', severity: 'severe', description: '新' });
    expect(next?.sheet.statusConditions).toEqual([{ name: '中毒', severity: 'severe', description: '新' }]);
  });
  it('remove 单个状态条件', () => {
    const base = { ...s2(), statusConditions: [{ name: '中毒', severity: 'minor' as const, description: 'x' }, { name: '骨折', severity: 'moderate' as const, description: 'y' }] } as CharacterSheet;
    const next = applyCharsheetRedirect(base, '调查员.状态条件.中毒', 'remove', undefined);
    expect(next?.sheet.statusConditions).toEqual([{ name: '骨折', severity: 'moderate', description: 'y' }]);
  });
  it('replace 整个状态条件数组', () => {
    const next = applyCharsheetRedirect(s2(), '调查员.状态条件', 'replace', [{ 名称: '极度口渴', 描述: '需尽快补水' }]);
    expect(next?.sheet.statusConditions).toEqual([{ name: '极度口渴', severity: 'moderate', description: '需尽快补水' }]);
  });
});

describe('applyCharsheetRedirect — MVU 规则对齐(信用评级作技能 / 物品不落角色卡)', () => {
  it('调查员.技能.信用评级 → skills.信用评级.current(信用评级作为技能存储)', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.技能.信用评级', 'replace', 65);
    expect(next?.sheet.skills.信用评级.current).toBe(65);
  });
  it('调查员.物品栏 不落角色卡(返回 null；物品走 inventoryChanges 专用通路)', () => {
    expect(applyCharsheetRedirect(sheet(), '调查员.物品栏', 'insert', { 手电筒: {} })).toBeNull();
    expect(applyCharsheetRedirect(sheet(), '调查员.物品栏.手电筒', 'replace', {})).toBeNull();
  });
  it('调查员.信用评级 顶层路径不落角色卡(应改用 调查员.技能.信用评级)', () => {
    expect(applyCharsheetRedirect(sheet(), '调查员.信用评级', 'replace', 65)).toBeNull();
  });
});

describe('applyCharsheetRedirect — 技能写入键归一(别名/专精)', () => {
  it('别名「手枪」归一为规范键「枪械(手枪)」写入(不造孤儿键)', () => {
    const next = applyCharsheetRedirect(sheet(), '调查员.技能.手枪', 'replace', 50);
    expect(next?.sheet.skills['枪械(手枪)']).toEqual({ base: 0, current: 50, ticked: false });
    expect(next?.sheet.skills['手枪']).toBeUndefined();
  });
  it('裸名「格斗」命中角色卡已有专精键「格斗(斗殴)」', () => {
    const base = { ...sheet(), skills: { '格斗(斗殴)': { base: 25, current: 45 } } } as CharacterSheet;
    const next = applyCharsheetRedirect(base, '调查员.技能.格斗', 'delta', 10);
    expect(next?.sheet.skills['格斗(斗殴)'].current).toBe(55);
    expect(next?.sheet.skills['格斗']).toBeUndefined();
  });
  it('裸名唯一前缀命中已有专精(非别名表路径)：写「枪械」落到唯一的「枪械(手枪)」', () => {
    const base = { ...sheet(), skills: { '枪械(手枪)': { base: 20, current: 40 } } } as CharacterSheet;
    const next = applyCharsheetRedirect(base, '调查员.技能.枪械', 'delta', 5);
    expect(next?.sheet.skills['枪械(手枪)'].current).toBe(45);
    expect(next?.sheet.skills['枪械']).toBeUndefined();
  });
  it('裸名前缀歧义(多个同前缀专精)：回落规范名、建裸键(记录当前 hits>1 行为)', () => {
    const base = { ...sheet(), skills: {
      '枪械(手枪)': { base: 20, current: 40 },
      '枪械(步枪/霰弹枪)': { base: 25, current: 30 },
    } } as CharacterSheet;
    const next = applyCharsheetRedirect(base, '调查员.技能.枪械', 'replace', 50);
    expect(next?.sheet.skills['枪械']).toEqual({ base: 0, current: 50, ticked: false });
    expect(next?.sheet.skills['枪械(手枪)'].current).toBe(40); // 既有专精不受影响
  });
});

describe('applyCharsheetRedirect — 幸运钳制 0~99', () => {
  it('replace 越界上限夹到 99', () => {
    expect(applyCharsheetRedirect(sheet(), '调查员.幸运', 'replace', 150)?.sheet.secondary.luck).toBe(99);
  });
  it('delta 越界下限夹到 0', () => {
    expect(applyCharsheetRedirect(sheet(), '调查员.幸运', 'delta', -100)?.sheet.secondary.luck).toBe(0);
  });
});

describe('applyCharsheetRedirect — 状态条件 remove 容错', () => {
  function withConds(): CharacterSheet {
    return { ...sheet(), posture: '站立', statusConditions: [
      { name: '中毒', severity: 'minor' as const, description: 'x' },
      { name: '骨折', severity: 'moderate' as const, description: 'y' },
    ] } as CharacterSheet;
  }
  it('数组下标 remove /调查员/状态条件/0 删除第一条', () => {
    const next = applyCharsheetRedirect(withConds(), '调查员.状态条件.0', 'remove', undefined);
    expect(next?.sheet.statusConditions).toEqual([{ name: '骨折', severity: 'moderate', description: 'y' }]);
  });
  it('越界下标 remove 不误删（数组 2 条，删下标 9 → 仍 2 条）', () => {
    const next = applyCharsheetRedirect(withConds(), '调查员.状态条件.9', 'remove', undefined);
    expect(next?.sheet.statusConditions).toHaveLength(2);
  });
  it('状态名恰为纯数字时按名优先删(而非当下标)', () => {
    const base = { ...sheet(), posture: '站立', statusConditions: [
      { name: '1', severity: 'minor' as const, description: '诅咒计数' },
      { name: '骨折', severity: 'moderate' as const, description: 'y' },
    ] } as CharacterSheet;
    const next = applyCharsheetRedirect(base, '调查员.状态条件.1', 'remove', undefined);
    // 按名删名为'1'的条件，保留骨折（若误当下标 1 会错删骨折）
    expect(next?.sheet.statusConditions).toEqual([{ name: '骨折', severity: 'moderate', description: 'y' }]);
  });
});
