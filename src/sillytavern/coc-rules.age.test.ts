import { describe, it, expect } from 'vitest';
import {
  applyAgeModifiers,
  rollEduImprovement,
  rollSkillImprovement,
} from './coc-rules';

const baseChars = { STR: 50, CON: 50, SIZ: 50, DEX: 50, APP: 50, INT: 50, POW: 50, EDU: 50 };

describe('applyAgeModifiers — R8 seven-band table', () => {
  it('15-19: STR+SIZ -5 group, EDU -5, eduImprovementCount=0, luckRollAgain=true', () => {
    const r = applyAgeModifiers({ ...baseChars }, 17);
    expect(r.chars.EDU).toBe(45);
    expect(r.chars.APP).toBe(50);
    expect(r.deductRemaining.strSizGroup).toBe(5);
    expect(r.deductRemaining.strConDexGroup).toBe(0);
    expect(r.appDeduct).toBe(0);
    expect(r.mov).toBe(9);
    expect(r.eduImprovementCount).toBe(0);
    expect(r.luckRollAgain).toBe(true);
  });

  it('20-39: no deductions, eduImprovementCount=1, mov=8', () => {
    const r = applyAgeModifiers({ ...baseChars }, 25);
    expect(r.chars).toEqual(baseChars);
    expect(r.deductRemaining.strConDexGroup).toBe(0);
    expect(r.appDeduct).toBe(0);
    expect(r.mov).toBe(8);
    expect(r.eduImprovementCount).toBe(1);
    expect(r.luckRollAgain).toBe(false);
  });

  it('40-49: STR/CON/DEX -5 group, APP -5, MOV-1, eduImprovementCount=2', () => {
    const r = applyAgeModifiers({ ...baseChars }, 45);
    expect(r.chars.APP).toBe(45);
    expect(r.deductRemaining.strConDexGroup).toBe(5);
    expect(r.appDeduct).toBe(5);
    expect(r.mov).toBe(7);
    expect(r.eduImprovementCount).toBe(2);
  });

  it('50-59: -10 group, APP-10, MOV-2, eduImprovementCount=3', () => {
    const r = applyAgeModifiers({ ...baseChars }, 55);
    expect(r.chars.APP).toBe(40);
    expect(r.deductRemaining.strConDexGroup).toBe(10);
    expect(r.appDeduct).toBe(10);
    expect(r.mov).toBe(6);
    expect(r.eduImprovementCount).toBe(3);
  });

  it('60-69: -20, APP-15, MOV-3, eduImprovementCount=4', () => {
    const r = applyAgeModifiers({ ...baseChars }, 65);
    expect(r.chars.APP).toBe(35);
    expect(r.deductRemaining.strConDexGroup).toBe(20);
    expect(r.mov).toBe(5);
    expect(r.eduImprovementCount).toBe(4);
  });

  it('70-79: -40, APP-20, MOV-4', () => {
    const r = applyAgeModifiers({ ...baseChars }, 75);
    expect(r.chars.APP).toBe(30);
    expect(r.deductRemaining.strConDexGroup).toBe(40);
    expect(r.mov).toBe(4);
    expect(r.eduImprovementCount).toBe(4);
  });

  it('80-89: -80, APP-25, MOV-5', () => {
    const r = applyAgeModifiers({ ...baseChars }, 85);
    expect(r.chars.APP).toBe(25);
    expect(r.deductRemaining.strConDexGroup).toBe(80);
    expect(r.mov).toBe(3);
    expect(r.eduImprovementCount).toBe(4);
  });

  it('clamps APP to 1 when deduction would go sub-1', () => {
    const r = applyAgeModifiers({ ...baseChars, APP: 10 }, 85);
    expect(r.chars.APP).toBe(1);
  });

  it('clamps EDU to 1 when 15-19 deduction would go sub-1', () => {
    const r = applyAgeModifiers({ ...baseChars, EDU: 3 }, 17);
    expect(r.chars.EDU).toBe(1);
  });
});

describe('rollEduImprovement', () => {
  it('improves when d100 > currentEdu', () => {
    const rng = (() => {
      const seq = [0.95 /* d100=96 */, 0.7 /* d10=8 */];
      let i = 0;
      return () => seq[i++];
    })();
    const r = rollEduImprovement(80, rng);
    expect(r.roll).toBe(96);
    expect(r.improved).toBe(true);
    expect(r.gain).toBe(8);
    expect(r.newEdu).toBe(88);
  });

  it('does not improve when d100 <= currentEdu', () => {
    const rng = () => 0.5; // d100=51
    const r = rollEduImprovement(80, rng);
    expect(r.improved).toBe(false);
    expect(r.newEdu).toBe(80);
  });

  it('caps newEdu at 99', () => {
    const rng = (() => {
      const seq = [0.99 /* d100=100 */, 0.99 /* d10=10 */];
      let i = 0;
      return () => seq[i++];
    })();
    const r = rollEduImprovement(95, rng);
    expect(r.newEdu).toBe(99);
  });
});

describe('rollSkillImprovement', () => {
  it('bonus die disqualifies even on apparent success', () => {
    const rng = () => 0.99;
    const r = rollSkillImprovement(40, /*useBonusDie*/ true, /*won*/ true, rng);
    expect(r.improved).toBe(false);
    expect(r.gain).toBe(0);
    expect(r.finalValue).toBe(40);
  });

  it('opposed and !won disqualifies', () => {
    const rng = () => 0.99;
    const r = rollSkillImprovement(40, false, false, rng);
    expect(r.improved).toBe(false);
    expect(r.finalValue).toBe(40);
  });

  it('d100 > currentValue improves by 1D10 capped at 99', () => {
    const rng = (() => {
      const seq = [0.85 /* d100=86 */, 0.5 /* d10=6 */];
      let i = 0;
      return () => seq[i++];
    })();
    const r = rollSkillImprovement(50, false, true, rng);
    expect(r.roll).toBe(86);
    expect(r.improved).toBe(true);
    expect(r.gain).toBe(6);
    expect(r.finalValue).toBe(56);
  });

  it('boundary: d100 > 95 always improves regardless of currentValue', () => {
    const rng = (() => {
      const seq = [0.95 /* d100=96 */, 0.2 /* d10=3 */];
      let i = 0;
      return () => seq[i++];
    })();
    const r = rollSkillImprovement(98, false, true, rng);
    expect(r.improved).toBe(true);
    expect(r.gain).toBe(3);
    expect(r.finalValue).toBe(99);
  });

  it('d100 <= currentValue and <= 95 does not improve', () => {
    const rng = () => 0.3; // d100=31
    const r = rollSkillImprovement(50, false, true, rng);
    expect(r.improved).toBe(false);
    expect(r.finalValue).toBe(50);
  });
});
