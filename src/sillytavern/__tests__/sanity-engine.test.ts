import { describe, it, expect } from 'vitest';
import { evaluateSanLoss } from '../sanity-engine';
import { BOUT_BEHAVIOR_TABLE, BOUT_SUMMARY_TABLE, PHOBIA_TABLE, MANIA_TABLE } from '../coc7e-tables';
import { rollIntCheck, rollBoutEntry, rollPhobia, rollMania } from '../coc-rules';

/**
 * A2.2 — sanity-engine + COC7e 表 + 受控骰子助手单测。
 * 全部纯函数：seq() 注入确定性 rng，便于断言精确 roll 值。
 */

/** 确定性 RNG：循环吐固定序列。 */
function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('evaluateSanLoss', () => {
  const base = {
    oldSan: 60,
    sanMax: 99,
    dailyAccumulated: 0,
    hasCompanionsPresent: true,
    allCompanionsInsane: false,
  };

  it('delta < 5 → no INT roll', () => {
    const r = evaluateSanLoss({ ...base, delta: -3 });
    expect(r.intRollNeeded).toBe(false);
    expect(r.indefiniteTriggered).toBe(false);
    expect(r.permanentTriggered).toBe(false);
  });

  it('delta == 5 single event → INT roll required (temporary bout candidate)', () => {
    const r = evaluateSanLoss({ ...base, delta: -5 });
    expect(r.intRollNeeded).toBe(true);
  });

  it('daily 1/5 sanMax cumulative → indefinite triggered', () => {
    // sanMax=99 → floor(99/5)=19; already 17, new -3 → 20 ≥ 19
    const r = evaluateSanLoss({ ...base, delta: -3, dailyAccumulated: 17 });
    expect(r.indefiniteTriggered).toBe(true);
  });

  it('san reaches 0 → permanent insanity', () => {
    const r = evaluateSanLoss({ ...base, oldSan: 4, delta: -4 });
    expect(r.permanentTriggered).toBe(true);
  });

  it('alone → bout mode summary', () => {
    const r = evaluateSanLoss({ ...base, delta: -5, hasCompanionsPresent: false });
    expect(r.boutMode).toBe('summary');
  });

  it('all companions insane → bout mode summary', () => {
    const r = evaluateSanLoss({ ...base, delta: -5, allCompanionsInsane: true });
    expect(r.boutMode).toBe('summary');
  });

  it('with sane companions → bout mode realtime', () => {
    const r = evaluateSanLoss({ ...base, delta: -5 });
    expect(r.boutMode).toBe('realtime');
  });
});

describe('coc7e-tables length', () => {
  it('BOUT tables have 10 entries each', () => {
    expect(BOUT_BEHAVIOR_TABLE).toHaveLength(10);
    expect(BOUT_SUMMARY_TABLE).toHaveLength(10);
  });
  it('PHOBIA/MANIA tables have 30 seed entries each', () => {
    expect(PHOBIA_TABLE).toHaveLength(30);
    expect(MANIA_TABLE).toHaveLength(30);
  });
  it('each entry has roll/label/description', () => {
    for (const t of [BOUT_BEHAVIOR_TABLE, BOUT_SUMMARY_TABLE, PHOBIA_TABLE, MANIA_TABLE]) {
      for (const e of t) {
        expect(typeof e.roll).toBe('number');
        expect(typeof e.label).toBe('string');
        expect(typeof e.description).toBe('string');
      }
    }
  });
});

describe('coc-rules sanity rolls (seeded)', () => {
  it('rollIntCheck deterministic — success when roll ≤ INT', () => {
    const r = rollIntCheck(60, seq([0.3])); // 0.3*100+1 = 31 ≤ 60
    expect(r.success).toBe(true);
    expect(r.roll).toBe(31);
  });
  it('rollIntCheck fail when roll > INT', () => {
    const r = rollIntCheck(40, seq([0.9])); // 91 > 40
    expect(r.success).toBe(false);
  });
  it('rollBoutEntry picks 1..10 deterministically', () => {
    const e = rollBoutEntry(seq([0.0]), BOUT_BEHAVIOR_TABLE);
    expect(e.roll).toBe(1);
    const e2 = rollBoutEntry(seq([0.99]), BOUT_BEHAVIOR_TABLE);
    expect(e2.roll).toBe(10);
  });
  it('rollPhobia / rollMania pick 1..30 from seed', () => {
    const p = rollPhobia(seq([0.0]));
    expect(p.roll).toBe(1);
    const m = rollMania(seq([0.99]));
    expect(m.roll).toBe(30);
  });
});
