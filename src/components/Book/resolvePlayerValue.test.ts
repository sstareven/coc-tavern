import { describe, it, expect } from 'vitest';
import { resolvePlayerValue } from './resolvePlayerValue';
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
  greeting: 'Hello, I am a test investigator.',
  description: 'A test character for unit testing.',
  personality: 'Curious and methodical.',
  scenario: 'A mysterious case in Arkham.',
  personaDescription: 'A dedicated investigator of the unknown.',
  posture: '站立',
  statusConditions: [],
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

  // 别名归一：LLM 用「快速交谈」发起检定，须归一到规范技能名「话术」(Fast Talk, base 5)，
  // 否则落 fallback 致目标值≈0/1。
  it('归一 快速交谈 → 话术 (Fast Talk base 5)，不落 fallback', () => {
    expect(resolvePlayerValue('快速交谈', mockSheet)).toEqual({ base: 5, current: 5 });
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
  it('returns DEX/2 for 躲闪 when not in sheet.skills (regression: was 1)', () => {
    // DEX 65 → floor(65/2) = 32
    expect(resolvePlayerValue('躲闪', mockSheet)).toEqual({ base: 32, current: 32 });
  });

  it('returns EDU for 语言(母语) when not in sheet.skills (regression: was 1)', () => {
    // EDU 70
    expect(resolvePlayerValue('语言(母语)', mockSheet)).toEqual({ base: 70, current: 70 });
  });

  it('uses allocated skill current value over computed base', () => {
    // 侦查 is in sheet.skills with current 50, base 25
    expect(resolvePlayerValue('侦查', mockSheet)).toEqual({ base: 25, current: 50 });
  });

  // Alias normalization — LLM 口语/简称归一到精确名
  it('归一 闪避 → 躲闪 (DEX/2)', () => {
    expect(resolvePlayerValue('闪避', mockSheet)).toEqual({ base: 32, current: 32 });
  });

  it('归一 母语 → 语言(母语) (EDU)', () => {
    expect(resolvePlayerValue('母语', mockSheet)).toEqual({ base: 70, current: 70 });
  });

  it('归一 侦察(错别字) → 侦查 (用已加点的 current)', () => {
    expect(resolvePlayerValue('侦察', mockSheet)).toEqual({ base: 25, current: 50 });
  });

  it('归一 手枪 → 枪械(手枪) (未加点取基础值 20)', () => {
    expect(resolvePlayerValue('手枪', mockSheet)).toEqual({ base: 20, current: 20 });
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