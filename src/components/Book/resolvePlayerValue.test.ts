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

  // Unknown skill fallback
  it('returns base value for unknown skill from ALL_SKILLS', () => {
    // This test assumes ALL_SKILLS has a skill with base value
    // If not found, it should return {base: 1, current: 1}
    expect(resolvePlayerValue('未知技能', mockSheet)).toEqual({ base: 1, current: 1 });
  });
});