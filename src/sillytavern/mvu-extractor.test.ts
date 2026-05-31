import { describe, it, expect } from 'vitest';
import { shouldUseLlmExtraction } from './mvu-extractor';

describe('shouldUseLlmExtraction', () => {
  it('S1: narrative stat hint without explicit tag → true (regex cannot catch it)', () => {
    expect(shouldUseLlmExtraction('你感到一阵眩晕，理智仿佛在流失。')).toBe(true);
  });

  it('S2: explicit <var> tag present → false (regex already covers it)', () => {
    expect(shouldUseLlmExtraction('<var name="SAN" value="55"/> 你冷静了下来。')).toBe(false);
  });

  it('S3: no narrative numeric clue → false', () => {
    expect(shouldUseLlmExtraction('你走进昏暗的房间，环顾四周。')).toBe(false);
  });

  it('S4: both stat hint AND explicit tag → false (tag already covers the change)', () => {
    expect(shouldUseLlmExtraction('你的理智受到冲击。<var name="SAN" value="40"/>')).toBe(false);
  });

  it('S2b: explicit {{set:}} command present → false', () => {
    expect(shouldUseLlmExtraction('你恢复了体力 {{set:HP=10}}')).toBe(false);
  });
});
