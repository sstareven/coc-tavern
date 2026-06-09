# 装束-生图对齐（NPC outfit + CharacterSheet outfit + 生图 prompt 注入）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `NpcProfile` 和 `CharacterSheet` 各加 1 个 `outfit: string` 字段，每回合主 API done 之后跑独立 LLM 子调用从叙事里抽 outfit diff 写库，生图 prompt 模板新增 `{{characters_outfit}}` / `{{characters_outfit_en}}` 占位，让生图 LLM 知道每个角色当下的穿着与外露物件。

**Architecture:** outfit 完全不入主 JSON 输出(规避「主 JSON 加字段会截断末尾」);每回合主 API done 后 fire-and-forget 跑 `outfit-extractor` 子调用，仅产「本回合发生过变化」的 diff，按 name 写 `useNpcStore` / `useCharSheetStore`；生图触发时 `buildImageRenderContext` 从两 store 读 outfit join 到 `characters` 数组里；英文化翻译搭车 `image-prompt-extractor` 现有 LLM 调用。

**Tech Stack:** React + TypeScript + Zustand + Dexie(IndexedDB) + Vitest。

设计依据：`docs/superpowers/specs/2026-06-09-outfit-image-injection-design.md`。

---

## 实现层修订说明

spec 草稿里有 `NpcProfile.carrying: string[]`「显眼可见物件」字段。**经实现勘察**：
- `NpcProfile.possessions: string[]`「随身物品」已存在(`src/types/index.ts:445`,NpcCard 已渲染),与 carrying 语义重叠。
- spec 写的 `useSheetStore` 实为 `useCharSheetStore`(`src/stores/useCharSheetStore.ts`)。
- 生图 LLM 只想知道画面里能看到啥,outfit 短句直接含「灰大衣,手持左轮」这种合并描述足够。

故 plan 实施层**合并 carrying 入 outfit 单字段**(中文短句),不引入 carrying;`useSheetStore` 全部改为 `useCharSheetStore`。这是 plan 对 spec 的轻量修订,不影响 spec 总体决策。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/types/index.ts` | 扩 `NpcProfile.outfit?: string` + `CharacterSheet` 加 outfit?(在 sheet 顶层 — 不进 sheet.identity) | 修改 |
| `src/stores/useNpcStore.ts` | 加 `setProfileOutfitByName(name, outfit)` action | 修改 |
| `src/stores/__tests__/useNpcStore-outfit.test.ts` | setter + clearAll 清空 outfit | 新建 |
| `src/stores/useCharSheetStore.ts` | 加 `setOutfit(outfit)` action | 修改 |
| `src/stores/__tests__/useCharSheetStore.test.ts` | setOutfit + reset 清空 outfit | 新建(或追加) |
| `src/sillytavern/outfit-extractor.ts` | 解耦子调用:叙事+快照→outfit diff | 新建 |
| `src/sillytavern/__tests__/outfit-extractor.test.ts` | happy / 未知 name 丢弃 / null parsed / 网络错 / aborted | 新建 |
| `src/api/image-gen-merge.ts` | `ImageRenderContext.characters` 类型升级 + `PromptTemplateContext` 加占位 + `renderPromptTemplate` 渲染 | 修改 |
| `src/api/__tests__/image-gen-merge-render.test.ts` | 新占位渲染 + 字段缺失退化 | 新建 |
| `src/api/image-prompt-builder.ts` | `buildImageRenderContext` 扩参 + `pickPresentImportantNpcNames` 不变 | 修改 |
| `src/api/__tests__/image-prompt-builder.test.ts` | characters 含 outfit join 测试 | 新建(或追加) |
| `src/api/image-prompt-extractor.ts` | 英文化分支接收 outfit 中文串 + 输出 `charactersOutfitEn` | 修改 |
| `src/api/image-gen-trigger.ts` | 调 buildImageRenderContext 时传 npcOutfitByName + investigatorOutfit | 修改 |
| `src/hooks/useChatPipeline.ts` | 主 API done 后 fire-and-forget 跑 extractor;首回合 sheet.outfit 为空时强制初始化 | 修改（大文件，主控亲自精确 Edit） |

> ⚠️ `useChatPipeline.ts` 是 2000+ 行大文件,按记忆 `workflow-subagent-edit-large-files` 不要交给并行子代理盲改。本 plan 的所有 useChatPipeline 改动由主控亲自 Edit。
>
> db V10 升级由 **plot-arc-causality-theme plan** Task 9 承担,本 plan **不再 bump 版本**。

---

## Task 1: 类型 `NpcProfile.outfit` / `CharacterSheet.outfit`

**Files:**
- Modify: `src/types/index.ts`(NpcProfile 约 :412-474;CharacterSheet 在 sheet 子类型定义处)

- [ ] **Step 1: NpcProfile 加 outfit 字段**

定位 `src/types/index.ts` 中 `NpcProfile` 接口(约 :412-474)。在 `possessions: string[]` 后追加:

```ts
  /** 当前装束:1 句中文短句(≤40字),含穿着+外露物件,如「灰色羊毛大衣,手持左轮」。
   *  仅 importance ∈ {核心,重要} 才由 outfit-extractor 写入;路人不挂。 */
  outfit?: string;
```

- [ ] **Step 2: CharacterSheet 加 outfit 字段**

定位 `CharacterSheet` 接口(同文件,搜 `interface CharacterSheet`)。在合适位置(`posture` 字段附近)追加:

```ts
  /** 调查员当前装束:1 句中文短句,同 NpcProfile.outfit 语义。
   *  由 outfit-extractor 写入,或玩家 UI 手改。 */
  outfit?: string;
```

- [ ] **Step 3: 类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 4: 提交**

```bash
git add src/types/index.ts
git commit -m "feat(类型): NpcProfile/CharacterSheet 加 outfit 可选字段"
```

---

## Task 2: `useNpcStore.setProfileOutfitByName` action

**Files:**
- Modify: `src/stores/useNpcStore.ts`
- Test: `src/stores/__tests__/useNpcStore-outfit.test.ts`(新建)

- [ ] **Step 1: 写失败测试**

创建 `src/stores/__tests__/useNpcStore-outfit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useNpcStore } from '../useNpcStore';
import type { NpcProfile } from '../../types';

function makeNpc(name: string, importance: NpcProfile['importance'] = '重要'): NpcProfile {
  return {
    id: `id-${name}`,
    name,
    identity: '',
    favorability: 0,
    appearance: '',
    personality: '',
    innerThoughts: '',
    memories: [],
    experience: '',
    backstory: '',
    possessions: [],
    isPresent: true,
    locationName: '',
    importance,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('useNpcStore.setProfileOutfitByName', () => {
  beforeEach(() => {
    useNpcStore.getState().clearAll();
  });

  it('按 name 找到对应 profile 设 outfit', () => {
    useNpcStore.getState().replaceAll([makeNpc('埃伦娜')]);
    useNpcStore.getState().setProfileOutfitByName('埃伦娜', '白衬衫沾血');
    const profiles = Object.values(useNpcStore.getState().profiles);
    expect(profiles[0].outfit).toBe('白衬衫沾血');
  });

  it('找不到 name 时静默忽略,不抛错', () => {
    useNpcStore.getState().replaceAll([makeNpc('埃伦娜')]);
    expect(() => useNpcStore.getState().setProfileOutfitByName('不存在', 'x')).not.toThrow();
    const profiles = Object.values(useNpcStore.getState().profiles);
    expect(profiles[0].outfit).toBeUndefined();
  });

  it('空字符串 outfit 视为删除字段', () => {
    useNpcStore.getState().replaceAll([{ ...makeNpc('张三'), outfit: '旧装' }]);
    useNpcStore.getState().setProfileOutfitByName('张三', '');
    const profiles = Object.values(useNpcStore.getState().profiles);
    expect(profiles[0].outfit).toBeUndefined();
  });

  it('clearAll 同步清空 outfit(随 profile 整体清)', () => {
    useNpcStore.getState().replaceAll([{ ...makeNpc('张三'), outfit: 'x' }]);
    useNpcStore.getState().clearAll();
    expect(Object.keys(useNpcStore.getState().profiles)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/stores/__tests__/useNpcStore-outfit.test.ts --reporter=verbose`
Expected: FAIL — `setProfileOutfitByName is not a function`。

- [ ] **Step 3: 在 NpcStore 接口 + 实现里加 action**

定位 `src/stores/useNpcStore.ts` `NpcStore` interface(约 :42-62),在 `clearAll: () => void;` 之前追加:

```ts
  /** outfit-extractor 写入:按 name 反查 id 后设/清 outfit。找不到 name 静默忽略。 */
  setProfileOutfitByName: (name: string, outfit: string) => void;
```

在 store 实现里(create() 内,与现有 `applyUpdates` / `replaceAll` 同层),追加:

```ts
  setProfileOutfitByName: (name, outfit) => set((s) => {
    const id = findIdByName(s.profiles, name);
    if (!id) return s;
    const cur = s.profiles[id];
    const trimmed = outfit.trim();
    const next: NpcProfile = trimmed
      ? { ...cur, outfit: trimmed, updatedAt: Date.now() }
      : (() => { const { outfit: _, ...rest } = cur; return { ...rest, updatedAt: Date.now() }; })();
    return { profiles: { ...s.profiles, [id]: next } };
  }),
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/stores/__tests__/useNpcStore-outfit.test.ts --reporter=verbose`
Expected: PASS — 4 个 case 全过。

- [ ] **Step 5: 提交**

```bash
git add src/stores/useNpcStore.ts src/stores/__tests__/useNpcStore-outfit.test.ts
git commit -m "feat(useNpcStore): 加 setProfileOutfitByName action,按 name 反查写 outfit(空串=删字段)"
```

---

## Task 3: `useCharSheetStore.setOutfit` action

**Files:**
- Modify: `src/stores/useCharSheetStore.ts`
- Test: `src/stores/__tests__/useCharSheetStore-outfit.test.ts`(新建)

- [ ] **Step 1: 写失败测试**

创建 `src/stores/__tests__/useCharSheetStore-outfit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCharSheetStore } from '../useCharSheetStore';

describe('useCharSheetStore.setOutfit', () => {
  beforeEach(() => {
    useCharSheetStore.getState().reset();
  });

  it('设 outfit 后 sheet.outfit 拿到值', () => {
    useCharSheetStore.getState().setOutfit('灰大衣,手持油灯');
    expect(useCharSheetStore.getState().sheet.outfit).toBe('灰大衣,手持油灯');
  });

  it('空字符串视为删除字段', () => {
    useCharSheetStore.getState().setOutfit('x');
    useCharSheetStore.getState().setOutfit('');
    expect(useCharSheetStore.getState().sheet.outfit).toBeUndefined();
  });

  it('reset 清空 outfit', () => {
    useCharSheetStore.getState().setOutfit('x');
    useCharSheetStore.getState().reset();
    expect(useCharSheetStore.getState().sheet.outfit).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/stores/__tests__/useCharSheetStore-outfit.test.ts --reporter=verbose`
Expected: FAIL — `setOutfit is not a function`。

- [ ] **Step 3: 在 CharSheetStore 接口 + 实现里加 action**

定位 `src/stores/useCharSheetStore.ts` `CharSheetStore` interface(约 :180-188)。在 `reset` 之前追加:

```ts
  /** outfit-extractor 写入:更新调查员装束。空串=删字段。 */
  setOutfit: (outfit: string) => void;
```

在 store 实现里(create() 内),追加:

```ts
  setOutfit: (outfit: string) => set((s) => {
    const trimmed = outfit.trim();
    if (trimmed) return { sheet: { ...s.sheet, outfit: trimmed } };
    const { outfit: _, ...rest } = s.sheet;
    return { sheet: rest as typeof s.sheet };
  }),
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/stores/__tests__/useCharSheetStore-outfit.test.ts --reporter=verbose`
Expected: PASS — 3 个 case 全过。

- [ ] **Step 5: 提交**

```bash
git add src/stores/useCharSheetStore.ts src/stores/__tests__/useCharSheetStore-outfit.test.ts
git commit -m "feat(useCharSheetStore): 加 setOutfit action(空串=删字段)"
```

---

## Task 4: `outfit-extractor.ts` 解耦子调用

**Files:**
- Create: `src/sillytavern/outfit-extractor.ts`
- Test: `src/sillytavern/__tests__/outfit-extractor.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/sillytavern/__tests__/outfit-extractor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractOutfitDiff } from '../outfit-extractor';
import * as subagentCall from '../subagent-call';

const baseReq = {
  leftContent: '调查员脱下沾血的大衣,埃伦娜递来一件干净的羊毛衫。',
  investigatorOutfitSnapshot: '黑大衣(沾血)',
  npcSnapshots: [{ name: '埃伦娜', outfit: '白衬衫' }],
  apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
};

describe('extractOutfitDiff', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path:返回两侧 diff', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '',
      parsed: {
        investigatorOutfit: '羊毛衫',
        npcs: { 埃伦娜: { outfit: '白衬衫,袖口微脏' } },
      },
    } as any);
    const r = await extractOutfitDiff(baseReq);
    expect(r.investigatorOutfit).toBe('羊毛衫');
    expect(r.npcs).toEqual({ 埃伦娜: '白衬衫,袖口微脏' });
  });

  it('未知 NPC name(快照里没有的)被丢弃', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '',
      parsed: {
        npcs: { 埃伦娜: { outfit: 'A' }, 不存在: { outfit: 'B' } },
      },
    } as any);
    const r = await extractOutfitDiff(baseReq);
    expect(r.npcs).toEqual({ 埃伦娜: 'A' });
  });

  it('parsed === null 时空结果', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '', parsed: null,
    } as any);
    const r = await extractOutfitDiff(baseReq);
    expect(r.investigatorOutfit).toBeUndefined();
    expect(r.npcs).toEqual({});
  });

  it('网络/HTTP 错误时返回空结果,永不 throw', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockRejectedValue(new Error('boom'));
    const r = await extractOutfitDiff(baseReq);
    expect(r.investigatorOutfit).toBeUndefined();
    expect(r.npcs).toEqual({});
  });

  it('signal 已 aborted 时早退,不发请求', async () => {
    const spy = vi.spyOn(subagentCall, 'callDsSubagent');
    const ac = new AbortController(); ac.abort();
    const r = await extractOutfitDiff({ ...baseReq, signal: ac.signal });
    expect(r.npcs).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });

  it('leftContent 空时早退', async () => {
    const spy = vi.spyOn(subagentCall, 'callDsSubagent');
    const r = await extractOutfitDiff({ ...baseReq, leftContent: '  ' });
    expect(r.npcs).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });

  it('仅产 investigatorOutfit 也合法', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '',
      parsed: { investigatorOutfit: '羊毛衫' },
    } as any);
    const r = await extractOutfitDiff(baseReq);
    expect(r.investigatorOutfit).toBe('羊毛衫');
    expect(r.npcs).toEqual({});
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/sillytavern/__tests__/outfit-extractor.test.ts --reporter=verbose`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 新建 outfit-extractor.ts**

创建 `src/sillytavern/outfit-extractor.ts`:

```ts
// 装束差分子调用(2026-06-09):
// 主 API done 之后跑一次,从「本回合 leftContent + 当前 outfit 快照」抽 diff,
// 写入 useNpcStore.setProfileOutfitByName / useCharSheetStore.setOutfit。
//
// 设计要点(per spec 2026-06-09-outfit-image-injection-design.md):
//  - 不入主 JSON(规避「主 JSON 加字段会截断末尾」)
//  - 静态 system prefix 前置(提示缓存命中)
//  - rpmLane='mvu'(与 prologue/causal-echo 共桶)
//  - 永不 throw,失败回退空结果
//  - 仅产 diff;快照名单外的 name 静默丢弃

import { callDsSubagent } from './subagent-call';

const SYSTEM_PROMPT = `你是 COC 守秘人的助手。给你「本回合叙事正文」与「当前装束快照」,请仅产出本回合发生过变化的项:
- investigatorOutfit: 调查员的新装束描述(中文短句,≤40字,含穿着+手持/显眼物件)
- npcs[name].outfit: 该 NPC 的新装束(同上)

未变化的项不要输出;快照里没有的 NPC name 不要新增;装束 1 句话整合穿着与显眼物件(怀里揣的不算)。

严格返回 JSON:{
  "investigatorOutfit": "string?",
  "npcs": { "<name>": { "outfit": "string?" } }
}
不得输出 JSON 之外的任何文本。`;

export interface OutfitExtractorRequest {
  /** 本回合叙事正文(BookPage.leftContent),中文。 */
  leftContent: string;
  /** 当前调查员 sheet.outfit 快照;空串=未记录。 */
  investigatorOutfitSnapshot: string;
  /** 当前核心/重要 NPC 快照:[{name, outfit}]。 */
  npcSnapshots: Array<{ name: string; outfit: string }>;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

export interface OutfitExtractorResult {
  /** 调查员装束变更;本回合未变 → undefined。 */
  investigatorOutfit?: string;
  /** NPC 装束变更,按 name 分桶;本回合未变 NPC 不出现。 */
  npcs: Record<string, string>;
}

const EMPTY: OutfitExtractorResult = { npcs: {} };

export async function extractOutfitDiff(req: OutfitExtractorRequest): Promise<OutfitExtractorResult> {
  if (req.signal?.aborted) return EMPTY;
  if (!req.leftContent || !req.leftContent.trim()) return EMPTY;
  if (!req.apiBaseUrl || !req.apiKey || !req.model) return EMPTY;

  const snapshotJson = JSON.stringify({
    investigator: req.investigatorOutfitSnapshot || '(未记录)',
    npcs: Object.fromEntries(
      req.npcSnapshots.map((s) => [s.name, s.outfit || '(未记录)']),
    ),
  }, null, 2);

  const truncatedNarrative = req.leftContent.slice(0, 1200).trim();
  const user = `本回合叙事正文:\n${truncatedNarrative}\n\n当前装束快照:\n${snapshotJson}\n\n请仅输出 diff。`;

  try {
    const resp = await callDsSubagent({
      apiBaseUrl: req.apiBaseUrl,
      apiKey: req.apiKey,
      model: req.model,
      signal: req.signal,
      temperature: 0.4,
      maxTokens: 20000,
      rpmLane: 'mvu',
      label: 'outfit-extractor',
      jsonObject: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    });

    const parsed = resp.parsed as
      | { investigatorOutfit?: string; npcs?: Record<string, { outfit?: string }> }
      | null;
    if (!parsed) return EMPTY;

    const investigatorOutfit =
      typeof parsed.investigatorOutfit === 'string' && parsed.investigatorOutfit.trim()
        ? parsed.investigatorOutfit.trim().slice(0, 40)
        : undefined;

    const allowed = new Set(req.npcSnapshots.map((s) => s.name));
    const npcs: Record<string, string> = {};
    if (parsed.npcs && typeof parsed.npcs === 'object') {
      for (const [name, val] of Object.entries(parsed.npcs)) {
        if (!allowed.has(name)) continue;
        const o = val?.outfit;
        if (typeof o === 'string' && o.trim()) {
          npcs[name] = o.trim().slice(0, 40);
        }
      }
    }

    return {
      ...(investigatorOutfit ? { investigatorOutfit } : {}),
      npcs,
    };
  } catch {
    return EMPTY;
  }
}
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/sillytavern/__tests__/outfit-extractor.test.ts --reporter=verbose`
Expected: PASS — 7 个 case 全过。

- [ ] **Step 5: 提交**

```bash
git add src/sillytavern/outfit-extractor.ts src/sillytavern/__tests__/outfit-extractor.test.ts
git commit -m "feat(outfit-extractor): 解耦子调用,从本回合叙事抽 outfit diff;仅产变更项+快照外 name 丢弃+永不 throw"
```

---

## Task 5: `ImageRenderContext` / `PromptTemplateContext` 类型升级

**Files:**
- Modify: `src/api/image-gen-merge.ts`(`ImageRenderContext` :43-51;`PromptTemplateContext` :96-125;`renderPromptTemplate` :166-208)

- [ ] **Step 1: 改 `ImageRenderContext.characters` 类型**

定位 `src/api/image-gen-merge.ts` 中 `ImageRenderContext`(约 :43-51),改 `characters` 字段:

```ts
export interface ImageRenderContext {
  location?: string;
  time?: string;
  weather?: string;
  /** 在场重要角色含装束。调查员第 0 项,NPC 按 updatedAt 倒序。
   *  beta 期 breaking:从 string[] 改为 Array<{name, outfit?}>。 */
  characters?: Array<{ name: string; outfit?: string }>;
  san?: number;
  /** 场景简述,从 leftContent 截前 120 字。可空。 */
  sceneBrief?: string;
}
```

- [ ] **Step 2: 改 `PromptTemplateContext` 加两占位**

定位同文件 `PromptTemplateContext`(约 :96-125),在 `image_hint: string;` 之后追加:

```ts
  /** 含装束的中文串:「张三(灰大衣); 李四(护士裙,提油灯)」。空时退化为名字串。 */
  characters_outfit: string;
  /** 英文 tag 化串:由 image-prompt-extractor 翻译;不命中英文路径时等于 characters_outfit。 */
  characters_outfit_en: string;
```

- [ ] **Step 3: 改 `renderPromptTemplate` 的 placeholdersOnly 表加两个新占位**

定位 `renderPromptTemplate`(约 :166-208),在 placeholdersOnly 对象里追加:

```ts
  const placeholdersOnly: Record<string, string> = {
    style: ctx.style,
    style_anchors: ctx.style_anchors,
    location: ctx.location,
    time: ctx.time,
    weather: ctx.weather,
    characters: ctx.characters,
    san: ctx.san,
    scene: ctx.scene,
    scene_brief: ctx.scene_brief,
    image_hint: ctx.image_hint,
    characters_outfit: ctx.characters_outfit,
    characters_outfit_en: ctx.characters_outfit_en,
  };
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 多处 error — `ImageRenderContext.characters` 类型变了,调用方需要适配(Task 6 处理)。

> ⚠️ 不要在此 Step 修任何调用方,留给后续 Task 一起跑通。本 Step 仅声明类型变更。

- [ ] **Step 5: 暂不提交**(联合 Task 6 一起提交)

---

## Task 6: `buildImageRenderContext` 扩参数 + 拼 outfit

**Files:**
- Modify: `src/api/image-prompt-builder.ts`(`buildImageRenderContext` 约 :59-72,`buildImageSpecFromPage` 约 :78-88,`pickPresentImportantNpcNames` 不变)
- Test: `src/api/__tests__/image-prompt-builder.test.ts`(新建)

- [ ] **Step 1: 写失败测试**

创建 `src/api/__tests__/image-prompt-builder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildImageRenderContext } from '../image-prompt-builder';
import type { BookPage, CharacterSheet } from '../../types';

const basePage: BookPage = {
  id: 'p1',
  leftPage: 1, rightPage: 2,
  leftHeader: '', leftContent: '叙事内容...',
  rightHeader: '', rightContent: '', choices: [],
  npcUpdates: [
    { name: '埃伦娜', isPresent: true, importance: '重要', innerThoughts: '' },
    { name: '路人甲', isPresent: true, importance: '路人', innerThoughts: '' },
  ],
} as any as BookPage;

const baseSheet: CharacterSheet = {
  identity: { name: '调查员·林', occupation: '', age: 30, gender: '男', birthplace: '', residence: '', id: 'p' },
  secondary: { san: { current: 55, max: 99 }, hp: { current: 10, max: 10 }, mp: { current: 5, max: 5 }, luck: 50, mov: 8, db: '', build: 0 },
} as any as CharacterSheet;

describe('buildImageRenderContext — outfit join', () => {
  it('无 opts 时 characters 只有名字,outfit 字段不出', () => {
    const ctx = buildImageRenderContext(basePage, baseSheet);
    expect(ctx.characters).toEqual([
      { name: '调查员·林' },
      { name: '埃伦娜' },
    ]);
  });

  it('opts.investigatorOutfit + npcOutfitByName 注入', () => {
    const ctx = buildImageRenderContext(basePage, baseSheet, {
      investigatorOutfit: '灰大衣,手持油灯',
      npcOutfitByName: new Map([['埃伦娜', '白衬衫沾血']]),
    });
    expect(ctx.characters).toEqual([
      { name: '调查员·林', outfit: '灰大衣,手持油灯' },
      { name: '埃伦娜', outfit: '白衬衫沾血' },
    ]);
  });

  it('npcOutfitByName 命中部分 NPC,未命中的不挂 outfit', () => {
    const ctx = buildImageRenderContext(basePage, baseSheet, {
      npcOutfitByName: new Map([['张三', 'x']]), // 不在场名单
    });
    expect(ctx.characters).toEqual([
      { name: '调查员·林' },
      { name: '埃伦娜' },
    ]);
  });

  it('路人 NPC 仍被 pickPresentImportantNpcNames 过滤掉', () => {
    const ctx = buildImageRenderContext(basePage, baseSheet);
    expect(ctx.characters?.find((c) => c.name === '路人甲')).toBeUndefined();
  });

  it('sheetSnapshot 缺失时调查员不入列', () => {
    const ctx = buildImageRenderContext(basePage, undefined, {
      npcOutfitByName: new Map([['埃伦娜', 'x']]),
    });
    expect(ctx.characters?.[0]?.name).toBe('埃伦娜');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/api/__tests__/image-prompt-builder.test.ts --reporter=verbose`
Expected: FAIL — buildImageRenderContext 仍返回 `characters: string[]`,断言不通过。

- [ ] **Step 3: 改 `buildImageRenderContext` 签名与实现**

替换 `src/api/image-prompt-builder.ts` 中 `buildImageRenderContext`:

```ts
/** 从 BookPage + scenarioDoc + settings 构造 ImageRenderContext。 */
export function buildImageRenderContext(
  page: BookPage,
  sheetSnapshot?: CharacterSheet,
  opts?: {
    /** name → outfit 短句,由 useNpcStore 当下快照拼出;调用方负责。 */
    npcOutfitByName?: Map<string, string>;
    /** 调查员当下 outfit(useCharSheetStore.sheet.outfit)。 */
    investigatorOutfit?: string;
  },
): ImageRenderContext {
  const sceneInfo = page.sceneInfo;
  const npcNames = pickPresentImportantNpcNames(page, 2);

  const npcEntries: Array<{ name: string; outfit?: string }> = npcNames.map((name) => {
    const outfit = opts?.npcOutfitByName?.get(name);
    return outfit ? { name, outfit } : { name };
  });

  const investigatorName = sheetSnapshot?.identity?.name?.trim() ?? '';
  const investigatorEntry: { name: string; outfit?: string } | null = investigatorName
    ? (opts?.investigatorOutfit
        ? { name: investigatorName, outfit: opts.investigatorOutfit }
        : { name: investigatorName })
    : null;

  const characters = investigatorEntry ? [investigatorEntry, ...npcEntries] : npcEntries;

  return {
    location: sceneInfo?.location ?? '',
    time: sceneInfo?.time ?? '',
    weather: sceneInfo?.weather ?? '',
    characters,
    san: sheetSnapshot?.secondary?.san?.current,
    sceneBrief: distillSceneBrief(page.leftContent ?? ''),
  };
}
```

- [ ] **Step 4: 改 `buildImageSpecFromPage` 透传 opts**

同文件,改 `buildImageSpecFromPage` 签名加 opts 参数透传:

```ts
export function buildImageSpecFromPage(
  page: BookPage,
  scenarioDoc: ScenarioDoc | undefined,
  settingsBase: SettingsImageDefaults,
  settingsEnabled: boolean,
  sheetSnapshot?: CharacterSheet,
  renderHints?: { protocol?: string; model?: string; imageHint?: string },
  outfitOpts?: { npcOutfitByName?: Map<string, string>; investigatorOutfit?: string },
): ResolvedImageGenSpec {
  const ctx = buildImageRenderContext(page, sheetSnapshot, outfitOpts);
  return resolveImageGen(settingsBase, scenarioDoc?.imageGen, ctx, settingsEnabled, renderHints);
}
```

- [ ] **Step 5: 测试通过**

Run: `npx vitest run src/api/__tests__/image-prompt-builder.test.ts --reporter=verbose`
Expected: PASS — 5 个 case 全过。

- [ ] **Step 6: 提交**

```bash
git add src/api/image-gen-merge.ts src/api/image-prompt-builder.ts src/api/__tests__/image-prompt-builder.test.ts
git commit -m "feat(image-prompt-builder): ImageRenderContext.characters 升级为 {name,outfit?}[];builder 扩 outfitOpts;PromptTemplateContext 加 characters_outfit/characters_outfit_en"
```

---

## Task 7: `resolveImageGen` 拼 `characters_outfit` 中文串 + 测试

**Files:**
- Modify: `src/api/image-gen-merge.ts`(`resolveImageGen` 函数,在拼 PromptTemplateContext 处)
- Test: `src/api/__tests__/image-gen-merge-render.test.ts`(新建)

> 本 Task 需要先 Read `src/api/image-gen-merge.ts` 整文件定位 `resolveImageGen` 内部拼 PromptTemplateContext 的位置(约 :260 之后)。同位置补 characters_outfit / characters_outfit_en 的本地拼接。

- [ ] **Step 1: 写失败测试**

创建 `src/api/__tests__/image-gen-merge-render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderPromptTemplate, type PromptTemplateContext } from '../image-gen-merge';

function makeCtx(extra: Partial<PromptTemplateContext> = {}): PromptTemplateContext {
  return {
    style: '', style_anchors: '', location: '', time: '', weather: '',
    characters: '', san: '', scene: '', scene_brief: '', image_hint: '',
    characters_outfit: '', characters_outfit_en: '',
    protocol: 'novelai', model: 'nai-diffusion-4-5-full',
    isNovelAi: true, isV4: true, isSd: false, isOpenAi: false, isChatCompletions: false,
    ...extra,
  };
}

describe('renderPromptTemplate — characters_outfit 占位', () => {
  it('{{characters_outfit}} 渲染中文串', () => {
    const tmpl = 'tags, {{characters_outfit}}, end';
    const result = renderPromptTemplate(tmpl, makeCtx({ characters_outfit: '张三(灰大衣); 李四(护士裙,提油灯)' }));
    expect(result).toBe('tags, 张三(灰大衣); 李四(护士裙,提油灯), end');
  });

  it('{{characters_outfit_en}} 渲染英文串', () => {
    const tmpl = '{{characters_outfit_en}}';
    const result = renderPromptTemplate(tmpl, makeCtx({ characters_outfit_en: 'a man in gray coat, a nurse holding lantern' }));
    expect(result).toBe('a man in gray coat, a nurse holding lantern');
  });

  it('characters_outfit 为空时占位渲染为空', () => {
    expect(renderPromptTemplate('a, {{characters_outfit}}, b', makeCtx({ characters_outfit: '' }))).toBe('a, , b');
  });

  it('EJS 条件块可读到新字段', () => {
    const tmpl = '<% if (characters_outfit) { %>has{{characters_outfit}}<% } else { %>none<% } %>';
    expect(renderPromptTemplate(tmpl, makeCtx({ characters_outfit: 'X' }))).toBe('hasX');
    expect(renderPromptTemplate(tmpl, makeCtx({ characters_outfit: '' }))).toBe('none');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/api/__tests__/image-gen-merge-render.test.ts --reporter=verbose`
Expected: PASS or FAIL — 取决于 Task 5 是否已落 placeholdersOnly 表。

> 若 Task 5 已加占位,此 Step 已经 PASS。Step 3 跳过。
> 若 Task 5 未触及 placeholdersOnly 表,Step 3 执行该修改。

- [ ] **Step 3:(如需)补 placeholdersOnly 表 — Task 5 已做则跳过**

(已在 Task 5 Step 3 处理)

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/api/__tests__/image-gen-merge-render.test.ts --reporter=verbose`
Expected: PASS — 4 个 case 全过。

- [ ] **Step 5: 在 `resolveImageGen` 内本地拼 characters_outfit 字符串**

Read `src/api/image-gen-merge.ts`,定位 `resolveImageGen` 内构造 `PromptTemplateContext` 字面量的位置(关键字搜 `characters: ` 即可,应该在拼字段时把 `ctx.characters` map 成中文名字串)。

在该位置改:

```ts
// 旧:characters: (ctx.characters ?? []).join('、'),
// 新:同时算出 characters 与 characters_outfit
const chs = ctx.characters ?? [];
const charactersNames = chs.map((c) => c.name).join('、');
const charactersOutfit = chs
  .map((c) => (c.outfit ? `${c.name}(${c.outfit})` : c.name))
  .join('; ');
// charactersOutfitEn 由 trigger 层从 image-prompt-extractor 拿;此处先用 charactersOutfit 作为 fallback。
const charactersOutfitEn = renderHints?.charactersOutfitEn || charactersOutfit;
```

并在 `PromptTemplateContext` 字面量里:

```ts
{
  style, style_anchors, location, time, weather,
  characters: charactersNames,
  characters_outfit: charactersOutfit,
  characters_outfit_en: charactersOutfitEn,
  san, scene, scene_brief, image_hint,
  protocol, model, isNovelAi, isV4, isSd, isOpenAi, isChatCompletions,
}
```

`renderHints` 类型扩 `charactersOutfitEn?: string`(可选)。

- [ ] **Step 6: 类型检查 + 测试**

Run: `npx tsc --noEmit && npx vitest run src/api/__tests__ --reporter=verbose`
Expected: 无 tsc 错;新增测试 PASS。

- [ ] **Step 7: 提交**

```bash
git add src/api/image-gen-merge.ts src/api/__tests__/image-gen-merge-render.test.ts
git commit -m "feat(image-gen-merge): resolveImageGen 拼 characters_outfit/characters_outfit_en;renderHints 扩 charactersOutfitEn 透传"
```

---

## Task 8: `image-prompt-extractor` 英文化分支搭车 outfit

**Files:**
- Modify: `src/api/image-prompt-extractor.ts`(`ImagePromptExtractInput` :13-28 + `buildUserPayload` :77-90 + `extractImagePromptHint` :93-130)
- Test: `src/api/__tests__/image-prompt-extractor-outfit.test.ts`(新建)

- [ ] **Step 1: 写失败测试**

创建 `src/api/__tests__/image-prompt-extractor-outfit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractImagePromptHint } from '../image-prompt-extractor';
import * as subagentCall from '../../sillytavern/subagent-call';

describe('extractImagePromptHint — outfit 翻译', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('charactersOutfit 中文串被附进 user payload', async () => {
    const spy = vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '', parsed: { prompt: 'tag1, tag2', charactersOutfitEn: 'a man in gray coat' },
    } as any);
    const out = await extractImagePromptHint(
      { leftContent: '正文', isNovelAi: true, isV4: true, charactersOutfit: '张三(灰大衣)' } as any,
      { apiBaseUrl: 'x', apiKey: 'k', model: 'm' },
    );
    expect(out?.prompt).toBe('tag1, tag2');
    expect(out?.charactersOutfitEn).toBe('a man in gray coat');
    const args = spy.mock.calls[0][0];
    const userMsg = (args.messages as any[]).find((m) => m.role === 'user').content;
    expect(userMsg).toContain('张三(灰大衣)');
  });

  it('charactersOutfit 为空时不附,返回 hint 仍正常', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '', parsed: { prompt: 'tag1' },
    } as any);
    const out = await extractImagePromptHint(
      { leftContent: '正文', isNovelAi: true, isV4: true } as any,
      { apiBaseUrl: 'x', apiKey: 'k', model: 'm' },
    );
    expect(out?.prompt).toBe('tag1');
    expect(out?.charactersOutfitEn).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/api/__tests__/image-prompt-extractor-outfit.test.ts --reporter=verbose`
Expected: FAIL — extractImagePromptHint 仍返回 string|null,断言不通过(`out?.prompt` 不存在)。

- [ ] **Step 3: 改 extractor 接口与实现**

改 `src/api/image-prompt-extractor.ts`:

```ts
// ── ImagePromptExtractInput 加 charactersOutfit ──
export interface ImagePromptExtractInput {
  leftContent: string;
  location?: string;
  time?: string;
  weather?: string;
  characters?: string[];
  san?: number;
  isNovelAi: boolean;
  isV4: boolean;
  /** characters_outfit 中文串(如「张三(灰大衣)」),非空时 LLM 顺便翻成英文。 */
  charactersOutfit?: string;
}

// ── 返回类型从 string | null 改为 { prompt, charactersOutfitEn? } | null ──
export interface ImagePromptExtractResult {
  prompt: string;
  charactersOutfitEn?: string;
}

// ── SYSTEM_NOVELAI / SYSTEM_GENERAL 文末追加新指令 ──
const OUTFIT_TRANSLATION_SUFFIX = [
  '',
  'If the user payload contains "Characters with outfit (zh):", also translate it into a single English Danbooru-style or natural-language fragment',
  'describing each character\'s visible outfit and held items. Put the result in a "charactersOutfitEn" field next to "prompt".',
  'Examples: "a man in gray wool coat holding a revolver, a nurse in white uniform with an oil lantern".',
  '',
  'Output JSON: {"prompt":"...", "charactersOutfitEn":"..."} — charactersOutfitEn 可省略(没传入时)。',
].join('\n');
// 注:把这段 suffix 拼到 SYSTEM_NOVELAI 与 SYSTEM_GENERAL 末尾。

// ── buildUserPayload 在 characters 行之后追加 charactersOutfit ──
function buildUserPayload(input: ImagePromptExtractInput): string {
  const lines: string[] = [];
  if (input.location) lines.push(`Scene location: ${input.location}`);
  if (input.time) lines.push(`Time of day: ${input.time}`);
  if (input.weather) lines.push(`Weather: ${input.weather}`);
  if (input.characters && input.characters.length > 0) {
    lines.push(`Present important characters: ${input.characters.slice(0, 3).join(', ')}`);
  }
  if (input.charactersOutfit && input.charactersOutfit.trim()) {
    lines.push(`Characters with outfit (zh): ${input.charactersOutfit.trim()}`);
  }
  if (input.san !== undefined) lines.push(`Investigator SAN: ${input.san}`);
  const narrative = (input.leftContent ?? '').slice(0, 800).trim();
  lines.push('', 'Narrative (translate the visible content into the image prompt):', narrative);
  return lines.join('\n');
}

// ── extractImagePromptHint 返回类型同步改 ──
export async function extractImagePromptHint(
  input: ImagePromptExtractInput,
  llmConfig: ImagePromptExtractLlmConfig,
): Promise<ImagePromptExtractResult | null> {
  if (!llmConfig.apiBaseUrl || !llmConfig.apiKey || !llmConfig.model) return null;
  if (!input.leftContent || !input.leftContent.trim()) return null;

  const system = (input.isNovelAi ? SYSTEM_NOVELAI : SYSTEM_GENERAL) + OUTFIT_TRANSLATION_SUFFIX;
  const user = buildUserPayload(input);

  const req: DsSubagentRequest = {
    apiBaseUrl: llmConfig.apiBaseUrl,
    apiKey: llmConfig.apiKey,
    model: llmConfig.model,
    extraParams: llmConfig.extraParams,
    signal: llmConfig.signal,
    label: 'image-prompt-extract',
    temperature: 0.7,
    maxTokens: 600,
    rpmLane: 'main',
    jsonObject: true,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  try {
    const resp = await callDsSubagent(req);
    const parsed = resp.parsed as { prompt?: string; charactersOutfitEn?: string } | null;
    if (!parsed || typeof parsed.prompt !== 'string' || !parsed.prompt.trim()) return null;
    const out: ImagePromptExtractResult = { prompt: parsed.prompt.trim() };
    if (typeof parsed.charactersOutfitEn === 'string' && parsed.charactersOutfitEn.trim()) {
      out.charactersOutfitEn = parsed.charactersOutfitEn.trim();
    }
    return out;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 适配调用方 `image-gen-trigger.ts` 拿新返回值**

定位 `src/api/image-gen-trigger.ts` 调 `extractImagePromptHint` 的地方(grep `extractImagePromptHint`),把:
```ts
const hint = await extractImagePromptHint(...);
// 用 hint 作为字符串
```
改为:
```ts
const hintResult = await extractImagePromptHint(...);
const hint = hintResult?.prompt ?? '';
const charactersOutfitEn = hintResult?.charactersOutfitEn;
```
并把 `charactersOutfitEn` 沿 `buildImageSpecFromPage` 的 `renderHints` 透传(在 Task 7 已把 renderHints 扩了字段)。

- [ ] **Step 5: 测试通过**

Run: `npx vitest run src/api/__tests__ --reporter=verbose`
Expected: PASS — 全部新增 case 过;现有 extractor 测试不退化(仅返回类型从 string|null 变 ImagePromptExtractResult|null,调用方已同步)。

- [ ] **Step 6: 类型检查全量**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add src/api/image-prompt-extractor.ts src/api/image-gen-trigger.ts src/api/__tests__/image-prompt-extractor-outfit.test.ts
git commit -m "feat(image-prompt-extractor): 英文化分支搭车 outfit 翻译;返回 {prompt,charactersOutfitEn?};trigger 透传到 renderHints"
```

---

## Task 9: `useChatPipeline.ts` 钩入 outfit-extractor + 首回合特殊化

**Files:**
- Modify: `src/hooks/useChatPipeline.ts`(导入区 + 主 API done 后 fire-and-forget 块)

> ⚠️ 大文件,主控亲自精确 Edit。

- [ ] **Step 1: 加 import**

定位导入区(约 :20-30),追加:

```ts
import { extractOutfitDiff } from '../sillytavern/outfit-extractor';
import { useNpcStore } from '../stores/useNpcStore';
import { useCharSheetStore } from '../stores/useCharSheetStore';
```

(若部分已 import,合并即可。)

- [ ] **Step 2: 在 prologue/causal-echo 触发块旁追加 outfit-extractor 触发块**

定位 plot-arc plan Task 8 加入的 causal-echo 触发块之后,继续追加 outfit-extractor 触发块:

```ts
// 装束差分:本回合主 API 已落 → 抽 outfit diff 写 useNpcStore / useCharSheetStore。
// 仅核心/重要 NPC 参与;首回合(sheet.outfit 为空)强制跑一次初始化。
// fire-and-forget;extractor 永不 throw。
{
  const sheet = useCharSheetStore.getState().sheet;
  const importantNpcs = Object.values(useNpcStore.getState().profiles)
    .filter((p) => p.isPresent)
    .filter((p) => p.importance === '核心' || p.importance === '重要');
  const isFirstTime = !sheet.outfit || !sheet.outfit.trim();
  const hasMaterial = (newPage.leftContent ?? '').trim().length > 0;
  if (hasMaterial && (importantNpcs.length > 0 || isFirstTime)) {
    const eff = settings.getEffectiveMvuApi();
    const aidOE = useChatStore.getState().activeId;
    const snapshots = importantNpcs.map((p) => ({
      name: p.name,
      outfit: p.outfit ?? '',
    }));
    void extractOutfitDiff({
      leftContent: newPage.leftContent ?? '',
      investigatorOutfitSnapshot: sheet.outfit ?? '',
      npcSnapshots: snapshots,
      apiBaseUrl: eff.baseUrl,
      apiKey: eff.apiKey,
      model: eff.model,
      signal: controller.signal,
    }).then((result) => {
      if (useChatStore.getState().activeId !== aidOE) return;
      let changed = false;
      if (result.investigatorOutfit) {
        useCharSheetStore.getState().setOutfit(result.investigatorOutfit);
        changed = true;
        pushLog('debug', `[装束·调查员] ${result.investigatorOutfit}`, 'system');
      }
      for (const [name, outfit] of Object.entries(result.npcs)) {
        useNpcStore.getState().setProfileOutfitByName(name, outfit);
        changed = true;
        pushLog('debug', `[装束·${name}] ${outfit}`, 'system');
      }
      if (changed && aidOE) void saveConversation(aidOE);
    });
  }
}
```

> 触发条件解释:
> - `hasMaterial`:`newPage.leftContent` 非空,叙事可供抽
> - `importantNpcs.length > 0 || isFirstTime`:有核心/重要 NPC 在场 OR 首回合调查员未初始化
> - 二者都不满足时直接跳过(避免空 LLM 调用)

- [ ] **Step 3: 类型检查 + 既有测试不退化**

Run: `npx tsc --noEmit && npx vitest run --reporter=verbose`
Expected: tsc 无错;现有测试 PASS。

- [ ] **Step 4: 提交**

```bash
git add src/hooks/useChatPipeline.ts
git commit -m "feat(useChatPipeline): 主 API done 后 fire-and-forget 跑 outfit-extractor;首回合(sheet.outfit 空)强制跑初始化"
```

---

## Task 10: image-gen-trigger 调 buildImageSpecFromPage 时传 outfitOpts

**Files:**
- Modify: `src/api/image-gen-trigger.ts`(调 `buildImageSpecFromPage` 处)

> 与 Task 8 Step 4 同文件,但本 Task 改的是另一处:trigger 调 buildImageSpec 时把 `npcOutfitByName` / `investigatorOutfit` 准备好传入。

- [ ] **Step 1: 在 trigger 调 buildImageSpecFromPage 前准备 outfitOpts**

定位 `src/api/image-gen-trigger.ts` 调 `buildImageSpecFromPage(...)` 的地方(grep `buildImageSpecFromPage`),在调用前加:

```ts
import { useNpcStore } from '../stores/useNpcStore';
import { useCharSheetStore } from '../stores/useCharSheetStore';

// 准备 outfitOpts
const npcProfiles = useNpcStore.getState().profiles;
const npcOutfitByName = new Map<string, string>();
for (const p of Object.values(npcProfiles)) {
  if (p.outfit && p.outfit.trim()) npcOutfitByName.set(p.name, p.outfit);
}
const investigatorOutfit = useCharSheetStore.getState().sheet.outfit ?? '';
const outfitOpts = { npcOutfitByName, investigatorOutfit: investigatorOutfit || undefined };

const spec = buildImageSpecFromPage(page, scenarioDoc, settingsBase, settingsEnabled, sheetSnapshot, renderHints, outfitOpts);
```

(若 trigger 内已有相关 import 复用即可。)

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 既有测试不退化**

Run: `npx vitest run --reporter=verbose`
Expected: 全部 PASS。

- [ ] **Step 4: 提交**

```bash
git add src/api/image-gen-trigger.ts
git commit -m "feat(image-gen-trigger): 调 buildImageSpecFromPage 时准备 npcOutfitByName + investigatorOutfit 透传"
```

---

## Task 11: 集成验证

**Files:** 无(仅运行验证)

- [ ] **Step 1: 全量测试**

Run: `npx vitest run --reporter=verbose`
Expected: 全部 PASS。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 构建**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 4: 推送 beta**

Run:
```bash
git push origin beta
```

UI 端验证(用户自测):
- 开新一局,首回合主 API done 后看 `[装束·调查员]` 日志
- 几回合后翻 NPC 面板检查 NpcProfile.outfit 是否被写入(可通过 Devtools/sessionLifecycle 验证)
- 触发生图后查 image prompt 是否含 `张三(灰大衣)` 或英文版

---

## 与 plot-arc-causality-theme plan 的耦合

- **db V10 升级由 plot-arc plan Task 9 创建**,本 plan 不再 bump 版本。本 plan 只往 NpcProfile / CharacterSheet 加可选字段(值结构内字段新增不影响 IndexedDB store 索引)。
- 两份 plan 改的代码路径几乎不重叠(本 plan 改 npc/sheet store / image-prompt 一组 + useChatPipeline 一条触发块;plot-arc plan 改 anchors store / megaagent / causal-echo / pickNextUnreached / useChatPipeline 另一条触发块)。
- `useChatPipeline.ts` 同文件不同区段,可分先后串行 Edit;两 plan 的 Task 8/Task 9(useChatPipeline 钩入)互不冲突,顺序由实施时决定。

---

## YAGNI(本 plan 不做)

- UI 面板露 outfit 字段:留作可选追加,主线不做(用户可走 DevTools 检查或下一轮迭代加 UI)
- inventory 与 outfit 合并去重:语义不同
- 装束历史时间线:当前态足够
- carrying 独立字段:已合并入 outfit
- 路人 NPC outfit:Section 排除
- 服装风格细化分层:单 outfit 字段已经能装载所需描述
