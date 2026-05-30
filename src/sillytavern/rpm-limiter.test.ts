import { describe, it, expect } from 'vitest';
import { rpmEvaluate } from './rpm-limiter';

const MIN = 60_000;

describe('rpmEvaluate — 滑动窗口 RPM 核心', () => {
  it('limit<=0 视为不限制', () => {
    expect(rpmEvaluate([1, 2, 3], 100, 0).waitMs).toBe(0);
  });

  it('窗口内不足上限 → 立即可发（waitMs 0）', () => {
    const now = 1_000_000;
    const r = rpmEvaluate([now - 1000, now - 2000], now, 5);
    expect(r.waitMs).toBe(0);
  });

  it('窗口内达到上限 → 需等待到最早一条过期', () => {
    const now = 1_000_000;
    const history = [now - 50_000, now - 40_000, now - 30_000]; // 3 条，均在 60s 窗口内
    const r = rpmEvaluate(history, now, 3);
    // 最早一条在 50s 前，需再等 ~10s
    expect(r.waitMs).toBeGreaterThan(9_000);
    expect(r.waitMs).toBeLessThanOrEqual(10_000);
  });

  it('超出 60s 窗口的旧记录被丢弃，不计入上限', () => {
    const now = 1_000_000;
    const history = [now - (MIN + 5000), now - (MIN + 1000), now - 1000]; // 前两条已过期
    const r = rpmEvaluate(history, now, 2);
    expect(r.kept).toHaveLength(1); // 只剩窗口内 1 条
    expect(r.waitMs).toBe(0); // 1 < 2，可发
  });

  it('恰好到上限边界', () => {
    const now = 1_000_000;
    const history = [now - 10_000, now - 5_000];
    expect(rpmEvaluate(history, now, 2).waitMs).toBeGreaterThan(0); // 已满
    expect(rpmEvaluate(history, now, 3).waitMs).toBe(0); // 未满
  });
});
