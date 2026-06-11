import { describe, it, expect } from 'vitest';
import { checkPhobiaPenalty } from '../dice-engine';

describe('checkPhobiaPenalty', () => {
  it('returns 1 penalty die when context matches phobia keyword', () => {
    expect(checkPhobiaPenalty('侦查', '面对深海黑暗', ['深海恐惧症'], [])).toBe(1);
  });
  it('returns 0 when no match', () => {
    expect(checkPhobiaPenalty('侦查', '检查书架', ['深海恐惧症'], [])).toBe(0);
  });
  it('matches mania keywords too', () => {
    expect(checkPhobiaPenalty('话术', '谈论纵火犯罪', [], ['纵火狂'])).toBe(1);
  });
  it('returns 0 without context', () => {
    expect(checkPhobiaPenalty('侦查', undefined, ['深海恐惧症'], [])).toBe(0);
  });
  it('strips 恐惧症 suffix for matching', () => {
    expect(checkPhobiaPenalty('攀爬', '站在高处', ['高处恐惧症'], [])).toBe(1);
  });
  it('strips 狂 suffix for matching', () => {
    expect(checkPhobiaPenalty('格斗', '看到纵火现场', [], ['纵火狂'])).toBe(1);
  });
  it('does not match single-char CJK suffix (too aggressive)', () => {
    // 纵火 → suffix 火 is only 1 char, should NOT match
    expect(checkPhobiaPenalty('格斗', '看到火', [], ['纵火狂'])).toBe(0);
  });
  it('handles empty phobias/manias arrays', () => {
    expect(checkPhobiaPenalty('侦查', '任何内容', [], [])).toBe(0);
  });
});
