import { describe, it, expect } from 'vitest';
import { computeMobilePanelHeight } from './settings-scroll-mobile';

describe('SettingsPanel mobile scroll height helper', () => {
  it('用 visualViewport 高度除以 zoom 计算像素高度', () => {
    expect(computeMobilePanelHeight(700, 0.75)).toBe('933px');
  });

  it('visualViewport 高度为 null 时回退到 CSS calc 表达式', () => {
    expect(computeMobilePanelHeight(null, 0.75)).toBe('calc(100dvh / var(--auto-zoom, 1))');
  });

  it('visualViewport 高度为 0 时回退到 CSS calc 表达式', () => {
    expect(computeMobilePanelHeight(0, 0.75)).toBe('calc(100dvh / var(--auto-zoom, 1))');
  });

  it('zoom 非正数时回退到 CSS calc 表达式', () => {
    expect(computeMobilePanelHeight(700, 0)).toBe('calc(100dvh / var(--auto-zoom, 1))');
  });
});
