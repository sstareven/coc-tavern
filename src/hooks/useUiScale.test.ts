import { describe, it, expect } from 'vitest';
import { applyUiScale } from './useUiScale';
import { clampUiScale, UI_SCALE_LEVELS } from '../stores/useSettingsStore';

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

describe('clampUiScale', () => {
  it('合法档位原样返回', () => {
    for (const lvl of UI_SCALE_LEVELS) expect(clampUiScale(lvl)).toBe(lvl);
  });
  it('越界/非法吸附到最近合法档', () => {
    expect(clampUiScale(2.0)).toBe(1.5);
    expect(clampUiScale(0.5)).toBe(1);
    expect(clampUiScale(1.2)).toBe(1.15); // 1.2 距 1.15(0.05) < 1.3(0.1)
    expect(clampUiScale(1.45)).toBe(1.5);
    expect(clampUiScale(NaN)).toBe(1);
    expect(clampUiScale(Infinity)).toBe(1);
  });
});

describe('applyUiScale', () => {
  it('scale!==1 设 zoom 为字符串倍率', () => {
    const { el, calls } = fakeEl();
    applyUiScale(1.3, el);
    expect(calls).toContainEqual(['set', 'zoom', '1.3']);
  });
  it('scale===1 移除 zoom（恢复默认）', () => {
    const { el, calls } = fakeEl();
    applyUiScale(1, el);
    expect(calls).toContainEqual(['remove', 'zoom']);
  });
  it('el 为 null 时安全无操作', () => {
    expect(() => applyUiScale(1.5, null)).not.toThrow();
  });
});
