# 剧情骨架升级（角色弧 + 因果链 + 主题 + 世界事实）设计

日期：2026-06-09 · 分支：beta · 状态：设计定稿待实现

## 1. 目标与动机

现有 `PlotAnchors`（2026-06-04 实现）已覆盖「有序事件节点 + 全局硬约束 + 威胁靶子」，但参考文章《设计剧情的合格线》总结的四要素后，仍缺三块：

1. **变化 / 角色成长** — 调查员与关键 NPC 都缺一个「开局态 → 终态」的方向感。没有它，每回合 NPC 都像「同一块调色板」，不像活人。
2. **事件因果链** — anchors 已有「有序节点」，但**节点之间为何接续**没有显式表达。文章原话：「一個事件扣著一個事件，每個事件環環相扣」。
3. **本局主题/中心思想** — 当前注入里没有一句话告诉 KP「本局到底想传递什么」。结果是 KP 只追情节、不追主旨，玩到最后没有「文学意义」。

外加文章里强调的「**后台设定集**防 bug」—— 自创世界事实没有显式台账，目前依赖 `useClueStore.lore` 但那是「玩家发现的线索」语义，与 KP 视角硬世界规则不对齐。

## 2. 核心区分（设计基石）

| | 现有 | 本次新增 |
|---|---|---|
| **事件维度** | nodes（节点是什么） | causalLinks（节点之间为什么接） |
| **人物维度** | NpcProfile.personality / innerThoughts（当前态） | characterArcs（终态目标） |
| **主旨维度** | （无） | theme（一句中心思想） |
| **世界规则维度** | clueStore.lore（玩家已发现） | worldFacts（KP 知道、玩家未必发现） |

「**角色弧**」是静态终点，不要求 LLM 每回合输出进度——LLM 只要保证「每回合 NPC 行为不与终点矛盾、长期朝终点靠近」。这是 anchors 思路的延伸（开局定终点，运行期只读不写）。

「**因果链**」走两层：

- **节点间钩子**（静态，开局一次性生成，写进 anchors.causalLinks） — 「节点 A 仅在某件事发生后才能走到 B」的桥接句。
- **回合级 causalEcho**（动态，每回合主 API 后独立子调用产出） — 「上回合 X → 本回合可推动 Y」一句话注入下回合。**不入主 JSON** 以避开「主 JSON 加字段会截断末尾」的已知陷阱。

## 3. 已定设计抉择

| 抉择 | 选定 | 理由 |
|---|---|---|
| 新字段注入接入点 | 扩 `PlotAnchors` + 同一注入文案块 | 改动集中、prompt 缓存命中好；characterArcs 静态化代价可接受 |
| 角色弧覆盖范围 | 调查员 + 关键 NPC（与 pillars 对齐） | 路人/重要 NPC 数量大，弧覆盖全成本不值；100~200 tokens 可控 |
| 因果链颗粒度 | 节点间钩子 + 每回合 causalEcho | 节点钩子稳定可缓存；echo 动态适配走偏 |
| causalEcho 落地路径 | **独立子调用 + fire-and-forget**，不入主 JSON | 规避主 JSON 字段截断末尾（参见记忆 `inline-llm-fields-truncate-trailing`） |
| 主题字段形态 | 单句 message 字符串 | 母题意象易反复出现像塔柏鱼鲶；单句够暗示 |
| 设定集形态 | 扩 `anchors.worldFacts: string[]` | 与已有 anchors 同生命周期；无新增 store；与 clueStore.lore 边界清晰（KP 硬事实 vs 玩家已发现） |

## 4. 数据结构

`src/types/index.ts` 扩 `PlotAnchors`（**beta 期直接断兼容**，新字段全可选但语义上首回合 megaagent 必须吐齐）：

```ts
export interface CharacterArc {
  /** 角色名（调查员=sheet.name；NPC=NpcProfile.name），与 NPC store findIdByName 对齐 */
  name: string;
  /** 开局态：1 句话刻画起点形象（性格/处境） */
  from: string;
  /** 中段态：1 句话刻画转折前的状态（可空，留给 LLM 自由发挥） */
  mid?: string;
  /** 终态：1 句话刻画结局形象，KP 让角色长期朝此方向收束 */
  to: string;
}

export interface CausalLink {
  fromNodeId: string;  // AnchorNode.id
  toNodeId: string;    // AnchorNode.id
  /** 1 句话：「节点 A 走到 B 必须先发生什么 / 玩家行动如何成为 B 的因」 */
  hookHint: string;
}

export interface PlotAnchors {
  // —— 现有 ——
  nodes: AnchorNode[];
  constraints: string[];
  threatDependencies: string[];
  // —— 新增 ——
  /** 1 句本局中心思想，KP 让叙事隐性回响（不要 NPC 说出来当讲道文） */
  theme?: string;
  /** 3-6 条 KP 视角世界硬事实（如「狼人怕银」「社区有三代旧怨」） */
  worldFacts?: string[];
  /** 调查员 + 关键 NPC 各一条角色弧；通常 3-4 条 */
  characterArcs?: CharacterArc[];
  /** 相邻节点间钩子，长度通常 = nodes.length - 1 */
  causalLinks?: CausalLink[];
}
```

`useAnchorStore` 新增 `lastCausalEcho: string` 状态（**只保留最近 1 个**，每回合 extractor 跑完覆盖）。

## 5. 首回合生成：`prologue-megaagent.ts` 改动

`SYSTEM_PROMPT_B` 扩四段新指令；JSON Schema 扩 4 个新字段。

```text
4. 据上述 badEnding+pillars+anchors.nodes，输出本局中心思想 theme（1 句话，
   不超过 30 字，KP 用作隐性引导，禁止 NPC 当讲道文说出来）。
5. 输出 worldFacts 3-6 条 KP 视角世界硬事实（玩家未必发现，但 KP 据此判定
   一切角色合理性）。
6. 输出 characterArcs：调查员一条 + 关键 NPC 各一条（与 pillars 反映出的人
   物对齐，通常共 3-4 条）；每条 from/to 必填，mid 可省。
7. 输出 causalLinks 把 nodes 两两相邻串起：每个 link 一句 hookHint「节点 A
   走到 B 必须先发生什么」，长度 = nodes.length - 1。
```

JSON Schema 末段：

```json
{
  "badEnding": { "description": "string" },
  "pillars": [ { "title": "string", "secret": "string" } ],
  "anchors": {
    "nodes": [ { "title": "string", "description": "string" } ],
    "constraints": ["string"],
    "threatDependencies": ["string"],
    "theme": "string",
    "worldFacts": ["string"],
    "characterArcs": [ { "name": "string", "from": "string", "mid": "string?", "to": "string" } ],
    "causalLinks": [ { "fromTitle": "string", "toTitle": "string", "hookHint": "string" } ]
  }
}
```

注意 `causalLinks` 用 `fromTitle/toTitle` 让 LLM 输出（LLM 看不到 id），`parsePrologueResponse` 内部按 title 反查 nodes 数组拿 id。

`parsePrologueResponse` 扩展：

- `theme` 抽 string，超 50 字截断（safety），空 → undefined
- `worldFacts` 抽 string[]，每条 trim、过滤空、上限 6
- `characterArcs` 抽 array，对每条校验 name+from+to 非空（mid 可空），上限 6
- `causalLinks` 抽 array，按 fromTitle/toTitle 查 nodes 数组，命中后写 fromId/toId；任一未命中丢弃；上限 = nodes.length - 1

「**三段必须全有内容才算成功**」校验**维持现状**（nodes/pillars/badEnding 三段全非空才算成功），新增的 theme/worldFacts/characterArcs/causalLinks **best-effort 软成功** —— 缺失就 anchors 落库时对应字段为空，`buildContextInjection` 对应节静默降级。这避免「LLM 偶尔吐不出 theme/links 就导致首回合无限重试」的退化场景；新字段的价值是「锦上添花」，缺失也比现状好不到哪里去（但也不至于卡死）。

## 6. 运行期注入：`useAnchorStore.buildContextInjection` 改文案

`recentSummaries` 入参不变。新文案 8 节（**字段缺失静默降级整节**，不留空白行）：

```
[剧情骨架与进程 — 仅限守秘人参考，用于把控剧情走向，绝不可照搬进正文]

【本局主题】（隐性回响，不让 NPC 当讲道文）
  {{theme}}

【必经骨架节点（默认推进路线，按序）】
  1. {{node1.title}} —— {{node1.description}}
  ↓ {{link1->2.hookHint}}
  2. {{node2.title}} —— {{node2.description}}
  ↓ {{link2->3.hookHint}}
  ...

【角色弧目标（KP 让角色长期朝终态收束，不强求每回合可见进度）】
  · {{arc1.name}}：{{arc1.from}} → {{arc1.to}}
    （中段：{{arc1.mid}}）  ← 若 mid 存在
  · {{arc2.name}}：...

【已发生事件时间线（旧→新；严禁重复以下场景/对话/事件）】
  1. {{summary1}}
  2. {{summary2}}
  ...

【全局硬约束（按默认推进时遵守，不凌驾合法整活胜利）】
  · {{constraint1}}
  · ...

【KP 视角世界硬事实（玩家未必发现，但据此判定一切合理性）】
  · {{worldFact1}}
  · ...

【上回合因果回响】（仅当 lastCausalEcho 非空）
  {{lastCausalEcho}}

【推进要求】
  参照已发生事件判断当前进度，让本回合 4 个行动选项中至少 1 个推动
  剧情朝「下一个尚未发生的骨架节点」前进；绝不重复已发生事件、场景或对话。

【威胁达成坏结局所依赖之物（玩家可瓦解的关键靶子）】
  · {{threatDep1}}
  · ...

  开放式胜利：玩家若用逻辑自洽的手段真正移除上述关键依赖……（与现行一致）
```

实现要点：
- 用 `lines.push` 累积，每节先判存在性，整节缺失就 `continue`，**永不产生空标题行**
- 节点之间的 `causalLinks` 用 `↓ {hookHint}` 缩进单行插入，自然呈现「因果桥」
- 角色弧 mid 字段缺失就省那行
- `lastCausalEcho` 单独由 `setLastCausalEcho` 写入，不与 anchors 同生命周期

## 7. 新增 LLM 子调用：`src/sillytavern/causal-echo-extractor.ts`

仿 `image-prompt-extractor.ts` / `time-jump-generator.ts` 风格。

```ts
export interface CausalEchoRequest {
  lastSummary: string;       // 上回合 page.summary
  nextNodeTitle: string;     // 当前最可能未达成的下一节点 title
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

export interface CausalEchoResult {
  echo: string;  // 1 句话「上回合 X → 本回合可推动 Y」；失败为空
}

export async function extractCausalEcho(req: CausalEchoRequest): Promise<CausalEchoResult>;
```

设计要点：
- **静态 system prefix**（不分桶，无 reason 切换）— 固定前置便于 prompt cache 命中
- `rpmLane='mvu'`（与 prologue/outfit-extractor 共桶）
- `maxTokens=20000`（项目下限）
- `temperature=0.4`（低温度让回响紧贴 summary）
- 永不 throw — 网络/解析失败一律返回 `{ echo: '' }`
- `signal.aborted` 早退

System prompt（pseudocode）：

```
你是 COC 守秘人的助手。给你「上回合发生的事」与「剧情下一个需推动的节点」，
请用 1 句话（≤40字）描述：上回合玩家的哪个行动，可以成为本回合推动该节点的
「因」。不要重复 summary，只点出钩子。
严格返回 JSON: { "echo": "string" }
```

## 8. 运行期触发：`useChatPipeline.ts` 钩入

主 API 流式 done 之后、saveConversation 之前，**fire-and-forget** 触发：

```ts
// 与 outfit-extractor 同位置触发；二者互不阻塞
if (anchors.nodes.length > 0) {
  void extractCausalEcho({
    lastSummary: justWrittenPage.summary,
    nextNodeTitle: pickNextUnreachedNode(anchors, recentSummaries),
    apiBaseUrl, apiKey, model,
    signal: pipelineSignal,
  }).then(({ echo }) => {
    if (echo) useAnchorStore.getState().setLastCausalEcho(echo);
  });
  // 不 catch；extractor 自身永不 throw
}
```

`pickNextUnreachedNode` 是纯本地启发：拿 anchors.nodes 第一条 title 在所有 recentSummaries 里都没出现的，作为下一个待推动节点。完全本地推断，不再额外发 LLM 调用。

## 9. 数据库：V10 升级

`src/db/database.ts` 加 V10。因 `plotAnchors` 表是 `&conversationId` 主键、整 PlotAnchors 当 value 序列化存，**字段新增不需要改 schema 索引**，只需要 bump version 让老存档触发 store recreate：

```ts
export const V10_SCHEMA = {
  ...V9_SCHEMA,
  // plotAnchors 表 schema 不变（值结构内字段新增不影响 IndexedDB store 索引）
  // 同时承载 outfit/carrying 字段升级（见 outfit-image-injection spec）
} as const;

db.version(10).stores(V10_SCHEMA);
```

按记忆 `beta-no-backward-compat`：不写迁移代码；老存档读到的 PlotAnchors 没有新字段 → `buildContextInjection` 整节降级静默；玩家继续推进时不会重生成（anchors 幂等防覆盖）— 这是可接受的，beta 阶段无包袱。

## 10. 测试

| 单元 | 测试 fixture | 文件 |
|---|---|---|
| `parsePrologueResponse` | (a) 全字段齐全 (b) 缺 theme (c) 缺 arcs (d) causalLinks fromTitle 与 nodes 不匹配 (e) 全字段乱序 | 已存在 `__tests__/prologue-megaagent.parse.test.ts` 加 case |
| `useAnchorStore.buildContextInjection` | 8 节文案 snapshot；字段缺失整节降级；空 `recentSummaries` 不出标题 | 已存在 `__tests__/useAnchorStore.test.ts` 加 case |
| `extractCausalEcho` | mock callDsSubagent：happy / 解析空对象 / null parsed / 网络抛错 / signal aborted | **新** `__tests__/causal-echo-extractor.test.ts` |
| `pickNextUnreachedNode`（pure） | (a) summaries 已涵盖前 2 节点 → 返回第 3 (b) 全未涵盖 → 返回第 1 (c) 已涵盖全部 → 返回最后一节点 | 同上文件或主 hook test |

不测：UI 暴露 anchors 调试面板（按 `user-does-ui-testing.md`）。

## 11. 不做的事（YAGNI）

- 节点 `reached` 状态显式追踪 — 维持 LLM 自定位
- characterArcs 「mid → to」中段过渡的 LLM 输出 — 静态终点 + 自然推进就够
- worldFacts 与 clueStore.lore 自动去重合并 — 两边语义不同，让 LLM 在 prompt 里看到两块并不冲突
- motif 反复意象库 — 已选纯 message 主题
- 主 JSON 加 causalEcho/arcProgress/themeReverb 字段 — 全部走解耦子调用避开截断
- 角色弧 UI 编辑器 — 玩家可直接改 DB（开发期），UI 后续按需补
- 给路人 NPC 也分配弧 — 数量大、价值低

## 12. 关键文件改动清单

| 文件 | 改动类型 |
|---|---|
| `src/types/index.ts` | 扩 `PlotAnchors` 加 4 字段 + 新增 `CharacterArc` / `CausalLink` interface |
| `src/sillytavern/prologue-megaagent.ts` | 改 `SYSTEM_PROMPT_B` + `parsePrologueResponse` |
| `src/stores/useAnchorStore.ts` | 加 `lastCausalEcho` + `setLastCausalEcho`；改 `buildContextInjection` 文案 |
| `src/sillytavern/causal-echo-extractor.ts` | **新建** |
| `src/hooks/useChatPipeline.ts` | 主 API done 后 fire-and-forget 触发 extractor |
| `src/db/database.ts` | V9 → V10（与 outfit spec 合并升级） |
| `src/sillytavern/__tests__/prologue-megaagent.parse.test.ts` | 加 case |
| `src/stores/__tests__/useAnchorStore.test.ts` | 加 case |
| `src/sillytavern/__tests__/causal-echo-extractor.test.ts` | **新建** |

## 13. 与 outfit-image-injection spec 的耦合点

唯一耦合点：`db V10` 升级。约定**先落地的 spec 负责创建 V10_SCHEMA**，后落地的 spec 不再 bump version，只在 PlotAnchors / NpcProfile / Sheet 字段添加新字段（值结构内字段新增不影响 IndexedDB store 索引）。

实现顺序由 writing-plans 阶段决定，两条 spec 改的代码路径几乎不重叠，可并行实现并行 review。
