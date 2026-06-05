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

  // COC 项目主回合实际输出 <UpdateVariable><JSONPatch> 风格——之前漏识别为「显式标签」,
  // 导致每页都触发冗余 MVU 提取(8-25s)。新增 case 覆盖。
  it('S5: 含 <UpdateVariable> 补丁块 → false (主回合补丁已覆盖)', () => {
    const text = '你感到眩晕，理智受到冲击。\n<UpdateVariable><JSONPatch>[{"op":"delta","path":"/调查员/理智值/当前","value":-3}]</JSONPatch></UpdateVariable>';
    expect(shouldUseLlmExtraction(text)).toBe(false);
  });

  it('S6: 含 <JSONPatch> 标签(裸标签变体) → false', () => {
    const text = '你受了伤，HP 下降。<JSONPatch>[{"op":"delta","path":"/调查员/生命值","value":-2}]</JSONPatch>';
    expect(shouldUseLlmExtraction(text)).toBe(false);
  });

  it('S7: 含 <UpdateVariable> 但无叙事数值暗示 → false (不该提取的本就不提取)', () => {
    expect(shouldUseLlmExtraction('你走进昏暗的房间。<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>')).toBe(false);
  });
});
