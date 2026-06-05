import { describe, it, expect } from 'vitest';
import { applyUiScale } from './useUiScale';
import { clampUiScale, UI_SCALE_LEVELS, UI_SCALE_MIN, UI_SCALE_MAX } from '../stores/useSettingsStore';

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

describe('clampUiScale (v1.11.6: 接受任意值，仅钳上下界)', () => {
  it('合法档位原样返回', () => {
    for (const lvl of UI_SCALE_LEVELS) expect(clampUiScale(lvl)).toBe(lvl);
  });
  it('范围内自定义值原样返回（不再 snap 到档位）', () => {
    expect(clampUiScale(1.2)).toBe(1.2);
    expect(clampUiScale(1.45)).toBe(1.45);
    expect(clampUiScale(1.75)).toBe(1.75);
    expect(clampUiScale(2.25)).toBe(2.25);
  });
  it('上界 3.0 / 下界 0.5 边界值原样返回', () => {
    expect(clampUiScale(UI_SCALE_MIN)).toBe(0.5);
    expect(clampUiScale(UI_SCALE_MAX)).toBe(3.0);
  });
  it('越界钳到上下界', () => {
    expect(clampUiScale(5.0)).toBe(UI_SCALE_MAX);
    expect(clampUiScale(0.1)).toBe(UI_SCALE_MIN);
  });
  it('非法/非有限值回落 1', () => {
    expect(clampUiScale(NaN)).toBe(1);
    expect(clampUiScale(Infinity)).toBe(1);
  });
});

describe('applyUiScale', () => {
  it('scale!==1 设 zoom 与 --ui-scale 为字符串倍率', () => {
    const { el, calls } = fakeEl();
    applyUiScale(1.3, el);
    expect(calls).toContainEqual(['set', 'zoom', '1.3']);
    expect(calls).toContainEqual(['set', '--ui-scale', '1.3']);
  });
  it('scale===1 移除 zoom 与 --ui-scale（恢复默认）', () => {
    const { el, calls } = fakeEl();
    applyUiScale(1, el);
    expect(calls).toContainEqual(['remove', 'zoom']);
    expect(calls).toContainEqual(['remove', '--ui-scale']);
  });
  it('el 为 null 时安全无操作', () => {
    expect(() => applyUiScale(1.5, null)).not.toThrow();
  });
});
