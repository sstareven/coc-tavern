# 回合进度条 (TurnProgressBar) 设计

**日期**: 2026-06-08
**分支**: beta
**问题**: MVU 已在关键路径(2026-06-03 反转后等结算完才翻页),但玩家看不到"还在跑哪些阶段",可能误以为卡住,或者趁着 toast 切换间隙再次点选项。需要一个可见的进度条 + 选项 lock 联动,把"队列里还有几个 LLM 子调用"显式化。

## 目标

1. 在 InputBar footer 顶部显示一条进度条,格式 `当前文案 (n/m) ▓▓░░ 18s`
2. `n` = 已完成阶段数(运行中算作"在路上"),`m` = 总阶段数(含将来要跑的)
3. **重纠会让 m 涨**:主回合 JSON retry、MVU 自纠、NPC 缺失补写命中触发时,m 实时 +1
4. `isRunning=true` 期间禁止玩家点选项(防 MVU 未结算就翻页致变量混乱)

## 架构

### 新增文件 3 个

- `src/stores/useTurnProgressStore.ts` — Zustand store,管 stages 队列。语义独立于 `useChoiceLockStore` 和 `useChatPipeline.loading`,不污染现有锁
- `src/components/Shared/TurnProgressBar.tsx` — 纯渲染组件,只读 store
- `src/stores/useTurnProgressStore.test.ts` — 单测 beginTurn / enqueueAfter / start / finish / skip / endTurn 行为

### 改动文件 3 个

- `src/hooks/useChatPipeline.ts` — 6 个埋点(入口 / sendWithJsonRetry / runMvuMegaAgent / runMvuSelfCorrect / rectifyMissingNpcs / finally)
- `src/components/InputBar.tsx` — 在 footer 顶部 mount `<TurnProgressBar />`
- `src/components/Book/RightPage.tsx` — `effectivelyLocked` 多一个 OR 条件 `|| useTurnProgressStore.getState().isRunning`(通过 selector hook)

## Store API

```ts
type StageStatus = 'queued' | 'running' | 'done' | 'skipped';
interface Stage {
  id: string;
  label: string;
  status: StageStatus;
  subLabel?: string;
}

beginTurn(initialStages: Pick<Stage,'id'|'label'>[]): void
enqueueAfter(afterId: string, stage: Pick<Stage,'id'|'label'>): void
start(id: string): void
finish(id: string): void
skip(id: string): void
setSubLabel(id: string, subLabel?: string): void
endTurn(): void

// selector hook(带 shallow):
useTurnProgress(): { current, total, label, subLabel, isRunning }
```

派生规则:
- `total = stages.filter(s => s.status !== 'skipped').length`
- `done = stages.filter(s => s.status === 'done').length`
- `running = stages.find(s => s.status === 'running')`
- `current = done + (running ? 1 : 0)`
- `isRunning = stages.some(s => s.status === 'queued' || s.status === 'running')`
- `label = running?.label ?? ''`

## 阶段定义

| Stage id | label | 入队时机 | 备注 |
|----------|-------|---------|------|
| `main` | 正在窥探深渊 | beginTurn 立刻 | jsonRetry 触发再插 `main-retry-k` |
| `mvu-mega` | 正在解析状态变量 | beginTurn 立刻 | 失败回落再插 `mvu-fallback` |
| `finalize` | 正在汇总书页 | beginTurn 立刻 | 包括 settleVariables 之后到 autoFlipForward |
| `main-retry-{k}` | 主回合 重试 k | jsonRetry 触发时 enqueueAfter('main') | k = 1..jsonRetryCount |
| `mvu-correct-{k}` | 正在校正状态变量 k | 自纠触发时 enqueueAfter('mvu-mega') | k = 1..budget(≤3) |
| `npc-fix` | 正在补写缺失 NPC | detectNpcMissing 命中时 enqueueAfter('mvu-mega') | 条件性,最多 1 个 |

**fire-and-forget 阶段不入队**(prologueMegaAgent / detectAndBuildEncounter / 写回 stat) — 避免翻页后还显示未完成进度。

## UI 视觉规范(InputBar footer 顶部第一行)

- 容器: `padding: '6px 24px'`、`fontSize: 'calc(12px * var(--system-ratio, 1))'`、`fontFamily: 'var(--font-ui)'`、`color: 'var(--gold)'`、`background: 'rgba(196,168,85,0.08)'`、`borderBottom: '1px solid rgba(196,168,85,0.18)'`、`display: flex; alignItems: center; gap: 12`
- 左侧文字: `${label} (${current}/${total})`,subLabel 存在时小一号 opacity 0.7 显示
- 右侧进度条: `flex: 1; height: 3; background: rgba(196,168,85,0.12); borderRadius: 1`,填充 `var(--gold)` + `transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1)`(按 MEMORY [feedback_animation_bezier])
- `isRunning=false` 时整条不渲染,无占位

## 选项 lock 联动

- `RightPage.tsx:672` `effectivelyLocked` 拆出来加一项:`|| progress.isRunning`
- 视图层从 `useTurnProgressStore` 选 `isRunning` 一个布尔,不订阅整个 stages 数组(避免不必要 re-render)
- InputBar 推进/补写按钮已经用 `disabled={pipeline.loading}`,因为 progress 和 loading 同生命周期,**不动**
- 不动现有 `useChoiceLockStore`,避免双源管理

## 错误/取消路径

- `abort` 路径(用户主动停): finally 块 endTurn(),队列清空,锁解开
- `MVU 综合 A 失败回落到 extractor`: 在 fallback 触发处 `enqueueAfter('mvu-mega', { id: 'mvu-fallback', label: '回退到 MVU 提取器' })`
- 异常吞掉的 fire-and-forget 不影响进度条
- 会话切换: sessionLifecycle 触发 endTurn(),与现有 useChoiceLockStore.unlock 同位

## 测试要点

`useTurnProgressStore.test.ts` 覆盖:
1. `beginTurn` 清空旧 stages、塞入新的、全部状态 `queued`
2. `start` → `running`,`finish` → `done`,`skip` → `skipped`
3. `enqueueAfter` 在指定 id 后插入,未找到 id 时追加到末尾
4. 派生计算:`current/total/isRunning/label` 在各组合下正确
5. `endTurn` 清空,`isRunning=false`
6. `skipped` 项不计入 `total`

不测 UI(按 MEMORY [user-does-ui-testing])。

## 接入点(useChatPipeline.ts 6 处)

| 位置 | 改动 |
|------|------|
| ~1697 入口 setLoading(true) | 同步 `beginTurn([{id:'main', label:'正在窥探深渊'}, {id:'mvu-mega', label:'正在解析状态变量'}, {id:'finalize', label:'正在汇总书页'}])` + `start('main')` |
| ~942 sendWithJsonRetry while 循环 attempt++ 前 | `enqueueAfter('main', { id: 'main-retry-${k}', label: '正在重试主回合 ${k}' })` + `finish('main')` + `start('main-retry-${k}')` |
| 主回合最终成功 / 全部 retry 走完 | `finish` 最后跑的 stage |
| ~1060 runMvuMegaAgent 前后 | `start('mvu-mega')` / `finish('mvu-mega')`(或 `skip` 如未启用) |
| ~1087 runMvuSelfCorrect 触发循环每轮 | `enqueueAfter('mvu-mega', { id: 'mvu-correct-${k}', label: '正在校正状态变量' })` + `start/finish` |
| ~1369 rectifyMissingNpcs 命中 | `enqueueAfter('mvu-mega', { id: 'npc-fix', label: '正在补写缺失 NPC' })` + `start/finish` |
| ~1633 autoFlipForward 之前 | `start('finalize')` |
| ~1664 finally | `finish('finalize')` 然后 `endTurn()` |

主控落地时再据现场代码精确调整行号。

## 不做

- 不显示 fire-and-forget 任务的进度(用户认可后台跑无所谓)
- 不做"暂停/取消单个 stage"的 UI 操作
- 不做历史回顾(只显示当前回合)
- 不动 useChoiceLockStore / useChatPipeline.loading 接口

## 解耦合(按 MEMORY [decoupling-modularity-required])

- store / UI / pipeline 接入 三方独立
- TurnProgressBar 纯渲染,无副作用
- store 不耦合任何业务对象(只是 stages 数组 + 方法)
- 6 个埋点都是单行调用,不堆栈
