# 设计：NPC 互动记忆自我消化 + 线索演化归档

日期：2026-06-01
分支：beta

## 背景与问题

当前两处派生游戏状态会随游戏推进持续变长：

1. **NPC 互动记忆**（人物名册里每个 NPC 的 `memories[]`）：每回合 AI 用 `addMemory` 追加。
   现有 `useNpcStore.applyUpdates` 写死 `.slice(-30)` 硬上限——不会真正无限增长，但**超出 30 条的旧记忆被直接丢弃（永久丢失，无任何「消化」）**，而注入上下文只取最近 3 条。UI（`NpcOverlay`）会把最多 30 条原样列出，观感上越来越长。

2. **线索库**（`useClueStore.clues[]`）：同名合并、否则新增，**无演化/归档机制**；`buildContextInjection` 会列出**全部**线索 → 持续变长并挤占上下文。

（注：剧情回顾摘要在注入时已按 `maxSummaryEntries` 默认 20 截断，本设计不涉及。）

## 目标

- NPC 记忆：封顶 + **自我消化**（把旧互动压缩成「记忆梗概」而非硬丢弃），永不无限增长。
- 线索：支持 **AI 显式声明的演化升级**（旧线索归档隐藏、新线索上位且更显著），归档线索保留以便回溯。
- 两者都要让进入 LLM 上下文的体量有确定性上限。
- 全程非破坏性迁移，兼容老存档。

## 已确认的关键决策

- 记忆消化机制：**随回合 AI 折叠**（复用现有每回合那次 LLM 调用，零额外请求）。
- 线索演化触发：**AI 显式声明**（新线索带 `evolvesFrom` 引用旧线索名）。
- 记忆展示形态：**记忆梗概 + 最近 N 条原始**。
- 常量取值与「仅暴露一个记忆保留条数设置项」均已认可。

---

## A. NPC 互动记忆「随回合 AI 折叠」

### A.1 数据模型（`NpcProfile`，`src/types/index.ts`）

- 新增 `memorySummary?: string` —— 滚动「记忆梗概」，由 AI 浓缩旧互动而成。
- `memories: string[]` 保留，语义变为「最近若干条原始记忆」。

### A.2 常量（定义在 `useNpcStore.ts`，集中可调）

| 常量 | 默认值 | 含义 |
|---|---|---|
| `MEMORY_RECENT_KEEP` | 6 | 折叠后保留的最近原始记忆条数（= 设置项默认值） |
| `MEMORY_FOLD_THRESHOLD` | 10 | 原始记忆条数 ≥ 此值时，注入端提示 AI 提供梗概 |
| `MEMORY_HARD_CAP` | 14 | 安全兜底：即便 AI 未给梗概，`memories` 也绝不超过此数，超出则本地丢最旧 |

不变量：`memories.length` 在任何路径后都 ≤ `MEMORY_HARD_CAP` → 永不无限增长。

### A.3 AI 协议

- `NpcUpdate`（`src/types/index.ts`）增加 `memorySummary?: string`。
- `format-instruction.ts` 的 NPC 段补充说明（中文，与现有风格一致）：
  > 当某 NPC 的互动记忆较多时，在其 npcUpdates 里给出 `memorySummary`：用 2-4 句浓缩此前所有关键互动（含已有的旧梗概），系统会据此精简逐条旧记忆。`addMemory` 仍用于追加本回合的新互动。
- `useNpcStore.buildContextInjection`：注入在场 NPC 时带上 `记忆梗概`（若有）+ 最近 3 条原始记忆；当某 NPC 原始记忆数 ≥ `MEMORY_FOLD_THRESHOLD`，在该 NPC 行末追加一句定向提示，例如：
  > （"X" 的互动记忆已较多，请本回合在其 npcUpdates 提供 memorySummary 以便归纳）

  这样 AI 在同一次回合调用里自然产出梗概，**零额外请求**。

### A.4 `applyUpdates` 逻辑（`useNpcStore.ts`）

- 移除现有 `p.memories = [...p.memories, u.addMemory.trim()].slice(-30)` 的写死上限。
- 新顺序：
  1. 若 `u.addMemory?.trim()`：`p.memories.push(...)`。
  2. 若 `u.memorySummary?.trim()`：写入 `p.memorySummary`（覆盖为 AI 给出的最新综合梗概），并把 `p.memories` 裁到最近 `MEMORY_RECENT_KEEP` 条。
  3. 兜底：若此时 `p.memories.length > MEMORY_HARD_CAP`，截到最近 `MEMORY_HARD_CAP` 条（丢最旧）。

### A.5 UI（`src/components/NPC/NpcOverlay.tsx`）

- 「互动记忆」区：
  - 有 `memorySummary` → 顶部一小块「记忆梗概」（弱化色/斜体），下方列最近 `MEMORY_RECENT_KEEP` 条原始记忆。
  - 无 `memorySummary` → 同现状，直接列原始记忆。

### A.6 迁移

- 老存档 `memories`（≤30）原样保留，`memorySummary` 初始 `undefined`；首次折叠后自然收敛到 `MEMORY_RECENT_KEEP`。非破坏性，无需写迁移代码（兜底裁剪在下次 `applyUpdates` 时生效；如需即时收敛可在 `replaceAll` 时对超 `MEMORY_HARD_CAP` 的数组裁剪，但仅裁到 HARD_CAP 不丢梗概语义）。

---

## B. 线索演化（AI 显式声明）+ 归档可回溯

### B.1 数据模型（`Clue`，`src/types/index.ts`）

- 新增 `status: 'active' | 'archived'`（默认 `'active'`）。
- 新增 `evolvedFrom?: string`（演化来源线索 id）。
- 新增 `evolvedIntoId?: string`（旧线索指向其演化成的新线索 id）。
- 新增 `tier?: 'normal' | 'major'`（演化出的更显著线索标 `major`，UI 高亮）。

### B.2 AI 协议

- `ClueInput`（`src/types/index.ts`）增加 `evolvesFrom?: string`（被取代的旧线索名）。
- `format-instruction.ts` 线索段补充：
  > 当一条已有线索因剧情推进升华为更关键的新线索时，用新线索的 `evolvesFrom` 字段引用旧线索名；系统会归档旧线索、把新线索标为关键并上位。不要删改旧线索内容重写——用演化保留可回溯的线索链。

### B.3 `addClues` 逻辑（`useClueStore.ts`）

- 处理某条 `input` 时：
  - 若带 `evolvesFrom`：按名（`findByName`）找到旧线索 → 置 `status='archived'`、记 `evolvedIntoId = 新线索.id`；新线索 push（`status='active'`、`evolvedFrom = 旧.id`、`tier='major'`）。旧线索名找不到时，退化为普通新增（仍创建新线索，`evolvedFrom` 留空）。
  - 无 `evolvesFrom`：维持现有同名合并/新增逻辑（新建时补 `status:'active'`、`tier:'normal'`）。

### B.4 上下文注入（`useClueStore.buildContextInjection`）

- 仅注入 `status==='active'` 的线索（归档线索不进上下文 → 自然瘦身）。
- 常量 `CLUE_INJECT_CAP = 15`：若 active 线索数超过它，只注入最近 N 条（按 `acquiredAt`），并追加一行标注「(更早线索见线索库)」。
- `major` 线索在注入文本里可加标记（如前缀「★」）以提示 AI 其重要性。

### B.5 UI（`src/components/Inventory/InventoryPanel.tsx` 线索页）

- 顶部：`active` 线索列表（`tier==='major'` 带显著徽标/图标）。
- 底部：可折叠区「已演化 · 历史线索 (N)」，**默认收起**；展开后列 `archived` 线索（暗化显示），每条显示「→ 已演化为 X」（X 为 `evolvedIntoId` 对应线索名），供回溯。
- `ClueRow` 增加对 `tier` 的高亮与对 archived 态的暗化样式。

### B.6 迁移

- 老存档线索缺少 `status` → 读取/`replaceAll` 时视为 `'active'`（可在 store 读取处补默认，或在渲染/注入处 `?? 'active'` 兜底）。非破坏性。

---

## C. 设置项（最小化）

- `useSettingsStore` 增加 `npcMemoryKeep: number`（默认 6），驱动 `MEMORY_RECENT_KEEP`。
- `SettingsPanel`「上下文」分类下新增一个滑杆「NPC 记忆保留条数」（范围 3–12），含 HelpIcon 说明。
- 线索注入上限 / 折叠阈值用常量，不进设置面板（避免设置膨胀）。

---

## D. 影响文件清单

- `src/types/index.ts` — `NpcProfile`/`NpcUpdate`/`Clue`/`ClueInput` 字段扩展
- `src/stores/useNpcStore.ts` — 常量、折叠逻辑、注入提示
- `src/stores/useClueStore.ts` — 演化归档、注入过滤+封顶
- `src/stores/useSettingsStore.ts` — `npcMemoryKeep`
- `src/sillytavern/format-instruction.ts` — NPC `memorySummary` + 线索 `evolvesFrom` 说明
- `src/components/NPC/NpcOverlay.tsx` — 记忆梗概 + 最近 N 条展示
- `src/components/Inventory/InventoryPanel.tsx` — major 高亮 + 历史线索折叠区
- `src/components/Settings/SettingsPanel.tsx` — 记忆保留条数滑杆

## E. 测试计划

- `useNpcStore.test.ts`：
  - 给 `memorySummary` 后 `memories` 裁到 `MEMORY_RECENT_KEEP`、梗概被写入
  - 仅 `addMemory` 连续追加超 `MEMORY_HARD_CAP` 时本地丢最旧（不变量）
  - `buildContextInjection` 含梗概；原始数 ≥ 阈值时含定向折叠提示
- `useClueStore.test.ts`：
  - `evolvesFrom` → 旧线索 `archived` + `evolvedIntoId`，新线索 `active`/`major`/`evolvedFrom`
  - 旧线索名找不到时退化为普通新增
  - `buildContextInjection` 只含 active；超 `CLUE_INJECT_CAP` 截断且带标注
  - 无 `evolvesFrom` 时同名合并行为不变
- 迁移：缺 `status` 的线索按 active 处理；缺 `memorySummary` 的 NPC 正常渲染

## F. 非目标（YAGNI）

- 不做线索的「逆向回退/取消演化」。
- 不做 NPC 记忆的独立压缩请求（已选随回合折叠）。
- 不改动剧情回顾摘要的现有封顶机制。
- 不暴露折叠阈值 / 线索注入上限为设置项。
