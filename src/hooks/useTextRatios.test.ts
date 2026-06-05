import { describe, it, expect } from 'vitest';
import { applyTextRatios } from './useTextRatios';
import { clampTextRatio, TEXT_RATIO_MIN, TEXT_RATIO_MAX } from '../stores/useSettingsStore';

function fakeEl() {
  const calls: Array<[string, string, string?]> = [];
  const el = {
    style: {
      setProperty: (k: string, v: string) => calls.push(['set', k, v]),
      removeProperty: (k: string) => calls.push(['remove', k]),
    },
  } as unknown as HTMLElement;
  return { el, calls };
}

describe('clampTextRatio (v1.11.7: 0.8 ~ 1.5)', () => {
  it('范围内原样返回', () => {
    expect(clampTextRatio(1.0)).toBe(1.0);
    expect(clampTextRatio(0.85)).toBe(0.85);
    expect(clampTextRatio(1.25)).toBe(1.25);
  });
  it('上下界边界值原样返回', () => {
    expect(clampTextRatio(TEXT_RATIO_MIN)).toBe(0.8);
    expect(clampTextRatio(TEXT_RATIO_MAX)).toBe(1.5);
  });
  it('越界钳到上下界', () => {
    expect(clampTextRatio(2.0)).toBe(TEXT_RATIO_MAX);
    expect(clampTextRatio(0.5)).toBe(TEXT_RATIO_MIN);
  });
  it('非法/非有限值回落 1', () => {
    expect(clampTextRatio(NaN)).toBe(1);
    expect(clampTextRatio(Infinity)).toBe(1);
  });
});

describe('applyTextRatios', () => {
  it('textRatio !== 1 设 --text-ratio', () => {
    const { el, calls } = fakeEl();
    applyTextRatios(1.2, 1, el);
    expect(calls).toContainEqual(['set', '--text-ratio', '1.2']);
    expect(calls).toContainEqual(['remove', '--system-ratio']);
  });
  it('systemRatio !== 1 设 --system-ratio', () => {
    const { el, calls } = fakeEl();
    applyTextRatios(1, 1.3, el);
    expect(calls).toContainEqual(['remove', '--text-ratio']);
    expect(calls).toContainEqual(['set', '--system-ratio', '1.3']);
  });
  it('两者都 = 1 时移除两个属性(恢复默认)', () => {
    const { el, calls } = fakeEl();
    applyTextRatios(1, 1, el);
    expect(calls).toContainEqual(['remove', '--text-ratio']);
    expect(calls).toContainEqual(['remove', '--system-ratio']);
  });
  it('两者都自定义时各自挂', () => {
    const { el, calls } = fakeEl();
    applyTextRatios(1.15, 0.9, el);
    expect(calls).toContainEqual(['set', '--text-ratio', '1.15']);
    expect(calls).toContainEqual(['set', '--system-ratio', '0.9']);
  });
  it('el 为 null 时安全无操作', () => {
    expect(() => applyTextRatios(1.2, 1.3, null)).not.toThrow();
  });
  it('不再清除 zoom (v1.11.8: zoom 由 useResponsiveZoom 独占)', () => {
    const { el, calls } = fakeEl();
    applyTextRatios(1.2, 1, el);
    expect(calls.find((c) => c[1] === 'zoom')).toBeUndefined();
  });
});
