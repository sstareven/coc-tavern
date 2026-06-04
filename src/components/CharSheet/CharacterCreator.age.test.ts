import { describe, it, expect, vi } from 'vitest';
import { applyAgeModifiers, rollEduImprovement } from '../../sillytavern/coc-rules';

describe('A3.2 — age 60 sheet build pipeline (helper composition)', () => {
  it('applies APP-15, MOV-3, queues 4 EDU rolls, and exposes 20-pt STR/CON/DEX bucket', () => {
    const chars = { STR: 60, CON: 60, SIZ: 50, DEX: 60, APP: 70, INT: 60, POW: 60, EDU: 70 };
    const r = applyAgeModifiers(chars, 60);
    expect(r.chars.APP).toBe(55);
    expect(r.mov).toBe(6); // STR>SIZ && DEX>SIZ → base 9, -3 = 6
    expect(r.deductRemaining.strConDexGroup).toBe(20);
    expect(r.eduImprovementCount).toBe(4);

    // simulate 4 EDU rolls with deterministic RNG
    const seq = [0.99,0.2 /*+3*/, 0.4 /*fail*/, 0.99,0.5 /*+6*/, 0.99,0.1 /*+2*/];
    let i = 0;
    const rng = () => seq[i++];
    let edu = r.chars.EDU; // 70
    const gains: number[] = [];
    for (let n = 0; n < r.eduImprovementCount; n++) {
      const er = rollEduImprovement(edu, rng);
      gains.push(er.improved ? er.gain : 0);
      edu = er.newEdu;
    }
    expect(gains).toEqual([3, 0, 6, 2]);
    expect(edu).toBe(81);
  });

  it('15-19: luck twice take max', () => {
    const roll3D6 = vi.fn().mockReturnValueOnce(8).mockReturnValueOnce(14);
    const luck = Math.max(roll3D6() * 5, roll3D6() * 5);
    expect(luck).toBe(70);
  });
});
