# 剧情骨架与约束（剧情锚点 + 不重复）设计

日期：2026-06-04 · 分支：beta · 状态：设计定稿待实现

## 1. 目标与动机

防止 LLM 自由发散导致剧情乱跑：开局一次性生成本局「剧情蓝图」（有序骨架节点 + 全局硬约束 + 威胁可瓦解依赖），之后每个主回合只注入「当前进度 + 已发生事件 + 软引导」，让 KP（LLM）：

- 不让剧情**漫无目的地乱跑/停滞** —— 朝既定骨架推进（如「极地邀约 → 必然开船去极地」）。
- 认可**逻辑自洽的整活胜利** —— 玩家用合理手段（清空邪教资产、引税务局抓人、毁掉法器祭品、公开揭发使信众溃散……）真正瓦解威胁达成坏结局之能力时，KP 顺势导向好结局，**不因「没按剧本对决」而拒绝或硬拉回**。
- 不重复已发生剧情/选项 —— 防止玩家重复执行同一件事，浪费时间、败坏叙事。

**「规律」只在生成阶段使用**：5 个开局命运各自的母题结构模板只存在于生成器 prompt 内，开局用一次产出具体节点后**绝不再注入**——与现有「statData 快照只注当前态、暗线只注进度+坏结局（暗线规律在 narrative_arc 世界书条目）」一致。

## 2. 核心区分（设计基石）

| | 拦 | 不拦 |
|---|---|---|
| **锚点骨架 + 硬约束** | 漫无目的的乱跑、剧情停滞 | 有逻辑的整活奇招 |
| **开放式胜利判定** | 没真正瓦解任何东西的瞎胡闹（软重定向） | 逻辑性移除威胁关键依赖（认可为合法胜利路径） |

骨架节点 = **默认推进路线**；硬约束 = **「若按默认推进」的地理/因果保证**，**不凌驾于合法整活胜利之上**。

## 3. 已定设计抉择

| 抉择 | 选定 |
|---|---|
| 生成架构 | **独立生成器**（在坏结局/支柱生成之后触发，拿它们 + 所选开局当输入） |
| 不重复粒度 | **按已发生事件**（复用现成 `page.summary` 浓缩成时间线，零额外持久化） |
| 约束强度 | **纯软引导**（注入文本 + 选项引导，不做叙事硬纠偏、不做选项级硬过滤） |
| 整活提前瓦解威胁后 | **允许提前结局**（KP 可跳过剩余骨架节点，用 1-2 回合收尾直接导向好结局） |

## 4. 数据结构

`src/types/index.ts`（仿 `KeyPillar:207-217`）：

```ts
export interface AnchorNode {
  id: string;
  title: string;        // 简短节点名，如「抵达极地死城」
  description: string;  // 1-2 句：该节点剧情应发生什么
}

export interface PlotAnchors {
  nodes: AnchorNode[];           // 3-6 个有序必达节点（默认推进路线）
  constraints: string[];         // 3-5 条全局硬约束（地理/因果保证）
  threatDependencies: string[];  // 威胁达成坏结局所依赖之物（= 玩家可瓦解的靶子）
}
```

MVP **不追踪** node 的 `reached` 状态——靠注入的「已发生事件时间线」让 LLM 自定位当前进度。

## 5. 生成：`anchor-generator.ts`（仿 `bad-ending-generator.ts:40-96`）

```ts
export async function generateAnchors(
  openingCtx: string,         // 开场叙事（序章 + 首页 leftContent）+ 玩家所选命运抉择文本
  badEnding: string,          // 已生成的坏结局（守秘人机密，连贯依据）
  pillars: { title; secret }[], // 已生成的 3 真相支柱
  apiBaseUrl, apiKey, model,
  signal?: AbortSignal,
  temperature = 0.9, maxTokens = 20000, retries = 3,
): Promise<PlotAnchors | null>
```

- 独立 LLM 调用：`rpmAcquire('main')` + `appIdHeaders()` + `coerceJsonObject` 健壮解析 + 仅对无效解析重试 + `max_tokens≥20000`（项目硬下限）。
- **system prompt 内嵌 5 个开局母题规律模板**（导师急信=禁书诅咒单点深挖 / 海风遗产=印斯茅斯封闭敌镇时限压迫 / 山丘委托=敦威治不可见威胁渐显 / 极地邀约=疯狂山脉线性地理纵深 / 镇上异变=阿卡姆多线并行收束）。生成器据「开场叙事 + 坏结局 + 支柱」选最贴近母题，产出与坏结局/支柱**连贯**的 3-6 有序节点 + 3-5 硬约束 + 威胁可瓦解依赖。
- 输出严格 JSON：`{ nodes:[{title,description}], constraints:[...], threatDependencies:[...] }`（id 由调用方补 `crypto.randomUUID()`，仿 keyClue pillars）。
- 绝不向玩家泄露：与坏结局/支柱同属守秘人侧引导。

### 触发点（`useChatPipeline.ts`，仿坏结局块 :999-1026）

序章首回合 fire-and-forget，**排在坏结局/支柱生成之后**（复用其已生成结果当输入）：

- 条件：`useAnchorStore.getState().anchors.nodes.length === 0 && !isEpilogue && API 齐全`。
- `activeId` 会话守卫；成功 → `useAnchorStore.setAnchors(...)` + `saveConversation(aid)`。
- **依赖顺序**：坏结局/支柱当前是 fire-and-forget 异步生成；锚点生成器需在拿到 badEnding+pillars 后才能跑。实现时在坏结局/支柱生成成功的回调内串联触发锚点生成（或独立块内 `await` 读取已落库的 badEnding/pillars，二者皆空则跳过本回合、下回合再试）。
- 老存档：`anchors` 空 → `buildContextInjection` 返回 `''` 不报错（仿 `useKeyClueStore.ts:56`）；下回合按同条件补生成（与坏结局一致）。

## 6. 运行期注入：「剧情骨架与进程」constant LoreEntry

每主回合在 `buildPromptMessages` 里构造（**照搬暗线桶 `useChatPipeline.ts:277-292`**），包成 `constant` LoreEntry 接进 `loreBuckets`（:361-372）。文本五段：

1. **有序骨架节点**（紧凑列出 title + description）—— 默认推进路线。
2. **全局硬约束** —— 标注「若剧情按默认推进则……」。
3. **已发生事件时间线** —— 取最近 N 页 `page.summary` 现算（纯函数，无 LLM 调用），按页序列出 → 服务「不重复」。
4. **软引导指令**：*你（KP）正沿骨架推进；参照已发生事件判断进度；让本回合 4 个行动选项中 ≥1 个推动剧情朝「下一个尚未发生的节点」前进；绝不重复已发生过的事件/场景/对话。*
5. **开放式胜利判定**：列出威胁可瓦解依赖；指令 —— *玩家若用逻辑自洽手段移除其中关键依赖，则暗线再无法逼近坏结局；此时你可跳过剩余骨架节点、用 1-2 回合收尾叙事直接导向好结局（剧情.阶段 可直推「高潮」→「结局」）；不得因「没按剧本对决」而拒绝或拉回；唯有没真正瓦解任何依赖的无意义跑题才软重定向。*

- 文本生成者：`useAnchorStore.buildContextInjection(recentSummaries: string[])` —— store 持有 nodes/constraints/threatDependencies，调用方传入「最近 N 页 summary」（事件时间线不入 store，运行时由 pages 现算）。
- **与暗线挂钩**：第 5 段所述「暗线无法再逼近坏结局」由 KP 在叙事/darkThread progress 上体现（复用现有 darkThread/saveWorld 机制，不新增结算）。
- **lite/补写模式丢弃**：在 `rewrite-lite.ts` 的 `LoreBuckets`/`selectLoreForRewrite`/`droppedLoreForRewrite`（:10-91）三处登记新桶，与 `darkThread` 同列入 dropped（补写不注入）。
- **选项对齐**：第 4 段的「≥1 选项朝节点推进」与现有 `CHOICE_FIT_RULE`（`format-instruction.ts:120-121`）并列；注入文本随暗线桶走，无需改 `assemblePrompt` 签名。

## 7. 不重复（完全复用 page.summary）

- 数据源：每页已持久化的 `page.summary`（一句话摘要），无需新 store/新表。
- 取最近 N 页（N 可配置，默认覆盖到不至于撑爆 token，如最近 8-12 页）summary 按时序拼成时间线，注入第 3 段。
- 仅软约束（不做选项级硬过滤），符合「纯软引导」。

## 8. 持久化与会话隔离（仿 keyClues 单行表范式）

### `src/db/database.ts`
- 加 Row 类型（仿 `KeyClueRow:91-95`）：`interface PlotAnchorRow { conversationId: string } & PlotAnchors`。
- `db` 类型声明加 `plotAnchors: EntityTable<PlotAnchorRow, 'conversationId'>`（:97-114 区）。
- 版本升级（当前 v8，:177-183）：追加 `V9_SCHEMA = { ...V8_SCHEMA, plotAnchors: '&conversationId' }` + `db.version(9).stores(V9_SCHEMA)`。无数据迁移 hook。

### `src/stores/useAnchorStore.ts`（仿 `useKeyClueStore.ts`）
- 字段 `anchors: PlotAnchors`（默认 `{nodes:[],constraints:[],threatDependencies:[]}`）。
- `setAnchors(a)`：**幂等防覆盖**（仅 `nodes.length===0` 时写入，仿 `setPillars:31-35`）。
- `replaceAll(a)`（读档）/ `clearAll()`（隔离）。
- `buildContextInjection(recentSummaries: string[]): string`：nodes 空 → 返回 `''`；否则拼五段文本（事件时间线由入参传入）。

### `src/stores/sessionLifecycle.ts` 四处（**MEMORY「按会话状态隔离不变量」要求全接**）
- `clearAllGameState`（:43-65）：加 `useAnchorStore.getState().clearAll()`。
- `saveConversationInner`（:129-250）：读态（:134-147 区）+ 组 Row + **事务表名数组（:187）追加 `'plotAnchors'`** + 有则 `put`/无则 `delete(cid)`（仿 keyClues :231-235）。
- `loadConversationInner`（:263-395）：事务表名（:277）+ `Promise.all` 加 `db.plotAnchors.get(cid)` + 解构 + `useAnchorStore.replaceAll(row?.anchors ?? 默认)`（仿 :345）。
- `deleteConversationInner`（:407-430）：表名数组（:411）+ `await db.plotAnchors.delete(cid)`（仿 :424）。
- `switchConversation`（:442-462）：**无需改**（内部复用 save/load）。

## 9. 测试

- `sessionLifecycle.test.ts`：新增「开新游戏 B 不继承存档 A 的剧情锚点」用例（仿 :280-297 跨档不泄漏）+ 切档 save/load 往返恢复 anchors。
- `anchor-generator` 解析：`coerceJsonObject` 对截断/畸形/缺字段的健壮性（仿 bad-ending 测试若有）。
- `useAnchorStore.buildContextInjection`：nodes 空返回 `''`；非空含五段关键字；事件时间线随入参变化。

## 10. 不做（YAGNI / 留后续）

- 节点 `reached` 精确追踪与「当前节点指针」推进校验（纯软引导下让 LLM 自定位）。
- 选项级硬过滤 / 重生成。
- 按选项文本去重（只按已发生事件）。
- 锚点 / 威胁依赖的 UI 展示面板（守秘人机密，暂不显示给玩家）。
- 威胁依赖被移除的结构化结算（靠 KP 叙事 + 现有 darkThread 机制软体现，不新增判定调用）。

## 11. 关键风险（来自调研）

- **主 JSON 截断红线**（MEMORY `inline-llm-fields-truncate-trailing`）：锚点**绝不**往 `FORMAT_INSTRUCTION` 输出 JSON 加字段；只走独立生成器 + 运行期 constant LoreEntry 注入。
- **注入膨胀**：baseFormat 已拼接能力/背包/NPC/支柱/序章目标 + 暗线/关键词/statData 三桶；再加锚点桶 + 事件时间线会推高 token。事件时间线用 `page.summary`（非 leftContent）控量，且补写 lite 模式必须丢弃。
- **会话隔离遗漏**：新 store 漏接四处任一 → 跨档泄漏（开新局继承上一局骨架）。clearAll/save(put/del)/load(replaceAll)/delete + 三处事务表名数组都要改。
- **依赖顺序**：锚点生成依赖 badEnding+pillars 已生成；二者也是 fire-and-forget，需串联或下回合补偿。
- **软约束不保证 100% 不重复**：清单越浓缩越省 token 越易漏判；在去重粒度与 token 间取舍。

## 12. 实现锚点速查（文件:行号）

- 开局生成范式：`src/sillytavern/bad-ending-generator.ts:40-96`
- 触发块范式：`src/hooks/useChatPipeline.ts:999-1026`（坏结局/支柱 fire-and-forget）
- 注入桶范式：`src/hooks/useChatPipeline.ts:277-292`（暗线）+ `:361-372`（loreBuckets）
- store 范式：`src/stores/useKeyClueStore.ts:31-64`
- 持久化四处：`src/stores/sessionLifecycle.ts:43-65 / 129-250 / 263-395 / 407-430`
- 表定义：`src/db/database.ts:91-95（Row）/ 177-183（version）`
- lite 丢弃：`src/sillytavern/rewrite-lite.ts:10-91`
- 事件源：`page.summary`（`src/types/index.ts` BookPage）
- 阶段挂钩：`剧情.阶段`（`mvu-schema.ts:39`）、`narrative_arc`（`useLorebookStore.ts:331-379`，规律所在，不重复注入）
