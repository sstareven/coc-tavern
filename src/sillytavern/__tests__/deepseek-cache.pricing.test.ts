import { describe, it, expect } from 'vitest';
import { inferModelTier, estimateCostCNY, DEEPSEEK_PRICES } from '../deepseek-cache';

describe('inferModelTier — 模型名识别 flash / pro', () => {
  it('明确 flash 名 → flash', () => {
    expect(inferModelTier('deepseek-v4-flash')).toBe('flash');
    expect(inferModelTier('deepseek-v3-flash')).toBe('flash');
    expect(inferModelTier('DeepSeek-V4-Flash')).toBe('flash'); // 大小写不敏感
  });

  it('明确 pro / 非 flash 名 → pro', () => {
    expect(inferModelTier('deepseek-v4-pro')).toBe('pro');
    expect(inferModelTier('deepseek-chat')).toBe('pro');
    expect(inferModelTier('deepseek-reasoner')).toBe('pro');
  });

  it('未知 / 空 / undefined → pro（保守，避免少报费用）', () => {
    expect(inferModelTier('')).toBe('pro');
    expect(inferModelTier('unknown-model')).toBe('pro');
    expect(inferModelTier(undefined)).toBe('pro');
  });
});

describe('DEEPSEEK_PRICES — 新价格表（2026 标准）', () => {
  it('flash: cacheHit 0.02 / cacheMiss 1 / output 2 元每百万 tokens', () => {
    expect(DEEPSEEK_PRICES.flash).toEqual({ cacheHit: 0.02, cacheMiss: 1, output: 2 });
  });
  it('pro: cacheHit 0.025 / cacheMiss 3 / output 6 元每百万 tokens', () => {
    expect(DEEPSEEK_PRICES.pro).toEqual({ cacheHit: 0.025, cacheMiss: 3, output: 6 });
  });
});

describe('estimateCostCNY — 按 model 走对应费率', () => {
  it('1M flash 全 cacheHit → ¥0.02', () => {
    expect(estimateCostCNY(1_000_000, 0, 0, 'deepseek-v4-flash')).toBeCloseTo(0.02, 6);
  });
  it('1M flash 全 cacheMiss → ¥1', () => {
    expect(estimateCostCNY(0, 1_000_000, 0, 'deepseek-v4-flash')).toBeCloseTo(1, 6);
  });
  it('1M flash 全 output → ¥2', () => {
    expect(estimateCostCNY(0, 0, 1_000_000, 'deepseek-v4-flash')).toBeCloseTo(2, 6);
  });

  it('1M pro 全 cacheHit → ¥0.025', () => {
    expect(estimateCostCNY(1_000_000, 0, 0, 'deepseek-v4-pro')).toBeCloseTo(0.025, 6);
  });
  it('1M pro 全 cacheMiss → ¥3', () => {
    expect(estimateCostCNY(0, 1_000_000, 0, 'deepseek-v4-pro')).toBeCloseTo(3, 6);
  });
  it('1M pro 全 output → ¥6', () => {
    expect(estimateCostCNY(0, 0, 1_000_000, 'deepseek-v4-pro')).toBeCloseTo(6, 6);
  });

  it('model 未传 → 默认 pro 价（保守）', () => {
    expect(estimateCostCNY(0, 1_000_000, 0)).toBeCloseTo(3, 6);
  });

  it('混合 token 用量正确加权', () => {
    // 500k hit + 200k miss + 100k output (flash)
    // = 500_000 * 0.02 + 200_000 * 1 + 100_000 * 2 (per 1M)
    // = (10_000 + 200_000 + 200_000) / 1_000_000 = 0.41 元
    expect(estimateCostCNY(500_000, 200_000, 100_000, 'deepseek-v4-flash')).toBeCloseTo(0.41, 4);
  });
});
