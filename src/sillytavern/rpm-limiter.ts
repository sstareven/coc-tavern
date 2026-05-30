import { useSettingsStore } from '../stores/useSettingsStore';

const WINDOW_MS = 60_000;

/** 限流桶标识：按 API 用途分桶（开启「每个API独立RPM」时各自独立计窗）。 */
export type RpmKind = 'main' | 'mvu' | 'rewrite';

const histories: Record<RpmKind, number[]> = { main: [], mvu: [], rewrite: [] };

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
 * 解析某 kind 实际使用的限流桶与上限：
 * - 关闭「每个API独立RPM」：所有调用统一走 main 桶 + rpmLimit（全局单一窗口，保持旧行为）。
 * - 开启：mvu/rewrite 各用自己的上限与独立窗口，其余归 main。
 */
export function resolveBucket(kind: RpmKind): { bucket: RpmKind; limit: number } {
  const s = useSettingsStore.getState();
  if (!s.perApiRpmEnabled) return { bucket: 'main', limit: s.rpmLimit ?? 0 };
  if (kind === 'mvu') return { bucket: 'mvu', limit: s.mvuRpmLimit ?? 0 };
  if (kind === 'rewrite') return { bucket: 'rewrite', limit: s.rewriteRpmLimit ?? 0 };
  return { bucket: 'main', limit: s.rpmLimit ?? 0 };
}

/**
 * RPM 限流：在允许发送前 await。kind 指明调用用途（默认主 API）。
 * 达到上限时排队等待，直到所属桶的滑动窗口腾出名额。
 */
export async function rpmAcquire(kind: RpmKind = 'main'): Promise<void> {
  const { bucket, limit } = resolveBucket(kind);
  if (limit <= 0) return;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();
    const { kept, waitMs } = rpmEvaluate(histories[bucket], now, limit);
    histories[bucket] = kept;
    if (waitMs <= 0) {
      histories[bucket].push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, Math.min(waitMs + 20, 5000)));
  }
}

/** 测试用：清空所有桶的发送历史。 */
export function _resetRpm(): void {
  histories.main = [];
  histories.mvu = [];
  histories.rewrite = [];
}
