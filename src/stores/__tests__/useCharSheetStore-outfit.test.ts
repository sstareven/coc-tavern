import { describe, it, expect, beforeEach } from 'vitest';
import { useCharSheetStore } from '../useCharSheetStore';

describe('useCharSheetStore.setOutfit', () => {
  beforeEach(() => {
    useCharSheetStore.getState().reset();
  });

  it('设 outfit 后 sheet.outfit 拿到值', () => {
    useCharSheetStore.getState().setOutfit('灰大衣,手持油灯');
    expect(useCharSheetStore.getState().sheet.outfit).toBe('灰大衣,手持油灯');
  });

  it('空字符串视为删除字段', () => {
    useCharSheetStore.getState().setOutfit('x');
    useCharSheetStore.getState().setOutfit('');
    expect(useCharSheetStore.getState().sheet.outfit).toBeUndefined();
  });

  it('reset 清空 outfit', () => {
    useCharSheetStore.getState().setOutfit('x');
    useCharSheetStore.getState().reset();
    expect(useCharSheetStore.getState().sheet.outfit).toBeUndefined();
  });
});
