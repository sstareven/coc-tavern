# 剧本系统 · Section 1 设计稿（数据模型 + 时代化池）

**Date:** 2026-06-06
**Branch:** beta
**Status:** Section 1-3 已落地（commit `827e374`），Section 4-6 待 plan
**Parent spec:** `docs/specs/2026-06-06-scenario-system-design.md`（剧本系统总设计稿）
**Topic:** 把剧本系统中的「NPC 角色定位」与「职业/技能时代池」两块从原 MVP 的最小化粒度扩展为完整可玩形态。包括 role 字段三档化、剧本携带本时代职业 + 自定义技能 + 技能黑名单、ScenarioEditor 加 2 个新 tab、scenario-llm 加 3 个新命令、8 内置剧本一键回填。

---

## 1. 背景与动机

剧本系统 MVP 落地后实战测试发现两个核心痛点：

### 1.1 痛点 A：NPC 不可玩

- 设计原意：`role: 'protagonist_candidate' | 'npc_only'` 区分"玩家可扮演"与"配角"
- 实际现状：
  - `_npc-helpers.ts` 默认 `role: 'npc_only'`
  - 8 内置剧本调用 `makeNpc()` 时**全部不传 role**
  - 24 个内置 NPC 全部是 `npc_only`
  - ScenarioScreen 角色选择抽屉 `.filter(role === 'protagonist_candidate')` 把所有 NPC 挡在外
- 结果：玩家选剧本后二级抽屉里只剩"新建角色"按钮，所有剧本预设角色一律无法扮演

**用户诉求**：所有 NPC 理论上都应该可选，但要保留作者"这人请别选"（反派/序章死者/关键 NPC）的钉死能力 → **role 三档**。

### 1.2 痛点 B：推荐职业不接 CharCreator + 时代错乱

- 8 内置剧本 `recommendedOccupations` 字段已填本时代职业名（百夫长/修士/维京战士/太空船长...）
- CharCreator StepSkills 职业下拉直接铺 `COC_OCCUPATIONS`（1920s 现代 56 个职业）
- 玩家选罗马剧本 → 下拉里看到"会计/律师/警察"，"百夫长"只能走"自定义"且没技能套餐
- 现代技能（汽车驾驶/电气维修/射击手枪）出现在罗马剧本里破坏沉浸

**用户诉求**：
1. 剧本携带本时代完整职业（含 8 技能 + 信用范围），强隔离不混入现代职业
2. 在背景基础上扩展更多职业（不止 6-8 个，要 10-15 个）
3. 技能也按时代裁剪：罗马砍"汽车驾驶"加"骑马"
4. ScenarioEditor 加"自定义技能"和"标准技能黑名单"工具
5. 基于这些能力 LLM 一键回填 8 内置剧本

### 1.3 工作流约束

- beta 分支未推 master，**不写老版本兼容代码**（[[beta-no-backward-compat]]）
- 设计阶段不提前落地，需要视觉对照时开 `tmp_preview/` 独立 HTML（[[preview-sketch-not-main-impl]]）
- 解耦合模块化：纯逻辑独立成 `*-engine.ts` / `*-data.ts` / `*-pools.ts`，React 只渲染（[[decoupling-modularity-required]]）

---

## 2. 决策摘要

| 维度 | 决策 |
|------|------|
| NPC role 字段 | 三档：`protagonist` / `optional` / `locked_npc`；老字段直接重命名，不留迁移 |
| 内置 24 NPC 默认 | `_npc-helpers` 默认 `optional`（玩家可选越界扮演） |
| 抽屉分区 | 推荐视角（金边）/ 配角视角（灰边「作者未为你专门调谐」）/ locked_npc 不出现 |
| 时代化职业 | `ScenarioDoc.customOccupations: Occupation[]`；非空 → **强隔离**，不与 COC_OCCUPATIONS 合并 |
| 自由探索（__free） | customOccupations 空 → fallback COC_OCCUPATIONS 全集 |
| 时代化技能 | `ScenarioDoc.customSkills: ScenarioCustomSkill[]`；并入 ALL_SKILLS（剔除 blacklist 后） |
| 同名 customSkill | 以 customSkills 为准（剧本可重定义"骑术"的 base/cat/desc） |
| 技能黑名单 | `ScenarioDoc.skillBlacklist: string[]`；从 ALL_SKILLS 剔除 |
| 派生纯函数 | `src/scenario/scenario-pools.ts` 三个函数 + 21 单测 |
| StepSkills / CharacterCreator | 全部 ALL_SKILLS / COC_OCCUPATIONS / SKILL_DESC 引用替换为 pool 派生 |
| Editor 新增 tab | 「职业」「技能」两个，放在「人物」之后 |
| LLM 新增命令 | `generateCustomOccupations` / `generateCustomSkills` / `proposeSkillBlacklist` |
| ScenarioPatch 扩展 | 6 个新字段 upsert/remove × 3 类（职业/自定义技能/黑名单） |
| 内置剧本回填 | 一次性脚本 `scripts/backfill-scenario-pools.ts`，输出中间 JSON，人工 paste 入 src |
| 老存档兼容 | 不写迁移代码（beta 阶段断兼容） |

---

## 3. 数据模型

```ts
// src/types/scenario.ts

import type { CharacterSheet } from './index';
import type { Occupation, SkillCat } from '../sillytavern/coc-data';

// 3.1 NPC 角色定位三档
//   protagonist  推荐视角(抽屉顶部金边,作者主打)
//   optional     配角可玩(下沉分区,作者未为你专门调谐)
//   locked_npc   剧本钉死不可选(反派/序章死者/关键 NPC,抽屉不出现)
export type ScenarioCharacterRole = 'protagonist' | 'optional' | 'locked_npc';

export interface ScenarioCharacter {
  id: string;
  role: ScenarioCharacterRole;
  sheet: CharacterSheet;
  npcAttrs: {
    identityTag: string;
    attitudeDefault: number;        // -100~100
    relationshipDefault: string;
    locationDefault: string;
    publicBio: string;              // 玩家可见
    hiddenBio: string;              // 仅编辑模式可见
  };
}

// 3.2 时代化技能定义
//   base 复用 ALL_SKILLS 三种形态(数字 / 'DEX_HALF' / 'EDU')
//   cat 复用 6 类(侦查/护理/运动/战斗/交涉/生活),保持类型一致
export interface ScenarioCustomSkill {
  name: string;
  base: number | 'DEX_HALF' | 'EDU';
  cat: SkillCat;
  desc?: string;
}

// 3.3 ScenarioDoc 新增三字段(全部必填,空数组等价"无定制")
export interface ScenarioDoc {
  id: string;
  builtin?: boolean;
  meta: ScenarioMeta;

  // 玩家可见
  prologueSeed: string;
  recommendedSkills: string[];
  recommendedOccupations: string[];
  characters: ScenarioCharacter[];

  // 时代化职业/技能池(本 spec 新增)
  customOccupations: Occupation[];        // 非空 → 强隔离;空 → fallback COC_OCCUPATIONS
  customSkills: ScenarioCustomSkill[];    // 并入 ALL_SKILLS(剔除 blacklist 后)
  skillBlacklist: string[];               // 从 ALL_SKILLS 剔除

  // 世界书级条目
  entries: ScenarioEntry[];

  // 仅编辑模式
  darkTimeline: DarkPhase[];
  badEndings: BadEnding[];
  authorNotes: string;

  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}

// 3.4 ScenarioPatch 扩展(本 spec 新增 6 个字段)
export interface ScenarioPatch {
  // ...原有字段(upsertEntries / removeEntryIds / recategorize / setCachePolicies /
  //   upsertDarkTimeline / upsertBadEndings / patchMeta / patchCharacters)
  upsertOccupations?: Occupation[];                // generateCustomOccupations + CompanionChat
  removeOccupationNames?: string[];                // 按 name 删
  upsertCustomSkills?: ScenarioCustomSkill[];      // generateCustomSkills + CompanionChat
  removeCustomSkillNames?: string[];               // 按 name 删
  addToBlacklist?: string[];                       // proposeSkillBlacklist + 手动勾选
  removeFromBlacklist?: string[];                  // proposeSkillBlacklist 反向
}
```

**类型守卫**：
- `isScenarioCharacter` 三档判定
- 新增 `isOccupationLike` / `isCustomSkillLike`（轻量结构守卫，给 scenario-io import 用）
- `isValidScenarioDoc` 加 3 个新字段断言

---

## 4. 派生函数（已落地 / Section 2）

```ts
// src/scenario/scenario-pools.ts

// 4.1 当前剧本下玩家可选职业池
//   customOccupations 非空 → 严格隔离,只返回它(罗马剧本不会看到"会计")
//   否则回退 COC_OCCUPATIONS 全集
export function getScenarioOccupationPool(scn?: ScenarioDoc | null): Occupation[]

// 4.2 当前剧本下玩家可见技能池
//   起点 ALL_SKILLS;剔除 skillBlacklist;并入 customSkills(同名以 custom 为准)
export function getScenarioSkillPool(scn?: ScenarioDoc | null): ScenarioSkillPoolEntry[]

// 4.3 当前剧本下技能描述映射
//   SKILL_DESC + customSkills.desc;黑名单技能从描述也剔除
export function getScenarioSkillDescMap(scn?: ScenarioDoc | null): Record<string, string>
```

**21 个单测**（`scenario-pools.test.ts`）：
- 三种状态（剧本为空 / customOccupations 空 / customOccupations 非空）
- 黑名单剔除
- customSkills 全新追加（末尾）
- customSkills 同名覆盖（不重复）
- 黑名单+自定义+覆盖三者协同（罗马场景）
- SKILL_DESC 合并 + 黑名单清理

---

## 5. UI 接入

### 5.1 ScenarioScreen 角色选择抽屉（已落地 / Section 3.1）

三分区：
- **新建角色**（始终首位，金色虚线边框）
- **推荐视角**（protagonist；金色实线边框；铜版小字标题）
- **配角视角**（optional；灰色边框 + opacity 0.86；副标题「作者未为你专门调谐」）
- **locked_npc** 角色不出现在抽屉里

`CharacterPickButton` + `SectionLabel` 抽出为内部组件，桌面 / 手机端共用。

### 5.2 PeopleTab role 切换（已落地 / Section 3.3）

- 角色名册卡片每条显示「推荐视角 / 配角可玩 / 钉死 NPC」
- 编辑面板 RoleToggle 三段开关条
- 新角色默认 `role: 'protagonist'`（作者主推视角通常是"推荐"）

### 5.3 StepSkills + CharacterCreator（已落地 / Section 3.2）

- 通过 `useScenarioStore.lastPicked` 拿当前剧本（与 RecommendedSkillsChipsRow 同源）
- `getScenarioOccupationPool(activeScenario)` 取代 `COC_OCCUPATIONS`
- `getScenarioSkillPool(activeScenario)` 取代 `ALL_SKILLS`
- `getScenarioSkillDescMap(activeScenario)` 取代 `SKILL_DESC`
- CharacterCreator 内部 15+ 处引用全部统一替换
- `ScenarioSkillPoolEntry.cat` 兼容 `SkillCat | string`（剧本自定义技能可能用 SkillCat 之外的字符串），CAT_COLORS 取色加 `?? '#b0bec5'` fallback

### 5.4 ScenarioEditor 新 tab：「职业」（Section 4 待落地）

**文件**：`src/components/Scenario/tabs/OccupationsTab.tsx`

**位置**：tab 列表中放在「人物」之后；「势力」之前

**布局**（双区，与 PeopleTab 同模式）：

```
左侧职业列表：
- 顶栏：[职业 N/15] [✨ AI 一键生成] [+ 新职业]
- 列表项：★名称 / 信用 N–M%（★ 标记当前选中）

右侧编辑区(选中职业)：
- 名称 / 描述(单行)
- 信用范围 min ─ max 双滑块
- 8 个职业技能槽(grid 2×4)
  · 每槽点击展开搜索下拉
  · 下拉候选 = getScenarioSkillPool(currentScn).map(s => s.name)
  · 下拉里看不到 blacklist 中的技能,但有 customSkills
- 底部:[删除职业] [复制到新] [✨ AI 重写描述]
```

**关键交互**：
- 8 技能槽下拉需带搜索框（56+ 候选）
- 删除前弹确认；ScenarioCharacter.sheet.identity.occupation 引用此职业时仅 warn 不阻塞
- 「AI 一键生成」触发 `scenario-llm.generateCustomOccupations(scn.meta, scn.customOccupations)`，返回 patch 进 CompanionChat 预览卡

### 5.5 ScenarioEditor 新 tab：「技能」（Section 4 待落地）

**文件**：`src/components/Scenario/tabs/SkillsTab.tsx`

**位置**：tab 列表中放在「职业」之后

**布局**（双栏，自定义 + 黑名单）：

```
顶栏 summary bar:
[ 原 ALL_SKILLS: 56 | − 黑名单: 9 | + 自定义: 4 | → 当前可见: 51 ]
[✨ AI 一键生成时代技能] [✨ AI 推荐黑名单]

左栏 ◇ 自定义技能(并入池):
- 顶栏 [+ 新]
- tag 行:★骑马 ★驾驶马车 ★咒语吟唱 ★古文献抄写 (点击选中编辑)
- 选中编辑区:
  · 名称 / 分类(6 选 1) / 基础值(数字/DEX_HALF/EDU) / 描述

右栏 ◇ 标准技能黑名单(从池中剔除):
- 顶栏搜索框
- 按 cat 分组的 checkbox 列表(运输/操作 · 战斗/射击 · 生活/科学 · ...)
- 勾选实时反映到顶栏 summary
- 已勾选项加红字"← 罗马时代禁"小尾注(显示 reasonMap[name])
```

**关键交互**：
- 顶栏统计实时算（不靠 LLM，纯前端 derive）
- 自定义技能与 PeopleTab 角色一致的"列表+编辑"模式
- 黑名单的 reasonMap 来自 LLM 命令的 `proposeSkillBlacklist` 副产品；手动勾选时为空

### 5.6 CompanionChat 右驻（已实现，本 spec 不动）

OccupationsTab 与 SkillsTab 同样接 CompanionChat 右驻（与现有 6 类 tab 一致）。作者可在聊天框说"罗马要加个'攻城器械'技能"，LLM 返回带 `upsertCustomSkills: [...]` 的 patch。

---

## 6. LLM 命令（Section 5 待落地）

`scenario-llm.ts` 已有 7 个命令。本 spec 新增 3 个：

### 6.1 `generateCustomOccupations(meta, existing, n=10)`

| 参数 | 类型 | 说明 |
|------|------|------|
| meta | `ScenarioMeta` | 剧本背景（name / type / blurb 等） |
| existing | `Occupation[]` | 当前已有职业（避免重复生成） |
| n | `number` | 期望生成数量（默认 10） |

**输出**：
```ts
{
  upsertOccupations: Occupation[];
  suggestedNewSkills?: string[];   // 副产品:发现池中没有但职业需要的技能
}
```

**提示词要点**：
- system prompt 共享前缀（model + JSON-only 约束）以提升 prefix cache 命中
- 时代锚强约束：罗马只能给罗马时代职业，禁止现代职业名
- 8 技能必须从 `getScenarioSkillPool(currentScn)` 池中选（提示词带白名单）
- 信用范围按时代社会结构合理化（贵族 50-90 / 农奴 0-5）

**池外技能处理**（重要）：
- LLM 生成的 Occupation 不强制 8 技能全部在池里 — 生成时池可能还空
- 池外技能名收集到 `suggestedNewSkills`，UI 渲染 patch 预览时显示「这些职业用到了池里没有的技能 [list]，是否一键加入 customSkills?」
- 接受 patch 不会因为池外技能而失败；只是给作者一个补技能的入口

### 6.2 `generateCustomSkills(meta, existing, n=6)`

| 参数 | 类型 | 说明 |
|------|------|------|
| meta | `ScenarioMeta` | 剧本背景 |
| existing | `ScenarioCustomSkill[]` | 当前已有自定义技能（去重） |
| n | `number` | 期望生成数量（默认 6） |

**输出**：
```ts
{
  upsertCustomSkills: ScenarioCustomSkill[];
  suggestedBlacklist?: string[];  // 副产品:顺势察觉的不合时代标准技能
}
```

**提示词要点**：
- 时代锚：罗马要"骑马 / 古文献抄写 / 战车驾驶 / 短剑投掷"
- cat 从固定 6 类（侦查/护理/运动/战斗/交涉/生活）选
- base 参考 COC 标准技能起点（5/10/20）
- 不重复已有 customSkills

### 6.3 `proposeSkillBlacklist(meta, currentBlacklist)`

| 参数 | 类型 | 说明 |
|------|------|------|
| meta | `ScenarioMeta` | 剧本背景 |
| currentBlacklist | `string[]` | 已勾选黑名单 |

**输出**：
```ts
{
  addToBlacklist: string[];
  removeFromBlacklist?: string[];        // 反向:LLM 觉得这个不该禁
  reasonMap?: Record<string, string>;    // 每个建议的解释,用于 UI hover 提示
}
```

**提示词要点**：
- 喂 LLM 完整 ALL_SKILLS 列表（约 56 条）
- 双向判定：哪些"时代不通"应加入 / 哪些"误禁"应移除
- `reasonMap` 给作者「为什么 LLM 建议禁这个」的解释

### 6.4 共用约定

- `settings.apiModel` 与现有 7 命令同 lane
- `cacheStats subCalls` label 前缀 `scenario:occ-gen` / `scenario:skill-gen` / `scenario:blacklist`
- `max_tokens` ≥ 20000（按 [[max-tokens-min-20000]]）
- JSON 解析失败 → 不应用 patch + toast 报错；返回空数组合法
- 共享 system prompt 前缀（[[feedback_subagent_cache_prefix]]）

### 6.5 ScenarioPatch 联动

`applyScenarioPatch` 新增 6 个分支：
- `upsertOccupations` / `removeOccupationNames`
- `upsertCustomSkills` / `removeCustomSkillNames`
- `addToBlacklist` / `removeFromBlacklist`

`validateScenarioPatch` 新增 6 段守卫（轻量结构校验，不深检 SkillCat 取值）。

---

## 7. 内置剧本一键回填（Section 6 待落地）

### 7.1 脚本

**文件**：`scripts/backfill-scenario-pools.ts`（不入 build；通过 `tsx` 直接跑）

**流程**：

```
对每个 scn ∈ BUILTIN_SCENARIOS 且 scn.id !== '__free':
  并行调用三个 LLM 命令:
    occ        = generateCustomOccupations(scn.meta, [], 10)
    skills     = generateCustomSkills(scn.meta, [], 6)
    blacklist  = proposeSkillBlacklist(scn.meta, [])
  合入 patched JSON,写到 scripts/.backfill-output/<scn-id>.json
  失败重试 ×2;仍失败 → 留空 + 记录 failures.log
人工核对中间 JSON 后手工 paste 回 src/data/scenarios/<scn>.ts
```

**CLI flags**：

| flag | 行为 |
|------|------|
| `--all` | 全 8 剧本 × 3 字段 |
| `--scenario=rome-cthulhu` | 单剧本重跑 |
| `--field=occupations` | 仅生成职业字段 |
| `--dry-run` | 只输出 JSON 不写回 |

**性能预估**：
- 8 剧本 × 3 LLM 调用 = 24 子调用
- 三个调用对同一剧本并行（Promise.all）
- 单剧本串行（防止 LLM rate limit）
- 总耗时约 2-3 分钟

**安全护栏**：
- 输出落到 `scripts/.backfill-output/`（gitignored），**不直接覆盖 src/**
- 收尾步骤是人工 paste 回剧本文件（也可写小 codegen 写回，但作者复审优先）
- `__free` 不回填（"无时代约束"本质就是空字段）

### 7.2 内置剧本各字段预期形态

| 剧本 | customOccupations 大致 | customSkills 大致 | skillBlacklist 大致 |
|------|---------------------------|-----------------------|------------------------|
| 罗马阴影 | 百夫长/军团士兵/学者/元老/神官/角斗士/医师/船长 等 8-12 | 骑马/驾驶马车/古文献抄写/短剑投掷/咒语吟唱 等 4-6 | 汽车驾驶/射击(手枪/步枪/霰弹枪)/电气维修/操作重型机械 等 8-10 |
| 黑暗时代 | 修士/骑士/吟游诗人/猎人/医者/巫医/游侠/铁匠 等 | 抄写/箭术/骑士礼仪/草药 等 | 现代职业全套 |
| 神秘冰岛 | 维京战士/族长/Galdrakona/Skald/船长/猎人/铁匠 等 | 古诺尔斯诗律/航海星象/海战 等 | 同 |
| 剑见箭 | 战士/弓手/盾兵/骑士/雇佣兵/将领副官/军医 等 | 剑术/弓术/战略指挥 等 | 同 |
| 煤气灯 | 医师/警探/记者/学者/牧师/通灵者/绅士侦探/律师 等 | 街头消息/灯光信号/打字电报 等 | 部分现代（如汽车驾驶） |
| 幻梦境 | 梦行者/学者/诗人/猫语者/水手/神秘学家 等 | 入梦/猫语/星际占卜/咒语吟唱 等 | 现代职业全套 |
| 伊卡洛斯 | 太空船长/工程师/科学家/医师/安全官/AI 专家/星际海军 等 | 零重力作业/AI 调试/星际导航/真空作业 等 | 骑术/会计 等过时项 |
| 收割 | 幸存者首领/废土学者/拾荒者/医师/猎人/疯狂先知/机械师 等 | 废土生存/辐射防护/即兴工程 等 | 部分现代金融/法律 等 |

实际数值与命名以脚本输出 + 作者复审为准。

---

## 8. 测试矩阵

| 文件 | 类型 | 覆盖 |
|------|------|------|
| `scenario-pools.test.ts` | 已落地 | 21 测试 / 池函数三种状态 + 黑名单 + 同名覆盖 + 协同场景 |
| `scenario-llm.occupations.test.ts` | 待加 | mock LLM JSON 解析 / fallback / suggestedNewSkills |
| `scenario-llm.custom-skills.test.ts` | 待加 | cat 校验 / base 数值 / suggestedBlacklist |
| `scenario-llm.blacklist.test.ts` | 待加 | reasonMap 解析 / 双向覆盖 |
| `scenario-patch.test.ts` | 追加 | 6 新 patch 字段 upsert/remove/validate |
| `OccupationsTab.test.tsx` | 待加 | tab 渲染 / 选职业 / 改信用 / 8 技能槽展开 / AI 触发 |
| `SkillsTab.test.tsx` | 待加 | 自定义增删 / 黑名单勾选 / 顶栏统计实时更新 |
| `builtin-scenarios.test.ts` | 追加 | 回填后断言：customOccupations ≥ 6 / skills.length===8 / 罗马 customSkills 无"汽车驾驶" |

---

## 9. 已知风险与对策

| 风险 | 对策 |
|------|------|
| LLM 生成的职业用了池外技能名 | suggestedNewSkills 副产品 + UI 提示一键加入 customSkills |
| LLM 生成的 customSkill cat 用了 6 类之外 | UI 选区限定 6 类 + 入库前 zod 风格校验丢弃非法值 |
| 罗马剧本意外漏禁现代技能 | proposeSkillBlacklist 提供「再扫一遍」按钮 + 内置剧本测试断言关键项必禁 |
| 玩家选剧本后又跳剧本 → 已选职业不在新池里 | CharacterCreator 内部 `occupationPool.find` 找不到时回退 `null` → 显示自定义状态（已实现） |
| LLM 回填脚本部分失败 | 重试 ×2 + 失败留空字段 + 记 failures.log，单剧本失败不阻塞其他 |
| 时代职业名翻译不一致（"船长" vs "Trierarchus"） | 提示词约束「优先用中文常见称呼，括号补西文原名」 |
| 技能黑名单误禁致玩家无法加点 | 顶栏统计 + 角色卡兜底（玩家可选"自定义"技能名输任意字符串） |
| 自定义技能与 ALL_SKILLS 同名时哪边胜出 | customSkills 胜（实现已确认，测试已覆盖） |

---

## 10. 范围外（明确不做）

- **角色卡职业-技能交叉业务校验**：8 技能槽下拉只过滤 blacklist + 加 customSkills，不做"该职业必须有近战技能"规则校验（除非 LLM 提示词自己处理）
- **JSON 导入导出兼容代码**：scenario-io 用 `...spread`，新字段自动跟着走（按 [[beta-no-backward-compat]]）
- **CharCreator 玩家"自定义职业"输入的时代禁用校验**：保留 fuzzy 兜底，玩家输 "百夫长" 即使不在 customOccupations 里也允许
- **历史 ScenarioCharacter mock 数据迁移**：beta 阶段不写 onRehydrate；测试 mock 已统一三档命名

---

## 11. Section 拆分与状态

```
Section 1: 数据模型扩展(role 三档 + 三时代字段)               [已落地 / 827e374]
Section 2: 派生函数(scenario-pools.ts)                        [已落地 / 827e374]
Section 3: UI 接入(抽屉三分区 / PeopleTab / StepSkills)        [已落地 / 827e374]
Section 4: 编辑器 2 个新 tab(职业 / 技能)                      [待 plan]
Section 5: 3 个 LLM 命令 + ScenarioPatch 扩展                  [待 plan]
Section 6: 8 内置剧本一键回填脚本 + 测试矩阵 + 文档收口            [待 plan]
```

Section 1-3 已通过 `tsc -b` + `vitest 1644` + `build`，推到 beta。Section 4-6 由 writing-plans 转化为 TDD 任务清单。

---

## 12. 下一步

1. 用户审稿本 spec
2. 通过后调用 `superpowers:writing-plans` 把 §5-§7 拆成 TDD bite-sized tasks
3. 实施 Section 4 → 视觉对照（复用 `tmp_preview/scenario-editor-preview.html`）
4. 实施 Section 5（LLM 命令）+ Section 6（回填脚本 + 测试）
5. 验收 → push beta → 等 Spec 2 落地完一并 push master（届时更新 ChangelogModal）
