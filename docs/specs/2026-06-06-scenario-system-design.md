# 剧本系统设计稿 (Scenario System)

**Date:** 2026-06-06
**Branch:** beta
**Status:** spec written, awaiting user review → 转 writing-plans 拆 Workflow 实现任务
**Topic:** 在人物创建前引入一个可选择/编辑/导出/导入/删除的剧本系统，作者可在媲美世界书的编辑器里塞入大量条目、配置必要人物、推荐技能、暗线与坏结局；玩家选剧本里的预设角色 = 套那套角色卡进游戏，选「新建角色」= 走原 CharacterCreator。

---

## 1. 决策摘要

| 维度 | 决策 |
|------|------|
| 入口流程 | `Landing → ScenarioScreen → (CharCreator OR LLM 扩写首页) → Game` |
| 选剧本预设角色 | 套该角色卡 + 其他角色变开局 NPC，**跳过 CharCreator**，立即 LLM 扩写 `prologueSeed` 为 `page[0]` |
| 选「新建角色」 | 走原 CharacterCreator；剧本里所有 characters 全部 NPC 化进 `useNpcStore` |
| 推荐技能 UX | CharacterCreator Step 4 顶部「剧本推荐」chip 行，点击即加入职业/兴趣槽 |
| 「自由探索」剧本 Step 4 | chip 行回退为「通用热门技能」（写死 6-8 个 COC 高频技能） |
| 暗线/坏结局对 LLM | 走现有 worldbook-conditional-unlock：`剧情.已解锁.*` + EJS `<% if %>` 条目 |
| 初始物品字段 | Step 5 加一个单行 `textarea`，进游戏前走 LLM 子调用抽取入 `useInventoryStore` |
| 剧本存储 | `useScenarioStore` (zustand + Dexie kvStore) + 会话 meta 写 `scenarioId` |
| 剧本条目挂载 | 选中剧本 → 临时挂载为 `useLorebookStore` 一个独立 book (`id=__scenario_<id>`)，复用全部匹配引擎/EJS/缓存优化器；卸载时移除 |
| 编辑模式入口 | 剧本卡上「编辑」按钮，无门槛 |
| 编辑器形态 | 媲美世界书：6 类固定分类 tab + 2 个 hidden tab（暗线时间线 + 坏结局矩阵）+ 右驻「作者伙伴」聊天框 |
| 自动分类体系 | 固定 6 类：地点 / 人物 / 势力 / 物品线索 / 暗线 / 秘密与解锁 |
| LLM 辅助范围 | 全套：条目生成 / 自动分类 / 静动态判定 / 缓存优化建议 / 暗线+坏结局生成 |
| LLM 辅助 UX | 右侧驻留作者伙伴聊天框 → 返回结构化 ScenarioPatch JSON → 一键 Accept/Reject |
| 角色卡数据深度 | 完整 `CharacterSheet`（八围/halfFifth/derived/技能 base+current）+ `npcAttrs`（身份/态度/位置/公开简历/隐藏简历） |
| 导入导出 | 单 JSON 文件 `*.scenario.json` |
| 内置剧本 | 多个，从 `C:\Users\USER\Downloads\Documents\COCExtends.pdf` 抽取；外加「自由探索」兜底 |
| 老存档兼容 | **不兼容**，本次改动太大无所谓老存档；进老会话强制套 `__free` 剧本，玩家应开新游戏 |
| 剧本卡预览 | 名 / 类型 / 时长 / 难度 / 人数 / 一句话背景 / 推荐职业 chips / 必要人物 chips / SAN 损耗 |
| 调试 | GameView 加「当前剧本」胶囊；DebugConsole 加 `:scenario` 命令查暗线/解锁/坏结局 |
| PDF 抽取实施 | 与代码实现同一轮 Workflow 并行，互不阻塞；PDF 工作流产 JSON 后回填 `builtin-scenarios.ts` |

---

## 2. 文件清单

### 新增

```
src/types/scenario.ts                        # ScenarioDoc / ScenarioCharacter / ScenarioEntry / DarkPhase / BadEnding
src/stores/useScenarioStore.ts               # zustand + persist(Dexie kvStore: 'coc_scenarios')，CRUD + active 选中 + 内置 hydrate
src/data/builtin-scenarios.ts                # 内置剧本常量数组（首装幂等种入）
src/data/popular-skills.ts                   # 「自由探索」剧本 Step 4 回退的「通用热门技能」清单
src/scenario/scenario-engine.ts              # activateScenario / unloadScenario / fork / 内置 dedup
src/scenario/scenario-llm.ts                 # 5 个 LLM 子调用：生条目/自动分类/缓存策略/暗线/坏结局
src/scenario/scenario-injection.ts           # 把 ScenarioEntry[] → LoreBook（id + entries），priority + 1000 防撞键
src/scenario/scenario-patch.ts               # ScenarioPatch 类型 + apply/reject (作者伙伴用)
src/scenario/scenario-io.ts                  # importScenario / exportScenario (单 JSON, schemaVersion 校验)
src/scenario/initial-items-extractor.ts      # 「初始物品 textarea → InventoryItem[]」LLM 子调用
src/hooks/useScenarioInjection.ts            # 进/退游戏时把剧本拉到 useLorebookStore + useNpcStore
src/components/Scenario/ScenarioScreen.tsx
src/components/Scenario/ScenarioCard.tsx
src/components/Scenario/ScenarioEditor.tsx
src/components/Scenario/CompanionChat.tsx
src/components/Scenario/tabs/MetaTab.tsx
src/components/Scenario/tabs/LocationsTab.tsx
src/components/Scenario/tabs/PeopleTab.tsx
src/components/Scenario/tabs/FactionsTab.tsx
src/components/Scenario/tabs/ItemsTab.tsx
src/components/Scenario/tabs/DarkThreadsTab.tsx
src/components/Scenario/tabs/SecretsTab.tsx
src/components/Scenario/tabs/DarkTimelineTab.tsx    # hidden
src/components/Scenario/tabs/BadEndingsTab.tsx      # hidden
src/components/Scenario/RecommendedSkillsChips.tsx  # 给 StepSkills 用的 chip 行
src/components/Scenario/CurrentScenarioBadge.tsx    # GameView 顶部胶囊
src/components/Scenario/__tests__/*.test.tsx
src/scenario/__tests__/*.test.ts
```

### 改动

```
src/App.tsx                                  # 加 'scenarioPick' screen，CharacterCreator onComplete 改为「按模式分支」
src/components/Landing/LandingScreen.tsx     # 「开始游戏」→ 进剧本屏，不再直接到 creator
src/types/index.ts                           # CharacterSheet 加 initialItemsRaw?: string
src/stores/useCharSheetStore.ts              # defaultSheet 加 initialItemsRaw: ''
src/stores/sessionLifecycle.ts               # startNewConversation 后 activateScenario；clearAllGameState 调 unloadScenario
src/stores/useChatStore.ts                   # sessions[i].meta.scenarioId 字段（持久化）
src/components/CharSheet/CharacterCreator.tsx # handleConfirm 后按 mode 分支：常规 → game / 套预设角色 → 跳过到 LLM 扩写首页
src/components/CharSheet/steps/StepSkills.tsx # 顶部插 RecommendedSkillsChips
src/components/CharSheet/steps/StepBackground.tsx # 「初始物品」textarea
src/components/Layout/GameView.tsx           # 顶部插 CurrentScenarioBadge
src/components/Shared/DebugConsole.tsx       # 加 ':scenario' 命令族
src/sillytavern/slash-commands.ts            # 加 /scenario 内置命令
src/components/Landing/ChangelogModal.tsx    # 新版本条目
```

---

## 3. 数据模型

```ts
// src/types/scenario.ts

import type { CharacterSheet } from './index';

export type ScenarioCategory = '地点' | '人物' | '势力' | '物品线索' | '暗线' | '秘密与解锁';
export type ScenarioCachePolicy = 'static_prefix' | 'dynamic_suffix' | 'auto';

export interface ScenarioEntry {
  id: string;
  category: ScenarioCategory;
  comment: string;          // 标题
  keys: string;             // 触发关键词（逗号分隔，与 lorebook 同语义）
  content: string;          // 可含 EJS <% %>，进 lorebook 后由现有 EJS 执行器渲染
  constant: boolean;        // true → 常驻 / false → keyword 触发
  position: 0 | 1 | 2 | 3 | 4;
  priority: number;         // 在挂载到 lorebook 时 +1000 防与 coc_lore 撞键被盖
  cachePolicy: ScenarioCachePolicy;  // 作者标注或 LLM 判定
  hidden?: boolean;         // 编辑模式独有的「未解锁/伏笔」条目；玩家模式视为禁用
}

export interface ScenarioCharacter {
  id: string;
  role: 'protagonist_candidate' | 'npc_only';
  sheet: CharacterSheet;    // 完整复用现有 CharacterSheet
  npcAttrs: {
    identityTag: string;            // 「密斯卡塔尼克大学考古学教授」
    attitudeDefault: number;        // -100~100
    relationshipDefault: string;    // 「同事」/ 「姐姐」
    locationDefault: string;
    publicBio: string;              // NPC 化时 LLM 引用（玩家可见）
    hiddenBio: string;              // 仅编辑模式可见；玩家模式由条件解锁机制流出
  };
}

export interface DarkPhase {
  id: string;
  threshold: number;        // 0~100 暗线进度门槛
  title: string;
  triggers: string[];       // 触发事件（环境异变/NPC 行为/背景声响）— LLM 可选用
  directorNote: string;     // 给守秘人 LLM 的导演词
  autoUnlockKeys: string[]; // 进入该 phase 时自动写 /剧情/已解锁/<key>: true
}

export interface BadEnding {
  id: string;
  condition: string;        // 自然语言条件（SAN<10 + 暗线进度>80 + NPC 死亡）
  narrative: string;        // 结局描述
  accelerators: string[];   // 哪些玩家行为加速触发
}

export interface ScenarioMeta {
  name: string;
  type: '调查' | '战斗' | '玩职' | '剧本' | '混合';
  durationHint: '1-2h' | '3-5h' | '长期连载';
  difficulty: 1 | 2 | 3 | 4 | 5;
  headcountHint: string;
  sanLossHint: '低' | '中' | '高' | '极高';
  blurb: string;            // 一句话背景（玩家卡片上可见）
  coverEmoji?: string;      // 占位封面；若作者填则按作者意图渲染
}

export interface ScenarioDoc {
  id: string;
  builtin?: boolean;        // 内置剧本：不可删，编辑 = 自动 fork 新 id
  meta: ScenarioMeta;

  // 玩家可见
  prologueSeed: string;             // 喂给 LLM 扩写首页的种子文本
  recommendedSkills: string[];      // Step 4 chip 行
  recommendedOccupations: string[]; // 卡面/Step 1 提示
  characters: ScenarioCharacter[];

  // 世界书级条目
  entries: ScenarioEntry[];

  // 仅编辑模式可见
  darkTimeline: DarkPhase[];
  badEndings: BadEnding[];
  authorNotes: string;

  schemaVersion: 1;
  createdAt: number;
  updatedAt: number;
}

export interface ScenarioPatch {
  // CompanionChat LLM 返回的统一变更包；scenario-patch.ts 应用
  upsertEntries?: ScenarioEntry[];
  removeEntryIds?: string[];
  recategorize?: Array<{ id: string; category: ScenarioCategory }>;
  setCachePolicies?: Array<{ id: string; cachePolicy: ScenarioCachePolicy }>;
  upsertDarkTimeline?: DarkPhase[];
  upsertBadEndings?: BadEnding[];
  patchMeta?: Partial<ScenarioMeta>;
  patchCharacters?: ScenarioCharacter[];
}
```

### CharacterSheet 字段新增

```ts
// src/types/index.ts CharacterSheet 接口尾部加
initialItemsRaw?: string;  // Step 5 textarea 原文；进游戏前 LLM 抽取 → useInventoryStore
```

### chatStore sessions[].meta 字段新增

```ts
scenarioId?: string;       // 老存档 undefined，进游戏时跳过 activateScenario
```

---

## 4. 启动流程

### 4.1 入口拓扑

```
[Landing]
   │
   │ onStart
   ▼
[ScenarioScreen]  ← 主要新增屏
   │
   │ 渲染：(1) 剧本卡网格  (2) 顶部「+ 新剧本」「📂 导入」按钮
   │       (3) 每张卡：选「玩」/ 「编辑」  (4) 选「玩」之后弹「选角色」二级抽屉
   │
   ├── pick(scenarioId, 'newChar')       → 走 CharacterCreator (Step 4 chip 行用 scenario.recommendedSkills)
   │                                        completion → activateScenario(mode='newChar') → game
   │
   └── pick(scenarioId, characterIdx)    → activateScenario(mode='preset', charIdx)
                                            → 显示「正在生成首页」loading
                                            → scenario-llm.expandPrologue(prologueSeed) → page[0]
                                            → game
```

### 4.2 activateScenario(scenarioId, mode, charIdx?)

```ts
// src/scenario/scenario-engine.ts
export async function activateScenario(
  scenarioId: string,
  mode: 'newChar' | 'preset',
  charIdx?: number,
): Promise<void> {
  // 0) 拿剧本
  const scn = useScenarioStore.getState().getById(scenarioId);
  if (!scn) throw new Error(`scenario not found: ${scenarioId}`);

  // 1) clearAllGameState 已在 startNewConversation 跑过（外层调用方负责）
  // 2) 角色装填
  if (mode === 'preset') {
    const proto = scn.characters[charIdx!];
    useCharSheetStore.getState().setSheet(proto.sheet);
    // 其他角色全 NPC 化
    for (let i = 0; i < scn.characters.length; i++) {
      if (i === charIdx) continue;
      useNpcStore.getState().upsert(scenarioCharacterToNpc(scn.characters[i]));
    }
  } else {
    // newChar: 玩家自建已通过 CharacterCreator 设置 sheet；所有 scenario.characters 全 NPC
    for (const c of scn.characters) {
      useNpcStore.getState().upsert(scenarioCharacterToNpc(c));
    }
  }

  // 3) 暗线/解锁种子（statData 树初始化由 createInitialStatData 负责，这里只覆盖剧本特有种子）
  const seed = buildScenarioStatDataSeed(scn);  // {剧情.暗线={...}, 剧情.结局类型='', 剧情.已解锁={}}
  useVariableStore.getState().patchStatData(seed);

  // 4) 条目挂载为独立 lorebook book
  useLorebookStore.getState().upsertBook(`__scenario_${scn.id}`, {
    name: `[剧本] ${scn.meta.name}`,
    enabled: true,
    entries: scenarioEntriesToLoreEntries(scn.entries, /*priorityOffset=*/1000),
  });

  // 5) 起始物品抽取（mode='newChar' 才走；preset 模式下 sheet 已带）
  if (mode === 'newChar') {
    const raw = useCharSheetStore.getState().sheet.initialItemsRaw ?? '';
    if (raw.trim()) {
      const items = await extractInitialItems(raw);  // LLM 子调用
      for (const it of items) useInventoryStore.getState().add(it);
    }
  }

  // 6) 写会话 scenarioId
  useChatStore.getState().setActiveSessionMeta({ scenarioId: scn.id });

  // 7) preset 模式：立即扩写首页
  if (mode === 'preset') {
    const page0 = await expandPrologueToPage(scn.prologueSeed, scn);  // LLM 子调用，返回 BookPage
    useBookStore.getState().setPages([{ ...page0, id: crypto.randomUUID() }]);
  }
  // newChar 模式：BookStore 走 resetToPrologue → defaultPages[0]；首回合用户发消息触发常规流程
}

export function unloadScenario(scenarioId: string): void {
  useLorebookStore.getState().removeBook(`__scenario_${scenarioId}`);
  // NPC 不主动移除——sessionLifecycle.clearAllGameState 已负责清空 useNpcStore
}
```

### 4.3 sessionLifecycle 改动

`startNewConversation` 保持同步签名不变（仍只做 clearAllGameState + createSession + 种 statData）。剧本激活由 **App 层调用方**串接：先 `startNewConversation` 同步，后 `await activateScenario`（见 §6.3 onComplete / onPick 流）。

```ts
// clearAllGameState 末尾追加（同步：unloadScenario 仅移除 lorebook book，纯同步操作）
const prev = useChatStore.getState().activeMeta?.scenarioId;
if (prev) unloadScenario(prev);
```

老存档 path：sessions[i].meta.scenarioId 为 undefined 时 App 层不调 activateScenario，路径完全回退到 v1（resetToPrologue → defaultPages[0]）。

---

## 5. 编辑器（媲美世界书）

### 5.1 结构

```
ScenarioEditor (overlay panel)
├─ 顶部工具栏：剧本名 / 「💾 保存」/ 「📤 导出」 /「⤴ 另存为」/「✕ 关闭」
├─ Tabs:
│   ├─ 元信息              (玩家也可见的 meta 字段)
│   ├─ 地点                 ScenarioEntry[category='地点']
│   ├─ 人物                 双视图：(1) ScenarioCharacter 名册  (2) ScenarioEntry[category='人物']
│   ├─ 势力                 ScenarioEntry[category='势力']
│   ├─ 物品线索             ScenarioEntry[category='物品线索']
│   ├─ 暗线                 ScenarioEntry[category='暗线']
│   ├─ 秘密与解锁           ScenarioEntry[category='秘密与解锁']
│   ├─ ★ 暗线时间线         DarkPhase[]（hidden tab）
│   └─ ★ 坏结局矩阵         BadEnding[]（hidden tab）
└─ 右侧驻留 CompanionChat（移动端折叠为底部抽屉）
```

每个 ScenarioEntry tab 共用同一个组件 `EntryListPane`（接 category prop），含：
- 左侧条目列表（搜索框/排序）
- 右侧选中条目编辑面板：标题 / 关键词 / 内容（CodeMirror EJS hi）/ position / priority / constant 开关 / 缓存策略（static_prefix / dynamic_suffix / auto）/「♻ 重新分类」按钮

### 5.2 CompanionChat 与 ScenarioPatch

CompanionChat 是一个对话框 + 输入框：
- 玩家发自然语言指令
- 子调用通过 `scenario-llm.ts` 返回 `ScenarioPatch` JSON（强制 JSON 输出）
- 渲染为「📋 变更预览」卡片：列出 +N 条 / -N 条 / 改 N 条 + 摘要
- 「接受」→ scenarioStore.applyPatch(scn.id, patch)；「拒绝」→ 仅丢消息

### 5.3 LLM 辅助 5 个命令

| 命令 | 触发 | 输入 | 输出 |
|------|------|------|------|
| `generateEntries(category, outline, n=5)` | CompanionChat 自然语句解析或按钮 | 类别 + 大纲 | `upsertEntries: ScenarioEntry[]` |
| `autoCategorize(entries)` | 「♻ 自动分类」按钮 | 全部条目 | `recategorize: [{id, category}]` |
| `decideCachePolicy(entries)` | 「📊 优化缓存」按钮 | 全部条目；扫 EJS 动态 marker (`getvar / parseInt / <% if %>`) | `setCachePolicies: [{id, cachePolicy}]` |
| `generateDarkTimeline(meta, entries)` | 暗线时间线 tab「✨ 生成」 | 剧本背景 + 现有 hint | `upsertDarkTimeline: DarkPhase[]` |
| `generateBadEndings(darkTimeline, entries)` | 坏结局矩阵 tab「✨ 生成」 | 暗线 + 现有线索 | `upsertBadEndings: BadEnding[]` |
| `rewriteEntry(entryId, instruction)` | 条目右键「✍ 重写文案」 | 单条目 + 指令（更阴森/更轻描淡写/转第三人称等） | `upsertEntries: [rewritten]` |
| `injectEjsUnlock(entryId, unlockKeys?)` | 条目右键「🔒 加解锁条件」 | 单条目 + 可选 unlockKeys | `upsertEntries: [带 `<% if (getvar('剧情.已解锁.X')==='true') { %>...<% } %>` 的版本]` |

所有子调用共用 settings.apiModel；命中 cacheStats subCalls 统计（label 前缀 `scenario:`）。

### 5.4 缓存优化器接入

复用现有 `worldbook-ds-cache-optimization`（commit d31a024）：
- 静态前置：`cachePolicy='static_prefix' && constant=true` 且条目内容**不含**动态 marker
- 动态尾置：`cachePolicy='dynamic_suffix' || constant=false || 含动态 marker`
- 编辑器在条目列表上每条画一个小标签（绿 = 静态命中 / 黄 = 动态尾置 / 灰 = 默认）

---

## 6. CharacterCreator 接入

### 6.1 Step 4 顶部 chip 行

```tsx
// src/components/CharSheet/steps/StepSkills.tsx 顶部插
<RecommendedSkillsChips
  source={activeScenario?.recommendedSkills ?? POPULAR_SKILLS}
  onClick={(name) => occSkills.length < 8 ? toggleOccSkill(name) : toggleInterestSkill(name)}
  occSelected={occSkills}
  intSelected={interestSkills}
/>
```

- chip 已选时灰色禁用（点不动）
- 「自由探索」剧本 → POPULAR_SKILLS 回退（在 `src/data/popular-skills.ts`）
- chip 行只在 Step 4 显示；不出现在 Step 1/2/3/5

### 6.2 Step 5 加初始物品 textarea

```tsx
// src/components/CharSheet/steps/StepBackground.tsx 在「珍贵物品 treasuredPossessions」之后插
<Field label="初始物品">
  <textarea
    value={initialItemsRaw}
    onChange={(e) => setInitialItemsRaw(e.target.value)}
    placeholder="开场即拥有的物品，逗号或换行分隔。例：照相机一台、笔记本、手电筒、12 美元零钱"
    rows={2}
  />
</Field>
```

handleConfirm 把 initialItemsRaw 写到 sheet：

```ts
// CharacterCreator.handleConfirm 内 setSheet({...}) 时加：
initialItemsRaw: initialItemsRaw,
```

activateScenario 时（mode='newChar'）抽取入 useInventoryStore（见 §4.2 第 5 步）。

### 6.3 选剧本预设角色时跳过 CharacterCreator

App.tsx 三段改 四段：

```ts
const [screen, setScreen] = useState<'landing' | 'scenarioPick' | 'creator' | 'game'>('landing');

// ScenarioScreen onPick
onPick: (scenarioId, choice: { mode: 'newChar' } | { mode: 'preset'; charIdx: number }) => {
  if (choice.mode === 'preset') {
    // 跳过 creator，先开新会话+激活剧本+扩写首页，再进 game
    void (async () => {
      const newId = startNewConversation('新游戏');
      await activateScenario(scenarioId, 'preset', choice.charIdx);
      setScreen('game');
    })();
  } else {
    useScenarioStore.getState().setLastPicked(scenarioId);
    setScreen('creator');
  }
}

// CharacterCreator onComplete
onComplete: () => {
  void (async () => {
    const scnId = useScenarioStore.getState().lastPicked;
    if (scnId) {
      startNewConversation('新游戏');
      await activateScenario(scnId, 'newChar');
    } else {
      startNewConversation('新游戏');  // 老路径
    }
    setScreen('game');
  })();
}
```

---

## 7. 内置剧本

### 7.1 「自由探索」兜底

由现有 `defaultPages[0]` 包装：
- `id = '__free'`, `builtin = true`
- `prologueSeed` = defaultPages[0].rightContent
- `recommendedSkills = []` （UI 检测空数组自动回退 POPULAR_SKILLS）
- `characters = []`
- `entries = []`, `darkTimeline = []`, `badEndings = []`

### 7.2 COCExtends.pdf 抽取（并行 workflow）

PDF 工作流（与代码实现 workflow 同轮并行）：
1. `pdftotext -layout COCExtends.pdf | iconv UTF-8` → 纯文本
2. deep-research / LLM 分章识别每个剧本（标题/类型/时长/难度/人数/SAN/必要人物/推荐技能/开场白/暗线/坏结局/世界书条目）
3. 每个剧本产出 `ScenarioDoc` JSON
4. 把 JSON 数组合并写入 `src/data/builtin-scenarios.ts`：

```ts
export const BUILTIN_SCENARIOS: ScenarioDoc[] = [
  FREE_EXPLORATION_SCENARIO,
  ...PDF_EXTRACTED_SCENARIOS,
];
```

useScenarioStore 在首装 hydrate 时把 BUILTIN_SCENARIOS 合并入 store.scenarios（按 id 去重，builtin=true 标记），玩家改内置剧本自动 fork 为新 id。

### 7.3 内置剧本与玩家剧本的关系

- 内置剧本不写入 Dexie，每次启动从 builtin-scenarios.ts 重读到 `store.builtins`
- 玩家自建/导入剧本写入 Dexie（`store.userScenarios`）
- 玩家「编辑」内置剧本 = 自动 fork 新 id 进 userScenarios，不污染内置；编辑器顶部提示「已 fork 为新剧本：…」
- 玩家删除 = 仅删 userScenarios；内置剧本「删除」按钮禁用

---

## 8. 导入导出

### 8.1 单 JSON 文件 `*.scenario.json`

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-06-06T12:00:00Z",
  "scenario": { /* 完整 ScenarioDoc */ }
}
```

### 8.2 importScenario

- 文件大小限制 5MB
- 校验 schemaVersion === 1
- 若 id 撞已有：弹窗「覆盖 / 改名导入 / 取消」
- 解析失败 → 全屏 ErrorModal 报告（指出违规字段路径，不静默）

### 8.3 exportScenario

- 浏览器 `Blob` + `URL.createObjectURL` 触发下载
- 文件名 `<safeName>-<id_prefix>.scenario.json`
- 内置剧本也可导出（导出后 builtin 字段置 false，相当于 fork）

---

## 9. 调试与领顶

### 9.1 GameView 「当前剧本」胶囊

`CurrentScenarioBadge.tsx` 插在 GameView 顶部右侧：

```
┌─ 印斯茅斯之影  暗线 32 / 100  ⓘ ─┐  ← 点击展开侧抽屉
└──────────────────────────────────┘
```

- 默认折叠为单行胶囊
- 点击展开：剧本名 / 类型 / 暗线进度 / 当前阶段 / 已解锁 keys 列表 / 当前已识别的潜在结局类型

### 9.2 DebugConsole `:scenario` 命令族

| 命令 | 行为 |
|------|------|
| `:scenario info` | 打印当前剧本元信息 |
| `:scenario unlock <key>` | 强制写 `/剧情/已解锁/<key>: true` |
| `:scenario phase <id>` | 强制 darkPhase 进入指定阶段 |
| `:scenario badending <id>` | 强制触发坏结局 |
| `:scenario list` | 列所有可用剧本 id + 名 |
| `:scenario reload-builtins` | 强制重新读取 builtin-scenarios.ts（开发用） |

### 9.3 SlashCommand `/scenario`

同上语义，主要供脚本/扩展系统调用。

---

## 10. 已知风险与对策

| 风险 | 对策 |
|------|------|
| 剧本 lorebook 与 coc_lore 关键词撞键被压住 | 挂载时 priority + 1000，剧本特化条目盖通用 |
| 右驻聊天框侵占编辑器宽度 | 移动端折叠为底部 60% 高度抽屉；桌面端最小 320px 编辑区 + 320px 聊天，<800px 视口强制抽屉 |
| 内置剧本随版本更新覆盖玩家编辑 | 玩家编辑内置 = 自动 fork；内置剧本仅在 store.builtins，每次启动 rehydrate |
| 选剧本预设角色后扩写首页失败 | catch → 把 prologueSeed 原文塞进 page[0].rightContent，附 4 个默认通用选项；同时 toast 报警 |
| 大量条目挂载导致首次匹配卡顿 | 复用 worldbook 现有索引；剧本卸载时清掉 book |
| 单 JSON 文件包含完整 sheet 字段，导出体积大 | 单剧本平均 100KB～500KB；超 2MB 时弹窗确认 |
| LLM 辅助返回的 ScenarioPatch 字段缺失/越界 | scenario-patch.ts 严格 zod 校验；越界 → 全屏 ErrorModal，patch 不应用 |
| 老存档无 scenarioId 进游戏 | **不兼容**：检测到 sessions[i].meta.scenarioId 为 undefined → 自动套 `__free` 剧本并 toast 提示「此版本机制已重写，老存档可能行为异常，建议新建游戏」 |
| CharacterCreator 内部状态太长（已 700+ 行） | 不重构；仅 2 处小插入（Step 4 顶部 chip 行 / Step 5 textarea），保持改动最小 |

---

## 11. Workflow 拆分概览（交给 writing-plans）

这份 spec 让 writing-plans 拆成 ≥ 20 个 TDD bite-sized 任务，下面是分桶预览（不是最终任务清单）：

**桶 A：类型与存储（无 UI）**
- A1 ScenarioDoc / Entry / Character / DarkPhase / BadEnding 类型 + zod schema
- A2 useScenarioStore（CRUD + hydrate + applyPatch）+ 单测
- A3 scenarioEntriesToLoreEntries 转换函数 + 单测
- A4 buildScenarioStatDataSeed 函数 + 单测
- A5 「自由探索」内置剧本常量 + popular-skills.ts

**桶 B：CharacterSheet 字段与 CharacterCreator 插桩**
- B1 CharacterSheet.initialItemsRaw 字段 + defaultSheet 同步
- B2 RecommendedSkillsChips 组件 + 单测
- B3 StepSkills 顶部接入（含「自由探索」回退）
- B4 StepBackground 加初始物品 textarea
- B5 CharacterCreator.handleConfirm 把 initialItemsRaw 写入 sheet

**桶 C：scenario-engine 与生命周期**
- C1 activateScenario 主函数 + 单测（用 fake stores）
- C2 unloadScenario + sessionLifecycle 接入
- C3 chatStore.sessions[].meta.scenarioId + persistence
- C4 initial-items-extractor LLM 子调用 + 单测（mock LLM）
- C5 expandPrologueToPage LLM 子调用 + fallback 路径

**桶 D：ScenarioScreen + ScenarioCard + 角色选择抽屉**
- D1 ScenarioScreen 容器与卡网格
- D2 ScenarioCard 丰富预览 UI
- D3 角色选择抽屉（玩家选「新建」/ 某 character 索引）
- D4 App.tsx screen 状态扩展为 4 段
- D5 LandingScreen 改「开始游戏」入口

**桶 E：ScenarioEditor 框架 + 6 类 tab + 元信息 tab**
- E1 ScenarioEditor overlay 容器 + 顶部工具栏
- E2 EntryListPane 共享组件（接 category prop）
- E3 6 个 category tab 接入 EntryListPane
- E4 MetaTab + zod 校验
- E5 PeopleTab 双视图（角色名册 + 人物条目）

**桶 F：hidden tabs + 暗线时间线 + 坏结局矩阵**
- F1 DarkTimelineTab UI + DarkPhase 编辑
- F2 BadEndingsTab UI + BadEnding 编辑

**桶 G：CompanionChat + ScenarioPatch + LLM 辅助 5 命令**
- G1 ScenarioPatch zod schema + applyPatch + 单测
- G2 CompanionChat UI（消息列表 + 输入 + patch 预览卡）
- G3 scenario-llm.generateEntries
- G4 scenario-llm.autoCategorize
- G5 scenario-llm.decideCachePolicy
- G6 scenario-llm.generateDarkTimeline
- G7 scenario-llm.generateBadEndings
- G8 scenario-llm.rewriteEntry
- G9 scenario-llm.injectEjsUnlock

**桶 H：导入导出**
- H1 scenario-io.exportScenario + Blob 下载
- H2 scenario-io.importScenario + 校验 + 冲突处理弹窗

**桶 I：GameView 当前剧本胶囊 + DebugConsole / SlashCommand**
- I1 CurrentScenarioBadge 折叠/展开
- I2 DebugConsole `:scenario` 命令族
- I3 /scenario slash command

**桶 J（并行 PDF 工作流，与上面 A-I 同轮跑，互不阻塞）**
- J1 pdftotext COCExtends.pdf → 文本
- J2 deep-research 通读分章识别每个剧本
- J3 每个剧本结构化 LLM 抽取 → ScenarioDoc JSON
- J4 写 PDF_EXTRACTED_SCENARIOS 到 builtin-scenarios.ts

**桶 K：收尾**
- K1 ChangelogModal 加版本条目
- K2 e2e 烟雾：选自由探索 + 新建角色 → 进游戏  /  选印斯茅斯 + 选某角色 → 跳 creator → 进游戏
- K3 README / docs/code-flow-walkthrough.md 简短更新（指向本 spec）

---

## 12. 决策审计（按用户回答原文）

| # | 用户原文 | 设计稿落点 |
|---|---------|------------|
| 1 | Landing → 剧本屏 → 创角 → 游戏；但若用户选的是剧本角色，则不要进入创角界面，并且基于剧本开场白，进行生成第一页 | §4.1 / §6.3 (App.tsx 四段) |
| 2 | 选剧本里某人 = 套这套角色卡来玩，其他人变开局 NPC | §4.2 activateScenario mode='preset' |
| 3 | Step 4 顶部「剧本推荐」chip，点击即加入职业/兴趣槽 | §6.1 RecommendedSkillsChips |
| 4 | 走现有「条件解锁」机制：剧情.已解锁 + EJS 世界书 | §3 ScenarioEntry / §4.2 第 3 步 statData 种子 |
| 5 | 单行 textarea + LLM 抽取入库 | §6.2 / §4.2 第 5 步 initial-items-extractor |
| 6 | 独立 useScenarioStore + Dexie，会话同步存 scenarioId | §2 / §3 |
| 7 | 配置媲美世界书的编辑模式 / 大量条目 / 缓存命中辅助 / 自动分类 / LLM 模型辅助 | §5 整章 + §5.4 缓存优化器接入 |
| 8 | 单 JSON 文件 *.scenario.json | §8 |
| 9 | 临时挂载为 useLorebookStore 一个独立 book | §4.2 第 4 步 |
| 10 | LLM 全套辅助 | §5.3 5 命令 |
| 11 | 固定 6 类 | §3 ScenarioCategory + §5.1 6 tab |
| 12 | LLM 扩写剧本开场白为 page[0] | §4.2 第 7 步 expandPrologueToPage |
| 13 | 老存档不迁移，剧本仅新游戏生效 | §10 已知风险末条 |
| 14 | 完整 CharacterSheet + NPC 属性 | §3 ScenarioCharacter |
| 15 | 多个内置剧本根据 COCExtends.pdf | §7.2 / §11 桶 J |
| 16 | 独立 tab：暗线时间线 + 坏结局矩阵 | §5.1 ★ 两 tab |
| 17 | 右侧驻留作者伙伴聊天框 | §5.2 |
| 18 | 丰富预览（名/类型/时长/难度/人数/一句话/职业 chips/必要人物 chips/SAN 损耗） | §3 ScenarioMeta + §11 桶 D2 |
| 19 | 自由探索剧本显示「通用热门技能」chip | §6.1 POPULAR_SKILLS |
| 20 | PDF 抽取与代码实现同轮并行 Workflow | §11 桶 J 与桶 A-I 并行 |
| 21 | GameView「当前剧本」胶囊 + DebugConsole 命令 | §9 |

---

## 13. 下一步

1. 用户审稿本 spec
2. 通过后调用 `superpowers:writing-plans` 把 §11 11 个桶拆成 TDD bite-sized tasks
3. ultracode + Workflow 并行跑：桶 A-I 主线 + 桶 J PDF 抽取
4. 验收 → push beta → 测试 → push master 时更新 ChangelogModal RELEASES + CURRENT_VERSION
