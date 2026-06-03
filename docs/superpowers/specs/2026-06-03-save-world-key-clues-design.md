# 拯救世界系统（关键线索 / 真相支柱）设计

- 日期：2026-06-03
- 分支：beta（实现+验证后按惯例发版）
- 状态：设计已与用户确认，待实现

## 0. 目标

玩家在剧情中收集【3 条关键线索】（揭示本局谜题的 3 个真相支柱）。集齐 3 个 → 开启「拯救世界模式」，与暗线坏结局的进度赛跑，调查员所有行动服务于终结灾厄。开场告知此目的。

## 1. 关键决策（已确认）
- 关键线索模型：**预定 3 真相支柱**（开局 LLM 生成、守秘人机密、绑定谜题）。
- 好结局范围：**只做模式 + 跟踪 + 赛跑**，不做正式结算画面（达成由叙事自然出结果）。
- 目的告知：**静态开场白总纲 + 选定情境后首幕点明**。
- 拯救模式：**明确化灾厄**（进入后坏结局对玩家公开，作为明确目标）。
- **存档隔离铁律**：新 store 必接 clearAllGameState + save/load/delete 四处（[[session-isolation-invariant]]）。

## 2. 数据模型

```ts
// types/index.ts
export interface KeyPillar {
  id: string;            // 稳定 id（生成时分配）
  title: string;         // 简短标题（守秘人视角，如「凶手身份」）
  secret: string;        // 该支柱的机密真相内容（绝不泄露给玩家原文）
  uncovered: boolean;    // 是否已被某线索揭示
  uncoveredByClue?: string; // 揭示它的线索名（展示/回溯）
}
// Clue 增字段：
//   keyPillarId?: string;  // 本线索揭示的真相支柱 id（=关键线索标记）
```

## 3. Store：`useKeyClueStore`（新，按会话隔离）

```ts
interface KeyClueStore {
  pillars: KeyPillar[];          // 0 或 3 条
  saveWorldMode: boolean;        // N>=3 触发，不可逆
  setPillars: (p: KeyPillar[]) => void;       // 开局生成后写入（仅当当前为空时）
  markPillarUncovered: (pillarId: string, clueName: string) => void; // 命中支柱→标记；N 达 3 自动置 saveWorldMode
  uncoveredCount: () => number;  // N = pillars.filter(uncovered).length
  buildContextInjection: () => string; // 见 §6
  replaceAll: (pillars: KeyPillar[], saveWorldMode: boolean) => void; // 读档恢复
  clearAll: () => void;
}
export const KEY_CLUE_TARGET = 3;
```
- `markPillarUncovered`：置该 pillar.uncovered=true + uncoveredByClue；若 uncoveredCount()>=KEY_CLUE_TARGET 则 saveWorldMode=true（一旦真，不再回退）。

## 4. 生成（开局，解耦，与坏结局同源）

扩展 `bad-ending-generator.ts`（或并列新函数）的独立调用：开局一次产出 **坏结局 + 3 真相支柱**。
- 提示词追加：除坏结局外，给出阻止该灾厄必须揭示的 3 个【真相支柱】（title + secret），守秘人机密。
- 返回 `{ description, pillars: {title, secret}[] }`；`max_tokens≥20000` + 健壮解析 + 重试（沿用现范式）。
- useChatPipeline 现有坏结局 fire-and-forget 段：拿到后 `setBadEnding` + `useKeyClueStore.setPillars(pillars→补 id/uncovered=false)`，带 activeId 守卫 + 持久化。
- 仅当 `pillars` 为空且 API 配置齐全时生成（与坏结局同闸）。

## 5. 判定（每回合，解耦评估器）

新模块 `key-clue-evaluator.ts`：`evaluateKeyClues(pillars机密, newClues, api...) → { matches: {pillarId, clueName}[] }`。
- useChatPipeline 在本回合 clues 应用后触发，**仅当**：有新线索 && 存在未揭示支柱 && 未进入 saveWorldMode && API 齐全。
- 把【未揭示支柱(机密)】+【本回合新线索(name+summary+discoveryNarrative)】喂入，判定哪些线索揭示了哪个未揭示支柱（同支柱只认一次）。
- fire-and-forget + activeId 守卫；命中 → `markPillarUncovered(pillarId, clueName)` + `useClueStore.markClueKey(clueName, pillarId)` + 持久化。
- max_tokens≥20000 + 健壮 JSON 解析 + 重试（仿 location-element-extractor）。

## 6. 注入（提示词）

- **支柱进度注入**（KP 视角，常驻）：在暗线注入旁，告知 LLM「本局 3 真相支柱及其揭示状态」（机密；用于引导剧情逐步让玩家逼近未揭示支柱）——只读引导，不泄露原文给玩家。
- **拯救世界模式注入**（saveWorldMode 时）：强指令——调查员已集齐关键真相、进入与暗线赛跑的终局；**坏结局对玩家明确化**（此时暗线注入改为：灾厄可公开、作为目标）；所有行动、选项都应服务于阻止灾厄；剧情.阶段推进至「高潮」。
- 暗线注入（`useDarkThreadStore.buildContextInjection`）增加 saveWorldMode 形参/分支：非拯救模式保持现状（绝不泄露坏结局）；拯救模式下改为公开灾厄、敦促赛跑。

## 7. 关键线索 & 整合保留（`useClueStore`）

- `markClueKey(name, pillarId)`：给 active 线索按名打 `keyPillarId`（宽松名匹配）。
- `consolidateClues`：归档前收集被归档 active 线索的 `keyPillarId` 集合；归并后的总结线索继承这些 pillarId（若多支柱，分配/并入产出的总结，至少保证每个被归档支柱在某条新 active 线索上仍带标记）。N 由 keyClueStore 跟踪、不受影响。
- `addClues` 演化(evolvesFrom)路径：新线索继承旧线索的 keyPillarId（演化保留关键性）。

## 8. 开场目的告知

- 静态 `defaultPages[0]`（梦境）正文追加一句总纲：调查员须收集三条关键真相、阻止注定降临的灾厄（[[prologue-template-frozen-in-save]]：仅对新游戏生效）。
- 序章首幕（pages.length<=1）FORMAT 追加指令：让 LLM 结合本局谜题，在 leftContent 自然点明调查员的核心目标（纯叙事，不加 JSON 字段，无截断风险）。

## 9. UI（`InventoryPanel` 线索区）

- 线索区顶部「关键线索 N/3」进度（金色，N=keyClueStore.uncoveredCount）。
- 关键线索条目（keyPillarId 非空）加 🔑「关键」徽标，强于 ★major 高亮。
- saveWorldMode 时显示「拯救世界模式 · 与灾厄赛跑」状态条（可结合暗线进度）。

## 10. 持久化（Dexie v8）& 隔离

- `Clue.keyPillarId` 随既有 clues 表持久化（ClueRow 自动带）。
- 新 Dexie v8 单行表 `keyClues`：`&conversationId`，存 `{ conversationId, pillars: KeyPillar[], saveWorldMode: boolean }`。
- `sessionLifecycle`：save 写该行；load 读 → `useKeyClueStore.replaceAll`；deleteConversation 删该行；`clearAllGameState` 加 `useKeyClueStore.clearAll()`。
- 删页一致性：pillars/saveWorldMode 是 store 级 KP 机密态（非页锚定），正常读档从 keyClues 表恢复；删页不重建它（与坏结局一致——坏结局删页也不重建，下回合幂等）。clue.keyPillarId 随 page.clues 重放（addClues 时若再被评估器命中则重标）。

## 11. 测试
- keyClueStore：markPillarUncovered 去重/N 计数/saveWorldMode 触发不可逆/replaceAll/clearAll。
- key-clue-evaluator：解析 matches、非命中、空/截断重试、API 非 2xx 抛错（仿 location-element-extractor.test）。
- useClueStore：markClueKey、consolidate 保留 keyPillarId、evolvesFrom 继承 keyPillarId。
- database.test：keyClues round-trip。
- sessionLifecycle.test：keyClues save→load 往返 + 跨会话隔离 + 删除清行。

## 12. 不做（YAGNI）
- 正式好结局结算画面/完结页；玩家手动标关键线索；超过 3 支柱；好结局生成器。
