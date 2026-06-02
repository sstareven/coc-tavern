# 线索标签筛选 + 线索整合 + 坏结局机制 — 设计

日期：2026-06-03 · 分支：beta

## 背景
在「线索」页（`InventoryPanel.tsx` 右页，数据 `useClueStore` / `Clue`）增加标签筛选与整合能力；并把游戏模式改为「开局生成一个隐藏坏结局，暗线逐步逼近它」。暗线机制已存在（`useDarkThreadStore` progress 0-100 + `DarkThreadData`，注入「暗线档案」，LLM 每回合在 `darkThread` 字段输出，解析在 `llm-response-parser.ts`）。

> 前置：已修复严重的跨存档隔离 bug（提交 b471e25）。新增的 per-conversation store 必须遵循 `session-isolation-invariant`：接入 `clearAllGameState` + save/load/delete 四处。

## 决策（已与用户确认）
1. 坏结局：**LLM 据开场情境生成**（非内置池）。
2. 坏结局可见性：**完全隐藏**，仅暗线暗中逼近。
3. 线索整合信息源：**仅玩家已知 active 线索**（不读隐藏暗线/坏结局，公平解谜）。
4. 标签体系：**受控分类标签**。
5. 整合产出：**生成新「推理线索」入库**（tier=major、自动加「推理」标签、`synthesized` 高亮）。

## 模块一：线索标签筛选
- `Clue` / `ClueInput` 增 `tags?: string[]`。受控词表常量 `CLUE_TAGS = ['人物','地点','物证','事件','组织','超自然','推理']`。
- `FORMAT_INSTRUCTION` clues 段：要求每条线索从固定集合选 1-3 个 `tags`；`llm-response-parser` 解析时**白名单过滤**（丢弃集合外标签）。
- UI（线索右页）：仿物品页 chip 行——`全部` + 各类别(带计数，仅渲染实际出现的类别)。多选 toggle，OR 命中即显示；点「全部」清空选中集合，点具体类别取消「全部」。
- 旧线索无 tags → 仅「全部」下出现。

## 模块二：线索整合按钮
- 线索页新增「整合线索」按钮（active 线索 < 2 禁用，调用中 loading）。
- 新建 `src/sillytavern/clue-integrator.ts`：独立 LLM 调用（复用 `mvu-extractor.ts` 范式：settings apiBaseUrl/apiKey/apiModel、`rpmAcquire`、`appIdHeaders`、JSON 解析兜底）。
- 输入仅玩家已知 active 线索（name/summary/discoveryNarrative/relatedTo/tags）。
- 产出 1-3 条经 `addClues` 入库：`tier='major'`、tags 含「推理」、新增 `synthesized?: boolean`。
- `Clue.synthesized` 也要进 isolation 持久化（已随 Clue 整体存子表，无需额外接线）。

## 模块三：坏结局 + 暗线逼近
- `useDarkThreadStore` 增单例 `badEnding: { description: string; createdAt: number } | null` + `setBadEnding` + 纳入 `replaceAll`/`clearAll`。
- 持久化：Dexie 新增 `darkEndings`（conversationId 单行表，仿 charsheets）；`sessionLifecycle` 四处接线（save/load/delete + clearAllGameState 经 store.clearAll）。
- 生成：新增 `PROLOGUE_BAD_ENDING_INSTRUCTION`；触发条件 `badEnding==null && 非后日谈` → format 末尾追加，要求模型额外输出 `badEnding` 字段；`llm-response-parser` 解析 → `setBadEnding`。覆盖新开局 + 旧档（下次生成补）。
- 逼近：`darkThread.buildContextInjection` 把 badEnding 作「暗线终点·守秘人最高机密」注入；`FORMAT_INSTRUCTION` 暗线段补「progress 反映向既定坏结局逼近，75+爆发时结局成形」。
- 不做结局过场 UI（YAGNI）。

## 实现顺序（主控 TDD，逐功能 push beta）
1. 模块三基座：badEnding store + isolation 四处接线 + DB 表（TDD）。
2. 模块一：tags 类型 + 解析白名单 + 筛选 UI + 提示词。
3. 模块二：clue-integrator + 整合按钮 UI。
4. 提示词收口：badEnding 生成 + tags + 暗线逼近。

## 验收
- `tsc` 干净、`vitest` 全绿、改动文件 eslint 无新增错误。
- UI 测试由用户做（见 `user-does-ui-testing`）。
- push master 前更新 ChangelogModal（见 `changelog-required-on-master-push`）——本轮在 beta，暂不动。
