import { describe, it, expect, afterEach } from 'vitest';
import { readMobile } from './useIsMobile';

// 测试环境为 node（无 jsdom/testing-library）——直接 stub globalThis.window，
// 验证 useIsMobile 内部复用的纯读取函数 readMobile。hook 的订阅行为由用户做 UI 验证。
describe('readMobile', () => {
  const orig = (globalThis as { window?: unknown }).window;
  afterEach(() => { (globalThis as { window?: unknown }).window = orig; });

  it('matchMedia 命中时返回 true', () => {
    (globalThis as { window?: unknown }).window = { matchMedia: (q: string) => ({ matches: true, media: q }) };
    expect(readMobile()).toBe(true);
  });

  it('matchMedia 未命中时返回 false', () => {
    (globalThis as { window?: unknown }).window = { matchMedia: (q: string) => ({ matches: false, media: q }) };
    expect(readMobile()).toBe(false);
  });

  it('无 matchMedia 时回退 false', () => {
    (globalThis as { window?: unknown }).window = {};
    expect(readMobile()).toBe(false);
  });

  it('透传自定义查询串', () => {
    let seen = '';
    (globalThis as { window?: unknown }).window = { matchMedia: (q: string) => { seen = q; return { matches: true, media: q }; } };
    readMobile('(max-width: 480px)');
    expect(seen).toBe('(max-width: 480px)');
  });
});
