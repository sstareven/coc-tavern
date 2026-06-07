# F12 项目日志捕获 → 缓存面板复制集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在缓存面板的"复制表格"按钮里自动带上当前会话最近 10 页的项目命名空间 console 日志（`[cache-diag]`、`[mvu-jsonpatch]` 等），便于贴出排错。同时修复 `[cache-diag]` 必须开 `debugLog` 才进 console 的断头路。

**Architecture:** 全局 monkey-patch `console.log/warn/error/info` → 正则过滤 `/^\[[a-z][a-z0-9-]+\]/` 命名空间 → 用 zustand store 富化 `sessionId/pageIndex` → 批量 dexie `bulkAdd` 进主 db 的新 `consoleLogs` 表（idle 调度 + 高水位 microtask flush）。复制按钮异步拉取并按页倒序拼接进 markdown 文本，删会话事务里同步删日志。

**Tech Stack:** Dexie 4.4（已用）、fake-indexeddb（已配），vitest 4.1，TypeScript 6。

**Spec:** `docs/superpowers/specs/2026-06-06-console-capture-for-cache-diag-design.md`

---

## File Structure

**新建**：
- `src/utils/console-capture.ts` — 拦截器、调度、批量 flush、读取、in-memory fallback
- `src/utils/console-capture.test.ts` — vitest 套件，含 fake-indexeddb

**修改**：
- `src/db/database.ts` — bump dexie 到 v11，加 `consoleLogs` 表和 `ConsoleLogRow` 类型
- `src/main.tsx` — boot 时调 `installConsoleCapture()`
- `src/hooks/useChatPipeline.ts:779` — 去掉 `if (dsCfg.debugLog === true)` gate
- `src/components/Settings/CacheStatsPanel.tsx` — `buildCopyText` 接日志参数、`handleCopy` 异步拉日志、`buildTroubleshootBlock` 加条目 #7
- `src/stores/sessionLifecycle.ts` — `deleteConversationInner` 事务里删 `consoleLogs` 表当前 cid 行

---

## Task 1: 主 DB 加 `consoleLogs` 表 schema (v11)

**Files:**
- Modify: `src/db/database.ts`

- [ ] **Step 1: 写测试 — 验证 v11 schema 含 consoleLogs 表，能 add / get / where**

```typescript
// src/db/database.test.ts 新增 describe 块（追加到文件末尾）
describe('v11: consoleLogs table', () => {
  it('exposes consoleLogs table with the new schema', async () => {
    const { db } = await import('./database');
    expect(db.consoleLogs).toBeDefined();

    const row = {
      sessionId: 's1',
      pageIndex: 3,
      ts: 1000,
      level: 'log' as const,
      message: '[cache-diag] hello',
    };
    const id = await db.consoleLogs.add(row);
    expect(typeof id).toBe('number');

    const fetched = await db.consoleLogs
      .where('[sessionId+pageIndex]')
      .equals(['s1', 3])
      .first();
    expect(fetched?.message).toBe('[cache-diag] hello');

    await db.consoleLogs.where('sessionId').equals('s1').delete();
    const count = await db.consoleLogs.where('sessionId').equals('s1').count();
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/db/database.test.ts -t "v11"`
Expected: FAIL with `db.consoleLogs is undefined` 或 schema 找不到。

- [ ] **Step 3: 实现 — 在 `src/db/database.ts` 加类型、表声明、v11 schema bump**

在 `CombatRow` 接口（约 line 109）后面追加：

```typescript
// 项目命名空间 console.log 捕获（[cache-diag] 等）。
// 跨会话保留，删会话时随 deleteConversationInner 事务同步清除。
export interface ConsoleLogRow {
  id?: number;
  sessionId: string;
  pageIndex: number;
  ts: number;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
}
```

在 `EntityTable` 类型集合（约 line 111-130 的 `as Dexie & { ... }` 块）末尾、`combat` 行下面追加：

```typescript
  consoleLogs: EntityTable<ConsoleLogRow, 'id'>;
```

在 V10_SCHEMA 后面（约 line 215 之后）追加 v11：

```typescript
/** v11: 新增 console 日志捕获表（项目命名空间 [xxx] 日志，跨会话保留）。无数据迁移。 */
export const V11_SCHEMA = {
  ...V10_SCHEMA,
  consoleLogs: '++id, [sessionId+pageIndex], sessionId, ts',
} as const;

db.version(11).stores(V11_SCHEMA);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/db/database.test.ts -t "v11"`
Expected: PASS

- [ ] **Step 5: 跑全套测试不要破其他**

Run: `npx vitest run`
Expected: 全过（已有测试不受 schema bump 影响 —— Dexie 仅新增 store）。

- [ ] **Step 6: Commit**

```bash
git add src/db/database.ts src/db/database.test.ts
git commit -m "feat(db): v11 加 consoleLogs 表(项目命名空间日志捕获)"
```

---

## Task 2: console-capture 模块骨架 — 类型 + dexie 写入 + 读取 + 删除

**Files:**
- Create: `src/utils/console-capture.ts`
- Create: `src/utils/console-capture.test.ts`

- [ ] **Step 1: 写测试 — appendLog 写入、getLogsForSession 按页倒序读取、deleteLogsForSession 清干净**

```typescript
// src/utils/console-capture.test.ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/utils/console-capture.test.ts`
Expected: FAIL with `Cannot find module './console-capture'`。

- [ ] **Step 3: 实现 console-capture.ts 骨架**

```typescript
// src/utils/console-capture.ts
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
let flushCount = 0;

/** 内部 API：测试用。把记录入队、触发 flush 调度。 */
export async function appendLog(row: PendingRow): Promise<void> {
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
    // 不让 console 拦截链抛错：静默 swallow
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
    // swallow：被调时通常在 dexie 事务内,失败不阻断会话删除主流程
  }
}

// ===== 测试钩子 =====
export function _resetForTests(): void {
  pending.length = 0;
  scheduled = false;
  flushCount = 0;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/utils/console-capture.test.ts`
Expected: PASS（4 个测试）

- [ ] **Step 5: Commit**

```bash
git add src/utils/console-capture.ts src/utils/console-capture.test.ts
git commit -m "feat(console-capture): 写入/读取/删除骨架 + 批量 flush 调度"
```

---

## Task 3: console-capture 拦截器 — 正则过滤 + args 序列化 + 调原 console

**Files:**
- Modify: `src/utils/console-capture.ts`
- Modify: `src/utils/console-capture.test.ts`

- [ ] **Step 1: 写测试 — 命名空间正则、序列化、原 console 透传、重复 install 幂等**

追加到 `src/utils/console-capture.test.ts`：

```typescript
import { vi } from 'vitest';
import { installConsoleCapture } from './console-capture';

describe('console-capture: 拦截器', () => {
  let original: typeof console.log;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await db.consoleLogs.clear();
    _resetForTests();
    // 重置拦截标志位
    (globalThis as { __consoleCaptureInstalled?: boolean }).__consoleCaptureInstalled = false;
    original = console.log;
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/utils/console-capture.test.ts -t "拦截器"`
Expected: FAIL（`installConsoleCapture` 还没导出）。

- [ ] **Step 3: 实现 — 在 console-capture.ts 顶部加拦截器**

在 `src/utils/console-capture.ts` 文件末尾追加（保留前面骨架）：

```typescript
// ===== 拦截器 =====
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
  // sessionId / pageIndex 富化推迟到下一 task，先用占位
  void appendLog({
    sessionId: getCurrentSessionId(),
    pageIndex: getCurrentPageIndex(),
    ts: Date.now(),
    level,
    message,
  });
}

function serializeArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

// 富化函数 —— Task 4 实装；先返回占位。
function getCurrentSessionId(): string {
  return '__no_session__';
}
function getCurrentPageIndex(): number {
  return 0;
}

// 扩展测试钩子：解除 patch（仅 Task 重置用，不导出给生产代码）
export function _uninstallForTests(): void {
  if (!installed) return;
  for (const level of LEVELS) {
    const orig = originals[level];
    if (orig) console[level] = orig;
  }
  installed = false;
}
```

然后修改 `_resetForTests` 让它顺带 uninstall：

```typescript
export function _resetForTests(): void {
  pending.length = 0;
  scheduled = false;
  flushCount = 0;
  _uninstallForTests();
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/utils/console-capture.test.ts`
Expected: 全过（前面 4 个 + 拦截器 8 个）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/console-capture.ts src/utils/console-capture.test.ts
git commit -m "feat(console-capture): 拦截器 + 命名空间正则过滤 + args 序列化"
```

---

## Task 4: 富化 sessionId + pageIndex（zustand store snapshot）

**Files:**
- Modify: `src/utils/console-capture.ts`
- Modify: `src/utils/console-capture.test.ts`

- [ ] **Step 1: 写测试 — 验证 zustand store 写入后，下一条 console.log 富化新值**

追加到 `console-capture.test.ts`：

```typescript
import { useChatStore } from '../stores/useChatStore';
import { useBookStore } from '../stores/useBookStore';

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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/utils/console-capture.test.ts -t "富化"`
Expected: FAIL（占位返回 `__no_session__` / 0）。

- [ ] **Step 3: 实现 — 让占位函数读 zustand store**

替换 `src/utils/console-capture.ts` 末尾的占位函数：

```typescript
// 改成读 zustand store
import { useChatStore } from '../stores/useChatStore';
import { useBookStore } from '../stores/useBookStore';

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
```

把 import 移到文件顶部一起（避免循环 import 风险 —— 这俩 store 不依赖 console-capture）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/utils/console-capture.test.ts`
Expected: 全过。

- [ ] **Step 5: Commit**

```bash
git add src/utils/console-capture.ts src/utils/console-capture.test.ts
git commit -m "feat(console-capture): sessionId/pageIndex 从 zustand store 富化"
```

---

## Task 5: Retention — 5000/session 上限懒清理

**Files:**
- Modify: `src/utils/console-capture.ts`
- Modify: `src/utils/console-capture.test.ts`

- [ ] **Step 1: 写测试 — 同会话条数 > 5000 时下一次 flush 触发清理，保留最新一半**

追加：

```typescript
describe('console-capture: retention', () => {
  beforeEach(async () => {
    await db.consoleLogs.clear();
    _resetForTests();
  });

  it('单 session > 5000 时下次 flush 触发删最旧一半', async () => {
    // 预填 5001 条
    const rows = Array.from({ length: 5001 }, (_, i) => ({
      sessionId: 's1',
      pageIndex: 1,
      ts: i,
      level: 'log' as const,
      message: `m${i}`,
    }));
    await db.consoleLogs.bulkAdd(rows);
    expect(await db.consoleLogs.where('sessionId').equals('s1').count()).toBe(5001);

    // 触发 1 次 flush（调内部 API），retention 在每次 flush 后跑
    useChatStore.setState({ activeId: 's1' });
    useBookStore.setState({ pages: [{ id: 'p', leftHeader: '', rightContent: '', leftContent: '', rightHeader: '' }] as unknown as ReturnType<typeof useBookStore.getState>['pages'] });
    installConsoleCapture();
    console.log('[cache-diag] trigger');
    // 等 flush + retention（retention 跑 .where(...).limit(N).delete()）
    await new Promise((r) => setTimeout(r, 200));

    const after = await db.consoleLogs.where('sessionId').equals('s1').count();
    // 5001 + 1 = 5002 → 删一半（约 2501）→ 应 ≤ 2502
    expect(after).toBeLessThanOrEqual(2502);
    expect(after).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/utils/console-capture.test.ts -t "retention"`
Expected: FAIL（清理逻辑不存在）。

- [ ] **Step 3: 实现 — 在 flush 末尾按 sessionId 计数 + 删最旧一半**

修改 `flush` 函数和模块顶部常量：

```typescript
const PER_SESSION_LIMIT = 5000;

async function flush(): Promise<void> {
  scheduled = false;
  if (pending.length === 0) return;
  const batch = pending.splice(0, pending.length);
  let writtenSessions = new Set<string>();
  try {
    await db.consoleLogs.bulkAdd(batch as ConsoleLogRow[]);
    flushCount += 1;
    for (const r of batch) writtenSessions.add(r.sessionId);
  } catch {
    return;
  }
  // 每次 flush 后对本次写入涉及的 session 检查计数（lazy & narrow scope）
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/utils/console-capture.test.ts`
Expected: 全过。

- [ ] **Step 5: Commit**

```bash
git add src/utils/console-capture.ts src/utils/console-capture.test.ts
git commit -m "feat(console-capture): retention 单 session 5000 上限懒清理"
```

---

## Task 6: 降级 in-memory ring buffer（IDB 不可用）

**Files:**
- Modify: `src/utils/console-capture.ts`
- Modify: `src/utils/console-capture.test.ts`

- [ ] **Step 1: 写测试 — db.consoleLogs.add 抛错时走 in-memory，getLogsForSession 仍工作**

追加：

```typescript
describe('console-capture: in-memory fallback', () => {
  beforeEach(async () => {
    await db.consoleLogs.clear();
    _resetForTests();
  });

  it('dexie write 失败时降级 in-memory，仍可读回', async () => {
    // 替换 bulkAdd 让它抛错（模拟隐私模式 / quota）
    const origBulkAdd = db.consoleLogs.bulkAdd.bind(db.consoleLogs);
    db.consoleLogs.bulkAdd = (async () => { throw new Error('idb unavailable'); }) as typeof db.consoleLogs.bulkAdd;

    try {
      useChatStore.setState({ activeId: 'sx' });
      useBookStore.setState({ pages: [{ id: 'p', leftHeader: '', rightContent: '', leftContent: '', rightHeader: '' }] as unknown as ReturnType<typeof useBookStore.getState>['pages'] });
      installConsoleCapture();
      console.log('[cache-diag] fallback line');
      await new Promise((r) => setTimeout(r, 50));

      const result = await getLogsForSession('sx', 10);
      expect(result.records.map((r) => r.message)).toContain('[cache-diag] fallback line');
    } finally {
      db.consoleLogs.bulkAdd = origBulkAdd;
    }
  });

  it('in-memory ring buffer 上限 2000', async () => {
    const origBulkAdd = db.consoleLogs.bulkAdd.bind(db.consoleLogs);
    db.consoleLogs.bulkAdd = (async () => { throw new Error('idb down'); }) as typeof db.consoleLogs.bulkAdd;
    try {
      // 直接调 appendLog 跑 2100 次
      for (let i = 0; i < 2100; i++) {
        await appendLog({
          sessionId: 'mem',
          pageIndex: 1,
          ts: i,
          level: 'log',
          message: `m${i}`,
        });
      }
      await new Promise((r) => setTimeout(r, 100));
      const result = await getLogsForSession('mem', 10);
      expect(result.records.length).toBeLessThanOrEqual(2000);
      // 最旧的被丢，最新的还在
      expect(result.records.some((r) => r.message === 'm2099')).toBe(true);
      expect(result.records.some((r) => r.message === 'm0')).toBe(false);
    } finally {
      db.consoleLogs.bulkAdd = origBulkAdd;
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/utils/console-capture.test.ts -t "in-memory"`
Expected: FAIL（降级不存在）。

- [ ] **Step 3: 实现 — flush 失败标志位 → 后续走 in-memory；getLogsForSession 合并两个源**

修改 `console-capture.ts`：

```typescript
const MEMORY_LIMIT = 2000;
let dexieAvailable = true;
const memoryBuffer: LogRecord[] = [];
let memoryNextId = 1;

async function flush(): Promise<void> {
  scheduled = false;
  if (pending.length === 0) return;
  const batch = pending.splice(0, pending.length);
  if (dexieAvailable) {
    try {
      await db.consoleLogs.bulkAdd(batch as ConsoleLogRow[]);
      flushCount += 1;
      const writtenSessions = new Set<string>();
      for (const r of batch) writtenSessions.add(r.sessionId);
      for (const sid of writtenSessions) void enforceRetention(sid);
      return;
    } catch {
      dexieAvailable = false;
      // fall through 到 in-memory
    }
  }
  for (const row of batch) {
    memoryBuffer.push({ ...row, id: memoryNextId++ });
  }
  while (memoryBuffer.length > MEMORY_LIMIT) {
    memoryBuffer.shift();
  }
}

export async function getLogsForSession(
  sessionId: string,
  lastNPages: number,
): Promise<LogsForSessionResult> {
  let allRows: LogRecord[] = [];
  if (dexieAvailable) {
    try {
      const dexieRows = await db.consoleLogs.where('sessionId').equals(sessionId).toArray();
      allRows = dexieRows as LogRecord[];
    } catch {
      dexieAvailable = false;
    }
  }
  // 合并内存缓冲（dexie 不可用时 memoryBuffer 是唯一源；可用时通常为空）
  for (const r of memoryBuffer) {
    if (r.sessionId === sessionId) allRows.push(r);
  }
  if (allRows.length === 0) {
    return { records: [], omittedPages: 0, omittedRecords: 0 };
  }
  const allPages = new Set<number>();
  for (const r of allRows) allPages.add(r.pageIndex);
  const maxPage = Math.max(...allPages);
  const keepFrom = Math.max(maxPage - (lastNPages - 1), 1);

  const omittedPagesSet = new Set<number>();
  let omittedRecords = 0;
  const kept: LogRecord[] = [];
  for (const r of allRows) {
    if (r.pageIndex < keepFrom) {
      omittedPagesSet.add(r.pageIndex);
      omittedRecords += 1;
    } else {
      kept.push(r);
    }
  }
  kept.sort((a, b) => {
    if (b.pageIndex !== a.pageIndex) return b.pageIndex - a.pageIndex;
    return a.id - b.id;
  });
  return { records: kept, omittedPages: omittedPagesSet.size, omittedRecords };
}

export async function deleteLogsForSession(sessionId: string): Promise<void> {
  if (dexieAvailable) {
    try {
      await db.consoleLogs.where('sessionId').equals(sessionId).delete();
    } catch {
      dexieAvailable = false;
    }
  }
  // 同步清 in-memory
  for (let i = memoryBuffer.length - 1; i >= 0; i--) {
    if (memoryBuffer[i].sessionId === sessionId) memoryBuffer.splice(i, 1);
  }
}
```

同时修改 `_resetForTests`：

```typescript
export function _resetForTests(): void {
  pending.length = 0;
  scheduled = false;
  flushCount = 0;
  dexieAvailable = true;
  memoryBuffer.length = 0;
  memoryNextId = 1;
  _uninstallForTests();
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/utils/console-capture.test.ts`
Expected: 全过。

- [ ] **Step 5: Commit**

```bash
git add src/utils/console-capture.ts src/utils/console-capture.test.ts
git commit -m "feat(console-capture): IDB 不可用时降级 in-memory ring buffer 2000 条"
```

---

## Task 7: Boot 接入 `main.tsx`

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: 读 main.tsx 现状**

Run: `cat src/main.tsx`

- [ ] **Step 2: 实现 — 在 createRoot 前调 installConsoleCapture()**

在 `src/main.tsx` 顶部 import 区追加：

```typescript
import { installConsoleCapture } from './utils/console-capture';
```

在 `ReactDOM.createRoot(...)` 这一行**之前**插入：

```typescript
installConsoleCapture();
```

- [ ] **Step 3: tsc + build 确认不破**

Run: `npx tsc -b && npx vite build 2>&1 | tail -20`
Expected: 通过；如果 vite build 报别的问题（与本改无关）忽略。

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx
git commit -m "feat(boot): app 启动时安装 console 拦截"
```

---

## Task 8: 修 `[cache-diag]` 的 debugLog gate

**Files:**
- Modify: `src/hooks/useChatPipeline.ts:779`

- [ ] **Step 1: 改 1 行**

把 `src/hooks/useChatPipeline.ts:779` 这行：

```typescript
        if (dsCfg.debugLog === true) console.log(line);
```

改成：

```typescript
        console.log(line); // experimentalPrefixDiagnostics 已是外层 gate；让 console-capture 可收
```

- [ ] **Step 2: tsc 确认**

Run: `npx tsc -b 2>&1 | tail -5`
Expected: 0 errors。

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useChatPipeline.ts
git commit -m "fix(prefix-diag): 去掉 debugLog gate, [cache-diag] 在 experimentalPrefixDiagnostics 时直进 console"
```

---

## Task 9: `buildCopyText` + `buildTroubleshootBlock` 加 F12 段

**Files:**
- Create: `src/components/Settings/cache-copy-format.ts`
- Create: `src/components/Settings/cache-copy-format.test.ts`
- Modify: `src/components/Settings/CacheStatsPanel.tsx`

按 `memory/decoupling-modularity-required.md`：**新逻辑**（拼日志段）独立成 `cache-copy-format.ts`，便于 unit test；不顺手重构旧函数（`estimateCostCNY` / `inferModelTier` 已在 `src/sillytavern/deepseek-cache.ts`，不动）。

- [ ] **Step 1: 新建 `src/components/Settings/cache-copy-format.ts`**

```typescript
// 纯逻辑：缓存面板复制文本里【F12 项目日志段】的拼装。
// 不引 React 依赖,便于 unit test。其余诊断段/排错段保留在 CacheStatsPanel.tsx,
// 因为本 task 仅新增日志段,旧函数无意改动范围。
import type { BookPage } from '../../types';
import type { LogRecord } from '../../utils/console-capture';

export function buildLogsSection(
  logs: LogRecord[],
  pages: BookPage[],
  omittedPages: number,
  omittedRecords: number,
): string[] {
  if (logs.length === 0) return [];
  const lines: string[] = [];
  lines.push('=== F12 项目日志（按页分组，仅最近 10 页） ===');
  lines.push('');
  if (omittedPages > 0) {
    lines.push(`（省略更早 ${omittedPages} 页 / ${omittedRecords} 条）`);
    lines.push('');
  }
  // 按 pageIndex 分组（保持 logs 已有的倒序）
  const groups = new Map<number, LogRecord[]>();
  for (const r of logs) {
    let g = groups.get(r.pageIndex);
    if (!g) { g = []; groups.set(r.pageIndex, g); }
    g.push(r);
  }
  const sortedPages = [...groups.keys()].sort((a, b) => b - a);
  for (const pi of sortedPages) {
    const pageLabel = pages[pi - 1]?.leftHeader || '';
    lines.push(pageLabel ? `— 第 ${pi} 页 · ${pageLabel} —` : `— 第 ${pi} 页 —`);
    for (const r of groups.get(pi)!) {
      const ts = formatTime(r.ts);
      // 多行 message：第一行带时间戳,后续行原样保留
      const [first, ...rest] = r.message.split('\n');
      lines.push(`[${ts}] ${first}`);
      for (const line of rest) lines.push(line);
    }
    lines.push('');
  }
  return lines;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
```

- [ ] **Step 2: 写测试 — `src/components/Settings/cache-copy-format.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildLogsSection } from './cache-copy-format';
import type { LogRecord } from '../../utils/console-capture';
import type { BookPage } from '../../types';

const mkPage = (id: string, header: string): BookPage => ({
  id, leftHeader: header, leftContent: '', rightHeader: '', rightContent: '',
} as BookPage);

const mkLog = (pageIndex: number, ts: number, msg: string): LogRecord => ({
  id: pageIndex * 100 + ts, sessionId: 's1', pageIndex, ts, level: 'log', message: msg,
});

describe('cache-copy-format: buildLogsSection', () => {
  it('空日志 → 空段(不留 header)', () => {
    expect(buildLogsSection([], [], 0, 0)).toEqual([]);
  });

  it('按页倒序、同页保持原顺序', () => {
    const logs = [
      mkLog(2, 200, '[cache-diag] p2-a'),
      mkLog(1, 100, '[cache-diag] p1-a'),
      mkLog(1, 150, '[cache-diag] p1-b'),
    ];
    const out = buildLogsSection(
      logs,
      [mkPage('p1', '第一页'), mkPage('p2', '第二页')],
      0, 0,
    );
    const joined = out.join('\n');
    expect(joined).toContain('— 第 2 页 · 第二页 —');
    expect(joined).toContain('— 第 1 页 · 第一页 —');
    expect(joined.indexOf('第 2 页')).toBeLessThan(joined.indexOf('第 1 页'));
    expect(joined.indexOf('p1-a')).toBeLessThan(joined.indexOf('p1-b'));
  });

  it('omittedPages > 0 时插入省略提示', () => {
    const logs = [mkLog(3, 100, '[x] m')];
    const pages: BookPage[] = [
      mkPage('p1', 'A'), mkPage('p2', 'B'), mkPage('p3', 'C'),
    ];
    const out = buildLogsSection(logs, pages, 2, 5);
    expect(out.some((l) => l.includes('省略更早 2 页 / 5 条'))).toBe(true);
  });

  it('多行 message 原样保留缩进', () => {
    const logs = [mkLog(1, 1000, '[cache-diag] head\n  body1\n  body2')];
    const out = buildLogsSection(logs, [mkPage('p1', 'A')], 0, 0);
    const joined = out.join('\n');
    expect(joined).toContain('[cache-diag] head');
    expect(joined).toContain('  body1');
    expect(joined).toContain('  body2');
  });
});
```

- [ ] **Step 3: 跑测试确认通过**

Run: `npx vitest run src/components/Settings/cache-copy-format.test.ts`
Expected: 全过(4 个测试)。

- [ ] **Step 4: 改 `CacheStatsPanel.tsx` — buildCopyText 接日志参数 + buildTroubleshootBlock 加条目 #7**

在 `CacheStatsPanel.tsx` 顶部 import 区追加：

```typescript
import { buildLogsSection } from './cache-copy-format';
import { getLogsForSession, type LogRecord } from '../../utils/console-capture';
import { useChatStore } from '../../stores/useChatStore';
```

修改 `buildCopyText` 函数签名，在原有参数后追加 `logs/omittedPages/omittedRecords`：

```typescript
function buildCopyText(
  pages: import('../../types').BookPage[],
  totalRate: number,
  totalCost: number,
  totalHit: number,
  totalMiss: number,
  totalOut: number,
  saved: number,
  byTier: { flash: { count: number; hit: number; miss: number; output: number; cost: number };
            pro:   { count: number; hit: number; miss: number; output: number; cost: number } },
  diagnostics: string[],
  troubleshoot: string[],
  logs: LogRecord[],
  omittedPages: number,
  omittedRecords: number,
): string {
```

在 `buildCopyText` 函数体里，**`lines.push('')` (line 170) 与 `lines.push(...troubleshoot)` (line 171) 之间**插入：

```typescript
  // F12 项目日志段（在 troubleshoot 之前；诊断头 → 表格 → 日志 → 排错尾）
  const logsLines = buildLogsSection(logs, pages, omittedPages, omittedRecords);
  if (logsLines.length > 0) {
    lines.push(...logsLines);
  }
```

修改 `buildTroubleshootBlock`，在数组末尾（line 105 那条 `'6. ...'` 之后）追加：

```typescript
    '7. 想知道哪段漂移：看上面【F12 项目日志】里 [cache-diag] 那条的"按段分布"和"疑似来自 X 段"',
```

- [ ] **Step 5: 改 `handleCopy` 异步拉日志**

修改 `handleCopy` 函数体，在 `const diagnostics = buildDiagnosticsBlock(...)` 之前追加：

```typescript
    const activeId = useChatStore.getState().activeId ?? '__no_session__';
    const { records: logs, omittedPages, omittedRecords } = await getLogsForSession(activeId, 10);
```

把 `const text = buildCopyText(...)` 调用更新成传入新参数：

```typescript
    const text = buildCopyText(
      pages, totalRate, totalCost, totalHit, totalMiss, totalOut, saved, byTier,
      diagnostics, troubleshoot,
      logs, omittedPages, omittedRecords,
    );
```

- [ ] **Step 6: tsc + 跑相关测试**

Run: `npx tsc -b 2>&1 | tail -5 && npx vitest run src/components/Settings/cache-copy-format.test.ts src/utils/console-capture.test.ts`
Expected: tsc 0 errors，测试全过。

- [ ] **Step 7: Commit**

```bash
git add src/components/Settings/cache-copy-format.ts src/components/Settings/cache-copy-format.test.ts src/components/Settings/CacheStatsPanel.tsx
git commit -m "feat(cache-panel): 复制表格附带 F12 项目日志段(按页分组,最近10页)"
```

---

## Task 10: `deleteConversationInner` 事务里删 consoleLogs

**Files:**
- Modify: `src/stores/sessionLifecycle.ts`

- [ ] **Step 1: 写测试 — 删会话后，该会话的 consoleLogs 同步消失**

新建 `src/stores/sessionLifecycle.consoleLogs.test.ts`（独立 spec 避免污染已有测试）：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/database';
import { deleteConversation } from './sessionLifecycle';
import { useChatStore } from './useChatStore';

describe('deleteConversation 删除该会话的 consoleLogs', () => {
  beforeEach(async () => {
    await db.consoleLogs.clear();
    await db.conversations.clear();
  });

  it('删会话同步删它的日志，不影响其他会话', async () => {
    // 直接插一会话行，让 deleteConversation 流程走通
    await db.conversations.put({
      id: 'sA', name: 'A', presetId: null, lorebookIds: [],
      messages: [], pageCount: 0, createdAt: 0, updatedAt: 0,
    });
    await db.conversations.put({
      id: 'sB', name: 'B', presetId: null, lorebookIds: [],
      messages: [], pageCount: 0, createdAt: 0, updatedAt: 0,
    });
    await db.consoleLogs.bulkAdd([
      { sessionId: 'sA', pageIndex: 1, ts: 1, level: 'log', message: 'a' },
      { sessionId: 'sA', pageIndex: 2, ts: 2, level: 'log', message: 'a2' },
      { sessionId: 'sB', pageIndex: 1, ts: 3, level: 'log', message: 'b' },
    ]);

    // 让 useChatStore 知道有这两个会话（avoid orphan cleanup 误删）
    useChatStore.setState({
      sessions: [
        { id: 'sA', name: 'A', messages: [], pages: [], pageCount: 0, presetId: null, lorebookIds: [], createdAt: 0, updatedAt: 0 } as unknown as ReturnType<typeof useChatStore.getState>['sessions'][number],
        { id: 'sB', name: 'B', messages: [], pages: [], pageCount: 0, presetId: null, lorebookIds: [], createdAt: 0, updatedAt: 0 } as unknown as ReturnType<typeof useChatStore.getState>['sessions'][number],
      ],
      activeId: 'sB',
    });

    await deleteConversation('sA');

    expect(await db.consoleLogs.where('sessionId').equals('sA').count()).toBe(0);
    expect(await db.consoleLogs.where('sessionId').equals('sB').count()).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/stores/sessionLifecycle.consoleLogs.test.ts`
Expected: FAIL — `sA` 的日志仍在（事务里没删 consoleLogs）。

- [ ] **Step 3: 实现 — 在 deleteConversationInner 事务里加 consoleLogs**

修改 `src/stores/sessionLifecycle.ts` line 446-472 的 `deleteConversationInner`：

把 `db.transaction('rw', [...table names...]` 的表名数组加 `'consoleLogs'`（在 'macroVars' 后追加）：

```typescript
  await db.transaction(
    'rw',
    ['conversations', 'pages', 'charsheets', 'inventory', 'clues', 'npcProfiles', 'mapLocations', 'mapEdges', 'locationElements', 'darkThreads', 'darkEndings', 'keyClues', 'plotAnchors', 'combat', 'keywords', 'gameVars', 'macroVars', 'consoleLogs'],
    async () => {
```

在事务体最后一行 `await db.macroVars.where('conversationId').equals(cid).delete();` 之后追加：

```typescript
      await db.consoleLogs.where('sessionId').equals(cid).delete();
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/stores/sessionLifecycle.consoleLogs.test.ts`
Expected: PASS。

- [ ] **Step 5: 跑全套测试不破其他**

Run: `npx vitest run`
Expected: 全过。

- [ ] **Step 6: Commit**

```bash
git add src/stores/sessionLifecycle.ts src/stores/sessionLifecycle.consoleLogs.test.ts
git commit -m "feat(session-lifecycle): 删会话事务里同步删 consoleLogs (per-session isolation invariant)"
```

---

## Task 11: 最终验证 + push

- [ ] **Step 1: 跑全套测试**

Run: `npx vitest run 2>&1 | tail -20`
Expected: 全过，无新增 failed。

- [ ] **Step 2: tsc + build**

Run: `npx tsc -b 2>&1 | tail -5 && npx vite build 2>&1 | tail -10`
Expected: 0 tsc errors；vite build success。

- [ ] **Step 3: 更新 memory（顺手更新现有相关 memory，而不是新写一条）**

打开 `C:\Users\USER\.claude\projects\E--Games-COC\memory\worldbook-ds-cache-optimization.md`（用户 memory 里"DS缓存优化器现状"那条），在 file body 末尾追加一行：

```markdown
- v1.11.11+：开 experimentalPrefixDiagnostics 时 [cache-diag] 直进 F12 console（不再需要 debugLog）；console-capture 拦截器收集所有 `[xxx]` 命名空间日志到 dexie，复制表格按钮自动带最近 10 页日志段
```

- [ ] **Step 4: push beta**

```bash
git push origin beta
```

（按 memory 规则：commit 不含 Co-Authored-By，改完即 push 到 beta；不动 master，更新日志在合 master 时统一改）

---

## Self-Review Notes

- ✅ Spec 每个 component / data flow / file 都对应到 task
- ✅ buildLogsSection 的实现与 spec 的"复制文本格式"小节匹配（按页倒序 / 时间戳 / omitted 提示 / 多行保留）
- ✅ Retention 5000/session 与 spec 一致
- ✅ in-memory fallback 2000 条与 spec 一致
- ✅ 命名空间正则 `/^\[[a-z][a-z0-9-]+\]/` 与 spec 一致；测试覆盖大写起字母、非 string 首参、不匹配的三方 noise
- ✅ deleteConversationInner 接入与 spec "Components.5" 匹配（事务内、加 'consoleLogs' 到表名数组）
- ✅ `debugLog` gate 移除与 spec "Components.3" 匹配
- ✅ 所有 task 都有 commit step；TDD 顺序（test 先 → fail → impl → pass）
- ✅ Task 9 仅**新增** `buildLogsSection` 到独立文件,旧函数 (`buildCopyText` 等) 留在 CacheStatsPanel.tsx 不动,改动范围最小
