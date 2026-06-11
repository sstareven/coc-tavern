import { describe, it, expect } from 'vitest';
import {
  parseTimeDelta,
  accumulateTime,
  formatEpochDisplay,
  canRestNow,
  executeRest,
  computeExpectedProgress,
  clampDarkThreadProgress,
  shouldResetDailySan,
  rollSanRecovery,
} from './time-engine';

/* ------------------------------------------------------------------ */
/*  parseTimeDelta                                                     */
/* ------------------------------------------------------------------ */

describe('parseTimeDelta', () => {
  it('parses a normal object', () => {
    expect(parseTimeDelta({ days: 1, hours: 2, minutes: 30 })).toEqual({
      days: 1,
      hours: 2,
      minutes: 30,
    });
  });

  it('returns null for null input', () => {
    expect(parseTimeDelta(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseTimeDelta(undefined)).toBeNull();
  });

  it('returns null for non-object (string)', () => {
    expect(parseTimeDelta('hello')).toBeNull();
  });

  it('returns null for array', () => {
    expect(parseTimeDelta([1, 2, 3])).toBeNull();
  });

  it('returns null when all components are zero', () => {
    expect(parseTimeDelta({ days: 0, hours: 0, minutes: 0 })).toBeNull();
  });

  it('clamps negative values to 0', () => {
    const result = parseTimeDelta({ days: -5, hours: 2, minutes: -10 });
    expect(result).toEqual({ days: 0, hours: 2, minutes: 0 });
  });

  it('returns null when all components are negative (clamped to 0)', () => {
    expect(parseTimeDelta({ days: -1, hours: -2, minutes: -3 })).toBeNull();
  });

  it('handles missing fields gracefully', () => {
    expect(parseTimeDelta({ hours: 3 })).toEqual({ days: 0, hours: 3, minutes: 0 });
  });

  it('coerces string numbers', () => {
    expect(parseTimeDelta({ days: '2', hours: '0', minutes: '15' })).toEqual({
      days: 2,
      hours: 0,
      minutes: 15,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  formatEpochDisplay                                                 */
/* ------------------------------------------------------------------ */

describe('formatEpochDisplay', () => {
  it('formats a basic date correctly', () => {
    // 1930-01-01T08:00 + 0 minutes = 1930年1月1日 08:00
    expect(formatEpochDisplay('1930-01-01T08:00', 0)).toBe('1930年1月1日 08:00');
  });

  it('advances by given minutes', () => {
    // 1930-01-01T08:00 + 1860 minutes (31h) = 1930-01-02 15:00
    expect(formatEpochDisplay('1930-01-01T08:00', 1860)).toBe('1930年1月2日 15:00');
  });

  it('returns empty string for invalid startDate', () => {
    expect(formatEpochDisplay('not-a-date', 100)).toBe('');
  });

  it('returns empty string for empty startDate', () => {
    expect(formatEpochDisplay('', 100)).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/*  accumulateTime                                                     */
/* ------------------------------------------------------------------ */

describe('accumulateTime', () => {
  it('accumulates time from statData', () => {
    const statData = {
      世界: {
        时间: {
          epoch: 100,
          startDate: '1930-01-01T08:00',
        },
      },
    };
    const result = accumulateTime(statData, { days: 0, hours: 1, minutes: 30 });
    expect(result.newEpoch).toBe(190); // 100 + 90
    // 1930-01-01T08:00 + 190 min = 1930-01-01 11:10
    expect(result.display).toBe('1930年1月1日 11:10');
  });

  it('defaults epoch to 0 when missing', () => {
    const statData = {
      世界: {
        时间: {
          startDate: '1930-01-01T08:00',
        },
      },
    };
    const result = accumulateTime(statData, { days: 1, hours: 0, minutes: 0 });
    expect(result.newEpoch).toBe(1440);
  });

  it('defaults startDate to empty string when missing', () => {
    const statData = { 世界: { 时间: { epoch: 0 } } };
    const result = accumulateTime(statData, { days: 0, hours: 0, minutes: 10 });
    expect(result.newEpoch).toBe(10);
    expect(result.display).toBe(''); // invalid startDate
  });

  it('handles completely empty statData', () => {
    const result = accumulateTime({}, { days: 0, hours: 2, minutes: 0 });
    expect(result.newEpoch).toBe(120);
    expect(result.display).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/*  shouldResetDailySan                                                */
/* ------------------------------------------------------------------ */

describe('shouldResetDailySan', () => {
  const startDate = '1930-01-01T08:00';

  it('returns false when epoch stays within the same day', () => {
    // 08:00 + 100min = 09:40, still Jan 1
    expect(shouldResetDailySan(startDate, 100, 200)).toBe(false);
  });

  it('returns true when epoch crosses a day boundary', () => {
    // 08:00 + 0min = Jan 1 08:00 → 08:00 + 1440min = Jan 2 08:00
    expect(shouldResetDailySan(startDate, 0, 1440)).toBe(true);
  });

  it('returns true when crossing midnight specifically', () => {
    // Use UTC-explicit start so day boundaries are predictable
    const sd = '1930-01-01T00:00:00Z';
    // epoch 1380 = 23:00 UTC Jan 1, epoch 1500 = 01:00 UTC Jan 2
    expect(shouldResetDailySan(sd, 1380, 1500)).toBe(true);
  });

  it('returns false for invalid startDate', () => {
    expect(shouldResetDailySan('not-a-date', 0, 1440)).toBe(false);
  });

  it('returns false for empty startDate', () => {
    expect(shouldResetDailySan('', 0, 1440)).toBe(false);
  });

  it('returns false when newEpoch <= oldEpoch', () => {
    expect(shouldResetDailySan(startDate, 1440, 1440)).toBe(false);
    expect(shouldResetDailySan(startDate, 1440, 100)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  canRestNow                                                         */
/* ------------------------------------------------------------------ */

describe('canRestNow', () => {
  it('allows rest after 24 hours and not in combat', () => {
    expect(canRestNow(1440, 0, false)).toBe(true);
  });

  it('denies rest if less than 24 hours have passed', () => {
    expect(canRestNow(1439, 0, false)).toBe(false);
  });

  it('denies rest if in combat even after 24 hours', () => {
    expect(canRestNow(1440, 0, true)).toBe(false);
  });

  it('allows rest exactly at 24 hours boundary', () => {
    expect(canRestNow(2880, 1440, false)).toBe(true);
  });

  it('denies rest when hours since rest is 0', () => {
    expect(canRestNow(100, 100, false)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  executeRest                                                        */
/* ------------------------------------------------------------------ */

describe('executeRest', () => {
  it('advances time by 480 minutes and recovers 1 hp', () => {
    const result = executeRest(1000);
    expect(result.newEpoch).toBe(1480);
    expect(result.hpRecovered).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  computeExpectedProgress                                            */
/* ------------------------------------------------------------------ */

describe('computeExpectedProgress', () => {
  it('computes progress as percentage', () => {
    expect(computeExpectedProgress(500, 1000)).toBe(50);
  });

  it('caps at 100', () => {
    expect(computeExpectedProgress(1500, 1000)).toBe(100);
  });

  it('returns null for zero duration', () => {
    expect(computeExpectedProgress(500, 0)).toBeNull();
  });

  it('returns null for negative duration', () => {
    expect(computeExpectedProgress(500, -100)).toBeNull();
  });

  it('rounds correctly', () => {
    // 333 / 1000 = 33.3 → 33
    expect(computeExpectedProgress(333, 1000)).toBe(33);
  });

  it('returns 0 when currentEpoch is 0', () => {
    expect(computeExpectedProgress(0, 1000)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  clampDarkThreadProgress                                            */
/* ------------------------------------------------------------------ */

describe('clampDarkThreadProgress', () => {
  it('returns max(current, llmProgress) when expected is null', () => {
    expect(clampDarkThreadProgress(30, null, 50)).toBe(50);
    expect(clampDarkThreadProgress(60, null, 40)).toBe(60);
  });

  it('clamps to floor when llmProgress is too low', () => {
    // current=30, expected=50, llmProgress=20
    // floor = max(30, 50-15) = 35
    // ceiling = 50+10 = 60
    // result = max(35, min(60, 20)) = max(35, 20) = 35
    expect(clampDarkThreadProgress(30, 50, 20)).toBe(35);
  });

  it('clamps to ceiling when llmProgress is too high', () => {
    // current=30, expected=50, llmProgress=80
    // floor = max(30, 35) = 35
    // ceiling = 60
    // result = max(35, min(60, 80)) = max(35, 60) = 60
    expect(clampDarkThreadProgress(30, 50, 80)).toBe(60);
  });

  it('passes through when llmProgress is within range', () => {
    // current=30, expected=50, llmProgress=45
    // floor = max(30, 35) = 35
    // ceiling = 60
    // result = max(35, min(60, 45)) = max(35, 45) = 45
    expect(clampDarkThreadProgress(30, 50, 45)).toBe(45);
  });

  it('uses current as floor when current > expected-15', () => {
    // current=45, expected=50, llmProgress=40
    // floor = max(45, 35) = 45
    // ceiling = 60
    // result = max(45, min(60, 40)) = max(45, 40) = 45
    expect(clampDarkThreadProgress(45, 50, 40)).toBe(45);
  });
});

/* ------------------------------------------------------------------ */
/*  rollSanRecovery                                                    */
/* ------------------------------------------------------------------ */

describe('rollSanRecovery', () => {
  it('succeeds when roll <= pow and recovers 1D3 SAN', () => {
    // rng returns 0.49 for d100 → floor(0.49*100)+1 = 50, then 0.5 for d3 → floor(0.5*3)+1 = 2
    let call = 0;
    const rng = () => [0.49, 0.5][call++];
    const result = rollSanRecovery(50, 40, 99, rng);
    expect(result.roll).toBe(50);
    expect(result.success).toBe(true);
    expect(result.recovered).toBe(2);
  });

  it('fails when roll > pow', () => {
    // rng returns 0.50 → floor(0.50*100)+1 = 51, which is > 50
    const rng = () => 0.50;
    const result = rollSanRecovery(50, 40, 99, rng);
    expect(result.roll).toBe(51);
    expect(result.success).toBe(false);
    expect(result.recovered).toBe(0);
  });

  it('recovers 0 when already at sanMax even on success', () => {
    // rng returns 0.0 → roll = 1 (always success)
    const rng = () => 0.0;
    const result = rollSanRecovery(50, 99, 99, rng);
    expect(result.roll).toBe(1);
    expect(result.success).toBe(true);
    expect(result.recovered).toBe(0);
  });

  it('caps recovery so SAN does not exceed sanMax', () => {
    // san=98, max=99, so at most 1 can be recovered even if d3 rolls 3
    // rng: 0.0 → roll=1 (success), 0.99 → d3=floor(0.99*3)+1=3
    let call = 0;
    const rng = () => [0.0, 0.99][call++];
    const result = rollSanRecovery(50, 98, 99, rng);
    expect(result.roll).toBe(1);
    expect(result.success).toBe(true);
    expect(result.recovered).toBe(1);
  });

  it('rolls d100 in range 1-100 at boundary values', () => {
    // rng=0.0 → roll=1
    expect(rollSanRecovery(50, 40, 99, () => 0.0).roll).toBe(1);
    // rng=0.99 → floor(99)+1=100
    expect(rollSanRecovery(50, 40, 99, () => 0.99).roll).toBe(100);
  });
});
