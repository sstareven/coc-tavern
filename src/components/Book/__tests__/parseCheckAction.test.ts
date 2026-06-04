// BUG4: parseCheckAction 兼容前缀难度 / 无括号 / 全角括号漂移格式 + cleanChoiceField 归一化
import { describe, it, expect, beforeAll } from 'vitest';
import { cleanChoiceField } from '../../../sillytavern/llm-response-parser';
import { parseCheckAction } from '../RightPage';
import { useCharSheetStore } from '../../../stores/useCharSheetStore';
import type { CharacterSheet } from '../../../types';

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
    '侦查': { base: 25, current: 50 },
    '图书馆使用': { base: 20, current: 60 },
  },
  identity: {
    name: 'Test Investigator', occupation: 'Professor', age: 35, gender: 'Male',
    birthplace: 'Boston', residence: 'Arkham', id: 'test-001',
  },
  greeting: 'Hello',
  description: 'A test character.',
} as unknown as CharacterSheet;

beforeAll(() => {
  useCharSheetStore.getState().setSheet(mockSheet);
});

describe('BUG4 — cleanChoiceField 漂移格式归一化', () => {
  it('"进行<难度>XX检定" → "进行XX检定(<难度>)"（无括号前缀难度）', () => {
    expect(cleanChoiceField('进行极难智力检定')).toBe('进行智力检定(极难)');
    expect(cleanChoiceField('进行普通侦查检定')).toBe('进行侦查检定(普通)');
    expect(cleanChoiceField('进行困难图书馆使用检定')).toBe('进行图书馆使用检定(困难)');
  });

  it('"进行XX的<难度>检定" → "进行XX检定(<难度>)"', () => {
    expect(cleanChoiceField('进行智力的极难检定')).toBe('进行智力检定(极难)');
  });

  it('全角括号 → 半角括号（标准检定语法）', () => {
    expect(cleanChoiceField('进行智力检定（普通）')).toBe('进行智力检定(普通)');
    expect(cleanChoiceField('进行侦查检定（困难, 奖励骰）')).toBe('进行侦查检定(困难, 奖励骰)');
  });

  it('回归：合法对抗语法不被破坏', () => {
    // 力量对抗中"力量"是技能，要保护其后续 "对抗(对手目标值:N)" 结构
    expect(cleanChoiceField('进行力量对抗(对手目标值:45)')).toBe('进行力量对抗(对手目标值:45)');
  });

  it('回归：标准检定语法不被破坏', () => {
    expect(cleanChoiceField('进行智力检定(普通)')).toBe('进行智力检定(普通)');
    expect(cleanChoiceField('进行侦查检定(困难, 奖励骰)')).toBe('进行侦查检定(困难, 奖励骰)');
  });
});

describe('BUG4 — parseCheckAction Format4 兜底兼容', () => {
  it('识别前缀难度的无括号检定: 进行极难智力检定', () => {
    const r = parseCheckAction('进行极难智力检定');
    expect(r).toBeTruthy();
    expect(r?.skillName).toBe('智力');
    expect(r?.difficulty).toBe('极难');
    expect(r?.opposed).toBe(false);
  });

  it('识别前缀难度的无括号检定: 进行普通侦查检定', () => {
    const r = parseCheckAction('进行普通侦查检定');
    expect(r).toBeTruthy();
    expect(r?.skillName).toBe('侦查');
    expect(r?.difficulty).toBe('普通');
  });

  it('识别 进行XX的<难度>检定', () => {
    const r = parseCheckAction('进行智力的困难检定');
    expect(r).toBeTruthy();
    expect(r?.skillName).toBe('智力');
    expect(r?.difficulty).toBe('困难');
  });

  it('回归：标准带括号难度仍识别 (Format 2)', () => {
    const r = parseCheckAction('进行智力检定(困难)');
    expect(r).toBeTruthy();
    expect(r?.skillName).toBe('智力');
    expect(r?.difficulty).toBe('困难');
  });

  it('回归：力量对抗格式仍识别为 opposed，不会被 Format4 误吃', () => {
    const r = parseCheckAction('进行力量对抗(对手目标值:45)');
    expect(r).toBeTruthy();
    expect(r?.opposed).toBe(true);
    expect(r?.opponentTarget).toBe(45);
    expect(r?.skillName).toBe('力量');
  });

  it('未知技能不返回检定（防止 LLM 乱写吞掉选项）', () => {
    const r = parseCheckAction('进行魔法值消耗检定');
    expect(r).toBeNull();
  });
});
