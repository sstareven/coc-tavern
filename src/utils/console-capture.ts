import { db, type ConsoleLogRow } from '../db/database';
import { useChatStore } from '../stores/useChatStore';
import { useBookStore } from '../stores/useBookStore';

export type LogLevel = 'log' | 'warn' | 'error' | 'info';

export interface LogRecord {
  id: number;
  sessionId: string;
  pageIndex: number;
  ts: number;
  level: LogLevel;
  message: string;
}

export interface LogsForSessionResult {
  records: LogRecord[];
  omittedPages: number;
  omittedRecords: number;
}

// ===== 写入队列（批量 flush） =====
type PendingRow = Omit<ConsoleLogRow, 'id'>;
const pending: PendingRow[] = [];
let scheduled = false;
// 累计 flush 次数。Task 5 retention 会读它(每 100 次触发计数+清理),
// 当前任务范围只统计不消费。
let flushCount = 0;
const PER_SESSION_LIMIT = 5000;

/** 写入入口：被 Task 3 的 console 拦截器在生产中调用,也供测试直接驱动。
 *  签名是同步 void——内部 schedule()/flush() 走 dexie,但 caller 不需要 await
 *  (logger 不能阻塞 console.log)。 */
export function appendLog(row: PendingRow): void {
  pending.push(row);
  schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  if (pending.length >= 10) {
    queueMicrotask(flush);
  } else if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => { void flush(); }, { timeout: 100 });
  } else {
    setTimeout(() => { void flush(); }, 50);
  }
}

async function flush(): Promise<void> {
  scheduled = false;
  if (pending.length === 0) return;
  const batch = pending.splice(0, pending.length);
  try {
    await db.consoleLogs.bulkAdd(batch as ConsoleLogRow[]);
    flushCount += 1;
  } catch {
    // 不让 console 拦截链抛错：静默 swallow。
    // TODO(task-6): IDB 失败时降级 in-memory ring buffer (本任务范围外,留 hookpoint)
    return;
  }
  // retention: 仅检查本次 flush 涉及的 sessionId (lazy & narrow scope)
  const writtenSessions = new Set<string>();
  for (const r of batch) writtenSessions.add(r.sessionId);
  for (const sid of writtenSessions) {
    void enforceRetention(sid);
  }
}

async function enforceRetention(sessionId: string): Promise<void> {
  try {
    const count = await db.consoleLogs.where('sessionId').equals(sessionId).count();
    if (count <= PER_SESSION_LIMIT) return;
    const removeN = Math.ceil(count / 2);
    // 按 id 升序删最旧 removeN 条（id 自增 ≈ 时间序）
    const ids = await db.consoleLogs
      .where('sessionId')
      .equals(sessionId)
      .primaryKeys();
    const toDelete = (ids as number[]).slice(0, removeN);
    await db.consoleLogs.bulkDelete(toDelete);
  } catch {
    // swallow
  }
}

// ===== 读取 =====
export async function getLogsForSession(
  sessionId: string,
  lastNPages: number,
): Promise<LogsForSessionResult> {
  try {
    const rows = await db.consoleLogs
      .where('sessionId')
      .equals(sessionId)
      .toArray();
    if (rows.length === 0) {
      return { records: [], omittedPages: 0, omittedRecords: 0 };
    }
    const allPages = new Set<number>();
    for (const r of rows) allPages.add(r.pageIndex);
    const maxPage = Math.max(...allPages);
    const keepFrom = Math.max(maxPage - (lastNPages - 1), 1);

    const omittedPagesSet = new Set<number>();
    let omittedRecords = 0;
    const kept: LogRecord[] = [];
    for (const r of rows) {
      if (r.pageIndex < keepFrom) {
        omittedPagesSet.add(r.pageIndex);
        omittedRecords += 1;
      } else {
        kept.push(r as LogRecord);
      }
    }
    // 按 pageIndex 倒序，同页内按 id 升序（bulkAdd 顺序 = 插入顺序 = ts 升序）
    kept.sort((a, b) => {
      if (b.pageIndex !== a.pageIndex) return b.pageIndex - a.pageIndex;
      return a.id - b.id;
    });
    return { records: kept, omittedPages: omittedPagesSet.size, omittedRecords };
  } catch {
    return { records: [], omittedPages: 0, omittedRecords: 0 };
  }
}

// ===== 删除（供 sessionLifecycle deleteConversationInner 调用） =====
export async function deleteLogsForSession(sessionId: string): Promise<void> {
  try {
    await db.consoleLogs.where('sessionId').equals(sessionId).delete();
  } catch {
    // swallow：被调时通常在 dexie 事务内,失败不阻断会话删除主流程。
  }
}

// ===== 测试钩子 =====
export function _resetForTests(): void {
  pending.length = 0;
  scheduled = false;
  flushCount = 0;
  uninstallForTests();
}

// ===== 拦截器 =====
/**
 * 命名空间前缀正则：第一字符必须小写字母,后跟一个以上 [a-z0-9-]。
 * 大小写是刻意的——排除 React DevTools、Vercel inject、Font preload 等带方括号的三方
 * noise (它们通常大写起 e.g. [Vercel] [HMR] [Fast Refresh])。
 * 代价：项目里用大写命名空间的日志(如 [TH] / [MVU])收不到——需要改用小写 (e.g. [th] / [mvu])
 * 才会被捕获。新增日志命名空间时请保持小写。
 */
const NAMESPACE_RE = /^\[[a-z][a-z0-9-]+\]/;
const LEVELS: LogLevel[] = ['log', 'warn', 'error', 'info'];

let installed = false;
const originals: Partial<Record<LogLevel, (...args: unknown[]) => void>> = {};

/** 启动时调一次。可重复调用无副作用。 */
export function installConsoleCapture(): void {
  if (installed) return;
  installed = true;

  for (const level of LEVELS) {
    const orig = console[level].bind(console);
    originals[level] = orig;
    console[level] = (...args: unknown[]): void => {
      // 1. 原 console 立刻执行 —— F12 永远先看到、拦截器 throw 也不影响
      try {
        orig(...args);
      } catch {
        // 极端：原 console 自身抛错（理论不可能），不再传播
      }
      // 2. 过滤 + 入队
      try {
        captureIfMatches(level, args);
      } catch {
        // 静默 swallow：拦截链不影响调用方
      }
    };
  }
}

function captureIfMatches(level: LogLevel, args: unknown[]): void {
  if (args.length === 0) return;
  const first = args[0];
  if (typeof first !== 'string') return;
  if (!NAMESPACE_RE.test(first)) return;

  const message = args.map(serializeArg).join(' ');
  appendLog({
    sessionId: getCurrentSessionId(),
    pageIndex: getCurrentPageIndex(),
    ts: Date.now(),
    level,
    message,
  });
}

function serializeArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) {
    return arg.stack ? `${arg.name}: ${arg.message}\n${arg.stack}` : `${arg.name}: ${arg.message}`;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

// 富化函数：snapshot zustand store 读 sessionId 和 pageIndex。
// try/catch 兜底覆盖 store 未 mount 或抛错的边界（boot 期、HMR 中间状态等）。
function getCurrentSessionId(): string {
  try {
    return useChatStore.getState().activeId ?? '__no_session__';
  } catch {
    return '__no_session__';
  }
}
function getCurrentPageIndex(): number {
  try {
    return useBookStore.getState().pages.length;
  } catch {
    return 0;
  }
}

/** 测试钩子：解除 patch,还原原 console（仅 _resetForTests 内部调用）。 */
function uninstallForTests(): void {
  if (!installed) return;
  for (const level of LEVELS) {
    const orig = originals[level];
    if (orig) console[level] = orig;
  }
  installed = false;
}
