import { describe, it, expect } from 'vitest';
import type { DiceResultType } from '../types';
import { determineResult, d100, randD10, rollDiceExpr } from './dice-engine';

// ============================================================
// d100 组合测试
// ============================================================
describe('d100', () => {
  it('combines tens and ones into a d100 value', () => {
    expect(d100(3, 5)).toBe(35);
    expect(d100(0, 1)).toBe(1);
    expect(d100(9, 0)).toBe(90);
    expect(d100(5, 7)).toBe(57);
  });

  it('treats (0, 0) as 100', () => {
    expect(d100(0, 0)).toBe(100);
  });

  it('handles boundary (9, 9) → 99', () => {
    expect(d100(9, 9)).toBe(99);
  });
});

// ============================================================
// randD10 范围测试
// ============================================================
describe('randD10', () => {
  it('returns values in 0–9 range', () => {
    for (let i = 0; i < 100; i++) {
      const v = randD10();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});

// ============================================================
// determineResult — COC 7th 五级判定
// ============================================================
describe('determineResult', () => {
  // ── 大成功 ──
  describe('crit-success (大成功)', () => {
    it('roll=1 is always crit-success regardless of target', () => {
      expect(determineResult(1, 65, false)).toBe('crit-success');
      expect(determineResult(1, 30, false)).toBe('crit-success');
      expect(determineResult(1, 95, true)).toBe('crit-success');
    });

    it('roll=1 beats extreme-success when target/5 ≥ 1', () => {
      // target=5: fifth=1, roll=1 would match both crit-success and extreme-success
      // crit-success check (line 11) comes before extreme (line 12) → crit wins
      expect(determineResult(1, 5, false)).toBe('crit-success');
    });
  });

  // ── 大失败 ──
  describe('crit-failure (大失败)', () => {
    it('roll=100 is always crit-failure', () => {
      expect(determineResult(100, 65, false)).toBe('crit-failure');
      expect(determineResult(100, 30, true)).toBe('crit-failure');
      expect(determineResult(100, 95, false)).toBe('crit-failure');
    });

    it('SAN check: roll 96–99 → crit-failure', () => {
      expect(determineResult(96, 65, true)).toBe('crit-failure');
      expect(determineResult(97, 65, true)).toBe('crit-failure');
      expect(determineResult(98, 65, true)).toBe('crit-failure');
      expect(determineResult(99, 65, true)).toBe('crit-failure');
    });

    it('SAN check: roll 96 even on high target → crit-failure', () => {
      expect(determineResult(96, 80, true)).toBe('crit-failure');
      expect(determineResult(99, 95, true)).toBe('crit-failure');
    });

    it('non-SAN, target < 50: roll 96–99 → crit-failure', () => {
      expect(determineResult(96, 30, false)).toBe('crit-failure');
      expect(determineResult(97, 30, false)).toBe('crit-failure');
      expect(determineResult(99, 49, false)).toBe('crit-failure');
    });

    it('non-SAN, target=50: roll 96–99 → crit-failure (CoC7e p.88)', () => {
      expect(determineResult(96, 50, false)).toBe('crit-failure');
      expect(determineResult(99, 50, false)).toBe('crit-failure');
    });

    it('non-SAN, target > 50: roll 96–99 → failure (not crit-failure)', () => {
      expect(determineResult(97, 51, false)).toBe('failure');
      expect(determineResult(97, 65, false)).toBe('failure');
      expect(determineResult(99, 80, false)).toBe('failure');
    });
  });

  // ── 极难成功 ──
  describe('extreme-success (极难成功)', () => {
    it('roll ≤ target/5', () => {
      const t = 65; // fifth = 13
      expect(determineResult(2, t, false)).toBe('extreme-success');
      expect(determineResult(13, t, false)).toBe('extreme-success');
    });

    it('roll 14 > 13 → hard-success (not extreme)', () => {
      expect(determineResult(14, 65, false)).toBe('hard-success');
    });

    it('target=30: fifth=6', () => {
      expect(determineResult(6, 30, false)).toBe('extreme-success');
      expect(determineResult(7, 30, false)).toBe('hard-success');
    });
  });

  // ── 困难成功 ──
  describe('hard-success (困难成功)', () => {
    it('roll ≤ target/2 but > target/5', () => {
      const t = 65; // half = 32
      expect(determineResult(14, t, false)).toBe('hard-success');
      expect(determineResult(32, t, false)).toBe('hard-success');
    });

    it('roll 33 → success (not hard)', () => {
      expect(determineResult(33, 65, false)).toBe('success');
    });
  });

  // ── 普通成功 ──
  describe('success (成功)', () => {
    it('roll ≤ target but > target/2', () => {
      const t = 65;
      expect(determineResult(33, t, false)).toBe('success');
      expect(determineResult(65, t, false)).toBe('success');
    });

    it('roll 66 > 65 → failure', () => {
      expect(determineResult(66, 65, false)).toBe('failure');
    });
  });

  // ── 失败 ──
  describe('failure (失败)', () => {
    it('roll > target, not a crit-failure', () => {
      expect(determineResult(66, 65, false)).toBe('failure');
      expect(determineResult(80, 65, false)).toBe('failure');
      expect(determineResult(95, 65, false)).toBe('failure');
    });

    it('target=5: roll 6–95 → failure, roll 96–99 depends', () => {
      expect(determineResult(6, 5, false)).toBe('failure');
      expect(determineResult(50, 5, false)).toBe('failure');
      // 96–99 with target<5 and non-SAN → crit-failure (line 15)
      expect(determineResult(96, 5, false)).toBe('crit-failure');
    });
  });

  // ── 边界值与优先级 ──
  describe('priority / edge cases', () => {
    it('roll=100 checked before SAN 96 check', () => {
      expect(determineResult(100, 65, true)).toBe('crit-failure');
    });

    it('roll=1 checked before extreme-success', () => {
      expect(determineResult(1, 80, false)).toBe('crit-success');
    });

    it('target=1: fifth=0, roll=2 → hard? No: half=0, 2≤1=false, 2>1 → failure', () => {
      expect(determineResult(2, 1, false)).toBe('failure');
    });

    it('target=0: roll=1 → crit-success', () => {
      expect(determineResult(1, 0, false)).toBe('crit-success');
    });

    it('target=0: roll=2 → failure (2 ≤ 0 false)', () => {
      expect(determineResult(2, 0, false)).toBe('failure');
    });

    it('target=0: roll=96, SAN=false → crit-failure (target<50)', () => {
      expect(determineResult(96, 0, false)).toBe('crit-failure');
    });
  });

  // ── 回归：确保返回正确的类型 ──
  describe('return type', () => {
    it('always returns a valid DiceResultType', () => {
      const types: DiceResultType[] = [
        'crit-success', 'extreme-success', 'hard-success',
        'success', 'failure', 'crit-failure',
      ];
      // Test a wide range
      for (let roll = 1; roll <= 100; roll++) {
        for (const target of [0, 1, 5, 30, 50, 65, 80, 95, 100]) {
          for (const san of [false, true]) {
            expect(types).toContain(determineResult(roll, target, san));
          }
        }
      }
    });
  });
  // ── 回归：RightPage 内联五档判定合一等价性（sanCheck=false） ──
  describe('RightPage inline-classifier equivalence (sanCheck=false)', () => {
    // 复刻 RightPage 合一前的内联规则，作为对照真值
    function legacyInline(raw: number, target: number): DiceResultType {
      const fifth = Math.floor(target / 5);
      const half = Math.floor(target / 2);
      if (raw === 100 || (target <= 50 && raw >= 96)) return 'crit-failure';
      if (raw === 1) return 'crit-success';
      if (raw <= fifth) return 'extreme-success';
      if (raw <= half) return 'hard-success';
      if (raw <= target) return 'success';
      return 'failure';
    }

    it('determineResult(raw,target,false) 对所有 raw×target 与旧内联逐值一致', () => {
      for (let raw = 1; raw <= 100; raw++) {
        for (const target of [0, 1, 5, 30, 49, 50, 65, 80, 95, 100]) {
          expect(determineResult(raw, target, false)).toBe(legacyInline(raw, target));
        }
      }
    });

    it('target<=50 && raw>=96 大失败 (CoC7e p.88)', () => {
      expect(determineResult(96, 49, false)).toBe('crit-failure');
      expect(determineResult(99, 30, false)).toBe('crit-failure');
      expect(determineResult(96, 50, false)).toBe('crit-failure');
    });

    it('保留大成功/大失败边界', () => {
      expect(determineResult(1, 65, false)).toBe('crit-success');
      expect(determineResult(100, 65, false)).toBe('crit-failure');
    });
  });
});

// ============================================================
// rollDiceExpr — 多面骰表达式
// ============================================================
describe('rollDiceExpr', () => {
  it('1D6 在 [1,6]，单骰', () => {
    for (let i = 0; i < 50; i++) {
      const r = rollDiceExpr('1D6')!;
      expect(r.rolls).toHaveLength(1);
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.total).toBeLessThanOrEqual(6);
    }
  });
  it('省略数量默认 1 颗（D3）', () => {
    const r = rollDiceExpr('D3')!;
    expect(r.rolls).toHaveLength(1);
    expect(r.total).toBeGreaterThanOrEqual(1);
    expect(r.total).toBeLessThanOrEqual(3);
  });
  it('带常数加值 1D3+1 在 [2,4]', () => {
    for (let i = 0; i < 50; i++) {
      const t = rollDiceExpr('1D3+1')!.total;
      expect(t).toBeGreaterThanOrEqual(2);
      expect(t).toBeLessThanOrEqual(4);
    }
  });
  it('多项相加 1D10+1D4 两颗骰，范围 [2,14]', () => {
    const r = rollDiceExpr('1D10+1D4')!;
    expect(r.rolls).toHaveLength(2);
    expect(r.total).toBeGreaterThanOrEqual(2);
    expect(r.total).toBeLessThanOrEqual(14);
  });
  it('减值 2D6-1 范围 [1,11]', () => {
    for (let i = 0; i < 50; i++) {
      const t = rollDiceExpr('2D6-1')!.total;
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(11);
    }
  });
  it('纯常数', () => {
    expect(rollDiceExpr('0')!.total).toBe(0);
    expect(rollDiceExpr('5')!.total).toBe(5);
  });
  it('小写 d 也支持', () => {
    expect(rollDiceExpr('1d6')).not.toBeNull();
  });
  it('非法表达式返回 null', () => {
    expect(rollDiceExpr('abc')).toBeNull();
    expect(rollDiceExpr('1D6+')).toBeNull();
    expect(rollDiceExpr('')).toBeNull();
  });
});
