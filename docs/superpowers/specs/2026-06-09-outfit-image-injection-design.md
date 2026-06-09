# 装束-生图对齐（NPC outfit/carrying + Sheet outfit + 生图 prompt 注入）设计

日期：2026-06-09 · 分支：beta · 状态：设计定稿待实现

## 1. 目标与动机

当前生图 prompt 上下文（`ImageRenderContext`，`src/api/image-gen-merge.ts:43-51`）只把 characters 当**名字数组**喂给生图 LLM：

```ts
characters?: string[]; // 在场重要角色名(中文)
```

后果：调查员中途换装、捡到道具、丢失装备、被血溅、烧坏外套——生图 LLM 全不知道，每次生图把角色画回「默认装束」。同 NPC 同回合的不同生图甚至装束都不一致。

文章原话「**自创物件記錄下來，免得寫著寫著忘了**」——给「世界状态」加显式装束/可见物件层，让生图 LLM 也认识这层状态。

## 2. 核心设计

**「装束」分两路存** —— 调查员与 NPC 走不同 store（调查员**不**在 useNpcStore）：

| | 调查员（玩家自己） | NPC |
|---|---|---|
| 字段位置 | `useSheetStore.sheet.outfit` | `NpcProfile.outfit` / `NpcProfile.carrying` |
| 谁更新 | outfit-extractor 子调用 + UI 玩家手改 | 同上 |
| 谁读 | image-prompt-builder 拼 ctx 时 | 同上 |
| 哪些 NPC 参与 | — | **仅 importance ∈ {'核心','重要'}** |

**更新走「独立 LLM 子调用」**而不入主 JSON：

- 主 JSON 不加 outfit 字段，规避「主 JSON 加字段会截断末尾」（参见记忆 `inline-llm-fields-truncate-trailing`）。
- 主 API done 之后 **fire-and-forget** 触发 `outfit-extractor`，读 leftContent + 当前快照 → 仅输出**本回合发生过变化**的项 → 写库。
- 路人 NPC 不挂装束（与 `useNpcStore.buildContextInjection` 现行「核心/重要 vs 路人」分层一致）。

**英文翻译**搭车 `image-prompt-extractor` —— 不再多开一个 LLM 调用：

- NovelAI / SD-compat 等英文 tag 协议下，`image-prompt-extractor` 拼英文 hint 时把当前 NPC outfit/carrying 中文文本一并喂给 LLM 翻成英文 tag。
- OpenAI（DALL-E 等）协议可直接走中文，不必翻。
- 判定沿用现行的 `needsLlmEnglishHint`。

## 3. 已定设计抉择

| 抉择 | 选定 | 理由 |
|---|---|---|
| 装束存哪 | 扩 `NpcProfile` + `Sheet`，不新建 store | session-isolation-invariant 已多一个 store 要四处接钩，能不加就不加 |
| 装束更新触发 | 独立 outfit-extractor 子调用，fire-and-forget | 不损主 JSON 输出末尾；可跨回合记忆 |
| 哪些 NPC 参与 | 仅核心/重要，路人不挂 | 路人是场景陈设，生图也只是「画面里有几个穿便装路人」；避免 token 浪费 |
| outfit-extractor 与 image-prompt-extractor | **拆开两个子调用** | 角色不同：outfit-extractor 写库每回合都跑；image-prompt-extractor 只生图触发跑、无副作用 |
| 英文 tag 翻译 | 搭车 image-prompt-extractor，不再新调用 | 已有英文化分支可复用 |
| 首回合调查员初装束 | outfit-extractor 强制跑一次初始化 | prologue-megaagent 不扩 outfit 字段（已扩 4 个，再加会推高截断风险） |

## 4. 数据结构

`src/types/index.ts`：

```ts
export interface NpcProfile {
  // —— 现有字段 ——
  // ...
  /** 中文短句：当前装束。如「灰色羊毛大衣，内里被血浸透」。空表示未显式记录。 */
  outfit?: string;
  /** 显眼可见物件列表（非全清单）。如 ["手电","左轮","油布包"]。 */
  carrying?: string[];
}

// Sheet（src/types/index.ts 或 sheet 子类型文件）
export interface Sheet {
  // —— 现有字段 ——
  // ...
  /** 中文短句：当前装束。同 NpcProfile.outfit 语义。 */
  outfit?: string;
}
```

`useInventoryStore` **不动**（已有 items 是物件清单语义；carrying 是「外露可见」语义，二者会有交集但语义不同 — 不强行去重）。

## 5. 新增 LLM 子调用：`src/sillytavern/outfit-extractor.ts`

仿 `image-prompt-extractor.ts` / `causal-echo-extractor.ts`（同 spec 兄弟）风格。

```ts
export interface OutfitExtractorRequest {
  /** 本回合主 API 产出的 leftContent（叙事正文）。 */
  leftContent: string;
  /** 当前调查员 sheet.outfit 快照（空字符串 = 未记录）。 */
  investigatorOutfitSnapshot: string;
  /** 当前核心/重要 NPC 快照：[{name, outfit, carrying}]。 */
  npcSnapshots: Array<{ name: string; outfit: string; carrying: string[] }>;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

export interface OutfitExtractorResult {
  /** 调查员装束变更（若本回合未发生变化则 undefined）。 */
  investigatorOutfit?: string;
  /** NPC 装束/可见物件变更，按 name 分桶；本回合未变 NPC 不出现在 map 里。 */
  npcs: Record<string, { outfit?: string; carrying?: string[] }>;
}

export async function extractOutfitDiff(req: OutfitExtractorRequest): Promise<OutfitExtractorResult>;
```

设计要点：

- **静态 system prefix**（无 reason 分桶），前置稳定字节序便于 prompt cache 命中
- `rpmLane='mvu'`（与 prologue/causal-echo 共桶）
- `maxTokens=20000`（项目下限）
- `temperature=0.4`（低温度让 diff 紧贴正文）
- 永不 throw — 网络/解析失败一律返回 `{ npcs: {} }`
- `signal.aborted` 早退
- 解析后**过滤 name** —— 不在 npcSnapshots 名单里的丢弃（避免 LLM 把临时杂鱼写进库）
- **仅产 diff** — 当前与快照相同的不输出（节约 token + 避免写库无效抖动）

System prompt（pseudocode）：

```
你是 COC 守秘人的助手。给你「本回合叙事正文」与「当前装束快照」，
请仅产出本回合发生过变化的项：
  - investigatorOutfit: 调查员的新装束描述（中文短句，≤40 字）
  - npcs[name].outfit: 该 NPC 的新装束
  - npcs[name].carrying: 该 NPC 当前显眼可见物件列表（≤5 项）
未变化的项不要输出；快照里没有的 NPC name 不要新增。
carrying 仅写「外露可见」之物（手电、左轮、油灯…），怀里揣的不算。
严格返回 JSON：{
  "investigatorOutfit": "string?",
  "npcs": { "<name>": { "outfit": "string?", "carrying": ["string"]? } }
}
```

## 6. 运行期触发：`useChatPipeline.ts` 钩入

主 API 流式 done 之后，**fire-and-forget**，与 causalEcho-extractor 并列触发：

```ts
const importantNpcs = useNpcStore.getState().getPresent()
  .filter((p) => p.importance === '核心' || p.importance === '重要');
const snapshots = importantNpcs.map((p) => ({
  name: p.name,
  outfit: p.outfit ?? '',
  carrying: p.carrying ?? [],
}));
const investigatorOutfit = useSheetStore.getState().sheet.outfit ?? '';

void extractOutfitDiff({
  leftContent: justWrittenPage.leftContent,
  investigatorOutfitSnapshot: investigatorOutfit,
  npcSnapshots: snapshots,
  apiBaseUrl, apiKey, model,
  signal: pipelineSignal,
}).then((result) => {
  if (result.investigatorOutfit) {
    useSheetStore.getState().setOutfit(result.investigatorOutfit);
  }
  for (const [name, diff] of Object.entries(result.npcs)) {
    const id = useNpcStore.getState().findIdByName(name);
    if (!id) continue;  // 双保险：extractor 已过滤，这里再防御
    useNpcStore.getState().patchProfile(id, {
      ...(diff.outfit ? { outfit: diff.outfit } : {}),
      ...(diff.carrying ? { carrying: diff.carrying } : {}),
    });
  }
});
```

**首回合特殊化**：序章生成完、玩家点出第一个选项进入第一回合后，主 API done 时**强制跑一次** outfit-extractor，把调查员初装束写进 sheet.outfit、关键 NPC 初装束写进 NpcProfile.outfit。判定条件：`useSheetStore.getState().sheet.outfit` 为空。

## 7. 生图整合：`src/api/image-gen-merge.ts` + `image-prompt-builder.ts`

### 7.1 ImageRenderContext 结构升级

**beta 期断兼容直接改类型**（按记忆 `beta-no-backward-compat`）：

```ts
export interface ImageRenderContext {
  location?: string;
  time?: string;
  weather?: string;
  /** 在场重要角色含装束。调查员第 0 项，NPC 按 NpcProfile.updatedAt 倒序。 */
  characters?: Array<{
    name: string;
    outfit?: string;
    carrying?: string[];
  }>;
  san?: number;
  sceneBrief?: string;
}
```

### 7.2 image-prompt-builder 拼 ctx

```ts
const investigatorEntry = sheet.outfit
  ? { name: sheet.name, outfit: sheet.outfit, carrying: [] }
  : { name: sheet.name };

const npcEntries = useNpcStore.getState().getPresent()
  .filter((p) => p.importance !== '路人')
  .sort((a, b) => b.updatedAt - a.updatedAt)
  .map((p) => ({
    name: p.name,
    ...(p.outfit ? { outfit: p.outfit } : {}),
    ...(p.carrying?.length ? { carrying: p.carrying } : {}),
  }));

const ctx: ImageRenderContext = {
  // ...location/time/weather/san/sceneBrief 不变
  characters: [investigatorEntry, ...npcEntries],
};
```

### 7.3 模板占位

`PromptTemplateContext`（`image-gen-merge.ts:96-125`）新增两个占位：

```ts
{
  // —— 现有 ——
  characters: string;            // 仅名字逗号串，向后兼容
  // —— 新增 ——
  characters_outfit: string;     // 含装束的中文串：「张三(灰大衣,左轮); 李四(护士裙,油灯)」
  characters_outfit_en: string;  // 英文 tag 化串：「a man in gray coat with a revolver, ...」
}
```

渲染规则：
- `characters_outfit` 本地拼接，无 LLM 调用：每人 `${name}(${outfit}${carrying ? ',' + carrying.join(',') : ''})`，空 outfit 退化为 `${name}`
- `characters_outfit_en` 由 `image-prompt-extractor.ts` 在英文 hint 子调用里**顺便生成**（见 7.4）

### 7.4 image-prompt-extractor 顺带英文化

`needsLlmEnglishHint` 命中时（NovelAI / SD-compat / pollinations 等），现行子调用 prompt 已让 LLM 把场景翻成英文 tag。在此基础上：

- 输入扩 1 段：附 characters_outfit（中文串）给 LLM
- 输出扩 1 字段：`charactersOutfitEn`
- 模板渲染 `{{characters_outfit_en}}` 写它

若该 LLM 调用失败/不命中英文路径，`characters_outfit_en` 退化为 `characters_outfit` 字面（OpenAI 路径下也是中文，DALL-E 等多模态模型可接受）。

### 7.5 默认模板字符串更新

`useSettingsStore.imageDefaults.promptTemplate` 默认值更新为含新占位的版本（实际值由模板编辑器或迁移逻辑决定，初始模板示例）：

```text
<%= isNovelAi ? "anime style" : "" %>, {{style}}, {{style_anchors}},
location: {{location}}, time: {{time}}, weather: {{weather}},
characters: {{characters_outfit_en}}
```

老用户**已自定义模板**保持原样不强改（按 `prologue-template-frozen-in-save` 同思路 — 设置存档有固化项；玩家可手动加占位）。新建剧本默认模板用新版。

## 8. UI 露出

| 面板 | 改动 | 优先级 |
|---|---|---|
| NPC 详情面板（暂未定位文件） | 加 outfit 单行 input + carrying 简易 chip 编辑 | 必做 |
| 角色卡（sheet）面板 | 加 outfit 单行 input | 必做 |
| 设置 → 生图 → 模板编辑器 | 文档/占位 hint 加新占位说明 | 必做 |
| 剧本编辑器 ImageGenTab | 模板占位 hint 同上 | 必做 |

UI 视觉风格遵循已有铜版线描 + 不带英文 label（按 `ui-pref-no-english-label`）。

## 9. 数据库：V10 升级

`NpcProfile` / `Sheet` 字段新增不影响 IndexedDB store 索引，仅需 bump version 让老 store recreate。**与 plot-arc-causality-theme spec 合并到同一次 V10 升级**——先落地的 spec 负责创建 `V10_SCHEMA`，后落地的 spec 不再 bump version，只确保字段写入逻辑兼容老存档（旧记录读出来字段为 undefined → buildContextInjection / image-prompt-builder 自然降级）。

按记忆 `beta-no-backward-compat`：不写迁移代码；老存档 outfit 字段为 undefined → outfit-extractor 第一次跑时会从 leftContent 推断初值（与首回合特殊化等价）。

## 10. 测试

| 单元 | 测试 fixture | 文件 |
|---|---|---|
| `extractOutfitDiff` 解析 | (a) happy 双侧 diff (b) LLM 返回未知 name 被丢弃 (c) 仅产 investigatorOutfit (d) null parsed → 空 (e) 网络错 → 空 (f) signal aborted | **新** `__tests__/outfit-extractor.test.ts` |
| `image-prompt-builder` 渲染 | (a) 调查员无 outfit + NPC 有 outfit (b) `characters_outfit` 拼接 (c) `characters_outfit_en` 用 fallback 时等于 characters_outfit (d) 路人 NPC 不出现 | 已存在 `image-prompt-builder.test.ts` 加 case |
| `image-prompt-extractor` 英文化分支 | mock LLM 返回 charactersOutfitEn → 模板渲染命中 | 已存在测试加 case |
| `useSheetStore.setOutfit` | trivial setter unit | 同 store 测试 |
| `useNpcStore.patchProfile` outfit/carrying 写入 | 已有 patch 通路覆盖即可，加 outfit/carrying 字段断言 | 已存在 NpcStore 测试加 case |

不测：UI 面板交互（按 `user-does-ui-testing.md`）；端到端生图实际出图对不对（玩家自检）。

## 11. 不做的事（YAGNI）

- `useInventoryStore` 与 `carrying` 自动合并去重 — 二者语义不同（库存清单 vs 外露可见）
- 装束历史时间线（昨日穿什么） — 当前态够用
- 路人 NPC 装束 — Section 5 已否
- 主 JSON 加 outfit 字段 — 全部走解耦子调用
- 装束变更动画/通知 UI — 静默落库即可
- 装束与 NSFW 字段联动 — 按现行 NSFW 控制路径，装束只是中性描述
- 服装风格细化分层（领口/袖口/裤型……） — 单字段中文短句足够

## 12. 关键文件改动清单

| 文件 | 改动类型 |
|---|---|
| `src/types/index.ts` | 扩 `NpcProfile` 加 `outfit/carrying`；扩 `Sheet` 加 `outfit` |
| `src/sillytavern/outfit-extractor.ts` | **新建** |
| `src/api/image-gen-merge.ts` | 改 `ImageRenderContext.characters` 类型；改 `PromptTemplateContext` 加 2 占位 |
| `src/api/image-prompt-builder.ts` | 拼 characters 含 outfit/carrying；本地拼 characters_outfit；调 extractor 时附 outfit 上下文 |
| `src/api/image-prompt-extractor.ts` | 英文化分支接收 outfit 中文串 + 输出 charactersOutfitEn |
| `src/stores/useSheetStore.ts` | 加 `setOutfit` action;clear/save/load 覆盖 outfit 字段 |
| `src/stores/useNpcStore.ts` | patchProfile 支持 outfit/carrying;buildContextInjection 文案不变(避免双注入) |
| `src/hooks/useChatPipeline.ts` | 主 API done 后 fire-and-forget 跑 extractor;首回合强制跑一次 |
| `src/db/database.ts` | V9 → V10（与 plot-arc spec 合并升级） |
| `src/components/...NPC/sheet/模板编辑器` | UI 露字段 + 占位 hint |
| `src/sillytavern/__tests__/outfit-extractor.test.ts` | **新建** |
| `src/api/__tests__/image-prompt-builder.test.ts` | 加 case |
| `src/api/__tests__/image-prompt-extractor.test.ts` | 加 case |

## 13. 与 plot-arc-causality-theme spec 的耦合点

唯一耦合：**db V10 升级合并**。先落地 spec 负责 `V10_SCHEMA` 创建；后落地 spec 字段加在对应类型上即可。

`useChatPipeline.ts` 内两个 extractor 触发块并列、互不依赖、互不阻塞、各自 fire-and-forget。

实现可并行 — 改的代码路径几乎不重叠（NPC store / sheet store / image-prompt 一组 vs anchors store / megaagent / causal-echo 一组）。
