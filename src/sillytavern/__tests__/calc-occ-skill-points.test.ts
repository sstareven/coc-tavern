import { describe, it, expect } from 'vitest';
import { calcOccSkillPoints } from '../coc-data';

const chars = { STR: 60, CON: 50, SIZ: 65, DEX: 70, APP: 80, INT: 75, POW: 55, EDU: 70 };

describe('calcOccSkillPoints', () => {
  it('defaults to EDU*4 when formula is undefined', () => {
    expect(calcOccSkillPoints(undefined, chars)).toBe(280);
  });
  it('parses EDU*4', () => {
    expect(calcOccSkillPoints('EDU*4', chars)).toBe(280);
  });
  it('parses EDU*2+APP*2', () => {
    expect(calcOccSkillPoints('EDU*2+APP*2', chars)).toBe(300);
  });
  it('parses EDU*2+STR*2', () => {
    expect(calcOccSkillPoints('EDU*2+STR*2', chars)).toBe(260);
  });
  it('parses EDU*2+DEX*2', () => {
    expect(calcOccSkillPoints('EDU*2+DEX*2', chars)).toBe(280);
  });
  it('parses EDU*2+POW*2', () => {
    expect(calcOccSkillPoints('EDU*2+POW*2', chars)).toBe(250);
  });
  it('parses EDU*2+BEST*2 (BEST = APP=80)', () => {
    expect(calcOccSkillPoints('EDU*2+BEST*2', chars)).toBe(300);
  });
  it('returns EDU*4 for empty/garbage formula', () => {
    expect(calcOccSkillPoints('', chars)).toBe(280);
    expect(calcOccSkillPoints('GARBAGE', chars)).toBe(280);
  });
});
