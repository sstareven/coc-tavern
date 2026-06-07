import { describe, it, expect } from 'vitest';
import { STEPS } from '../../sillytavern/coc-data';

describe('CharCreator 步骤扩展', () => {
  it('STEPS 增加【关系】到 7 项 - 关系位于背景故事与确认创建之间', () => {
    expect(STEPS).toHaveLength(7);
    expect(STEPS[4]).toBe('背景故事');
    expect(STEPS[5]).toBe('关系');
    expect(STEPS[6]).toBe('确认创建');
  });
});
