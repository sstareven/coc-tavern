# NPC / 世界 Agent Memory 系统设计

**日期**: 2026-06-10
**分支**: beta
**状态**: 设计完成，待实施

## 一句话

新增一个 per-conversation 开关「Agent 心智档案」。开启后，**核心 + 重要 NPC** 和**世界本身**各自拥有结构化「心智档案」（硬字段 + 自由散文），由独立子调用驱动，作为 Agent 注入 LLM 上下文。

---

## 范围（已确认 A3）

- 核心 NPC（importance='核心'）—— 永远完整注入
- 重要 NPC（importance='重要'）—— 在场（locationName 匹配）时完整注入，离场时仅硬字段简版
- 路人 NPC —— 不参与（沿用现有 buildContextInjection 的轻量路径）
- 世界本身 —— 一份 WorldMemory，吸纳现有 darkThread/keywordMeanings 字段 + 新增 atmosphere/unrevealed

## 数据形态（已确认 B3）

### NpcMemory（每 NPC 一份）

| 字段 | 类型 | 用途 |
|---|---|---|
| `goal` | string | 当前主要目标 |
| `nextMove` | string | 下回合打算做的具体事 |
| `trustOnPC` | number (-1~1) | 对调查员的信任度 |
| `emotionToPC` | EmotionEnum | 当前情绪倾向（敌意/警惕/中立/友好/暧昧/恐惧） |
| `secrets` | string[] | 没告诉调查员的秘密清单 |
| `relationships` | Array&lt;{target,emotion,note}&gt; | 与其他 NPC 的关系，target 用真名（findIdByName 解析） |
| `prose` | string | 自由散文心思（200~500 字） |
| `updatedAt` | number | 最后更新回合索引（用于排序/裁剪） |

### WorldMemory（每会话一份）

| 字段 | 类型 | 用途 |
|---|---|---|
| `darkThread` | string | 暗线推进描述（吸纳原 darkThread store 字段） |
| `keywordMeanings` | Record&lt;string,string&gt; | 重要词意义（吸纳原 keywordMeanings） |
| `atmosphere` | string | 当前氛围/紧张度描述 |
| `unrevealed` | string[] | 已铺好但还没触发的剧情提示 |
| `prose` | string | 世界整体心思散文 |
| `updatedAt` | number | 最后更新回合索引 |

### EmotionEnum

`'敌意' | '警惕' | '中立' | '友好' | '暧昧' | '恐惧'`

NPC 对调查员和 NPC 对 NPC 共用同一套。

---

## 写入路径（已确认 C5，3 RPM 目标）

### NPC Memory → 搭 MVU 综合调用顺风车

- `mvu-megaagent.ts:OUTPUT_SCHEMA_DESC` 末尾追加 `npcMemoryUpdates` 字段（在 `cleanedText` 之前，避免抗截尾设计的尾部位置）
- LLM 只对**当回合被涉及**的 NPC 输出 Memory 增量（参照 npcUpdates 的"被涉及"规则）
- `parseMegaAgentResponse` 加字段级降级解析（失败返 null，不影响其他字段）
- `dispatchMegaAgentResult` 加 `useNpcMemoryStore.applyUpdates(...)` 分支
- 0 额外 RPM

### 世界 Memory → 独立子调用（fire-and-forget）

- 新文件 `src/sillytavern/world-memory-extractor.ts`，参照 `image-prompt-extractor.ts` 模板
- 触发时机：主回合 LLM 流式完成、MVU 综合调用 dispatch 完成后，由 `useChatPipeline` 调用 `runWorldMemoryUpdate(input)`，不 `await`（fire-and-forget）
- 结果落 `useWorldMemoryStore`，同步把 `darkThread` 字符串 `addEntry` 进旧 `useDarkThreadStore`、把 `keywordMeanings` map `addKeywords` 进旧 `useKeywordStore`
- `rpmLane: 'mvu'` 复用 MVU 桶（不新建桶）或 `'rewrite'`（实施时根据并发情况选择）
- fire-and-forget：不阻塞翻页，下回合主 LLM 看到的是 (n-1) 回合的世界 Memory（一回合延迟可接受）
- 开关开启时 **+1 RPM/回合**，3 RPM 目标

### 与旧 store 的关系（E2 切分）

- NpcProfile 保留全部现有字段（locationName/importance/sheet/HP/SAN 等数值由 npcUpdates 管）
- darkThread / keywordMeanings 字段从 `OUTPUT_SCHEMA_DESC` 移除（开关开启时）；世界 Memory 子调用同步把 `darkThread` 字符串 `addEntry` 进旧 `useDarkThreadStore`、把 `keywordMeanings` map `addKeywords` 进旧 `useKeywordStore`，**保 RescueBar 角标 / KeywordTooltip 悬浮等下游 UI 工作正常**
- 开关关闭时：`useNpcMemoryStore` / `useWorldMemoryStore` 不写入，megaagent 沿用原 darkThread/keywordMeanings 字段，旧 store 单独工作

---

## 注入路径（已确认 D2）

### NPC Memory → `addFormatPart` 独立通路

`useChatPipeline.ts:buildPromptMessages` 在现有 `npcCtx` 段（buildContextInjection）之后追加：

```ts
if (agentMemoryEnabled) {
  const memoryCtx = useNpcMemoryStore.getState().buildContextInjection({
    currentLocationName: curLocName,
    npcStore: useNpcStore.getState(),
  })
  if (memoryCtx) addFormatPart('### NPC 心智档案\n' + memoryCtx)
}
```

`buildContextInjection` 内分层：
- 核心 NPC：硬字段 + 散文 + relationships 全注入
- 重要 NPC：locationName === currentLocationName 时全注入；否则仅 goal + nextMove + emotionToPC 简版

### 世界 Memory → `addFormatPart` 固定段

```ts
if (agentMemoryEnabled) {
  const worldCtx = useWorldMemoryStore.getState().buildContextInjection()
  if (worldCtx) addFormatPart('### 世界心思\n' + worldCtx)
}
```

不进 lore 桶（lore 桶要求 entry 形态 + 匹配引擎，世界 Memory 是固定全量注入）。

---

## 开关粒度（已确认 F2）

### 全局默认

`useSettingsStore` 加 `agentMemoryDefault: boolean`（开发期默认 `false`）。

`SettingsPanel.tsx` general section 加 Toggle「Agent 心智档案（默认）」。

### per-conversation 覆盖

`Conversation` (useChatStore session) 加 `agentMemoryEnabled?: boolean`（undefined 时取全局默认）。

`createSession` 不预填该字段（保留 undefined 让全局默认生效）。

**有效值计算**：

```ts
const effective = conv.agentMemoryEnabled ?? settings.agentMemoryDefault
```

### per-conversation UI 入口

**首版**：在 `SettingsPanel.tsx` general section 全局开关下面，紧贴着加一行「本会话覆盖」三态选择器（跟随默认 / 强制开 / 强制关）。当 useChatStore 的 activeId 切换时该选择器跟随刷新。

数据层 `Conversation.agentMemoryEnabled` 字段保留（undefined / true / false 三态）。

---

## 冷启动（已确认 G4 分级混合）

### NPC

- **importance 从 '路人'/undefined → '重要'**（applyUpdates 检测 importance 变化时）：程序模板填充
  ```ts
  { goal: '（尚不明确）', nextMove: '观察情况', trustOnPC: 0, emotionToPC: '中立',
    secrets: [], relationships: [], prose: '刚被关注，待观察', updatedAt: turn }
  ```
- **importance 从任一 → '核心'**：触发独立立卡子调用 `runNpcMemoryCard(npcId, ctx)`（新文件 `npc-memory-extractor.ts`），异步 fire-and-forget，结果落 `useNpcMemoryStore`
  - 核心 NPC 数量 1~3，频率低
  - `useNpcMemoryStore` 内部维护 `pendingCardIds: Set<string>` 集合，立卡触发时 add，结果落定/失败时 remove；NpcCard 通过 `pendingCardIds.has(npcId)` 判定骨架屏
  - 立卡失败 → 沿用模板默认值 + 显示「心思未浮现」占位 + 重试按钮
- 后续每回合：`npcMemoryUpdates` 字段搭 MVU 综合顺风车维护

### 世界

- `startNewConversation` 触发一次 `runWorldMemoryUpdate({ bootstrap: true, scenarioCtx })`（+1 RPM 一次性）
- 玩家在新游戏加载界面看到"世界正在苏醒……"等待 ~5s
- 失败 → 进入空 WorldMemory（atmosphere='', unrevealed=[], darkThread='' 等），后续每回合子调用继续尝试

### 老存档迁移（H4-B 推荐）

- 开关从 OFF 切到 ON 时：
  - 立即触发一次 `runWorldMemoryUpdate({ bootstrap: true, ... })` 给世界 Memory 立卡（+1 RPM）
  - 当前重要/核心 NPC Memory 不立刻立卡——等下次该 NPC 在 `npcMemoryUpdates` 中被涉及时模板填充 + LLM 顺手细化
  - 核心 NPC 仍触发独立立卡（数量少，成本可控）

---

## 存档隔离与回溯（已确认 H1/H2/H3）

### 存储

- 新 Dexie 表 `npcMemories`：`[conversationId+npcId]` 复合主键
- 新 Dexie 表 `worldMemories`：`conversationId` 主键（一会话一行）
- `useNpcMemoryStore` 内存态 `memories: Record<npcId, NpcMemory>`
- `useWorldMemoryStore` 内存态 `world: WorldMemory`

### 翻页快照

`BookPage` 加：
- `npcMemorySnapshot?: Record<npcId, NpcMemory>`
- `worldMemorySnapshot?: WorldMemory`

`useChatPipeline.ts:1612` 现有 `structuredClone(profiles)` 旁加 `structuredClone(npcMemories)` + `structuredClone(worldMemory)`，一起写入 `newPage`。

### 删页/手动回溯

- `useBookStore.ts:deletePage`：kept 末页反向找 `npcMemorySnapshot` + `worldMemorySnapshot` → `useNpcMemoryStore.replaceAll(snap)` + `useWorldMemoryStore.replace(snap)`
- `Storybook.tsx`：手动回溯路径并行加同样逻辑（page-delete-rollback-snapshot-pattern 的"两处都改"）

### session 四口接入

| 钩子 | 位置 | 操作 |
|---|---|---|
| `clearAllGameState` | sessionLifecycle.ts:58 | `useNpcMemoryStore.getState().clearAll()` + `useWorldMemoryStore.getState().clear()` |
| `saveConversationInner` | sessionLifecycle.ts:190 | 序列化 → npcMemoryRows / worldMemoryRow → bulkPut |
| `loadConversationInner` | sessionLifecycle.ts:349 | 读 npcMemoryRows / worldMemoryRow → replaceAll / replace |
| `deleteConversationInner` | sessionLifecycle.ts:553 | 删表内 conversationId 行 |

---

## UI（已确认 I1-I5）

### 全局开关

`SettingsPanel.tsx` general section 加 Toggle「Agent 心智档案（默认）」。

### NPC 卡片 Memory 摘要带

`NpcOverlay.tsx:NpcCard` 在 importance ∈ {核心, 重要} 且 agentMemoryEnabled 时追加：

```
顶部摘要带：goal（一行）/ nextMove（一行） / emotionToPC 标签 + trustOnPC 横条
可折叠区（默认折叠）：secrets 列表 / relationships 表格 / prose 散文
```

立卡进行中：摘要带显示骨架屏（不阻塞翻页）。

立卡失败：保留模板默认值 + 「心思未浮现」占位 + 重试按钮。

### 世界 Memory UI

**首版不做独立面板**（YAGNI；研究确认没有现成 runtime 暗线面板）。

`atmosphere` / `unrevealed` 通过 LLM 在叙事中自然体现；玩家通过 RescueBar 「暗线 N」角标读 `useDarkThreadStore`（保持同步写入）。

### 编辑权限

只读 + 「重新立卡」按钮（NpcCard 折叠区底部，触发 `runNpcMemoryCard(npcId)`）。

---

## 受影响的现有架构（cautions 摘要）

1. **importance 没有事件触发的升降级** —— 在 `applyUpdates` 内 diff 前后 importance 触发冷启动钩子（不能在 applyUpdates 内偷偷改 importance，要监听）
2. **findIdByName trim 后逐字相等** —— relationships.target 解析必须用 `findIdByName`，不要 includes/正则
3. **调查员本人不进 NPC 名册** —— Memory 也不存调查员，调查员意图归玩家自己掌控
4. **inParty 玩家独占** —— Memory 不影响 inParty
5. **isScenarioPreset 保护** —— 剧本预设 NPC 的 hiddenBio 已锁；NpcMemory 字段在 isScenarioPreset 时遵循**首份保留 + 后续 LLM 仅增量补**规则：冷启动模板/立卡可填空字段，但 LLM 的 npcMemoryUpdates 不能覆盖已存在的 prose/goal/secrets，只能追加 relationships/secrets 数组项
6. **page 快照走 structuredClone** —— NpcMemory/WorldMemory 必须 plain JSON（不含 Map/Set/Function）
7. **OUTPUT_SCHEMA 字段顺序抗截尾** —— `npcMemoryUpdates` 字段必须放在 `cleanedText` 之前
8. **MVU 综合调用 fire-and-forget-with-block** —— NPC Memory dispatch 副作用要轻量；重逻辑用 setTimeout 异步
9. **max_tokens >= 20000** —— 子调用 maxTokens 至少 20000，世界 Memory 子调用建议 20000~32768
10. **buildContextInjection 命名约定** —— 新 store 暴露同名方法
11. **per-conversation store 四口必须配套** —— 任一漏接就违反 session 隔离

---

## 文件清单（按影响面）

### 新文件

1. `src/types/npc-world-memory.ts` —— NpcMemory / WorldMemory / NpcMemoryUpdate / EmotionEnum 类型
2. `src/stores/useNpcMemoryStore.ts` —— NPC Memory store（applyUpdates / replaceAll / clearAll / buildContextInjection）
3. `src/stores/useWorldMemoryStore.ts` —— World Memory store（replace / clear / buildContextInjection）
4. `src/sillytavern/npc-memory-extractor.ts` —— NPC 立卡子调用（runNpcMemoryCard）
5. `src/sillytavern/world-memory-extractor.ts` —— 世界 Memory 立卡 + 每回合更新（runWorldMemoryUpdate）

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/types/index.ts` | 导出 NpcMemory/WorldMemory；BookPage 加 npcMemorySnapshot/worldMemorySnapshot；Conversation 加 agentMemoryEnabled?:boolean |
| `src/db/database.ts` | 加 npcMemories / worldMemories 两张 Dexie 表 |
| `src/stores/sessionLifecycle.ts` | 四口接入 |
| `src/stores/useSettingsStore.ts` | 加 agentMemoryDefault: boolean |
| `src/stores/useChatStore.ts` | createSession 接受 agentMemoryEnabled 字段（可选） |
| `src/stores/useBookStore.ts` | BookPage 快照字段 + deletePage 快照恢复 |
| `src/stores/useNpcStore.ts` | applyUpdates 内监听 importance 变化触发冷启动 hook（通过事件回调，避免循环依赖） |
| `src/sillytavern/mvu-megaagent.ts` | OUTPUT_SCHEMA_DESC 加 npcMemoryUpdates 字段；MegaAgentResult 加字段；parseMegaAgentResponse 加降级解析；dispatchMegaAgentResult 加分发分支 |
| `src/hooks/useChatPipeline.ts` | addFormatPart 加两个独立通路；structuredClone 写 page 快照；世界 Memory 子调用触发；NPC 立卡触发 |
| `src/components/NPC/NpcOverlay.tsx` | NpcCard 加 Memory 摘要带 + 折叠区 |
| `src/components/Settings/SettingsPanel.tsx` | general section 加 Toggle |
| `src/components/Book/Storybook.tsx` | 手动回溯快照恢复 |

---

## 不做的事（YAGNI）

- 独立 World Memory UI 面板（首版仅 LLM 可见，玩家通过叙事感受）
- 调试模式 Memory 编辑入口（避开 DicePanel 教训）
- per-NPC 开关（粒度过细）
- 关系图谱可视化
- Memory 历史/版本控制（页快照已经覆盖回溯需求）
- NPC↔NPC relationships 的双向自动同步（用户已确认单向）
- 新 RPM 桶（复用 mvu/rewrite 桶）

---

## 实施分工（workflow-subagent-edit-large-files 约束）

### Subagent 并行（新文件）

每个子代理独立写一个新文件：
- A. types/npc-world-memory.ts
- B. stores/useNpcMemoryStore.ts
- C. stores/useWorldMemoryStore.ts
- D. sillytavern/npc-memory-extractor.ts
- E. sillytavern/world-memory-extractor.ts

### 主控收口（修改大文件）

按依赖顺序顺序改：
1. types/index.ts + db/database.ts（基础类型 / schema）
2. useSettingsStore.ts / useChatStore.ts（开关字段）
3. sessionLifecycle.ts（四口接入）
4. useBookStore.ts / useNpcStore.ts（store 联动）
5. mvu-megaagent.ts（核心集成）
6. useChatPipeline.ts（管线接入）
7. NpcOverlay.tsx / SettingsPanel.tsx / Storybook.tsx（UI）

### 验证

- `pnpm tsc -p tsconfig.json --noEmit`
- `pnpm vitest run`
- `pnpm build`

### 推送

- commit 不带 Co-Authored-By
- push origin beta
- 不动 master、不写 ChangelogModal
