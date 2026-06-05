import { db, type ConsoleLogRow } from '../db/database';

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
    // TODO(task-3): Task 3 装上 console patch 后,这里若 console.error 报错会无限递归 ——
    //   必须用 originals[level] 而不是 console.error
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
    // TODO(task-3): 同 flush — 用 originals[level] 而非 console.error,避免拦截器装上后递归
  }
}

// ===== 测试钩子 =====
export function _resetForTests(): void {
  pending.length = 0;
  scheduled = false;
  flushCount = 0;
}
