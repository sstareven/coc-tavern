import { describe, it, expect } from 'vitest';
import { applyCharsheetRedirect } from '../mvu-charsheet-redirect';
import type { CharacterSheet } from '../../types';

// A3.3 — /调查员/技能/<name>/ticked 分支：
//   - replace true/false → 写 sheet.skills[name].ticked
//   - 未知技能（不在 sheet.skills）→ 返回 null（不造孤儿条目）
//   - 别名「手枪」归一到「枪械(手枪)」
//   - 非 replace 或非 boolean 值 → null

function baseSheet(): CharacterSheet {
  return {
    characteristics: { 力量: 50 },
    secondary: { hp: { current: 10, max: 12 }, san: { current: 60, max: 80 }, mp: { current: 8, max: 8 }, luck: 55, mov: 7, db: '0', build: 0 },
    skills: { 侦查: { base: 25, current: 40, ticked: false }, '射击(手枪)': { base: 20, current: 50, ticked: false } },
    identity: { name: '调查员', occupation: '记者', age: 30, gender: '男', residence: '', birthplace: '', id: '' },
    description: '', 
    posture: '站立', statusConditions: [],
    dailySanLoss: 0,
    temporaryInsanity: { active: false, roundsLeft: 0 },
    indefiniteInsanity: { active: false, daysLeft: 0 },
    permanentInsanity: false,
    phobias: [], manias: [], known_spells: [],
    recovery: {},
  } as unknown as CharacterSheet;
}

describe('A3.3 applyCharsheetRedirect — 调查员.技能.X.ticked 分支', () => {
  it('replace true → 技能 ticked=true', () => {
    const next = applyCharsheetRedirect(baseSheet(), '调查员.技能.侦查.ticked', 'replace', true);
    expect(next?.sheet.skills.侦查.ticked).toBe(true);
    expect(next?.sheet.skills.侦查.current).toBe(40);  // current 不变
    expect(next?.sheet.skills.侦查.base).toBe(25);
  });

  it('replace false → 技能 ticked=false（发展期清除用）', () => {
    const seeded = { ...baseSheet() };
    seeded.skills = { ...seeded.skills, 侦查: { ...seeded.skills.侦查, ticked: true } };
    const next = applyCharsheetRedirect(seeded, '调查员.技能.侦查.ticked', 'replace', false);
    expect(next?.sheet.skills.侦查.ticked).toBe(false);
  });

  it('未知技能 ticked → null（不造孤儿条目）', () => {
    expect(applyCharsheetRedirect(baseSheet(), '调查员.技能.不存在的技能.ticked', 'replace', true)).toBeNull();
  });

  it('全角括号「射击（手枪）.ticked」归一到半角「射击(手枪)」', () => {
    const next = applyCharsheetRedirect(baseSheet(), '调查员.技能.射击（手枪）.ticked', 'replace', true);
    expect(next?.sheet.skills['射击(手枪)'].ticked).toBe(true);
    // 没造出孤儿 '射击（手枪）' 键
    expect(next?.sheet.skills['射击（手枪）']).toBeUndefined();
  });

  it('delta/remove/insert op 不接受（ticked 只走 replace）', () => {
    expect(applyCharsheetRedirect(baseSheet(), '调查员.技能.侦查.ticked', 'delta', true)).toBeNull();
    expect(applyCharsheetRedirect(baseSheet(), '调查员.技能.侦查.ticked', 'remove', undefined)).toBeNull();
  });

  it('非布尔 value 拒绝（数字、对象、null）', () => {
    expect(applyCharsheetRedirect(baseSheet(), '调查员.技能.侦查.ticked', 'replace', 1)).toBeNull();
    expect(applyCharsheetRedirect(baseSheet(), '调查员.技能.侦查.ticked', 'replace', null)).toBeNull();
    expect(applyCharsheetRedirect(baseSheet(), '调查员.技能.侦查.ticked', 'replace', {})).toBeNull();
  });

  it('字符串 "true" / "false" 兼容（LLM 可能给字串）', () => {
    expect(applyCharsheetRedirect(baseSheet(), '调查员.技能.侦查.ticked', 'replace', 'true')?.sheet.skills.侦查.ticked).toBe(true);
    expect(applyCharsheetRedirect(baseSheet(), '调查员.技能.侦查.ticked', 'replace', 'false')?.sheet.skills.侦查.ticked).toBe(false);
  });
});
