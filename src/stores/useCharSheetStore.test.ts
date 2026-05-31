import { describe, it, expect, beforeEach } from 'vitest';
import { useCharSheetStore, defaultSheet, isDefaultSheet } from './useCharSheetStore';
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
