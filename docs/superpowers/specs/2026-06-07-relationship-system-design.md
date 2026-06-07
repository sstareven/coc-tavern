# 关系系统设计 — 角色关系图 + 显式小队 + 自创卡固化剧本

**日期**：2026-06-07
**分支**：beta
**触发需求**：给人物之间加入"关系"。如果两个角色之间毫无关系，那即便是剧本里面登场了，也不应该在同一个小队里面。
**作者**：与玩家对齐 brainstorm 后定稿

---

## 1. 目标与范围

### 1.1 解决的问题
- 当前"小队成员" = `useNpcStore` 里所有 `isPresent=true` 的 NPC（`TeamSidebar.tsx:85`），由 LLM 每回合自由切换 → 互不相识的角色可能被 LLM 拉进同一支队伍，违反叙事直觉。
- 现状关系只有 `NpcProfile.favorability`（NPC→调查员单向数值）和 `ScenarioCharacter.npcAttrs.relationshipDefault`（自由文本），没有节点-边图谱，LLM 与 UI 都不能据此筛队伍。
- onboarding 流程把"创建角色"和"挑选剧本中的角色"耦合在一起：自建调查员走 CharCreator 就直接进游戏，不能回到剧本看看其他角色，也不能让自创卡留在剧本里供未来使用。

### 1.2 这次解决 / 不解决
**解决**
- 在剧本数据层引入"角色关系图"（有向、带类型）。
- 把"在场（`isPresent`）"和"同队（`inParty`）"解耦，新增显式入队/退队流程。
- 用关系图阻挡无关或敌对角色入队，禁止队友互攻，关系变敌对自动脱队。
- 重做 onboarding：CharCreator 完成 → 回选角界面（RosterPicker）→ 显式选角进游戏。
- 自创卡作为 `player_created` 角色永久写入剧本 `characters[]`，下次开新游戏在 RosterPicker 仍可见、可继续编辑或删除。
- 剧本编辑器 PeopleTab 也支持 NPC↔NPC 关系编辑。

**不解决（YAGNI）**
- 全局关系图可视化（拓扑/桑基图等）。第一版只用列表+侧栏。
- 关系强度数值（仅枚举类型，不引入 0-100 数值）。
- 跨剧本人物迁移、角色商店、云同步。
- 不在 NPC 名册 `useNpcStore` 单独再存关系（关系图单一真源 = `ScenarioDoc.characters[].relations`），运行时若需要查关系直接读 `useScenarioStore`。

---

## 2. 数据模型

### 2.1 新增枚举与字段

```typescript
// src/types/scenario.ts

export type RelationType =
  | 'family'        // 亲属（父母、兄妹、亲戚）
  | 'lover'         // 恋人/配偶
  | 'friend'        // 朋友（含旧识、好友）
  | 'colleague'     // 同事、同行、同学
  | 'mentor'        // 师徒（A 是 B 的导师即 A.relations[{targetId:B, type:'mentor'}]）
  | 'rival'         // 竞争对手（敌对但相识，仍排斥同队）
  | 'enemy'         // 敌人（排斥同队）
  | 'acquaintance'; // 点头之交（最弱的"有关系"）

export interface ScenarioRelation {
  targetId: string;       // 对方 ScenarioCharacter.id
  type: RelationType;
  note?: string;          // 自由文本：进 lorebook 条目增色
}

// ScenarioCharacter.role 加新枚举值
export type ScenarioCharacterRole =
  | 'protagonist'
  | 'optional'
  | 'locked_npc'
  | 'player_created';     // 新增：玩家创建的角色，固化进剧本

export interface ScenarioCharacter {
  // ...已有字段
  role: ScenarioCharacterRole;
  relations?: ScenarioRelation[];   // 出边集合；undefined/空 = 此角色无关系记录
  presentAtStart?: boolean;          // 开场是否在场；undefined = 走原 isPresent 默认逻辑
  createdAt?: number;                // 玩家自创卡用，RosterPicker 按时间倒序分组排序
}
```

### 2.2 NpcProfile 新增 inParty

```typescript
// src/types/index.ts → NpcProfile

export interface NpcProfile {
  // ...已有字段
  inParty?: boolean;       // 新增：显式同队标记，与 isPresent 解耦
                            // - undefined / false：不在小队，仅"在场"或"缺席"
                            // - true：玩家显式邀请入队
}
```

**isPresent vs inParty 语义对比**
| 字段 | 谁能改 | 含义 | 用途 |
|---|---|---|---|
| `isPresent` | LLM 主回合 `npcUpdates` | 此角色当前在玩家身边/场景内 | 旁白引用、上下文注入、对话目标 |
| `inParty` | 仅玩家 UI 操作 + 自动脱队评估器 | 此角色是小队正式成员 | TeamSidebar 显示、战斗友军、攻击保护、队伍上下文 |

中立陌生人可以 `isPresent=true, inParty=false`（同场不同队，正常对话），队友通常 `isPresent=true, inParty=true`。

### 2.3 单一真源

关系图唯一存储位置：`useScenarioStore.scenarios[].characters[].relations[]`。
- NPC 运行时档案 `useNpcStore.profiles` 不冗余存关系（避免双写漂移）。
- 运行时查关系：通过 `NpcProfile.id`（建场时已和 `ScenarioCharacter.id` 对齐，见 `useNpcStore.ts:161-163` "scenarioCharacterToNpc 用剧本 character.id"）反查当前会话挂载的 `scenarioDoc.characters`。
- 玩家走 CharCreator 自建模式时也会拿到固定 id（即新建 `ScenarioCharacter.id`），玩家 NPC 节点 id = 该 `ScenarioCharacter.id`。

---

## 3. 三层架构与模块清单

按 memory `decoupling-modularity-required`：纯逻辑独立成 `*-engine.ts` / `*-data.ts`，React 只渲染。

| 层 | 文件（新/改） | 职责 |
|---|---|---|
| **数据层 — 纯函数** | `src/scenario/relation-graph.ts`（新） | `getRelations(scenarioDoc, charId)`、`canJoinParty(scenarioDoc, candidateId, partyIds, playerId)`、`hasHostileEdge(scenarioDoc, aId, bId)`、`detectPartyConflicts(scenarioDoc, partyIds)`。无副作用，可单测。 |
| **Lorebook 注入层** | `src/scenario/relation-lorebook.ts`（新） | `buildRelationEntries(scenarioDoc) → ScenarioEntry[]`：把每个 character 的出边 + 反向查询的入边渲染成一条 lorebook 条目；被订阅 `useScenarioStore` 的副作用调用，触发时立刻 upsert 到当前会话 lorebook。 |
| **Post-Settle 评估器** | `src/sillytavern/party-relation-evaluator.ts`（新） | LLM 子调用：输入本回合叙事 + 当前关系图，输出 `relationDelta[]`；调用 `useScenarioStore.applyRelationDelta()` 应用，扫描小队检测新出现的敌对边、强制脱队、写 RightPage 旁白。 |
| **Scenario Store** | `src/stores/useScenarioStore.ts`（改） | 新增 `applyRelationDelta(scenarioId, deltas)` 与对 `relations / presentAtStart` 的 patch 支持。`forkMap` 路径不变。 |
| **NPC Store** | `src/stores/useNpcStore.ts`（改） | 新增 `joinParty(npcId)` / `leaveParty(npcId)` / `getParty()`，原 `applyUpdates` 不改 `inParty`（避免 LLM 抢权）。 |
| **CharCreator** | `src/components/CharSheet/CharacterCreator.tsx`（改） | 在已有步骤之后插入【关系】步（步骤序号 +1）：列表+侧栏布局，编辑自创卡对剧本各 NPC 的 `relations` 与 `presentAtStart`。`handleConfirm` 不再 `activateScenario`，改为 `applyPatch + 跳回 RosterPicker`。 |
| **RosterPicker** | `src/components/Landing/RosterPicker.tsx`（新） | 新角色选择界面，列出剧本里所有 `protagonist + optional + player_created`，分组显示，每行【选这个角色 →】触发真正的 `startNewConversation + activateScenario`。 |
| **PeopleTab** | `src/components/Scenario/PeopleTab.tsx`（改） | 现有 9 字段折叠中新增【关系】折叠段，复用 Section 4 同款列表+侧栏 UI；`player_created` 角色右上角加【×删除】按钮。 |
| **TeamSidebar** | `src/components/Layout/TeamSidebar.tsx`（改） | 显示对象从 `isPresent` 改成 `inParty=true`。新增"在场非队"区，列出 `isPresent && !inParty` 的 NPC，每行【邀请入队】按钮。 |
| **RightPage / 选项闸口** | `src/components/Book/RightPage.tsx`（改） + `parseChoice` 调用点 | 解析选项时若识别到目标为 `inParty=true` 队友的攻击/格斗类动作 → 灰显选项 + tooltip "队友"。 |
| **CombatPanel** | `src/components/Combat/CombatPanel.tsx`（改） | 战斗中选目标时跳过 `inParty=true` 的成员。 |
| **App.tsx** | `src/App.tsx`（改） | 调整路由：选剧本后跳 RosterPicker 而非直接进 CharCreator 或正文。 |
| **Scenario Engine** | `src/scenario/scenario-engine.ts`（改） | `activateScenario` 接受 `presentAtStart` 数组，开场建场 NPC 时按字段决定 `isPresent` 初值。`mountScenarioBook` 改造为同时挂关系 lorebook（订阅模式）。 |

---

## 4. 关系图语义与规则

### 4.1 边语义

- **方向性**：`A.relations[targetId=B, type=mentor]` 表示"A 是 B 的导师"。反向（"B 是 A 的学生"）由 `relation-graph.ts` 通过反查 `characters[].relations` 计算，不要求作者两边都写。
- **类型对称性**（用于关系图查询时的语义补全）：
  | 写入方向 | 反向语义 |
  |---|---|
  | `mentor` | 反向 = "学生"（UI 显示用） |
  | `family / lover / friend / colleague / rival / enemy / acquaintance` | 反向 = 同义（双向语义） |
  当查询"X 与 Y 是否有边"时，只要任一方向存在该类型边，就算有。
- **"无边" = 陌生**：作者不需要为每对 NPC 都写 stranger，留白即可。
- **`note` 自由文本**：渲染进 lorebook 条目，增加叙事氛围，但不影响入队判定。

### 4.2 三大判定规则

**规则 R1 — 准入条件**
```
B 想入队（玩家点【邀请入队】或 onboarding 时由 presentAtStart 触发自动入队）：
  必须满足：B 与（玩家 或 当前队内任意成员）至少存在一条"非敌对边"
            非敌对边 = friend / family / lover / colleague / mentor / acquaintance
```

**规则 R2 — 排斥条件**
```
B 与 玩家 或 队内任意成员 存在敌对边（enemy / rival，任一方向）
  → 阻止入队
  → 如果 B 已在队、敌对边因运行时变更新出现 → 自动脱队（规则 R4）
```

**规则 R3 — 攻击保护**
- RightPage 选项解析：`parseChoice` 识别到"攻击 / 格斗 / 射击 / 推打 ... <名字>"类动作 + 目标名匹配 `inParty=true` NPC → 该选项灰显 + tooltip "队友"，玩家点不动。
- CombatPanel 战斗目标列表：渲染敌人名册时跳过 `inParty=true` 的成员。
- 这层硬挡在 UI 层，不靠 LLM 自觉，不依赖 prompt 守则。

**规则 R4 — 关系变敌对自动脱队**
- 每回合 post-settle 链跑 `party-relation-evaluator`（独立 LLM 子调用，方案 D）。
- 子调用返回 `relationDelta[]` → 应用到 `useScenarioStore`。
- 应用后扫描当前 party：若任一成员 X 与队内他人新出现 `enemy/rival` 边 → `X.inParty = false`，写 RightPage 旁白「<X> 因与<Y>反目，离队而去」。

**规则 R5 — 开场冲突剧本编辑器校验**
- 剧本作者写两人都 `presentAtStart=true` + 互为 `enemy/rival` → PeopleTab 编辑器保存时显示红色警告（不阻止保存，但显眼地警告作者）。
- 运行时 `activateScenario` 遇到这种矛盾：按 `characters[]` 数组顺序优先后到者保留 `isPresent=true`，先到者强制 `isPresent=false`，并打 console.warn 留痕。

---

## 5. Onboarding 流程改造

### 5.1 旧流程
```
Landing → ScenarioPicker → CharacterCreator → 直接 activateScenario → 正文
```

### 5.2 新流程
```
Landing 主菜单
  └─ "新游戏"
       └─ ScenarioPicker（已有，选剧本）
            └─ RosterPicker（新）
                 ├─ 顶部按钮 [+ 新建调查员]
                 │    └─ 跳 CharacterCreator
                 │          ├─ 步骤 1-4（属性/技能/背景/起始物品）— 已有，不改
                 │          ├─ 步骤 5【关系】(新)：列表+侧栏编辑自创卡 → 剧本 NPC
                 │          ├─ 步骤 6【确认】(原步骤 5 改名)
                 │          └─ handleConfirm:
                 │                ① 不再 startNewConversation / activateScenario
                 │                ② useScenarioStore.applyPatch(scenarioId, {
                 │                     patchCharacters: [自创卡（role: 'player_created'）],
                 │                   })
                 │                   - builtin 剧本：触发 forkMap → 永久写 userScenarios
                 │                   - user 剧本：直接 upsert
                 │                ③ 跳回 RosterPicker
                 ├─ 列表分组显示：
                 │    ┌─ 作者预设
                 │    │   - 所有 protagonist + optional（按 role 排序）
                 │    │   - 不显示 locked_npc（剧本钉死不可选）
                 │    └─ 你创建的
                 │        - 所有 player_created（按 createdAt 倒序）
                 │        - 每行右上角【×删除】按钮（删除 = applyPatch 移除角色）
                 │        - 每行【✎编辑】按钮 → 重进 CharCreator 加载该卡
                 ├─ 每行右侧【选这个角色 →】
                 │    └─ 触发：
                 │         ① startNewConversation(selectedChar.sheet.identity.name || '调查员')
                 │         ② activateScenario(scenarioId, mode, charIdx)
                 │              mode = 'newChar' 玩家=自创卡
                 │              mode = 'preset' 玩家=作者预设
                 │         ③ 进正文
                 └─ 顶部 [← 返回选剧本] 按钮（回 ScenarioPicker）
```

### 5.3 进游戏后开场逻辑

`activateScenario` 中按 `presentAtStart` 决定 NPC 建场：
- `presentAtStart=true` 且不是玩家本人 → 当场 `useNpcStore.applyUpdates([{ ..., isPresent: true }])`
- 同时按规则 R1（准入）评估：与玩家是否有非敌对边？有 → 自动 `inParty=true`（玩家开场就有同行者）；无 → 仅 `isPresent=true, inParty=false`（场上但非队友）。
- 规则 R2 校验：若两个 `presentAtStart=true` 的 NPC 互为敌对 → 后者强制 `isPresent=false` + console.warn。
- 玩家本人始终 `inParty=true`（不写到 NpcProfile，因为玩家不在名册）。

---

## 6. UI 设计

### 6.1 通用样式约束
- 所有新增面板/抽屉/列表的滚动容器套 `.scenario-editor` className，确保铜版风滚动条统一（memory `scenario-no-default-scrollbar`）。
- 按钮遵循 hover 增亮放大 + active 按压（memory `feedback_button_interaction`）。
- 动效用 `cubic-bezier(0.4, 0, 0.2, 1)`（memory `feedback_animation_bezier`）。
- 不用 emoji，用 `TabIcons` SVG 图标；缺则按同风格新增（memory `no-emoji-use-ui-icons`）。
- 不在 UI 标签里加英文对照（memory `ui-pref-no-english-label`）。
- 紧凑工具栏按钮不接 `var(--system-ratio)`（memory `ui-pref-no-overflow-no-button-bloat`）。

### 6.2 CharCreator 【关系】步（步骤 5）

布局：列表 + 侧栏详情（左 30% 列表，右 70% 详情）。

```
┌─ CharCreator · 步骤 5/6 · 关系 ──────────────────────────────┐
│                                                              │
│  剧本《xxx》预设角色 — 设定你与他们的关系                  │
│                                                              │
│  ┌────────────────┬──────────────────────────────────────┐│
│  │ ▸ 以利亚·霍尔姆斯│  以利亚·霍尔姆斯  侦探 · 推荐主角   ││
│  │   侦探 · 朋友   │  ──────────────────────────────     ││
│  │                 │                                       ││
│  │ ▸ 哈丽特修女    │  关系类型：[朋友        ▼]            ││
│  │   传教士 · 陌生 │                                       ││
│  │                 │  备注：                              ││
│  │ ▸ 布兰登神父    │  ┌──────────────────────────────┐   ││
│  │ 🔒教区长 · 陌生 │  │ 在伦敦皇家学院同期，                  │   ││
│  │   (剧本钉死,    │  │ 我帮他破过一桩诬告案。              │   ││
│  │    可关系不可同队)│  └──────────────────────────────┘   ││
│  │                 │                                       ││
│  │                 │  ☑ 开场和他一起在场                  ││
│  │                 │                                       ││
│  │                 │  ⚠ 提示：选择"敌人"会阻止他入队     ││
│  └────────────────┴──────────────────────────────────────┘│
│                                                              │
│       [← 上一步]                                  [下一步 →] │
└──────────────────────────────────────────────────────────────┘
```

- 列表行：NPC 头像/姓名/职业/当前关系类型（陌生时显示灰字"陌生"）
- 选中行在左栏高亮
- 右栏：关系类型下拉、备注 textarea、`presentAtStart` 复选
- 实时校验：勾"开场同场"但关系是 `enemy/rival` → 复选框旁红色提示「与敌对者不能开场同场」（不允许保存）
- locked_npc 显示但不可勾选 presentAtStart（弱化）

### 6.3 PeopleTab 关系折叠段

复用 6.2 同款列表+侧栏，唯一区别：
- 编辑的是当前选中 NPC 的 `relations`（而非玩家自创卡）
- 列表里也显示"玩家位"占位符（`@创建调查员`），灰显 + tooltip "玩家关系由 CharCreator 编辑"
- `player_created` 角色右上角加【×删除】按钮（剧本作者可手动清理玩家堆积的卡）

### 6.4 RosterPicker

布局：纵向列表，分组标题分隔。

```
┌─ 选择你的角色 — 剧本《xxx》 ─────────────────── [✕] ─┐
│  [← 返回选剧本]                                       │
│                                                       │
│  [+ 新建调查员]                                       │
│                                                       │
│  ── 作者预设 ──────────────────────────────────────  │
│                                                       │
│  以利亚·霍尔姆斯   侦探 · 推荐主角                    │
│                                  [选这个角色 →]      │
│                                                       │
│  哈丽特修女       传教士 · 配角                       │
│                                  [选这个角色 →]      │
│                                                       │
│  ── 你创建的 ──────────────────────────────────────  │
│                                                       │
│  约翰·肯特       记者 · 你的角色 · 2026/06/05         │
│            [✎ 编辑]  [× 删除]  [选这个角色 →]        │
│                                                       │
│  萨拉·林         考古学家 · 你的角色 · 2026/05/30     │
│            [✎ 编辑]  [× 删除]  [选这个角色 →]        │
└───────────────────────────────────────────────────────┘
```

### 6.5 TeamSidebar 修改

- 当前"队伍"段（已有）改为只渲染 `inParty=true` 的 NPC。
- 新增折叠段「在场非队」：渲染 `isPresent=true && !inParty` 的 NPC，每行【邀请入队】按钮（触发 `useNpcStore.joinParty`，前置 R1+R2 校验，失败 toast 提示）。
- 队伍中每个成员加【请求退队】按钮（玩家主动请人退队 → `inParty=false`）。
- **邀请入队的前提**：仅 `isPresent=true` 的 NPC 才出现在"在场非队"段，玩家无法直接邀请缺席（`isPresent=false`）NPC——要让缺席角色加入需先让 LLM 把他写入场景（自然剧情触发）。这一约束与 R1 准入正交：先 in 场，再判 R1。

---

## 7. Lorebook 注入（输入侧方案 B + 实时机制）

### 7.1 条目结构

每个有 `relations` 或被引用的 `ScenarioCharacter` 产生一条 entry：

```typescript
{
  id:        `__scenario_${sid}_rel_${charId}`,
  category:  'people',                    // 复用现有 ScenarioCategory
  comment:   `<${X.sheet.identity.name}> 的人际关系`,
  keys:      X 的姓名 + npcAttrs.identityTag + 别名（如有）,
  content:   renderRelations(X, scenarioDoc),  // 见 7.2
  constant:  false,                       // keyword 触发
  position:  1,                           // 按 memory worldbook-injection-architecture 走标准注入
  priority:  800,                         // 不挤 coc_lore（默认 1000）
  cachePolicy: 'dynamic_suffix',          // 关系会变，归动态尾置（memory worldbook-ds-cache-optimization）
}
```

### 7.2 内容渲染

```
<X 的姓名>的人际关系：
  · 是 <Y 的姓名> 的导师（备注：在皇家学院教过他三年）
  · 视 <Z 的姓名> 为竞争对手（备注：当年学位之争）
  · 朋友：<W 的姓名>（备注：…）
  ...
被以下角色提及：
  · <Y 的姓名> 是他的学生
  · <K 的姓名> 视他为亲属
  ...
```

第一段 = X 的出边渲染；第二段 = 反查其他 character 指向 X 的入边渲染。

### 7.3 实时机制

`relation-lorebook.ts` 订阅 `useScenarioStore`：
```typescript
// 伪代码
useScenarioStore.subscribe(
  (state, prev) => {
    if (relationsOrPresentChanged(state, prev)) {
      const sid = useChatStore.getState().sessions.find(s => s.id === activeId)?.scenarioId;
      if (!sid || sid === '__free') return;
      const doc = useScenarioStore.getState().getById(sid);
      if (!doc) return;
      const entries = buildRelationEntries(doc);
      useLorebookStore.getState().upsertEntries(
        `__scenario_${sid}`,
        entries,
        { prefix: 'rel_' }   // 只替换前缀匹配的旧关系条目，不影响剧本主条目
      );
    }
  }
);
```

- 玩家在 CharCreator/PeopleTab 编辑、`party-relation-evaluator` 自动 patch、`applyRelationDelta` 调用 — 全都触发同一条副作用，下一次 LLM 调用前 lorebook 已更新。
- 订阅在 `scenario-engine.mountScenarioBook` 完成后挂上，`unmountScenarioBook` 时解挂。

---

## 8. Post-Settle 评估器（输出侧方案 D）

### 8.1 接入位置

- 接现有 `useChatPipeline` post-settle 评估链（和 sanity / dailySanLoss / bout-evaluator 同位）。
- 顺序：放在 sanity 之后、清理之前。

### 8.2 子调用 prompt 草案

```
你是关系演化评估器。读本回合叙事，判断角色之间的关系是否发生变化。

【当前关系图】
- 玩家(<玩家名>) → 以利亚: 朋友（备注：…）
- 哈丽特 → 玩家: 敌人
...

【本回合叙事】
<本回合 LLM 输出的正文 + 玩家选择 + NPC 行动>

【任务】
返回 JSON：
{
  "deltas": [
    { "sourceId": "...", "targetId": "...", "newType": "friend|enemy|...", "reason": "短句解释" }
  ]
}
- 仅返回真实发生变化的边；无变化返回 { "deltas": [] }
- 不允许凭空新增"陌生 → 友好"等关系，除非叙事中明确互动改变了他们的关系
- "newType": "stranger" 表示删除该边（变回陌生）
- 不要修改本回合未参与叙事的角色
```

- 模型用 flash 廉价模型（按 `useSettingsStore` 配置）。
- 失败容错：子调用超时/JSON 解析失败 → 跳过，console.warn 留痕（不阻塞主流程）。
- 走独立 `subCalls` 统计入 `genStats`（与现有缓存统计面板一致）。

### 8.3 应用 + 脱队联动

```typescript
async function partyRelationEvaluator(ctx) {
  const deltas = await callLLMForRelationDeltas(ctx);
  if (!deltas.length) return;

  useScenarioStore.getState().applyRelationDelta(ctx.scenarioId, deltas);
  // ↑ 触发 7.3 lorebook 实时机制

  // 扫描小队检测新出现的敌对边
  const party = useNpcStore.getState().getParty();
  const conflicts = detectPartyConflicts(/*scenarioDoc*/, party.map(p => p.id), playerId);
  for (const { kicked, hostileWith } of conflicts) {
    useNpcStore.getState().leaveParty(kicked.id);
    appendRightPageAside(`${kicked.name} 因与 ${hostileWith.name} 反目，离队而去。`);
  }
}
```

### 8.4 RightPage 旁白注入

- 复用现有 RightPage 旁白通道。
- **TODO — implementation 阶段必须先确认**：当前 `RightPage.tsx` 是否已有"系统旁白"或"叙事旁白"段可复用？
  - 有 → 直接 append 一行
  - 无 → 新增 `useNarrationStore` 一条临时旁白队列，与现有 `inventoryChanges / diceResults` 同位作为页面元数据持久化
- 旁白随页持久化，删页/翻页正常回溯（与 memory `page-delete-rollback-snapshot-pattern` 兼容）。

---

## 9. 风险与回退

### 9.1 已识别风险

| 风险 | 缓解 |
|---|---|
| 玩家自创卡永久写入 builtin 剧本副本，未来用户更新剧本时被作者覆盖 | builtin 剧本 fork 行为已通过 `forkMap` 机制隔离副本，作者更新 builtin 不影响已 fork 副本（现有逻辑）。第一版不解决"剧本更新合并"。 |
| `party-relation-evaluator` 误判，凭空把队友改成敌人 | 子调用 prompt 中明确"必须有叙事依据"；玩家发现后可在 PeopleTab 手动改回；脱队事件写 RightPage 旁白玩家立即可见。 |
| LLM 在 `npcUpdates` 仍按旧习惯把陌生 NPC `isPresent=true` 拉入"场"，玩家发现一堆陌生人围观 | 第一版仅约束 `inParty`，不约束 `isPresent`；陌生人同场是允许的（旁观/路人），只要 LLM 不让玩家攻击/邀请即可。若问题严重再升 LLM prompt 约束。 |
| 关系 lorebook 条目过多挤压上下文 | `priority=800` 低于 `coc_lore`，被裁时优先裁关系条目；条目本身按 NPC 名 keyword 触发，不在场的 NPC 不会进 prompt。 |
| onboarding 流程加一步玩家觉得繁琐 | 关系步可"全留空跳过"，玩家不想编关系就直接下一步；自创卡 `relations: []` 进游戏后玩家照样可邀请有 presetAtStart 自动入队的 NPC（剧本作者写好的关系仍生效）。 |

### 9.2 回退路径

如果上线后发现 R1+R2 太严、玩家骂"我连这个 NPC 都拉不进队"：
- 应急：在 `useSettingsStore` 加一个 `disableRelationGate` 开关，开启后 `canJoinParty` 永远返回 true（保留小队 UI 但跳过校验）。
- 数据无需回滚（`relations`/`inParty` 字段保留即可）。

---

## 10. 测试策略

### 10.1 单元测试（vitest）

- `src/scenario/relation-graph.test.ts`：覆盖 `canJoinParty / hasHostileEdge / detectPartyConflicts` 全部分支。
  - 玩家陌生 NPC → 拒绝
  - 玩家好友 → 通过
  - 队里有 A，B 是 A 朋友且与玩家陌生 → 通过（"朋友的朋友"）
  - 队里有 A，B 与 A 敌对 → 拒绝
  - 队里有 A，运行时 B 与 A 变敌对 → `detectPartyConflicts` 返回 B
  - `mentor` 单向边的反向查询正确
- `src/scenario/relation-lorebook.test.ts`：覆盖 entry 渲染：纯出边、纯入边、混合、无关系（不生成条目）。
- `src/stores/useNpcStore.test.ts` 加：`joinParty / leaveParty` 与 `inParty` 字段往返。

### 10.2 集成 / 手动测试（UI 部分按 memory `user-does-ui-testing` 由玩家自己跑）

- 自创卡固化：建卡 → 选别人进游戏 → 返菜单 → 重新选同剧本 → 看到上次的自创卡在列表里 → 选他进游戏。
- 实时 lorebook：进游戏 → 在 TeamSidebar 邀请陌生 NPC → 应被拒；在 PeopleTab 把他改成朋友 → 立刻能邀请。
- 脱队评估：手动构造叙事让 LLM 输出 `relationDelta`（或开发期 mock），观察队友脱队 + RightPage 旁白。
- 攻击保护：选项里出现"攻击 <队友>" → 灰显；战斗中战斗员名册不含队友。

### 10.3 类型 + 构建

- `npx tsc --noEmit` 必须干净通过。
- `npx vite build` 必须成功（pre-existing warning 除外）。

---

## 11. 落地里程碑（writing-plans 阶段会拆细）

按依赖顺序，每个里程碑独立可 merge 可回滚：

1. **M1 — 数据层与纯函数**
   - 新增 `RelationType / ScenarioRelation`、扩 `ScenarioCharacter.relations/presentAtStart/role`、加 `NpcProfile.inParty`、写 `relation-graph.ts` + 单测
   - 不动 UI，仅类型与逻辑落地

2. **M2 — Store 改造**
   - `useScenarioStore.applyRelationDelta` + relations patch 支持
   - `useNpcStore.joinParty/leaveParty/getParty`
   - 单测覆盖

3. **M3 — Lorebook 实时机制**
   - `relation-lorebook.ts` 生成器
   - 订阅 `useScenarioStore` 副作用挂载点（scenario-engine）
   - 不动 UI，验证 lorebook 条目正确

4. **M4 — Onboarding 流程改造**
   - 新 `RosterPicker.tsx`
   - 改 `App.tsx` 路由
   - 改 `CharacterCreator.tsx` handleConfirm（不进游戏，回 RosterPicker）
   - 自创卡 applyPatch 固化路径
   - 不动关系编辑步，先把流程闭环

5. **M5 — CharCreator 关系编辑步**
   - 新增步骤 5 + 列表+侧栏 UI
   - 编辑 `relations / presentAtStart` 落 store

6. **M6 — PeopleTab 关系折叠段 + 自创卡删除**
   - 复用 M5 UI 组件
   - 加 `player_created` 删除按钮

7. **M7 — TeamSidebar 改造与入队/退队**
   - 渲染源从 isPresent 改 inParty
   - 在场非队段 + 邀请按钮
   - 走 `canJoinParty` 校验

8. **M8 — 攻击保护**
   - `parseChoice` 攻击意图 + 队友目标识别
   - RightPage 选项灰显
   - CombatPanel 战斗目标过滤

9. **M9 — Post-Settle 评估器**
   - `party-relation-evaluator.ts`
   - 接 `useChatPipeline` post-settle 链
   - RightPage 旁白注入

10. **M10 — activateScenario 开场逻辑**
    - 按 `presentAtStart` 建场 + 自动 inParty
    - 开场冲突运行时处理 + console.warn

每个里程碑完成都跑 tsc + vitest + build，按 memory 提交 + 推 beta，不写 Co-Authored-By。

---

## 12. 决策记录

本 spec 对齐过程中明确的决策（按 brainstorm 顺序）：

1. **关系数据来源** = 剧本作者预设（推荐项胜出）
2. **阻挡机制** = 新增 `inParty` 玩家显式拉人（与 `isPresent` 解耦）
3. **关系图结构** = 有向、带类型，8 枚举
4. **入队判定** 流程改造 = onboarding 拆 CharCreator + RosterPicker；自创卡固化剧本
5. **CharCreator 关系编辑** = 内嵌新步骤【关系】，深度结合剧本
6. **关系类型枚举** = 8 个够用
7. **敌对边** = 算"有关系"但阻止同队（会攻击你）
8. **运行时执行** = 同队禁互攻 + 关系变敌对自动脱队
9. **脱队评估器** = 接现有 post-settle 链；脱队消息走 RightPage 旁白
10. **CharCreator 编辑 UI** = 列表+侧栏详情；备注保留
11. **输入侧** = lorebook 注入 (B) + 实时机制
12. **输出侧** = 独立 LLM 子调用 (D)
13. **自创卡** = 永久写入剧本作为 player_created 角色（含删除按钮）
14. **UI 风格** = 统一铜版风（套 `.scenario-editor`）+ memory 所有 UI 规约

---

**下一步**：本 spec 经玩家审核后，调用 `superpowers:writing-plans` 拆 M1-M10 落地 plan。
