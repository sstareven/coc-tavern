import { describe, it, expect, beforeEach } from 'vitest';
import { useCharSheetStore, defaultSheet, isDefaultSheet, migrateSheet } from './useCharSheetStore';
import type { CharacterSheet } from '../types';

function makePopulatedSheet(): CharacterSheet {
  return {
    ...defaultSheet,
    characteristics: { ...defaultSheet.characteristics, STR: 50, CON: 60 },
    skills: { 侦查: { base: 25, current: 25 } },
    identity: { ...defaultSheet.identity, name: '亚瑟·彭德拉贡' },
  };
}

describe('useCharSheetStore.reset', () => {
  beforeEach(() => useCharSheetStore.getState().setSheet(makePopulatedSheet()));

  it('reset() 把 sheet 还原为 defaultSheet', () => {
    expect(useCharSheetStore.getState().sheet.identity.name).toBe('亚瑟·彭德拉贡');
    useCharSheetStore.getState().reset();
    expect(useCharSheetStore.getState().sheet).toEqual(defaultSheet);
  });
});

describe('isDefaultSheet', () => {
  it('对默认空 sheet 返回 true', () => {
    expect(isDefaultSheet(defaultSheet)).toBe(true);
  });

  it('对已填充 sheet 返回 false', () => {
    expect(isDefaultSheet(makePopulatedSheet())).toBe(false);
  });
});

describe('migrateSheet', () => {
  it('undefined 输入返回 defaultSheet 的等价值（含预留字段默认值）', () => {
    const m = migrateSheet(undefined);
    expect(m.characteristics).toEqual(defaultSheet.characteristics);
    expect(m.halfFifth).toEqual(defaultSheet.halfFifth);
    expect(m.secondary).toEqual(defaultSheet.secondary);
    expect(m.skills).toEqual({});
    expect(m.identity.name).toBe('');
    expect(m.dailySanLoss).toBe(0);
    expect(m.temporaryInsanity).toEqual({ active: false, roundsLeft: 0 });
    expect(m.indefiniteInsanity).toEqual({ active: false, daysLeft: 0 });
    expect(m.permanentInsanity).toBe(false);
    expect(m.phobias).toEqual([]);
    expect(m.manias).toEqual([]);
    expect(m.known_spells).toEqual([]);
    expect(m.recovery).toEqual({});
    expect(m.posture).toBe('站立');
    expect(m.statusConditions).toEqual([]);
  });

  it('保留已存在字段并补齐缺失字段', () => {
    const legacy = {
      characteristics: { STR: 70, CON: 60, POW: 50, DEX: 65, APP: 55, SIZ: 60, INT: 75, EDU: 80 },
      identity: { name: '亚瑟', occupation: '记者', age: 30, gender: '男', birthplace: '伦敦', residence: '阿卡姆', id: 'inv-1' },
      skills: { 侦查: { base: 25, current: 50 } },
    } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(legacy);
    expect(m.identity.name).toBe('亚瑟');
    expect(m.characteristics.STR).toBe(70);
    expect(m.skills.侦查).toEqual({ base: 25, current: 50, ticked: false });
    expect(m.dailySanLoss).toBe(0);
    expect(m.phobias).toEqual([]);
    expect(m.recovery).toEqual({});
    expect(m.posture).toBe('站立');
    expect(m.statusConditions).toEqual([]);
  });

  it('已含部分新字段时透传不覆盖', () => {
    const legacy = {
      dailySanLoss: 12,
      phobias: ['幽闭恐惧症'],
      known_spells: ['萎缩术'],
      temporaryInsanity: { active: true, roundsLeft: 3, bout: { mode: 'realtime', table: 'VII', entry: '失忆' } },
      indefiniteInsanity: { active: true, daysLeft: 45 },
      permanentInsanity: true,
      recovery: { hpRegenAtMs: 1700000000000, sanRegenAtMs: 1700000100000 },
    } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(legacy);
    expect(m.dailySanLoss).toBe(12);
    expect(m.phobias).toEqual(['幽闭恐惧症']);
    expect(m.known_spells).toEqual(['萎缩术']);
    expect(m.temporaryInsanity).toEqual({ active: true, roundsLeft: 3, bout: { mode: 'realtime', table: 'VII', entry: '失忆' } });
    expect(m.indefiniteInsanity).toEqual({ active: true, daysLeft: 45 });
    expect(m.permanentInsanity).toBe(true);
    expect(m.recovery).toEqual({ hpRegenAtMs: 1700000000000, sanRegenAtMs: 1700000100000 });
  });

  it('中文键的 legacy characteristics 被丢弃，STR/... 回落 0', () => {
    const legacy = { characteristics: { 力量: 50 } } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(legacy);
    expect(m.characteristics.STR).toBe(0);
    expect((m.characteristics as Record<string, unknown>)['力量']).toBeUndefined();
  });

  it('部分 halfFifth/secondary 被 per-key 深合并而非整体丢失', () => {
    const legacy = {
      halfFifth: { STR: { half: 35, fifth: 14 } },
      secondary: { hp: { current: 8, max: 11 }, luck: 55 },
    } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(legacy);
    expect(m.halfFifth.STR).toEqual({ half: 35, fifth: 14 });
    expect(m.halfFifth.CON).toEqual({ half: 0, fifth: 0 });
    expect(m.secondary.hp).toEqual({ current: 8, max: 11 });
    expect(m.secondary.san).toEqual({ current: 0, max: 0 });
    expect(m.secondary.luck).toBe(55);
    expect(m.secondary.db).toBe('0');
  });

  it('防御性：phobias 若为字符串而非数组则丢弃，回落空数组', () => {
    const legacy = { phobias: '幽闭恐惧症' as unknown as string[] } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(legacy);
    expect(m.phobias).toEqual([]);
  });

  it('skills without `ticked` get ticked:false injected by migrateSheet', () => {
    const partial = {
      skills: { 侦查: { base: 25, current: 25 }, 急救: { base: 30, current: 30 } },
    } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(partial);
    expect(m.skills['侦查'].ticked).toBe(false);
    expect(m.skills['急救'].ticked).toBe(false);
  });

  it('skills with existing ticked:true preserve it through migrateSheet', () => {
    const partial = {
      skills: { 心理学: { base: 10, current: 50, ticked: true } },
    } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(partial);
    expect(m.skills['心理学'].ticked).toBe(true);
  });

  it('malformed bout (string instead of object) is dropped without crashing', () => {
    const partial = {
      temporaryInsanity: { active: true, roundsLeft: 3, bout: 'failure-of-memory' as unknown },
    } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(partial);
    expect(m.temporaryInsanity.active).toBe(true);
    expect(m.temporaryInsanity.roundsLeft).toBe(3);
    expect(m.temporaryInsanity.bout).toBeUndefined();
  });

  it('malformed bout (partial object missing mode/table) is dropped', () => {
    const partial = {
      temporaryInsanity: { active: true, roundsLeft: 5, bout: { entry: 'panic' } as unknown },
    } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(partial);
    expect(m.temporaryInsanity.bout).toBeUndefined();
  });
});
