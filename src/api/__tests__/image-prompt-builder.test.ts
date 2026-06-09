import { describe, it, expect } from 'vitest';
import { buildImageRenderContext } from '../image-prompt-builder';
import type { BookPage, CharacterSheet } from '../../types';

const basePage: BookPage = {
  id: 'p1',
  leftPage: 1, rightPage: 2,
  leftHeader: '', leftContent: '叙事内容...',
  rightHeader: '', rightContent: '', choices: [],
  npcUpdates: [
    { name: '埃伦娜', isPresent: true, importance: '重要', innerThoughts: '' },
    { name: '路人甲', isPresent: true, importance: '路人', innerThoughts: '' },
  ],
} as any as BookPage;

const baseSheet: CharacterSheet = {
  identity: { name: '调查员·林', occupation: '', age: 30, gender: '男', birthplace: '', residence: '', id: 'p' },
  secondary: { san: { current: 55, max: 99 }, hp: { current: 10, max: 10 }, mp: { current: 5, max: 5 }, luck: 50, mov: 8, db: '', build: 0 },
} as any as CharacterSheet;

describe('buildImageRenderContext — outfit join', () => {
  it('无 opts 时 characters 只有名字,outfit 字段不出', () => {
    const ctx = buildImageRenderContext(basePage, baseSheet);
    expect(ctx.characters).toEqual([
      { name: '调查员·林' },
      { name: '埃伦娜' },
    ]);
  });

  it('opts.investigatorOutfit + npcOutfitByName 注入', () => {
    const ctx = buildImageRenderContext(basePage, baseSheet, {
      investigatorOutfit: '灰大衣,手持油灯',
      npcOutfitByName: new Map([['埃伦娜', '白衬衫沾血']]),
    });
    expect(ctx.characters).toEqual([
      { name: '调查员·林', outfit: '灰大衣,手持油灯' },
      { name: '埃伦娜', outfit: '白衬衫沾血' },
    ]);
  });

  it('npcOutfitByName 命中部分 NPC,未命中的不挂 outfit', () => {
    const ctx = buildImageRenderContext(basePage, baseSheet, {
      npcOutfitByName: new Map([['张三', 'x']]),
    });
    expect(ctx.characters).toEqual([
      { name: '调查员·林' },
      { name: '埃伦娜' },
    ]);
  });

  it('路人 NPC 仍被 pickPresentImportantNpcNames 过滤掉', () => {
    const ctx = buildImageRenderContext(basePage, baseSheet);
    expect(ctx.characters?.find((c) => c.name === '路人甲')).toBeUndefined();
  });

  it('sheetSnapshot 缺失时调查员不入列', () => {
    const ctx = buildImageRenderContext(basePage, undefined, {
      npcOutfitByName: new Map([['埃伦娜', 'x']]),
    });
    expect(ctx.characters?.[0]?.name).toBe('埃伦娜');
  });
});
