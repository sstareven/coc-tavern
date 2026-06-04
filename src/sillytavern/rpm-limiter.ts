import { useSettingsStore } from '../stores/useSettingsStore';

const WINDOW_MS = 60_000;

/** 单次 rpmAcquire 调用允许的最大排队重试次数硬上限：用户设置可在 [0,10] 内调，超 10 一律截到 10。 */
export const RPM_QUEUE_ATTEMPTS_HARD_CAP = 10;

/** 限流桶标识：按 API 用途分桶（开启「每个API独立RPM」时各自独立计窗）。 */
export type RpmKind = 'main' | 'mvu' | 'rewrite';

const histories: Record<RpmKind, number[]> = { main: [], mvu: [], rewrite: [] };

/**
 * 结构化错误：rpmAcquire 排队等待次数达到 settings.rpmMaxQueueAttempts（硬上限 10）后抛出。
 * 调用方可用 `err instanceof RpmQueueExhaustedError` 捕获并选择 fail-open（静默降级、丢弃这次请求）。
 */
export class RpmQueueExhaustedError extends Error {
  /** 触发的桶（main/mvu/rewrite）—便于日志定位是哪条管线被卡爆。 */
  readonly bucket: RpmKind;
  /** 实际等待的次数（达到此数即抛）。 */
  readonly attempts: number;
  /** 当时所属桶的 limit，便于日志显示。 */
  readonly limit: number;
  constructor(bucket: RpmKind, attempts: number, limit: number) {
    super(`RPM 排队上限：bucket=${bucket} 已等待 ${attempts} 次（limit=${limit}/分钟）`);
    this.name = 'RpmQueueExhaustedError';
    this.bucket = bucket;
    this.attempts = attempts;
    this.limit = limit;
  }
}

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
 * 把任意输入钳到 [0, RPM_QUEUE_ATTEMPTS_HARD_CAP]；非有限值回落硬上限。
 * 用户设置/外部传入都走这里 — 单一来源，避免「设了 15 却以为生效」。
 */
export function clampQueueAttempts(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return RPM_QUEUE_ATTEMPTS_HARD_CAP;
  return Math.max(0, Math.min(RPM_QUEUE_ATTEMPTS_HARD_CAP, Math.floor(v)));
}

/**
 * RPM 限流：在允许发送前 await。kind 指明调用用途（默认主 API）。
 * 达到上限时排队等待，直到所属桶的滑动窗口腾出名额。
 *
 * 排队上限：每次调用累计的「等待轮次」最多 `settings.rpmMaxQueueAttempts`（硬上限 10）；
 * 超过即抛 `RpmQueueExhaustedError`。调用方可 catch 后 fail-open（静默降级丢这次请求）。
 */
export async function rpmAcquire(kind: RpmKind = 'main'): Promise<void> {
  const { bucket, limit } = resolveBucket(kind);
  if (limit <= 0) return;
  const maxAttempts = clampQueueAttempts(useSettingsStore.getState().rpmMaxQueueAttempts);
  let attempts = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();
    const { kept, waitMs } = rpmEvaluate(histories[bucket], now, limit);
    histories[bucket] = kept;
    if (waitMs <= 0) {
      histories[bucket].push(now);
      return;
    }
    if (attempts >= maxAttempts) {
      throw new RpmQueueExhaustedError(bucket, attempts, limit);
    }
    attempts += 1;
    await new Promise((r) => setTimeout(r, Math.min(waitMs + 20, 5000)));
  }
}

/** 测试用：清空所有桶的发送历史。 */
export function _resetRpm(): void {
  histories.main = [];
  histories.mvu = [];
  histories.rewrite = [];
}
