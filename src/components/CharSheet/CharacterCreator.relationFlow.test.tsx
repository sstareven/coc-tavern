import { describe, it, expect } from 'vitest';
import { STEPS } from '../../sillytavern/coc-data';

describe('CharCreator 关系步可跳过', () => {
  it('关系步在确认创建之前 - 流程为 1..5(背景) → 6(关系) → 7(确认)', () => {
    const relIdx = STEPS.indexOf('关系');
    const confirmIdx = STEPS.indexOf('确认创建');
    expect(relIdx).toBeGreaterThan(STEPS.indexOf('背景故事'));
    expect(confirmIdx).toBe(STEPS.length - 1);
    expect(relIdx).toBe(confirmIdx - 1);
  });
});
