import { describe, it, expect } from 'vitest';
import type { DiceResultType } from '../../types';
import { CHEATING_RESULT_TYPES, pickRollForResult, getCheatingDisabledTypes } from '../cheating-helpers';
import { determineResult } from '../dice-engine';

// 固定 rng 工厂 — 在 [lo, hi] 区间内取得指定位置（0=最小、1=最大）
const rngFixed = (frac: number) => () => Math.min(0.999999, Math.max(0, frac));

describe('CHEATING_RESULT_TYPES', () => {
  it('包含 6 档结果，按从最好到最坏顺序', () => {
    expect(CHEATING_RESULT_TYPES).toEqual([
      'crit-success', 'extreme-success', 'hard-success', 'success', 'failure', 'crit-failure',
    ]);
  });
});

describe('pickRollForResult — round-trip 一致性（笛卡尔积）', () => {
  const targets = [1, 2, 3, 5, 10, 49, 50, 95, 99];
  const sanFlags = [true, false];
  const rngExtremes = [rngFixed(0), rngFixed(0.5), rngFixed(0.99)];

  for (const target of targets) {
    for (const sanCheck of sanFlags) {
      for (const type of CHEATING_RESULT_TYPES) {
        for (const rng of rngExtremes) {
          it(`type=${type} target=${target} sanCheck=${sanCheck} rng=fixed → match or null`, () => {
            const roll = pickRollForResult(type, target, sanCheck, rng);
            const verifyType = roll === null ? null : determineResult(roll, target, sanCheck);
            const match = verifyType === type;
            if (roll === null) {
              expect(verifyType).toBeNull();
              expect(match).toBe(false);
            } else {
              expect(verifyType, `roll=${roll} 不被判为 ${type}（实得 ${verifyType}）`).toBe(type);
              expect(match).toBe(true);
            }
          });
        }
      }
    }
  }
});

describe('pickRollForResult — 各档位边界', () => {
  it('crit-success 总返回 1', () => {
    expect(pickRollForResult('crit-success', 50, false)).toBe(1);
    expect(pickRollForResult('crit-success', 1, true)).toBe(1);
  });

  it('extreme-success: target<10 时 fifth<2 返回 null', () => {
    expect(pickRollForResult('extreme-success', 4, false)).toBeNull();
    expect(pickRollForResult('extreme-success', 9, false)).toBeNull();
    expect(pickRollForResult('extreme-success', 10, false)).not.toBeNull();
  });

  it('extreme-success: target=10 时 fifth=2, 应返回 2', () => {
    expect(pickRollForResult('extreme-success', 10, false, rngFixed(0))).toBe(2);
  });

  it('hard-success: target=3 时 fifth=0 half=1 区间 [2,1] 空，返回 null', () => {
    expect(pickRollForResult('hard-success', 3, false)).toBeNull();
  });

  it('hard-success: target=10 时 fifth=2 half=5 区间 [3,5]', () => {
    expect(pickRollForResult('hard-success', 10, false, rngFixed(0))).toBe(3);
    expect(pickRollForResult('hard-success', 10, false, rngFixed(0.99))).toBe(5);
  });

  it('success: target=50 区间 [26, 50]', () => {
    expect(pickRollForResult('success', 50, false, rngFixed(0))).toBe(26);
    expect(pickRollForResult('success', 50, false, rngFixed(0.99))).toBe(50);
  });

  it('success: 连续 3 次同档应可能不同（随机化生效）', () => {
    // 用真随机，连续 5 次取样应该出现 >1 个不同值（极小概率失败）
    const values = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const v = pickRollForResult('success', 50, false);
      if (v !== null) values.add(v);
    }
    expect(values.size, `30 次取样只见 ${values.size} 个不同值`).toBeGreaterThan(1);
  });

  it('failure: target=50 普通检定区间 [51, 95]（96-100 大失败）', () => {
    expect(pickRollForResult('failure', 50, false, rngFixed(0))).toBe(51);
    expect(pickRollForResult('failure', 50, false, rngFixed(0.99))).toBe(95);
  });

  it('failure: target=99 普通检定区间 [100, 99] 空，返回 null', () => {
    expect(pickRollForResult('failure', 99, false)).toBeNull();
  });

  it('failure: target=10 SAN 检定区间 [11, 95]', () => {
    expect(pickRollForResult('failure', 10, true, rngFixed(0))).toBe(11);
    expect(pickRollForResult('failure', 10, true, rngFixed(0.99))).toBe(95);
  });

  it('crit-failure: SAN 检定区间 [96, 100]', () => {
    expect(pickRollForResult('crit-failure', 50, true, rngFixed(0))).toBe(96);
    expect(pickRollForResult('crit-failure', 50, true, rngFixed(0.99))).toBe(100);
  });

  it('crit-failure: 普通检定固定 100', () => {
    expect(pickRollForResult('crit-failure', 30, false)).toBe(100);
    expect(pickRollForResult('crit-failure', 60, false)).toBe(100);
  });
});

describe('pickRollForResult — 类型断言（exhaustive check 编译期保证）', () => {
  it('未知 type 会被 TS 类型系统拒绝，无需 runtime test', () => {
    // 此测试仅占位标注：如果有人给 DiceResultType 加新成员而忘改 switch，
    // tsc 会在 default 分支的 `const _exhaustive: never = type;` 编译报错
    const known: DiceResultType[] = [...CHEATING_RESULT_TYPES];
    expect(known.length).toBe(6);
  });
});

describe('pickRollForResult — 非法 target 防御', () => {
  it('NaN 返回 null（不向下游传播坏区间）', () => {
    expect(pickRollForResult('success', Number.NaN, false)).toBeNull();
  });
  it('Infinity 返回 null', () => {
    expect(pickRollForResult('success', Number.POSITIVE_INFINITY, false)).toBeNull();
  });
  it('负数返回 null', () => {
    expect(pickRollForResult('success', -1, false)).toBeNull();
  });
  it('>100 返回 null', () => {
    expect(pickRollForResult('success', 101, false)).toBeNull();
  });
});

describe('getCheatingDisabledTypes — UI 预检', () => {
  it('target=0 非 SAN：extreme/hard/success 区间为空，预检禁用 3 档', () => {
    const disabled = getCheatingDisabledTypes(0, false);
    expect([...disabled].sort()).toEqual(['extreme-success', 'hard-success', 'success']);
  });
  it('target=50 非 SAN：所有档位均可用（failure=51-95, crit-failure=100）', () => {
    const disabled = getCheatingDisabledTypes(50, false);
    expect(disabled.has('failure')).toBe(false);
    expect(disabled.has('crit-failure')).toBe(false);
    expect(disabled.size).toBe(0);
  });
  it('target=50 SAN：所有档位均可用（failure=51-95, crit-failure=96-100）', () => {
    const disabled = getCheatingDisabledTypes(50, true);
    expect(disabled.size).toBe(0);
  });
  it('target=3 非 SAN：hard-success 区间 [2,1] 空，预检禁用', () => {
    // fifth=0, half=1, lo=max(1, 2)=2, half<lo → 区间空
    const disabled = getCheatingDisabledTypes(3, false);
    expect(disabled.has('hard-success')).toBe(true);
  });
});
