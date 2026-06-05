# F12 项目日志捕获 → 缓存面板复制集成

**Date:** 2026-06-06
**Status:** Spec approved, ready for implementation plan
**Owner:** beta 分支

## Problem

用户碰到这种情况无法自助排错：缓存面板显示某一页（如第 3 页）命中率异常低（8.7%），但 token 数据本身无法告诉用户**哪段静态前缀漂移了**（systemPrompt / wbBefore / processedFormat / wbAfter）。这个信息存在 `[cache-diag]` 的 `console.log` 里，但：

1. 那条 `console.log` 当前 gated 在 `dsCfg.debugLog === true`（默认 false）—— 开 `experimentalPrefixDiagnostics` 不足以让日志写到 F12
2. 即便日志写到 F12，用户复制贴出来麻烦（要打开 F12、滚动、按命名空间筛选、手动剪贴）

用户的诉求：**复制表格按钮一键带上 F12 里的 `[…]` 项目命名空间日志**，按会话隔离、按页分组，便于贴给我或社区排查。

## Goals

- 复制表格的输出里**自动包含**当前会话的项目日志，按页分组（默认最近 10 页）
- 捕获范围**精准**：只收带 `[xxx]` 命名空间前缀的日志（`[cache-diag]`、`[ds-cache-restructure]`、`[mvu-jsonpatch]`、`[TH]` 等），React DevTools / Vercel / Font preload 等三方 noise 自动过滤
- 跨刷新存在 → 用 IndexedDB
- 会话隔离 → delete session 时同步删日志
- 修 `debugLog` gate：开 `experimentalPrefixDiagnostics` 时 `[cache-diag]` 直接进 console（不依赖 `debugLog`）

## Non-Goals

- **不**做日志查看面板（这次仅服务"复制贴排错"用例）
- **不**加 UI 开关（默认全开；过滤精准、noise 已掐死）
- **不**发 telemetry / 不上传
- **不**捕获不带命名空间前缀的 console.log（React/Vercel/scheduler 等 noise）

## Architecture

```
console.log("[cache-diag] ...")
   │
   ▼ installConsoleCapture()（启动时安装的全局拦截）
   │   1. 调原 console 函数（F12 仍能看）
   │   2. 检查首参 typeof === 'string' && /^\[[a-z][a-z0-9-]+\]/
   │   3. 不匹配 → 直接 return（不收）
   │   4. 匹配 → 序列化 args 成单串，富化 { sessionId, pageIndex, ts, level }
   │   5. requestIdleCallback 排队 IDB write（不阻塞调用方）
   │
   ▼
IndexedDB(coc-cache-diag).logs
   │  Index: by_session_page [sessionId, pageIndex]
   │
   ▼ CacheStatsPanel handleCopy
   │   getLogsForSession(activeId, lastNPages=10)
   │
   ▼ buildCopyText 拼接
   │   [诊断段] [表格] [F12 日志段] [排错指南]
   │
   ▼
navigator.clipboard.writeText(text)
```

## Components

### 1. `src/utils/console-capture.ts`（新建，~180 行）

模块边界：纯模块，不依赖 React。只 import zustand store（`useChatStore`、`useBookStore`）来获取 sessionId 和 pageIndex —— 这是项目里 store 的访问惯例（参考 `prefix-cache-diagnostics.ts` 之类）。

**Exports**：

```typescript
/** boot 时调一次。可重复调用无副作用（已安装就跳过）。 */
export function installConsoleCapture(): void;

/** 拉取某会话最近 N 页的日志，按 pageIndex 倒序 + 同页内 ts 升序。 */
export function getLogsForSession(
  sessionId: string,
  lastNPages: number,
): Promise<{
  records: LogRecord[];
  omittedPages: number;  // 被截掉的更早页数
  omittedRecords: number;
}>;

/** 删除某会话所有日志（sessionLifecycle 删会话时调）。 */
export function deleteLogsForSession(sessionId: string): Promise<void>;

export interface LogRecord {
  id: number;
  sessionId: string;
  pageIndex: number;  // 1-based; 0 表示无会话/未知页
  ts: number;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
}
```

**实现要点**：

- 模块内布尔 `installed` 防重复安装
- 保留原 `console.log/warn/error/info` 引用
- 序列化非 string 参数用 `JSON.stringify(arg, null, 0)`，失败兜底 `String(arg)`
- 命名空间正则 `/^\[[a-z][a-z0-9-]+\]/`（小写起、允许数字和短横线）
- IndexedDB 操作全部 promise 包装；write 走批量 flush（见 Data Flow，触发条件：pending ≥ 10 走 microtask、否则 idle callback）
- 保留策略：每 100 次 write 后检查计数；某 sessionId 条数 > 5000 → `cursor.delete()` 最旧一半
- IDB 不可用（`indexedDB` undefined / 隐私模式）→ 降级 in-memory ring buffer（2000 条上限），同 API surface

### 2. `src/main.tsx`（修改 1 行）

App boot 入口加：

```typescript
import { installConsoleCapture } from './utils/console-capture';
installConsoleCapture();
```

放在 `ReactDOM.createRoot` **之前**，确保 React 启动期间的 `[…]` 日志也收得到。

### 3. `src/hooks/useChatPipeline.ts:779`（修改 1 行）

去掉 `debugLog` gate：

```diff
- if (dsCfg.debugLog === true) console.log(line);
+ console.log(line);
```

理由：诊断逻辑都跑了，结果不写 console 就是断头路；本次新增的 buffer 也收不到。本来这条就在 `if (dsRestructureOn && dsCfg.experimentalPrefixDiagnostics === true)` 分支里，外层 gate 已经在了。

### 4. `src/components/Settings/CacheStatsPanel.tsx`（修改）

- `handleCopy` 改成 `async` 时多 `await getLogsForSession(activeId, 10)`
- 拿到 `{ records, omittedPages, omittedRecords }` 后传入 `buildCopyText`
- `buildCopyText` 新增参数 `logs: LogRecord[]`、`omittedPages: number`、`omittedRecords: number`
- 在表格段尾、`troubleshoot` 段前插入新 section（实现见"复制文本格式"小节）
- `buildTroubleshootBlock` 加条目 #7

`activeId` 取法：`useChatStore.getState().activeId ?? '__no_session__'`，与 `useChatPipeline` 处保持一致。

### 5. `src/stores/sessionLifecycle.ts`（修改）

按 memory 的"按会话状态隔离不变量"要求，在删会话的流程里加：

```typescript
await deleteLogsForSession(sessionIdBeingDeleted);
```

具体接入点（startNewConversation / clear / delete 之类）按现有调用模式补 —— 需要先看代码定位。

## Data Flow

### 写入路径（高频，每次 console.log）

1. 业务代码调 `console.log('[cache-diag] ...')`
2. 拦截器调原 `console.log`（F12 立刻看到）
3. 正则检查：不匹配 → return
4. 取 sessionId（zustand snapshot，同步、O(1)）
5. 取 pageIndex = `useBookStore.getState().pages.length`
6. enqueue 到 in-memory pending 数组
7. 触发 flush 调度（如果还没调度过）：
   - pending 长度 < 10 → `requestIdleCallback(flush, { timeout: 100 })`
   - pending 长度 ≥ 10 → 立刻 `queueMicrotask(flush)`，避免高频日志期间 buffer 无限涨
8. flush：开一个 readwrite txn，批量 add 全部 pending，清空数组，清调度标志

### 读取路径（低频，复制按钮）

1. `getLogsForSession(sid, 10)`
2. 用 `by_session_page` index 的 `IDBKeyRange.bound([sid, 0], [sid, Infinity])` cursor 遍历
3. 收集 pageIndex 集合 → 取 max；保留 pageIndex >= max(maxPage - 9, 1)
4. 统计 `omittedPages`（不在保留区间的页数）、`omittedRecords`
5. 返回保留区间内的记录数组

## 复制文本格式

在 `buildCopyText` 里，**表格之后、排错指南之前**插入：

```
=== F12 项目日志（按页分组，仅最近 10 页） ===

（省略更早 0 页 / 0 条）  ← 仅在 omittedPages > 0 时出现

— 第 8 页 · 试炼之路 —
[00:08:12.345] [cache-diag] 静态前缀稳定 ✓ (会话内 #8，累计漂移 1/7，按段分布 {wbBefore=1})
[00:08:12.501] [ds-cache-restructure] Partition: { static: 18234, dynamic: 3743 }

— 第 3 页 · 归档任务 —
[00:05:33.012] [cache-diag] ⚠️ 静态前缀漂移 (会话内 #3，累计 1/2，按段分布 {wbBefore=1})
  位置: 字节 2143 (疑似来自 wbBefore 段)
  上回合: ...⏎
  本回合: ...⏎
```

**规则**：

- 倒序（最新页在前），与上方表格一致
- 同页内按 ts 升序
- 时间格式 `HH:mm:ss.SSS`（本地时区）
- 多行 message（如 `[cache-diag]` 的漂移日志）原样保留换行，前缀只挂第一行
- 页标题取 `pages[pageIndex - 1]?.leftHeader`，缺则只写"第 N 页"
- 该会话无日志：整段不输出（不留空 section）
- 加 troubleshoot 条 #7：`想知道哪段漂移：看上面【F12 项目日志】里 [cache-diag] 那条的"按段分布"和"疑似来自 X 段"`

## Error Handling

| 场景 | 处理 |
|---|---|
| `indexedDB` undefined（SSR、老浏览器） | 降级 in-memory ring buffer (2000 条)；不抛错 |
| IDB open 失败（隐私模式 / quota） | 同上 |
| IDB write 失败（quota exceeded） | 静默 swallow（捕获在原 console.error 之外）；下次 flush 重试 |
| 拦截器 throw | try/catch 包裹整段拦截逻辑；原 console 调用永远先做、不受影响 |
| `getLogsForSession` 失败 | 返回空数组 + omittedPages=0；复制按钮照常工作，只是 F12 段为空 |

## Retention & Privacy

- **保留**：每 sessionId 5000 条上限（懒清理：每 100 次 write 触发）
- **删会话**：`deleteLogsForSession(sid)` 删该 sessionId 全部记录
- **跨会话**：默认不清；用户可能想跨会话回看
- **脱敏**：项目日志的 message 不含 API key（key 不会被 log）；`[cache-diag]` 含 80 字符 prevSnippet/currSnippet，可能含玩家输入碎片 —— 但只 80 字符且复制是用户主动触发，**接受这个 trade-off**，与现有"复制表格"诊断段同口径

## Testing

UI 测试由用户做（按 `memory/user-does-ui-testing.md`）。我跑：

- `vitest` 新增 `src/utils/console-capture.test.ts`：
  - 命名空间正则匹配/不匹配（fake-indexeddb）
  - 序列化非 string 参数
  - getLogsForSession 按 pageIndex 倒序、同页 ts 升序
  - 截最近 N 页正确返回 omitted 数
  - deleteLogsForSession 真删
  - IDB 不可用时降级 in-memory
- `tsc` + `npm run build` 不破

## Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 拦截 console 在 React 渲染期间触发同步 IDB 操作 → 卡帧 | `requestIdleCallback` 异步排队，原 console 立即返回 |
| 高频 console.log（如 stream-parser 每 token 一条）撑爆 buffer | 5000 条/session 上限 + 100 次写检查触发清理；命名空间过滤本身已经过滤掉 noise |
| pageIndex 在页切换边界采到旧值 | 接受 fuzziness；日志可能落到上一页或下一页，无关紧要 |
| sessionLifecycle 调用点漏接 | 列出现有 startNewConversation 等所有调用点，确认 4 处都补到（per memory 不变量） |
| `installConsoleCapture` 在 HMR 时重复安装 | `installed` 布尔 + 模块顶层 module identity，HMR 时按 `import.meta.hot?.accept` 跳过 |

## File List

**新建**：
- `src/utils/console-capture.ts`
- `src/utils/console-capture.test.ts`

**修改**：
- `src/main.tsx` — boot 时安装
- `src/hooks/useChatPipeline.ts:779` — 去 debugLog gate
- `src/components/Settings/CacheStatsPanel.tsx` — handleCopy 拉日志、buildCopyText 插段、buildTroubleshootBlock 加条目 #7
- `src/stores/sessionLifecycle.ts` — 删会话时调 deleteLogsForSession

## Acceptance

1. 开 `experimentalPrefixDiagnostics` 后，F12 console 立刻能看到 `[cache-diag]` 输出（不再依赖 `debugLog`）
2. 点缓存面板"复制表格"，剪贴板内容含 `=== F12 项目日志 ===` 段，按页倒序分组，按页内 ts 升序
3. 复制段只含 `[xxx]` 命名空间日志，React/Vercel/Font preload 等不出现
4. 关浏览器、重开、切到同会话，复制仍能看到上次会话的日志
5. 删会话后，日志同步删除（不会跨会话泄漏）
6. 隐私模式下打开应用不崩，复制段为空段（被跳过）

## Out of Scope（后续可做）

- 提供 UI 让用户预览 / 筛选 / 导出已捕获日志
- 给捕获本身加开关（默认开就够）
- 跨会话搜索日志
- 把 troubleshoot 条目 #6（"切换会话/预设/上下文裁剪边界 → 缓存重写"）的判定也自动化（基于捕获日志检测 preset switch 事件等）
