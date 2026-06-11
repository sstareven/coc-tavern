import { describe, it, expect } from 'vitest';
import {
  COC_TOMES,
  findTome,
  readingProgress,
  buildTomeCatalogSummary,
} from './coc-tomes';

// ============================================================
// COC_TOMES data integrity
// ============================================================
describe('COC_TOMES', () => {
  it('contains exactly 8 tomes', () => {
    expect(COC_TOMES).toHaveLength(8);
  });

  it('every tome has positive readingWeeks and mythosGain', () => {
    for (const t of COC_TOMES) {
      expect(t.readingWeeks).toBeGreaterThan(0);
      expect(t.mythosGain).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// findTome
// ============================================================
describe('findTome', () => {
  it('finds tome by exact name', () => {
    expect(findTome('死灵之书')?.name).toBe('死灵之书');
    expect(findTome('黄衣之王')?.name).toBe('黄衣之王');
    expect(findTome('无名邪教')?.name).toBe('无名邪教');
  });

  it('finds tome by prefix', () => {
    expect(findTome('死灵')?.name).toBe('死灵之书');
    expect(findTome('塞拉伊诺')?.name).toBe('塞拉伊诺断章');
  });

  it('returns undefined for unknown tome', () => {
    expect(findTome('不存在的书')).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(findTome('  梦境秘典  ')?.name).toBe('梦境秘典');
  });
});

// ============================================================
// readingProgress
// ============================================================
describe('readingProgress', () => {
  it('returns 0 when no weeks spent', () => {
    expect(readingProgress(0, 36)).toBe(0);
  });

  it('returns 100 when all weeks completed', () => {
    expect(readingProgress(36, 36)).toBe(100);
  });

  it('returns 50 at halfway', () => {
    expect(readingProgress(18, 36)).toBe(50);
  });

  it('clamps to 100 when over-reading', () => {
    expect(readingProgress(50, 36)).toBe(100);
  });

  it('returns 100 when totalWeeks is 0', () => {
    expect(readingProgress(5, 0)).toBe(100);
  });

  it('returns 0 for negative weeksSpent', () => {
    expect(readingProgress(-3, 10)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    // 1/3 = 33.33... → 33
    expect(readingProgress(1, 3)).toBe(33);
    // 2/3 = 66.66... → 67
    expect(readingProgress(2, 3)).toBe(67);
  });
});

// ============================================================
// buildTomeCatalogSummary
// ============================================================
describe('buildTomeCatalogSummary', () => {
  it('starts with header', () => {
    const summary = buildTomeCatalogSummary();
    expect(summary.startsWith('【神话典籍目录】')).toBe(true);
  });

  it('contains all 8 tome names', () => {
    const summary = buildTomeCatalogSummary();
    for (const t of COC_TOMES) {
      expect(summary).toContain(t.name);
    }
  });

  it('contains language and weeks info for each tome', () => {
    const summary = buildTomeCatalogSummary();
    expect(summary).toContain('拉丁语, 36周');
    expect(summary).toContain('法语, 2周');
    expect(summary).toContain('德语, 8周');
  });

  it('contains mythos gain values', () => {
    const summary = buildTomeCatalogSummary();
    expect(summary).toContain('神话+15');
    expect(summary).toContain('神话+5');
    expect(summary).toContain('神话+9');
  });
});
