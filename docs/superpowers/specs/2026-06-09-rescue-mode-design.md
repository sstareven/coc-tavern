# 拯救模式（多路径 RescueEnding + 进度条）设计

日期：2026-06-09
分支：beta（开发线，后续按记忆「更新公告必须人话化」走 master）

## 目标

让玩家在游戏中能看到「拯救可能性」状态条；剧本作者可在剧本编辑器里为每个剧本预设 2~4 条 RescueEnding（拯救路径），每条由若干「里程碑」推进；与已有的暗线 progress 形成赛跑：暗线先 100% → badEnding；某条 RescueEnding 先 100% → 锁定为最终结局。

整体写入与 MVU 体系一致（项目记忆「MVU API 管控所有变量 · 2 RPM 目标」），不开新 LLM 子调用。

## 设计约束（已通过 brainstorming 确认）

- **多路径**：剧本可定义多条 RescueEnding，各自一条 0~100 进度
- **里程碑触发**：剧本预定义每条路径的 N 个里程碑（`delta` 固定），LLM 只判定「该里程碑是否达成」
- **逐步解锁**：每条路径有 `unlockHint`，未触发前路径名隐藏
- **首条解锁即显示**：任一路径 `unlocked=true` 时顶部横条出现；全 `unlocked=false` 不渲染
- **100% 锁定结局**：某条路径 progress=100 → `globalStatus='锁定'` + `winningEndingId` 填值，其他路径冻结
- **严格赛跑**：与 `useDarkThreadStore.entries[].progress` 形成对照；暗线先到 → badEnding，救援先到 → 锁定 RescueEnding；UI 同条横条两侧对照
- **横条形态**：单条横条叠 N 个金点（每条路径一个标记），不浮层、嵌入 StatusBar 一行
- **失败变体**：每条 RescueEnding 绑定 `failureVariantId` 指向 `ScenarioDoc.badEndings[]` 中的某条；暗线赢时按胜出方向挑变体收尾

## §1 数据模型

### 1.1 剧本侧类型（`src/types/scenario.ts`）

```ts
export interface RescueMilestone {
  id: string;
  name: string;
  delta: number;   // 推进点数，默认 25
  hint?: string;   // 给 LLM 的判定提示
}

export interface RescueEnding {
  id: string;
  name: string;
  description: string;     // 「成功是什么样」的叙事种子
  unlockHint: string;      // 解锁条件描述
  milestones: RescueMilestone[];
  failureVariantId?: string;  // 指向 ScenarioDoc.badEndings[].id
}

// ScenarioDoc 加字段
interface ScenarioDoc {
  // ...
  rescueEndings?: RescueEnding[];
}
```

### 1.2 运行态 store（`src/stores/useRescueStore.ts`，新建）

```ts
export interface RescuePathState {
  endingId: string;
  unlocked: boolean;
  progress: number;          // 0-100
  achievedMilestoneIds: string[];
  lastNarration?: string;
}

export interface RescueSnapshot {
  paths: RescuePathState[];
  globalStatus: '潜伏' | '对峙' | '锁定';
  winningEndingId: string | null;
}

interface RescueStore {
  paths: RescuePathState[];
  globalStatus: '潜伏' | '对峙' | '锁定';
  winningEndingId: string | null;

  initFromScenario(endings: RescueEnding[]): void;
  unlockPath(endingId: string): void;
  advanceMilestone(endingId: string, milestoneId: string, narration?: string): void;
  applyDelta(endingId: string, delta: number, narration?: string): void;  // 兜底
  lockOutcome(endingId: string): void;
  buildContextInjection(): string;
  clear(): void;
  hydrateFromSnapshot(snap: RescueSnapshot | null): void;
  toSnapshot(): RescueSnapshot;
  hydrateFromStatData(statData: Record<string, unknown>): void;  // LLM 写 statData 后反向同步
}
```

**真源与同步方向**：
- `useRescueStore` 是 UI 读取的真源；`statData['剧情']['救援']` 是镜像（供 prompt 宏 + LLM 反查）
- store mutation（unlock/advanceMilestone/applyDelta/lockOutcome/initFromScenario/clear）必须**同步**调 `setTreePath` 把对应子树写回 `statData`
- LLM 主回执 JSONPatch 经 `useVariableStore.processResponse` 写到 `statData` 后，由 `mvu-megaagent.dispatchMegaAgentResult` 在管线末尾调 `useRescueStore.hydrateFromStatData(statData)` 反向回灌 store —— 单点同步，避免响应式订阅复杂度

行为约定：
- `globalStatus` 由 paths 推导写回：全部 unlocked=false → `潜伏`；任一 unlocked → `对峙`；任一 100% → `锁定`
- `lockOutcome` 不可逆：调用后 `winningEndingId` 填值，其他路径不再接受 `applyDelta/advanceMilestone`（store 内静默丢弃）
- `advanceMilestone` 同一 milestoneId 只生效一次（去重；记忆「session-isolation 不变量」语义）
- `hydrateFromStatData` 必须幂等且不破坏不可逆性：若 `statData` 显示 `胜出路径` 已填且本地 store 未锁，自动调 `lockOutcome`；反过来若本地已锁但 statData 没锁，**不**降级（防 LLM 回退）

## §2 MVU 镜像 + LLM 通知通路

### 2.1 statData 镜像结构

```yaml
剧情:
  救援:
    全局状态: 潜伏        # 潜伏/对峙/锁定
    胜出路径: ''          # 锁定后填 ending name
    路径:
      封印古神:
        已解锁: false
        进度: 0
        已达里程碑: []
        最近: ''
      驱散邪教:
        已解锁: false
        进度: 0
        已达里程碑: []
        最近: ''
```

key 用 `RescueEnding.name`（与暗线 `剧情.NPC.<名>.态度` 用名作 key 一致），不用 id —— LLM 看名字易判定，输出更稳。

### 2.2 改动点

**MVU 核心**：
- `src/sillytavern/mvu-initial-statdata.ts` —— `剧情` 块加 `救援: { 全局状态: '潜伏', 胜出路径: '', 路径: {} }`
- `src/sillytavern/mvu-schema.ts` —— 加：
  - `'剧情.救援.全局状态'` enum `['潜伏', '对峙', '锁定']`
  - `'剧情.救援.胜出路径'` string
  - `'剧情.救援.路径.*.已解锁'` boolean
  - `'剧情.救援.路径.*.进度'` `{ kind: 'number', min: 0, max: 100 }`

**LLM 字典（lorebook 内置条目）**：
- `src/stores/useLorebookStore.ts` 的 `mvu_update_rules` 内置条目 YAML —— `剧情:` 下新增 `救援:` 子树，写 type/range/check，告诉 LLM：
  - 玩家行为命中某路径的 `unlockHint` 含义 → 写 `路径.X.已解锁 = true`
  - 命中某里程碑 hint → `路径.X.进度 += milestone.delta` + push `已达里程碑`
  - `路径.X.进度 >= 100` → `全局状态='锁定'` + `胜出路径='X'`
- 同文件 `mvu_initvar` 条目 YAML —— 同步加 stub（玩家可见参考）

**JSONPatch 示例**：
- `src/sillytavern/format-instruction.ts` —— 加一段救援推进 demo（参考现有暗线写法）

**输出转发**：
- `src/sillytavern/mvu-megaagent.ts` 的 `dispatchMegaAgentResult` —— 不进 megaAgent schema 主块（记忆「inline-llm-fields-truncate-trailing」）。LLM 通过主回执 JSONPatch 写到 `statData['剧情']['救援']` 后，**dispatchMegaAgentResult 在最后调 `useRescueStore.hydrateFromStatData(updatedStatData)`** 反向回灌 store —— 这是唯一同步点，保证 store ↔ statData 单向收敛

**剧本激活种子**：
- `src/scenario/scenario-injection.ts` —— `buildScenarioStatDataSeed` 按 `scn.rescueEndings[].name` 把 `路径.*` 种入 statData seed；同时构造 lore entry「拯救路径状态」常驻注入

写入入口收窄到主回执 JSONPatch 一条（不开新子调用），符合「2 RPM 目标」。

## §3 剧本编辑器 RescueEndingsTab

### 3.1 类型与 reducer 同步（两处必同改）

- `src/scenario/scenario-patch.ts` `applyScenarioPatch` —— 加 `rescueEndings: { upsert?, removeIds?, replaceAll? }` 字段
- `src/stores/useScenarioStore.ts` `mergePatch` —— 同步加（记忆「双 reducer 分歧」风险）

### 3.2 ScenarioEditor 注册（4 处）

- `src/components/Scenario/ScenarioEditor.tsx`
  - `TabKey` 加 `'rescue'`
  - `TABS` 加 `{ key: 'rescue', label: '拯救路径', hidden: false }`
  - `renderTab` switch 加 case
- `src/components/Scenario/tabs/RescueEndingsTab.tsx`（新文件，接 `(scn, onChange)` props）

### 3.3 RescueEndingsTab UI 形态

参考 `BadEndingsTab` 实现：列表卡片 + 内嵌编辑。每张卡：
- 路径名输入 / 描述 textarea / 解锁条件 textarea
- 失败变体下拉（来自 `scn.badEndings`，未选警告但不阻塞保存）
- 里程碑子列表：拖拽排序 / 名称 / delta 数字 / hint textarea / 删除
- 顶部统计栏：`{N} 条路径 · {M} 个里程碑 · {K} 条未绑失败变体`

样式遵循「剧本系统所有滚动条铜版风」记忆 —— 套 `.scenario-editor` className 级联。

### 3.4 与 BadEndingsTab 联动

- `BadEndingsTab` 每条 badEnding 标注：`已被路径〈封印古神〉绑定为失败变体`（双向显式）
- 删 badEnding 时清空所有 `rescueEndings[].failureVariantId == 此 id`（不阻塞，保持 beta 阶段「断兼容」语义）

## §4 顶部拯救横条 UI

### 4.1 放置

- **桌面端**：`StatusBar` 内的新一行（HP/SAN/MP 行下方、场景信息行同级），随 StatusBar 自然滚出，不浮层
- **手机端**：进 `CompactStat` 同行，单格压缩成「⚜ 2/3 · 67」（最高路径里程碑数 / 暗线 progress %），点击弹底部抽屉看全部
- 隐藏阈：`globalStatus === '潜伏'` → 整行不渲染（不占高度）

### 4.2 形态

```
┌──────────────────────────────────────────────────────────────┐
│ ⚜  封印古神  ━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━  3/5  🔴 67  │
│    驱散邪教  ━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━  2/4              │
│    带走幸存者 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  0/3 [未解锁]    │
└──────────────────────────────────────────────────────────────┘
```

- 复用 `CurrentScenarioBadge.tsx:330-346` 的 `ProgressBar`（inline style，CSS 变量配色）
- 整体单条共享底色 `var(--blood) → 暗渐变`，顶层细描金边 `var(--gold)`
- 每条 RescueEnding 一行：
  - **unlocked**：金色实心圆点位置=progress；hover 显示已达里程碑列表
  - **locked-out**：灰点（其他路径在某条 100% 后冻结）
  - **unrevealed（`!unlocked`）**：**整行不渲染**——既不显示路径名也不占视觉位（与「逐步解锁」语义一致：玩家不知道还有这条路存在）
- 右端：里程碑达成 `已达/总数`
- 右上角红色小数字：暗线 `useDarkThreadStore.entries.at(-1)?.progress` —— 赛跑参照
- 锁定后整条变金 + 横向铭牌「最终结局：封印古神」

### 4.3 样式约束

- 容器用 `BadgeButton` 风（brass 边框 + 暗渐变背景），但**不**用其 `fixed` 定位
- 动画统一 `transition: width 360ms cubic-bezier(0.4, 0, 0.2, 1)`（记忆「动效贝塞尔曲线优先」）
- 字号**不接** `var(--system-ratio)`（记忆「按钮内字号一般不接」）
- 图标用现有 `IconLuck`（四芒星）；锁定时叠 `IconStar` filled —— 若需要专用 `IconRescue` 可后置补 SVG（同 `TabIcons.tsx` base() viewBox/stroke 风）

### 4.4 文件

- `src/components/Book/RescueBar.tsx`（新）—— 桌面+手机两态
- `src/components/Book/StatusBar.tsx` —— 在 HP/SAN/MP 行下方插一行；compact 模式下进 CompactStat

## §5 删页快照 + 会话隔离

### 5.1 按页快照（记忆「删页回溯快照模式」）

- `src/types/index.ts` `BookPage` 加 `rescue?: RescueSnapshot`
- `src/stores/useBookStore.ts` 加 `setPageRescue(pageIndex, snap)` action
- `src/hooks/useChatPipeline.ts` 提交回执后调 `setPageRescue(newPageIndex, useRescueStore.getState().toSnapshot())`，与 `setPageDarkThread` 同位置
- `src/components/Book/Storybook.tsx` 删页路径在 clearAll 后调 `useRescueStore.hydrateFromSnapshot(targetPage.rescue ?? null)` 重放

### 5.2 会话隔离（记忆「按会话状态隔离不变量」4 处）

- `src/stores/sessionLifecycle.ts` 4 处全部接 `useRescueStore`：
  - `startNewConversation()` → `useRescueStore.getState().clear()` + 等剧本激活时再 `initFromScenario`
  - `saveCurrentConversation()` → 写 dexie `rescue` 表
  - `loadConversation(id)` → 读 dexie + `hydrateFromSnapshot`
  - `deleteConversation(id)` → 删 dexie 行
- dexie schema：在 `src/db/dexie.ts`（项目实际位置）加表 `rescue`（key=conversationId）。若文件位置/表声明方式与暗线表 `darkThreads` 不同，照搬暗线写法

### 5.3 剧本激活流程接入

- `src/scenario/scenario-engine.ts` `activateScenario` —— 调 `useRescueStore.initFromScenario(scn.rescueEndings ?? [])` → statData seed 写入（通过 `useVariableStore.setStatData(deepMerge(...))`）
- `unloadScenario` —— 调 `useRescueStore.clear()`

## §6 测试策略

新增测试文件：
- `src/stores/useRescueStore.test.ts`：
  - `initFromScenario` 正确建 path 列表
  - `unlockPath` 改 `globalStatus` 为 `对峙`
  - `advanceMilestone` 推进 + 同 milestoneId 幂等
  - 进度满 100 → `lockOutcome` 自动触发 → 其他路径冻结
  - `applyDelta` 兜底（含负值约束、上界饱和）
  - `hydrateFromStatData` 幂等 + 不降级（已锁定状态不被 statData 回退覆盖）
- `src/scenario/scenario-injection.test.ts` 扩：剧本含 `rescueEndings` 激活后 statData `剧情.救援.路径.*` seed 正确
- `src/scenario/rescue-flow.integration.test.ts`（新）：
  - 模拟主回执 JSONPatch：unlock → 里程碑 ×N → progress=100 → globalStatus 锁定
  - 锁定后给 LLM 的 lore 注入文本含「已锁定为〈封印古神〉，其他路径无效」
- 删页快照：写 2 页、第二页拯救 +50，删第二页 → store 回到第一页快照
- 暗线赛跑：暗线 progress=100 时 `buildContextInjection` 文本含「暗线已胜出，不应再推进救援」（纯提示、不机制阻止）

## §7 改动文件清单（约 17 处，多为薄改）

| # | 文件 | 类型 | 说明 |
|---|------|------|------|
| 1 | `src/types/scenario.ts` | 改 | `RescueMilestone`/`RescueEnding` + `ScenarioDoc.rescueEndings?` |
| 2 | `src/stores/useRescueStore.ts` | **新** | 运行态 store |
| 3 | `src/sillytavern/mvu-initial-statdata.ts` | 改 | `剧情.救援` 块 |
| 4 | `src/sillytavern/mvu-schema.ts` | 改 | 4 条 rule |
| 5 | `src/stores/useLorebookStore.ts` | 改 | `mvu_update_rules` + `mvu_initvar` 内置 YAML |
| 6 | `src/sillytavern/format-instruction.ts` | 改 | JSONPatch 示例 |
| 7 | `src/sillytavern/mvu-megaagent.ts` | 改 | `dispatchMegaAgentResult` 转发 rescue ops |
| 8 | `src/scenario/scenario-engine.ts` | 改 | activate/unload 调 init/clear |
| 9 | `src/scenario/scenario-injection.ts` | 改 | statData seed + lore 注入 |
| 10 | `src/scenario/scenario-patch.ts` | 改 | `rescueEndings` reducer |
| 11 | `src/stores/useScenarioStore.ts` | 改 | `mergePatch` 同步（双 reducer） |
| 12 | `src/components/Scenario/ScenarioEditor.tsx` | 改 | TabKey/TABS/renderTab |
| 13 | `src/components/Scenario/tabs/RescueEndingsTab.tsx` | **新** | 拯救路径编辑 tab |
| 14 | `src/components/Scenario/tabs/BadEndingsTab.tsx` | 改 | 「被绑定为失败变体」提示 |
| 15 | `src/components/Book/RescueBar.tsx` | **新** | 顶部横条组件 |
| 16 | `src/components/Book/StatusBar.tsx` | 改 | 嵌入 RescueBar（含 compact 模式） |
| 17 | `src/stores/sessionLifecycle.ts` + `src/db/database.ts` + `src/types/index.ts` + `src/stores/useBookStore.ts` + `src/components/Book/Storybook.tsx` + `src/hooks/useChatPipeline.ts` | 改 | 会话隔离 4 处 + BookPage.rescue 快照 + 写入/回放 |

测试：3 个新文件 + 1 个扩展。

## §8 风险与注意

1. **双 reducer 分歧**：`scenario-patch.ts` 与 `useScenarioStore.mergePatch` 必须同步加 `rescueEndings` 处理，记忆已警告
2. **主 JSON 加字段截断**：不进 megaAgent OUTPUT_SCHEMA，rescue ops 走主回执 JSONPatch（记忆「inline-llm-fields-truncate-trailing」）
3. **删页快照**：必走 `BookPage.rescue` 快照 + 重放，不能只靠 store dexie（记忆「page-delete-rollback-snapshot-pattern」）
4. **会话隔离**：sessionLifecycle 4 处一处不漏（记忆「session-isolation-invariant」）
5. **beta 阶段断兼容**：删 badEnding 时清空绑定的 failureVariantId，不写迁移；老存档没 `剧情.救援` 时 `statPath` 返回空字符串，前端 fallback `globalStatus='潜伏'` → 不渲染（无伤害）
6. **statData 同步**：所有 rescueStore mutation 必须 `setTreePath` 镜像 statData（记忆「megaagent-darkthread-statdata-sync」）
7. **LLM 用名作 key**：path key 用 name 而非 id，剧本作者改 RescueEnding name 时需同步 statData rename（reducer 内做）
8. **手机端横条**：CompactStat 已有压缩逻辑，加 rescue 列要测试现有列宽阈不被挤爆（记忆「ui-pref-no-overflow-no-button-bloat」）
9. **横条不接 system-ratio**：字号别接 `var(--system-ratio)`，进度数字接 `var(--text-ratio)` 即可
10. **buildContextInjection 内容控制**：给 LLM 的状态文本不要过长——已知 lore 桶不进 prefix cache（记忆「DS 缓存优化器现状」），冗长会损 cache 命中
