import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  rpmEvaluate,
  resolveBucket,
  rpmAcquire,
  _resetRpm,
  clampQueueAttempts,
  RpmQueueExhaustedError,
  RPM_QUEUE_ATTEMPTS_HARD_CAP,
} from './rpm-limiter';
import { useSettingsStore } from '../stores/useSettingsStore';

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

describe('resolveBucket — 每个API独立RPM分桶', () => {
  it('关闭独立RPM：所有 kind 都归 main 桶 + rpmLimit', () => {
    useSettingsStore.setState({ perApiRpmEnabled: false, rpmLimit: 3, mvuRpmLimit: 2, rewriteRpmLimit: 1 });
    expect(resolveBucket('main')).toEqual({ bucket: 'main', limit: 3 });
    expect(resolveBucket('mvu')).toEqual({ bucket: 'main', limit: 3 });
    expect(resolveBucket('rewrite')).toEqual({ bucket: 'main', limit: 3 });
  });

  it('开启独立RPM：各 kind 用各自上限与独立桶', () => {
    useSettingsStore.setState({ perApiRpmEnabled: true, rpmLimit: 3, mvuRpmLimit: 2, rewriteRpmLimit: 1 });
    expect(resolveBucket('main')).toEqual({ bucket: 'main', limit: 3 });
    expect(resolveBucket('mvu')).toEqual({ bucket: 'mvu', limit: 2 });
    expect(resolveBucket('rewrite')).toEqual({ bucket: 'rewrite', limit: 1 });
  });
});

describe('clampQueueAttempts — 硬上限 10 钳子', () => {
  it('非数字/非有限值回落硬上限 10', () => {
    expect(clampQueueAttempts(undefined)).toBe(RPM_QUEUE_ATTEMPTS_HARD_CAP);
    expect(clampQueueAttempts(null)).toBe(RPM_QUEUE_ATTEMPTS_HARD_CAP);
    expect(clampQueueAttempts(Number.NaN)).toBe(RPM_QUEUE_ATTEMPTS_HARD_CAP);
    expect(clampQueueAttempts(Number.POSITIVE_INFINITY)).toBe(RPM_QUEUE_ATTEMPTS_HARD_CAP);
  });
  it('>10 一律截到 10（设置 UI 也再做一次 clamp 但这里是最终防线）', () => {
    expect(clampQueueAttempts(11)).toBe(10);
    expect(clampQueueAttempts(9999)).toBe(10);
  });
  it('<0 截到 0', () => {
    expect(clampQueueAttempts(-1)).toBe(0);
    expect(clampQueueAttempts(-9999)).toBe(0);
  });
  it('[0,10] 中按 Math.floor 透传', () => {
    expect(clampQueueAttempts(0)).toBe(0);
    expect(clampQueueAttempts(3)).toBe(3);
    expect(clampQueueAttempts(7.9)).toBe(7);
    expect(clampQueueAttempts(10)).toBe(10);
  });
});

describe('setRpmMaxQueueAttempts — store 写入也 clamp 到 [0,10]', () => {
  it('>10 一律截到 10', () => {
    useSettingsStore.getState().setRpmMaxQueueAttempts(99);
    expect(useSettingsStore.getState().rpmMaxQueueAttempts).toBe(10);
  });
  it('<0 截到 0', () => {
    useSettingsStore.getState().setRpmMaxQueueAttempts(-5);
    expect(useSettingsStore.getState().rpmMaxQueueAttempts).toBe(0);
  });
  it('合法值透传', () => {
    useSettingsStore.getState().setRpmMaxQueueAttempts(7);
    expect(useSettingsStore.getState().rpmMaxQueueAttempts).toBe(7);
  });
});

describe('rpmAcquire — 排队上限抛 RpmQueueExhaustedError', () => {
  beforeEach(() => {
    _resetRpm();
    vi.useFakeTimers();
    useSettingsStore.setState({
      perApiRpmEnabled: false,
      rpmLimit: 1, // 极小窗口让排队必发生
      rpmMaxQueueAttempts: 3, // 排队 3 次即抛
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    _resetRpm();
  });

  it('窗口内连发 1 次后，第 2 次最多排队 N 次即抛 RpmQueueExhaustedError', async () => {
    // 第一次必通过（窗口空）
    await rpmAcquire('main');
    // 第二次撞限：vi.useFakeTimers 下 setTimeout 不会自动推进，需 vi.advanceTimersByTimeAsync
    const acquirePromise = rpmAcquire('main').catch((e) => e);
    // 推进 3 轮 setTimeout（每轮 5s 上限），第 4 轮进入循环时 attempts=3>=3 抛错
    for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(5_000);
    const err = await acquirePromise;
    expect(err).toBeInstanceOf(RpmQueueExhaustedError);
    expect((err as RpmQueueExhaustedError).bucket).toBe('main');
    expect((err as RpmQueueExhaustedError).attempts).toBe(3);
    expect((err as RpmQueueExhaustedError).limit).toBe(1);
  });

  it('用户设 maxAttempts=15 被 clamp 到 10（不能超 10）', async () => {
    useSettingsStore.setState({ rpmMaxQueueAttempts: 15, rpmLimit: 1 });
    await rpmAcquire('main');
    const acquirePromise = rpmAcquire('main').catch((e) => e);
    // 推进 11 轮（每轮 5s）— 第 11 轮 attempts=10>=10 抛
    for (let i = 0; i < 11; i++) await vi.advanceTimersByTimeAsync(5_000);
    const err = await acquirePromise;
    expect(err).toBeInstanceOf(RpmQueueExhaustedError);
    expect((err as RpmQueueExhaustedError).attempts).toBe(10);
  });

  it('limit=0 不限制：不进入排队循环，立即返回', async () => {
    useSettingsStore.setState({ rpmLimit: 0 });
    // 无需推进定时器，立即 resolve
    await expect(rpmAcquire('main')).resolves.toBeUndefined();
  });
});
