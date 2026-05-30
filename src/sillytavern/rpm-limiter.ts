import { useSettingsStore } from '../stores/useSettingsStore';

const WINDOW_MS = 60_000;

let timestamps: number[] = [];

/**
 * 纯函数核心：给定历史发送时间戳、当前时间、每分钟上限，
 * 返回滑动窗口内保留的时间戳与需等待的毫秒（0 表示可立即发送）。
 * limit<=0 视为不限制。
 */
export function rpmEvaluate(
  history: number[],
  now: number,
  limit: number,
): { kept: number[]; waitMs: number } {
  if (limit <= 0) return { kept: history, waitMs: 0 };
  const kept = history.filter((t) => now - t < WINDOW_MS);
  if (kept.length < limit) return { kept, waitMs: 0 };
  return { kept, waitMs: Math.max(0, WINDOW_MS - (now - kept[0])) };
}

/**
 * 全局 RPM 限流：在允许发送前 await。
 * 读取设置里的 rpmLimit（0 = 不限制），对主 API、补写、独立 mvu 等所有调用统一生效。
 * 达到上限时排队等待，直到滑动窗口腾出名额。
 */
export async function rpmAcquire(): Promise<void> {
  const limit = useSettingsStore.getState().rpmLimit ?? 0;
  if (limit <= 0) return;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();
    const { kept, waitMs } = rpmEvaluate(timestamps, now, limit);
    timestamps = kept;
    if (waitMs <= 0) {
      timestamps.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, Math.min(waitMs + 20, 5000)));
  }
}

/** 测试用：清空发送历史。 */
export function _resetRpm(): void {
  timestamps = [];
}
