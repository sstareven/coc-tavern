import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/database';
import {
  appendLog,
  getLogsForSession,
  deleteLogsForSession,
  _resetForTests,
} from './console-capture';

describe('console-capture: 写入/读取/删除', () => {
  beforeEach(async () => {
    await db.consoleLogs.clear();
    _resetForTests();
  });

  it('appendLog 把记录写进 dexie', async () => {
    await appendLog({
      sessionId: 's1',
      pageIndex: 1,
      ts: 100,
      level: 'log',
      message: '[cache-diag] one',
    });
    // 等 flush（pending 队列由 microtask/idle 调度）
    await new Promise((r) => setTimeout(r, 50));
    const count = await db.consoleLogs.where('sessionId').equals('s1').count();
    expect(count).toBe(1);
  });

  it('getLogsForSession 按 pageIndex 倒序、同页 id 升序', async () => {
    await db.consoleLogs.bulkAdd([
      { sessionId: 's1', pageIndex: 1, ts: 100, level: 'log', message: 'p1-a' },
      { sessionId: 's1', pageIndex: 2, ts: 200, level: 'log', message: 'p2-a' },
      { sessionId: 's1', pageIndex: 1, ts: 150, level: 'log', message: 'p1-b' },
      { sessionId: 's2', pageIndex: 1, ts: 300, level: 'log', message: 'other-session' },
    ]);
    const result = await getLogsForSession('s1', 10);
    expect(result.records.map((r) => r.message)).toEqual([
      'p2-a',
      'p1-a',
      'p1-b',
    ]);
    expect(result.omittedPages).toBe(0);
    expect(result.omittedRecords).toBe(0);
  });

  it('getLogsForSession 截取最近 N 页时报 omitted 计数', async () => {
    // 12 页，每页 1 条
    const rows = Array.from({ length: 12 }, (_, i) => ({
      sessionId: 's1',
      pageIndex: i + 1,
      ts: 1000 + i,
      level: 'log' as const,
      message: `p${i + 1}`,
    }));
    await db.consoleLogs.bulkAdd(rows);
    const result = await getLogsForSession('s1', 10);
    // 保留 page 3..12 = 10 页，省略 page 1..2 = 2 页 / 2 条
    expect(result.records.map((r) => r.pageIndex)).toEqual(
      [12, 11, 10, 9, 8, 7, 6, 5, 4, 3],
    );
    expect(result.omittedPages).toBe(2);
    expect(result.omittedRecords).toBe(2);
  });

  it('deleteLogsForSession 只删指定会话', async () => {
    await db.consoleLogs.bulkAdd([
      { sessionId: 's1', pageIndex: 1, ts: 100, level: 'log', message: 'a' },
      { sessionId: 's2', pageIndex: 1, ts: 200, level: 'log', message: 'b' },
    ]);
    await deleteLogsForSession('s1');
    const s1 = await db.consoleLogs.where('sessionId').equals('s1').count();
    const s2 = await db.consoleLogs.where('sessionId').equals('s2').count();
    expect(s1).toBe(0);
    expect(s2).toBe(1);
  });
});
