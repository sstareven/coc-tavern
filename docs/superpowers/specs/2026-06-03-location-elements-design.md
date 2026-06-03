# 地点元素（Location Elements）设计

- 日期：2026-06-03
- 分支：beta（实现完成、验证后按惯例 merge master 发版）
- 状态：已与用户确认设计，待写实现计划

## 1. 背景与目标

地图体系（`useMapStore`）已维护「地点（MapLocation）+ 连线（MapEdge）+ 当前地点」。本特性新增**地点元素（Location Element）**——挂在地点下的环境特征/陈设/可注意之物，与「线索(clues=知识/推理)」正交、互不替代。

目标：
1. 每个地点下聚合若干「地点元素」（父子关系，至少一个）。
2. 剧情描述某地点特点时，自动把这些特点沉淀成该地点的元素。
3. 当调查员位于某地点时，把该地点已存元素回灌给 LLM，使其一致描述、不前后矛盾。
4. 地图页可视化：左页地图点击/选中地点 → 高亮并定位；右页底部滚动展示该地点元素。

## 2. 关键决策（已确认）

- **捕获机制**：独立 API 抽取（`mvuUseIndependentApi && mvuApiKey` 走 MVU API，否则回退主 API）。不往主回合 JSON 加字段（规避 `inline-llm-fields-truncate-trailing` 截断病）。
- **元素字段**：名称 + 描述 + 类型（category，受控枚举）。
- **注入时机**：当前地点 · 每回合。

## 3. 数据模型

```ts
// src/types/index.ts
export const LOCATION_ELEMENT_CATEGORIES = ['陈设', '机关', '痕迹', '通道', '容器', '异常', '其他'] as const;
export type LocationElementCategory = (typeof LOCATION_ELEMENT_CATEGORIES)[number];

export interface LocationElement {
  id: string;
  /** 父子关联键：用地点【名称】而非 id —— 删页重放 clearAll+重放会给地点重分配随机 id，按 id 必成孤儿；名称稳定，且地图本就用 findLocByName 名称匹配。 */
  locationName: string;
  name: string;
  category: LocationElementCategory;
  description: string;
  createdAt: number;
}

// 抽取/页锚定用的轻量输入（无 id/createdAt，store 落地时补全）
export interface LocationElementInput {
  locationName: string;
  name: string;
  category: LocationElementCategory;
  description: string;
}
```

`BookPage` 新增可选字段：`locationElements?: LocationElementInput[]`（本页抽取产物，随页持久化，供删页重放重建）。

## 4. 捕获（独立 API 抽取 + 页锚定 fire-and-forget）

新模块 `src/sillytavern/location-element-extractor.ts`：

```
extractLocationElements(
  locationName: string,
  existingNames: string[],      // 该地点已存元素名，供 LLM 去重、只产新元素
  narrative: string,            // 本回合 left+right 正文
  apiBaseUrl, apiKey, model,
  temperature?, maxTokens=20000, retries=3,
): Promise<{ elements: LocationElementInput[]; usage? }>
```

- 范式完全复用 `starting-items-generator`：`rpmAcquire` + `appIdHeaders` + `coerceJsonObject` 健壮解析（兼容 `{"elements":[...]}` / 顶层数组）+ **重试仅对 `parsed===null`** + `max_tokens≥20000`（记忆 `max-tokens-min-20000`）。
- category 非法回落 `'其他'`；过滤无名、过滤与 `existingNames` 同名。
- 提示词：给定地点名 + 已存元素 + 本回合叙事，要求只输出该地点【本回合新出现/被描述】的元素（名称/类型/描述），严格 JSON。

**接入 `useChatPipeline`**（在 `mapUpdates` 应用之后、即当前地点已确定时）：
- 触发条件：`!formatOverride`（非补写）+ 存在 `currentLocationId/Name` + API 配置齐全（MVU 或主）。
- **fire-and-forget**（不阻塞翻页，仿起始物品 / 坏结局）+ `activeId` 会话守卫。
- 选择 endpoint：`mvuUseIndependentApi && mvuApiKey?.trim()` → `(mvuApiBaseUrl, mvuApiKey, mvuApiModel)`；否则 `(apiBaseUrl, apiKey, apiModel)`。
- 拿到 `elements` 后（非空 && activeId 未变）：
  - `useBookStore.setPageLocationElements(siPageIdx, [...page已有, ...new])`（页锚定写回，删页重放可恢复）；
  - `useLocationElementStore.applyExtracted(elements)`（入 store 内存态，按 locationName+name 去重）；
  - `savePages` + 守卫后 `saveConversation(aid)`。
- 按【捕获的插入 index】定位页（`appendPage` 不赋 id），与起始物品同法。

## 5. Store

新 store `src/stores/useLocationElementStore.ts`：

```
interface LocationElementStore {
  elements: LocationElement[];
  applyExtracted: (items: LocationElementInput[]) => void;   // 按 (locationName,name) 去重 upsert；补 id/createdAt
  getByLocation: (locationName: string) => LocationElement[]; // 名称匹配（trim + 宽松 includes 兜底，与 findLocByName 一致）
  buildContextInjection: (currentLocationName: string) => string; // 当前地点元素的提示词文本，无则 ''
  replaceAll: (list: LocationElement[]) => void;
  clearAll: () => void;
}
```
（无 isOpen/toggle/close —— 本特性无独立面板，展示寄生在地图页。）

## 6. 注入（当前地点 · 每回合）

`buildPromptMessages` 中（紧邻 NPC `buildContextInjection` 注入处），当 `!formatOverride` 且当前地点有元素时：

```
const curName = 当前地点名(useMapStore.currentLocationId → locations.find);
const locCtx = useLocationElementStore.getState().buildContextInjection(curName);
if (locCtx) baseFormat += '\n\n' + locCtx;
```

`buildContextInjection` 文本形如：
```
[当前地点「<名>」的已知元素——请与下列描述保持一致，勿与之矛盾，可在叙事中自然提及/复用]
- <名称>（<类型>）：<描述>
...
```

## 7. 持久化（Dexie v7）

- `database.ts`：新增 `V7_SCHEMA = { ...V6_SCHEMA, locationElements: '[conversationId+elementId], conversationId' }` + `db.version(7).stores(V7_SCHEMA)`；新增 `LocationElementRow` 类型与 `db.locationElements` 句柄。无数据迁移（新表）。
- `sessionLifecycle.ts`：
  - **save**：把 `useLocationElementStore.elements` 写 `locationElements` 表（先按 conversationId delete 再 bulkPut，仿 inventory/map）。
  - **load**：读该会话 `locationElements` 行 → `useLocationElementStore.replaceAll(...)`。
  - **delete 会话**：连带删 `locationElements` 行（仿现有各域）。
  - `clearAllGameState`：加 `useLocationElementStore.getState().clearAll()`（按会话隔离不变量 `session-isolation-invariant`）。

## 8. 删页重放（页锚定一致性）

`Storybook` 删页重放循环中，`clearAll` 后追加：
```
useLocationElementStore.getState().clearAll();
...
for (const p of remaining) {
  ...
  if (p.locationElements?.length) useLocationElementStore.getState().applyExtracted(p.locationElements);
}
```
配合新增 `useBookStore.setPageLocationElements(index, elements)`（仿 `setPageInventoryChanges`，越界守卫）。

## 9. UI（地图页）

复用现有 `MapOverlay/MapGraph` 金色羊皮纸主题 + 动效（`cubic-bezier(0.4,0,0.2,1)`、hover 增亮放大、active 按压）。

- **选中状态**：地图页持有 `selectedLocationId`（默认 = 当前地点）。左页地图节点**点击**→设为选中 + 视觉高亮（描边/发光）。
- **左页**：点击节点高亮，不在地图上堆叠大段文字（避免挤爆）；选中即驱动右页展示。
- **右页底部**：「地点元素」区，展示 `getByLocation(选中地点名)`：标题（地点名）+ 元素列表（名称 + 类型徽标 + 描述），**可滚动**，自定义滚动条贴合主题（金/黄铜细滚动条，参考现有面板滚动条样式）。无元素时显示占位文案。

## 10. 测试

- `location-element-extractor.test.ts`：解析 `{"elements":[...]}`/顶层数组、非法 category 回落、去重 existingNames、空/截断触发重试、API 非 2xx 抛错（仿 `starting-items-generator.test`）。
- `useLocationElementStore.test.ts`：applyExtracted 去重 upsert、getByLocation 名称宽松匹配、buildContextInjection 空/非空、replaceAll/clearAll。
- `database.test.ts`：补 `locationElements` 表 round-trip。

## 11. 不做（YAGNI / 后续）

- 不做地点元素的独立编辑/手动增删面板（仅 LLM 抽取 + 展示）。
- 不做元素与线索/物品的自动关联。
- 元素不做「升华/归并」（线索才有）。
- 抽取失败仅告警、不阻断回合。

## 12. 风险与缓解

- **抽取额外一次 LLM 调用/回合**：fire-and-forget 不阻塞；走 MVU 桶（有独立 API 时）减轻主桶 RPM 压力。
- **地点名变更/重名**：按名匹配，宽松 includes 兜底；重名地点元素会合并到同名 —— 可接受（地图本身同名即同点）。
- **删页 id 重分配**：已用 locationName 关联规避。
