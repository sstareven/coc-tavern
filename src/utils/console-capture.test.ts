import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db/database';
import {
  appendLog,
  getLogsForSession,
  deleteLogsForSession,
  _resetForTests,
  installConsoleCapture,
} from './console-capture';
import { useChatStore } from '../stores/useChatStore';
import { useBookStore } from '../stores/useBookStore';

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

describe('console-capture: 拦截器', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await db.consoleLogs.clear();
    _resetForTests();
    logSpy = vi.spyOn(console, 'log');
  });

  it('调原 console.log（F12 仍能看）', () => {
    installConsoleCapture();
    console.log('[cache-diag] hello');
    expect(logSpy).toHaveBeenCalled();
  });

  it('命名空间前缀匹配的写库', async () => {
    installConsoleCapture();
    console.log('[cache-diag] hit', { foo: 1 });
    await new Promise((r) => setTimeout(r, 50));
    const rows = await db.consoleLogs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain('[cache-diag] hit');
    expect(rows[0].message).toContain('{"foo":1}');
    expect(rows[0].level).toBe('log');
  });

  it('不带命名空间前缀的不收（React/Vercel noise）', async () => {
    installConsoleCapture();
    console.log('Download the React DevTools …');
    console.log({ object: 'first' });
    console.log(42);
    await new Promise((r) => setTimeout(r, 50));
    const count = await db.consoleLogs.count();
    expect(count).toBe(0);
  });

  it('大写起字母前缀不收（避免 React/Vercel 误中）', async () => {
    installConsoleCapture();
    console.log('[Vercel] something');
    console.warn('[ABC] foo');
    await new Promise((r) => setTimeout(r, 50));
    const count = await db.consoleLogs.count();
    expect(count).toBe(0);
  });

  it('warn/error/info 级别都拦', async () => {
    installConsoleCapture();
    console.warn('[mvu-jsonpatch] warn line');
    console.error('[ds-cache-restructure] err');
    console.info('[TH] info'); // 但 [TH] 是大写，不收
    await new Promise((r) => setTimeout(r, 50));
    const rows = await db.consoleLogs.toArray();
    const messages = rows.map((r) => r.message);
    expect(messages).toContain('[mvu-jsonpatch] warn line');
    expect(messages).toContain('[ds-cache-restructure] err');
    expect(messages.some((m) => m.includes('[TH] info'))).toBe(false);
    expect(rows.find((r) => r.message.includes('mvu'))?.level).toBe('warn');
    expect(rows.find((r) => r.message.includes('ds-cache'))?.level).toBe('error');
  });

  it('重复 install 只 patch 一次', () => {
    installConsoleCapture();
    const afterFirst = console.log;
    installConsoleCapture();
    expect(console.log).toBe(afterFirst);
  });

  it('非 string 第一参数不收（即使内容像命名空间）', async () => {
    installConsoleCapture();
    console.log(['[cache-diag]', 'array first arg']);
    await new Promise((r) => setTimeout(r, 50));
    expect(await db.consoleLogs.count()).toBe(0);
  });

  it('多行 message 原样保留', async () => {
    installConsoleCapture();
    console.log('[cache-diag] line1\n  line2\n  line3');
    await new Promise((r) => setTimeout(r, 50));
    const row = await db.consoleLogs.toCollection().first();
    expect(row?.message).toContain('line1\n  line2\n  line3');
  });
});

describe('console-capture: 富化 sessionId + pageIndex', () => {
  beforeEach(async () => {
    await db.consoleLogs.clear();
    _resetForTests();
  });

  it('从 useChatStore.activeId 读 sessionId', async () => {
    useChatStore.setState({ activeId: 'sess-abc' });
    installConsoleCapture();
    console.log('[cache-diag] from sess-abc');
    await new Promise((r) => setTimeout(r, 50));
    const row = await db.consoleLogs.toCollection().first();
    expect(row?.sessionId).toBe('sess-abc');
  });

  it('activeId=null 时降为 __no_session__', async () => {
    useChatStore.setState({ activeId: null });
    installConsoleCapture();
    console.log('[cache-diag] orphan');
    await new Promise((r) => setTimeout(r, 50));
    const row = await db.consoleLogs.toCollection().first();
    expect(row?.sessionId).toBe('__no_session__');
  });

  it('pageIndex 取自 useBookStore.pages.length', async () => {
    useChatStore.setState({ activeId: 's1' });
    useBookStore.setState({
      pages: [
        { id: 'p1', leftHeader: 'a', rightContent: '', leftContent: '', rightHeader: '' },
        { id: 'p2', leftHeader: 'b', rightContent: '', leftContent: '', rightHeader: '' },
        { id: 'p3', leftHeader: 'c', rightContent: '', leftContent: '', rightHeader: '' },
      ] as unknown as ReturnType<typeof useBookStore.getState>['pages'],
    });
    installConsoleCapture();
    console.log('[cache-diag] page3');
    await new Promise((r) => setTimeout(r, 50));
    const row = await db.consoleLogs.toCollection().first();
    expect(row?.pageIndex).toBe(3);
  });
});
