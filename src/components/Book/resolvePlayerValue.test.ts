import { describe, it, expect } from 'vitest';
import { resolvePlayerValue, isKnownCheckTarget } from './resolvePlayerValue';
import type { CharacterSheet } from '../../types';

const mockSheet: CharacterSheet = {
  characteristics: { STR: 70, CON: 50, POW: 80, DEX: 65, APP: 45, SIZ: 55, INT: 75, EDU: 70 },
  halfFifth: {
    STR: { half: 35, fifth: 14 },
    CON: { half: 25, fifth: 10 },
    POW: { half: 40, fifth: 16 },
    DEX: { half: 32, fifth: 13 },
    APP: { half: 22, fifth: 9 },
    SIZ: { half: 27, fifth: 11 },
    INT: { half: 37, fifth: 15 },
    EDU: { half: 35, fifth: 14 },
  },
  secondary: {
    hp: { current: 11, max: 11 },
    san: { current: 80, max: 80 },
    mp: { current: 16, max: 16 },
    luck: 50,
    mov: 8,
    db: '0',
    build: 0,
  },
  skills: {
    '图书馆使用': { base: 20, current: 60 },
    '侦查': { base: 25, current: 50 },
  },
  identity: {
    name: 'Test Investigator',
    occupation: 'Professor',
    age: 35,
    gender: 'Male',
    birthplace: 'Boston',
    residence: 'Arkham',
    id: 'test-001',
  },
  description: 'A test character for unit testing.',
  posture: '站立',
  statusConditions: [],
  dailySanLoss: 0,
  temporaryInsanity: { active: false, roundsLeft: 0 },
  indefiniteInsanity: { active: false, daysLeft: 0 },
  permanentInsanity: false,
  phobias: [],
  manias: [],
  known_spells: [],
  recovery: {},
};

describe('resolvePlayerValue', () => {
  // Characteristic lookups
  it('returns STR characteristic for 力量', () => {
    expect(resolvePlayerValue('力量', mockSheet)).toEqual({ base: 70, current: 70 });
  });

  it('returns CON characteristic for 体质', () => {
    expect(resolvePlayerValue('体质', mockSheet)).toEqual({ base: 50, current: 50 });
  });

  it('returns POW characteristic for 意志', () => {
    expect(resolvePlayerValue('意志', mockSheet)).toEqual({ base: 80, current: 80 });
  });

  it('returns DEX characteristic for 敏捷', () => {
    expect(resolvePlayerValue('敏捷', mockSheet)).toEqual({ base: 65, current: 65 });
  });

  it('returns APP characteristic for 外貌', () => {
    expect(resolvePlayerValue('外貌', mockSheet)).toEqual({ base: 45, current: 45 });
  });

  it('returns SIZ characteristic for 体型', () => {
    expect(resolvePlayerValue('体型', mockSheet)).toEqual({ base: 55, current: 55 });
  });

  it('returns INT characteristic for 智力', () => {
    expect(resolvePlayerValue('智力', mockSheet)).toEqual({ base: 75, current: 75 });
  });

  it('returns EDU characteristic for 教育', () => {
    expect(resolvePlayerValue('教育', mockSheet)).toEqual({ base: 70, current: 70 });
  });

  // Skill lookups
  it('returns skill value for 图书馆使用', () => {
    expect(resolvePlayerValue('图书馆使用', mockSheet)).toEqual({ base: 20, current: 60 });
  });

  it('returns skill value for 侦查', () => {
    expect(resolvePlayerValue('侦查', mockSheet)).toEqual({ base: 25, current: 50 });
  });

  // 已废弃 SKILL_ALIASES（一刀切规则书 canonical）——「快速交谈」不再归一，「话术」是 canonical 名直接查。
  it('canonical 名「话术」直接命中(Fast Talk base 5,无加点)', () => {
    expect(resolvePlayerValue('话术', mockSheet)).toEqual({ base: 5, current: 5 });
  });

  // Secondary stats — 幸运 / 理智(SAN) live in secondary, not skills
  it('returns luck for 幸运 (regression: was falling back to 1)', () => {
    expect(resolvePlayerValue('幸运', mockSheet)).toEqual({ base: 50, current: 50 });
  });

  it('returns luck for 幸运值 alias', () => {
    expect(resolvePlayerValue('幸运值', mockSheet)).toEqual({ base: 50, current: 50 });
  });

  it('returns current/max SAN for 理智', () => {
    expect(resolvePlayerValue('理智', mockSheet)).toEqual({ base: 80, current: 80 });
  });

  it('returns current/max SAN for SAN alias', () => {
    expect(resolvePlayerValue('SAN', mockSheet)).toEqual({ base: 80, current: 80 });
  });

  // Derived-base skills not allocated by player — must compute from characteristics, not fall to 1
  it('returns DEX/2 for 闪避 when not in sheet.skills (regression: was 1)', () => {
    // DEX 65 → floor(65/2) = 32
    expect(resolvePlayerValue('闪避', mockSheet)).toEqual({ base: 32, current: 32 });
  });

  it('returns EDU for 语言(母语) when not in sheet.skills (regression: was 1)', () => {
    // EDU 70
    expect(resolvePlayerValue('语言(母语)', mockSheet)).toEqual({ base: 70, current: 70 });
  });

  it('uses allocated skill current value over computed base', () => {
    // 侦查 is in sheet.skills with current 50, base 25
    expect(resolvePlayerValue('侦查', mockSheet)).toEqual({ base: 25, current: 50 });
  });

  // SKILL_ALIASES 已清空——下列「正向」用例确认 canonical 名仍直接命中。
  it('canonical「闪避」(DEX/2) 直接命中', () => {
    expect(resolvePlayerValue('闪避', mockSheet)).toEqual({ base: 32, current: 32 });
  });

  it('canonical「语言(母语)」直接命中(EDU)', () => {
    expect(resolvePlayerValue('语言(母语)', mockSheet)).toEqual({ base: 70, current: 70 });
  });

  it('canonical「射击(手枪)」直接命中(未加点取基础值 20)', () => {
    expect(resolvePlayerValue('射击(手枪)', mockSheet)).toEqual({ base: 20, current: 20 });
  });

  it('两侧空白被 trim', () => {
    expect(resolvePlayerValue('  侦查  ', mockSheet)).toEqual({ base: 25, current: 50 });
  });

  // Unknown skill fallback
  it('returns base value for unknown skill from ALL_SKILLS', () => {
    // This test assumes ALL_SKILLS has a skill with base value
    // If not found, it should return {base: 1, current: 1}
    expect(resolvePlayerValue('未知技能', mockSheet)).toEqual({ base: 1, current: 1 });
  });
});

// 专精技能容错（regression: 科学(生物学) 等带括号专精被算成目标值 1）
describe('resolvePlayerValue — 专精技能名容错', () => {
  const withSci = (skills: CharacterSheet['skills']): CharacterSheet => ({ ...mockSheet, skills });

  it('精确命中带括号专精 key', () => {
    expect(resolvePlayerValue('科学(生物学)', withSci({ '科学(生物学)': { base: 1, current: 60 } }))).toEqual({ base: 1, current: 60 });
  });

  it('全角括号查询归一到半角 key', () => {
    expect(resolvePlayerValue('科学（生物学）', withSci({ '科学(生物学)': { base: 1, current: 60 } }))).toEqual({ base: 1, current: 60 });
  });

  it('查询带专精但卡里只存裸名 → 退裸名取值（regression: 曾返回 1）', () => {
    expect(resolvePlayerValue('科学(生物学)', withSci({ '科学': { base: 1, current: 55 } }))).toEqual({ base: 1, current: 55 });
  });

  it('查询裸名但卡里是唯一同前缀专精 → 命中该专精', () => {
    expect(resolvePlayerValue('科学', withSci({ '科学(生物学)': { base: 1, current: 60 } }))).toEqual({ base: 1, current: 60 });
  });

  it('同前缀多个专精 → 歧义不猜，落基础值', () => {
    const r = resolvePlayerValue('科学', withSci({ '科学(生物学)': { base: 1, current: 60 }, '科学(化学)': { base: 1, current: 40 } }));
    expect(r).toEqual({ base: 1, current: 1 });
  });
});

describe('isKnownCheckTarget — 拦截非技能检定目标（如「魔法值消耗」）', () => {
  it('属性名 → true', () => {
    expect(isKnownCheckTarget('力量', mockSheet)).toBe(true);
  });
  it('副属性（幸运/理智）→ true', () => {
    expect(isKnownCheckTarget('幸运', mockSheet)).toBe(true);
    expect(isKnownCheckTarget('理智', mockSheet)).toBe(true);
  });
  it('角色卡已有技能 → true', () => {
    expect(isKnownCheckTarget('图书馆使用', mockSheet)).toBe(true);
  });
  it('标准技能表中的技能（即便角色卡未列）→ true', () => {
    expect(isKnownCheckTarget('侦查', mockSheet)).toBe(true);
    expect(isKnownCheckTarget('话术', mockSheet)).toBe(true);
  });
  it('别名表已清空——查未在 ALL_SKILLS 中的口语词「侦察」→ false（不再有 SKILL_ALIASES 归一）', () => {
    expect(isKnownCheckTarget('侦察', mockSheet)).toBe(false);
    expect(isKnownCheckTarget('图书馆', mockSheet)).toBe(false);
  });
  it('信用评级 → true（已纳入 ALL_SKILLS，作为生活系 base 0 技能）', () => {
    expect(isKnownCheckTarget('信用评级', mockSheet)).toBe(true);
  });
  it('专精技能（角色卡裸名）→ true', () => {
    const sheet = { ...mockSheet, skills: { ...mockSheet.skills, '科学': { base: 1, current: 55 } } };
    expect(isKnownCheckTarget('科学(生物学)', sheet)).toBe(true);
  });
  it('「魔法值消耗」等非技能词 → false（核心：不应被当技能检定）', () => {
    expect(isKnownCheckTarget('魔法值消耗', mockSheet)).toBe(false);
    expect(isKnownCheckTarget('魔法值', mockSheet)).toBe(false);
    expect(isKnownCheckTarget('魔法消耗', mockSheet)).toBe(false);
    expect(isKnownCheckTarget('随便编的检定', mockSheet)).toBe(false);
  });
});