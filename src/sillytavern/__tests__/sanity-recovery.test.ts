import { describe, it, expect } from 'vitest';
import { rollPsychoanalysis } from '../sanity-engine';

describe('rollPsychoanalysis', () => {
  it('success recovers 1D3 SAN', () => {
    const r = rollPsychoanalysis(60, 40, 80, () => 0.1, () => 0.5);
    expect(r.success).toBe(true);
    expect(r.recovered).toBe(2); // floor(0.5*3)+1=2
  });
  it('failure recovers 0', () => {
    const r = rollPsychoanalysis(60, 40, 80, () => 0.9);
    expect(r.success).toBe(false);
    expect(r.recovered).toBe(0);
  });
  it('caps at sanMax', () => {
    const r = rollPsychoanalysis(60, 79, 80, () => 0.1, () => 0.9);
    expect(r.recovered).toBe(1); // min(3, 80-79=1) = 1
  });
  it('self-therapy uses hard difficulty (skill/2)', () => {
    const r = rollPsychoanalysis(60, 40, 80, () => 0.4, undefined, true);
    // roll = floor(0.4*100)+1 = 41, effective skill = 30, 41 > 30 → fail
    expect(r.success).toBe(false);
  });
  it('returns 0 when already at sanMax', () => {
    const r = rollPsychoanalysis(60, 80, 80, () => 0.1);
    expect(r.recovered).toBe(0);
  });
});
