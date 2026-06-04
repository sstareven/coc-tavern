import { describe, it, expect, beforeEach } from 'vitest';
import { buildCharacterVariables } from './character-variables';
import { useCharSheetStore } from '../stores/useCharSheetStore';

describe('buildCharacterVariables', () => {
  beforeEach(() => {
    // Reset store to known state with skills
    useCharSheetStore.setState({
      sheet: {
        ...useCharSheetStore.getState().sheet,
        skills: {
          '话术': { base: 5, current: 5 },
          '侦查': { base: 25, current: 40 },
          '图书馆使用': { base: 20, current: 60 },
        },
      },
    });
  });

  describe('skill variables', () => {
    it('includes skill entries with 调查员.技能 prefix', () => {
      const vars = buildCharacterVariables();
      expect(vars['调查员.技能.话术']).toBe('5');
      expect(vars['调查员.技能.侦查']).toBe('40');
      expect(vars['调查员.技能.图书馆使用']).toBe('60');
    });

    it('uses current value, not base', () => {
      const vars = buildCharacterVariables();
      // 侦查: base=25, current=40 → should be '40'
      expect(vars['调查员.技能.侦查']).toBe('40');
    });

    it('handles empty skills gracefully', () => {
      useCharSheetStore.setState({
        sheet: { ...useCharSheetStore.getState().sheet, skills: {} },
      });
      const vars = buildCharacterVariables();
      const skillKeys = Object.keys(vars).filter((k) => k.startsWith('调查员.技能.'));
      expect(skillKeys).toHaveLength(0);
    });
  });
});