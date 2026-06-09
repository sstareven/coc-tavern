# 剧情骨架升级（角色弧 + 因果链 + 主题 + 世界事实）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已有「剧情锚点」基础上扩 4 个 KP 视角的剧情结构字段（theme/worldFacts/characterArcs/causalLinks）+ 每回合产 1 句因果回响（causalEcho），让 KP 朝「角色弧 + 事件因果 + 主题回响」收束叙事，不再靠 LLM 每回合脑补。

**Architecture:** PlotAnchors 4 新字段在**首回合 prologue-megaagent 综合 B** 一次性生成；新字段全部 best-effort 软成功（缺失整节静默降级，不卡首回合）；causalEcho 走**独立 LLM 子调用** + fire-and-forget，规避「主 JSON 加字段会截断末尾」；useAnchorStore.buildContextInjection 重排为 8 节文案。

**Tech Stack:** React + TypeScript + Zustand + Dexie(IndexedDB) + Vitest。

设计依据：`docs/superpowers/specs/2026-06-09-plot-arc-causality-theme-design.md`。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/types/index.ts` | 扩 `PlotAnchors` 加 4 字段 + 新 `CharacterArc` / `CausalLink` interface | 修改（追加） |
| `src/sillytavern/prologue-megaagent.ts` | 改 `SYSTEM_PROMPT_B` + `parsePrologueResponse` 解析新字段 | 修改 |
| `src/sillytavern/__tests__/prologue-megaagent.parse.test.ts` | 4 个新字段 parse 用例 | 新建 |
| `src/stores/useAnchorStore.ts` | 加 `lastCausalEcho` + `setLastCausalEcho`；改 `buildContextInjection` 文案 | 修改 |
| `src/stores/__tests__/useAnchorStore.test.ts` | buildContextInjection 8 节 snapshot；字段缺失整节降级 | 新建（或追加） |
| `src/sillytavern/causal-echo-extractor.ts` | 解耦子调用：上回合 summary → 1 句因果回响 | 新建 |
| `src/sillytavern/__tests__/causal-echo-extractor.test.ts` | happy / null parsed / 网络错 / aborted | 新建 |
| `src/hooks/useChatPipeline.ts` | `pickNextUnreachedNode` 纯函数 + 主 API done 后 fire-and-forget 钩入 | 修改（大文件，主控亲自精确 Edit） |
| `src/hooks/__tests__/pickNextUnreachedNode.test.ts` | 纯函数单测 | 新建 |
| `src/db/database.ts` | V9 → V10（**本 plan 负责创建 V10_SCHEMA**，outfit plan 不再 bump） | 修改 |

> ⚠️ `useChatPipeline.ts` 是 2000+ 行大文件，按记忆 `workflow-subagent-edit-large-files` 不要交给并行子代理盲改——本 plan 的所有 useChatPipeline 改动由主控（你）亲自精确 Edit。

---

## Task 1: 类型 `CharacterArc` / `CausalLink` / `PlotAnchors` 扩字段

**Files:**
- Modify: `src/types/index.ts`（在现有 `PlotAnchors` 定义附近，约 :339-353）

- [ ] **Step 1: 追加 / 修改类型定义**

定位 `src/types/index.ts` 中现有 `AnchorNode` / `PlotAnchors` 定义（约 :339-353）。在 `PlotAnchors` 之前追加 `CharacterArc` / `CausalLink`，并扩 `PlotAnchors` 加 4 个可选字段：

```ts
/** 调查员或关键 NPC 的角色弧：开局态 → 终态。LLM 用作长期方向，每回合不要求显式进度。 */
export interface CharacterArc {
  /** 角色名（调查员=sheet.identity.name；NPC=NpcProfile.name，与 findIdByName 对齐）。 */
  name: string;
  /** 开局态：1 句话刻画起点形象（性格/处境）。 */
  from: string;
  /** 中段态：1 句话刻画转折前的状态，可省。 */
  mid?: string;
  /** 终态：1 句话刻画结局形象，KP 让角色长期朝此方向收束。 */
  to: string;
}

/** 相邻骨架节点之间的因果钩子：节点 A 走到 B 必须先发生什么。 */
export interface CausalLink {
  /** AnchorNode.id（megaagent 输出 fromTitle，parse 阶段反查 nodes 拿 id）。 */
  fromNodeId: string;
  /** AnchorNode.id（同上）。 */
  toNodeId: string;
  /** 1 句话桥接钩子（≤30字）。 */
  hookHint: string;
}

/** 本局剧情蓝图：开局一次生成、整局固定（单行/会话）。 */
export interface PlotAnchors {
  /** 3-6 个有序必达节点（默认推进路线）。 */
  nodes: AnchorNode[];
  /** 3-5 条全局硬约束（地理/因果保证）。 */
  constraints: string[];
  /** 威胁达成坏结局所依赖之物（= 玩家可逻辑性瓦解的关键靶子）。 */
  threatDependencies: string[];
  /** 本局中心思想，1 句话（≤30字）。KP 隐性回响，不当讲道文。 */
  theme?: string;
  /** 3-6 条 KP 视角世界硬事实（如「狼人怕银」「社区三代旧怨」）。 */
  worldFacts?: string[];
  /** 调查员 + 关键 NPC 各一条角色弧，通常共 3-4 条。 */
  characterArcs?: CharacterArc[];
  /** 相邻骨架节点之间的因果钩子，长度通常 = nodes.length - 1。 */
  causalLinks?: CausalLink[];
}
```

- [ ] **Step 2: 类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无错误（仅新增类型 + 扩可选字段，老调用方读不到新字段会拿到 undefined，不破坏类型）。

- [ ] **Step 3: 提交**

```bash
git add src/types/index.ts
git commit -m "feat(类型): PlotAnchors 扩 theme/worldFacts/characterArcs/causalLinks 四字段"
```

---

## Task 2: `parsePrologueResponse` 解析新字段 + helper

**Files:**
- Modify: `src/sillytavern/prologue-megaagent.ts`（`parsePrologueResponse` 约 :129-169；helpers 在文件末段）
- Test: `src/sillytavern/__tests__/prologue-megaagent.parse.test.ts`（新建）

- [ ] **Step 1: 写失败测试 — 解析 4 个新字段 + causalLinks fromTitle→fromNodeId 反查**

创建 `src/sillytavern/__tests__/prologue-megaagent.parse.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { parsePrologueResponse } from '../prologue-megaagent';

describe('parsePrologueResponse — 新字段', () => {
  it('解析 theme/worldFacts/characterArcs/causalLinks(fromTitle 反查 id)', () => {
    const raw = {
      badEnding: { description: '极地崩塌，全员葬身。' },
      pillars: [{ title: '柱1', secret: '秘1' }],
      anchors: {
        nodes: [
          { title: '抵达极地', description: '调查员到达基地。' },
          { title: '发现遗骸', description: '挖出古老化石。' },
          { title: '城下之诡', description: '深入冰下城市。' },
        ],
        constraints: ['仅能徒步'],
        threatDependencies: ['仪式材料'],
        theme: '人面对不可名状之物时,付出湛然依是选择。',
        worldFacts: ['极地有古老遗迹', '社区有三代旧怨', '某 NPC 与基地有渊源'],
        characterArcs: [
          { name: '调查员', from: '天真助理', to: '清醒的报信者' },
          { name: '埃伦娜·武', from: '冷静学者', mid: '动摇', to: '殉道者' },
        ],
        causalLinks: [
          { fromTitle: '抵达极地', toTitle: '发现遗骸', hookHint: '调查员翻读队长遗物' },
          { fromTitle: '发现遗骸', toTitle: '城下之诡', hookHint: '冰隙裂开露出阶梯' },
          { fromTitle: '不存在的节点', toTitle: '城下之诡', hookHint: '应被丢弃' }, // 反查失败
        ],
      },
    };
    const result = parsePrologueResponse(raw);
    expect(result.anchors).not.toBeNull();
    const a = result.anchors!;
    expect(a.theme).toBe('人面对不可名状之物时,付出湛然依是选择。');
    expect(a.worldFacts).toEqual(['极地有古老遗迹', '社区有三代旧怨', '某 NPC 与基地有渊源']);
    expect(a.characterArcs).toEqual([
      { name: '调查员', from: '天真助理', to: '清醒的报信者' },
      { name: '埃伦娜·武', from: '冷静学者', mid: '动摇', to: '殉道者' },
    ]);
    // causalLinks 应只剩 2 条(第 3 条 fromTitle 找不到 → 丢弃),fromNodeId/toNodeId 用 nodes 的真实 id
    expect(a.causalLinks).toHaveLength(2);
    expect(a.causalLinks![0].fromNodeId).toBe(a.nodes[0].id);
    expect(a.causalLinks![0].toNodeId).toBe(a.nodes[1].id);
    expect(a.causalLinks![0].hookHint).toBe('调查员翻读队长遗物');
  });

  it('新字段全缺时不报错,旧三段仍正常落地', () => {
    const raw = {
      badEnding: { description: '坏结局' },
      pillars: [{ title: 't', secret: 's' }],
      anchors: {
        nodes: [{ title: 'n1', description: 'd1' }],
        constraints: [],
        threatDependencies: [],
      },
    };
    const result = parsePrologueResponse(raw);
    expect(result.anchors).not.toBeNull();
    expect(result.anchors!.theme).toBeUndefined();
    expect(result.anchors!.worldFacts).toBeUndefined();
    expect(result.anchors!.characterArcs).toBeUndefined();
    expect(result.anchors!.causalLinks).toBeUndefined();
  });

  it('worldFacts 上限 6 条、theme 超 50 字截断', () => {
    const raw = {
      badEnding: { description: 'x' },
      pillars: [{ title: 't', secret: 's' }],
      anchors: {
        nodes: [{ title: 'n1', description: 'd1' }],
        constraints: [],
        threatDependencies: [],
        theme: 'a'.repeat(80),
        worldFacts: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'],
      },
    };
    const result = parsePrologueResponse(raw);
    expect(result.anchors!.theme!.length).toBe(50);
    expect(result.anchors!.worldFacts).toHaveLength(6);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/sillytavern/__tests__/prologue-megaagent.parse.test.ts --reporter=verbose`
Expected: FAIL — parsePrologueResponse 未 export 或新字段解析为 undefined。

- [ ] **Step 3: 改 `parsePrologueResponse` + export**

在 `src/sillytavern/prologue-megaagent.ts` 把 `parsePrologueResponse` 改为 `export function`，并扩展解析新字段：

```ts
export function parsePrologueResponse(
  parsed: Record<string, unknown>,
  usage?: TokenUsage,
): PrologueMegaAgentResult {
  let badEnding: PrologueMegaAgentResult['badEnding'] = null;
  const beRaw = asObject(parsed.badEnding);
  if (beRaw && asString(beRaw.description)) {
    badEnding = { description: asString(beRaw.description) };
  }

  const pillars = asArray<Record<string, unknown>>(parsed.pillars)
    .map((p) => ({ title: asString(p?.title), secret: asString(p?.secret) }))
    .filter((p) => p.title && p.secret)
    .slice(0, 3);

  let anchors: PrologueMegaAgentResult['anchors'] = null;
  const anchorsRaw = asObject(parsed.anchors);
  if (anchorsRaw) {
    const nodes = asArray<Record<string, unknown>>(anchorsRaw.nodes)
      .filter((x) => x && (typeof x.title === 'string' || typeof x.description === 'string'))
      .map((x) => ({
        id: crypto.randomUUID(),
        title: asString(x.title, '节点'),
        description: asString(x.description),
      }))
      .slice(0, 6);
    const constraints = asArray<string>(anchorsRaw.constraints)
      .filter((c) => typeof c === 'string' && c.trim())
      .map((c) => c.trim())
      .slice(0, 5);
    const threatDependencies = asArray<string>(anchorsRaw.threatDependencies)
      .filter((d) => typeof d === 'string' && d.trim())
      .map((d) => d.trim())
      .slice(0, 8);

    // ── 新字段(best-effort 软成功,缺失即 undefined) ──
    const themeRaw = asString(anchorsRaw.theme).trim();
    const theme = themeRaw ? themeRaw.slice(0, 50) : undefined;

    const worldFactsRaw = asArray<string>(anchorsRaw.worldFacts)
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim())
      .slice(0, 6);
    const worldFacts = worldFactsRaw.length > 0 ? worldFactsRaw : undefined;

    const characterArcsRaw = asArray<Record<string, unknown>>(anchorsRaw.characterArcs)
      .map((a) => ({
        name: asString(a?.name).trim(),
        from: asString(a?.from).trim(),
        mid: asString(a?.mid).trim(),
        to: asString(a?.to).trim(),
      }))
      .filter((a) => a.name && a.from && a.to)
      .map((a) => (a.mid ? a : { name: a.name, from: a.from, to: a.to }))
      .slice(0, 6);
    const characterArcs = characterArcsRaw.length > 0 ? characterArcsRaw : undefined;

    // causalLinks: LLM 输出 fromTitle/toTitle, 此处反查 nodes 拿 id
    const titleToId = new Map(nodes.map((n) => [n.title, n.id]));
    const causalLinksRaw = asArray<Record<string, unknown>>(anchorsRaw.causalLinks)
      .map((l) => ({
        fromTitle: asString(l?.fromTitle).trim(),
        toTitle: asString(l?.toTitle).trim(),
        hookHint: asString(l?.hookHint).trim(),
      }))
      .filter((l) => l.fromTitle && l.toTitle && l.hookHint)
      .map((l) => {
        const fromNodeId = titleToId.get(l.fromTitle);
        const toNodeId = titleToId.get(l.toTitle);
        return fromNodeId && toNodeId
          ? { fromNodeId, toNodeId, hookHint: l.hookHint.slice(0, 30) }
          : null;
      })
      .filter((l): l is { fromNodeId: string; toNodeId: string; hookHint: string } => l !== null)
      .slice(0, Math.max(0, nodes.length - 1));
    const causalLinks = causalLinksRaw.length > 0 ? causalLinksRaw : undefined;

    if (nodes.length > 0) {
      anchors = {
        nodes,
        constraints,
        threatDependencies,
        ...(theme ? { theme } : {}),
        ...(worldFacts ? { worldFacts } : {}),
        ...(characterArcs ? { characterArcs } : {}),
        ...(causalLinks ? { causalLinks } : {}),
      };
    }
  }

  return { badEnding, pillars, anchors, usage };
}
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/sillytavern/__tests__/prologue-megaagent.parse.test.ts --reporter=verbose`
Expected: PASS — 3 个 case 全过。

- [ ] **Step 5: 提交**

```bash
git add src/sillytavern/prologue-megaagent.ts src/sillytavern/__tests__/prologue-megaagent.parse.test.ts
git commit -m "feat(prologue-megaagent): parsePrologueResponse 扩 theme/worldFacts/characterArcs/causalLinks 解析(best-effort 软成功)"
```

---

## Task 3: 改 `SYSTEM_PROMPT_B` 让 megaagent 输出新字段

**Files:**
- Modify: `src/sillytavern/prologue-megaagent.ts`（`SYSTEM_PROMPT_B` 常量 :16-43）

- [ ] **Step 1: 改 SYSTEM_PROMPT_B**

替换 `SYSTEM_PROMPT_B` 整个常量为：

```ts
const SYSTEM_PROMPT_B = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人,正在为本局编排「真相」与「剧情骨架」。请按以下步骤【在同一次输出内】依序完成:

1. 据开场情境定本局注定的坏结局 badEnding(1-3 句具体描述,紧扣主题与地点)。
2. 据坏结局推 3 个真相支柱 pillars(title + secret),共同构成破局核心。
3. 据上述坏结局+支柱+开场情境,按 5 大开局母题匹配最贴近母题,输出剧情蓝图 anchors:
   - 禁书诅咒型(导师急信/密大残籍):单点深挖、解谜驱动、阅读禁书伴随理智流失。
   - 封闭敌镇型(海风遗产/印斯茅斯):敌意小镇、时限压迫、全镇合谋。
   - 不可见威胁型(山丘委托/敦威治):乡村孤立、威胁初期不可见、家族秘密。
   - 线性探险型(极地邀约/疯狂山脉):地理纵深、场景线性递进、真相是衰落文明。
   - 多线收束型(镇上异变/阿卡姆):开放主场、多条怪事并行、调查员是本地人。
4. 输出本局中心思想 anchors.theme(1 句话,不超过 30 字,KP 用作隐性引导,禁止 NPC 当讲道文说出来)。
5. 输出 anchors.worldFacts 3-6 条 KP 视角世界硬事实(玩家未必发现,但 KP 据此判定一切角色合理性,如「狼人怕银」「社区有三代旧怨」)。
6. 输出 anchors.characterArcs:调查员一条 + 关键 NPC(与 pillars 反映出的人物)各一条,通常共 3-4 条。每条字段 name/from/to 必填,mid 可省。例:{name:'调查员', from:'天真助理', mid:'目击者', to:'清醒的报信者'}。
7. 输出 anchors.causalLinks 把 nodes 两两相邻串起,长度 = nodes.length - 1。每条 {fromTitle, toTitle, hookHint},hookHint 用 1 句话(≤30字)说明「节点 A 走到 B 必须先发生什么 / 玩家行动如何成为 B 的因」,fromTitle/toTitle 用 nodes 里的真实 title。

要求:
- nodes:3-6 个【有序】必经节点。
- constraints:3-5 条全局硬约束。
- threatDependencies:威胁要达成坏结局所依赖之物(资金/法器/信众/补给/仪式材料等)。

坏结局、支柱机密、anchors 都属于守秘人最高机密,禁止露给玩家。

只输出单一 JSON 对象,不要任何额外文字、解释或代码围栏:
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
}`;
```

**「三段必须全有内容才算成功」的校验维持现状**（`runPrologueMegaAgent` :107 不动）—— 即 nodes/pillars/badEnding 三段非空即可，新字段缺失不再次重试。

- [ ] **Step 2: 类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/sillytavern/prologue-megaagent.ts
git commit -m "feat(prologue-megaagent): SYSTEM_PROMPT_B 加 7 步指令产出 theme/worldFacts/characterArcs/causalLinks"
```

---

## Task 4: `useAnchorStore` 加 `lastCausalEcho` 状态与 setter

**Files:**
- Modify: `src/stores/useAnchorStore.ts`

- [ ] **Step 1: 改 `AnchorStore` interface + 实现，新加 `lastCausalEcho` / `setLastCausalEcho`**

定位 `src/stores/useAnchorStore.ts`，改 `AnchorStore` interface（约 :6-20）+ create 实现：

```ts
interface AnchorStore {
  /** 本局剧情蓝图；未生成时 nodes 为空数组。 */
  anchors: PlotAnchors;
  /** 上一回合 causal-echo-extractor 产出的因果回响（1 句话）；空字符串表示无。 */
  lastCausalEcho: string;
  /** 写入蓝图——仅当当前 nodes 为空时生效（幂等防重复生成覆盖）。 */
  setAnchors: (a: PlotAnchors) => void;
  /** 读档恢复:整体替换。 */
  replaceAll: (a: PlotAnchors) => void;
  /** 清空(会话隔离)。 */
  clearAll: () => void;
  /** causal-echo-extractor 每回合产出后写入(覆盖上一句)。 */
  setLastCausalEcho: (echo: string) => void;
  /**
   * 构造守秘人视角「剧情骨架与进程」注入文本；nodes 为空返回 ''。
   * @param recentSummaries 最近若干页的 page.summary(事件时间线,旧→新),由调用方现算传入。
   */
  buildContextInjection: (recentSummaries: string[]) => string;
}
```

实现层在 `create` 的 state 初值 + actions 里新增对应字段：

```ts
export const useAnchorStore = create<AnchorStore>()((set, get) => ({
  anchors: EMPTY,
  lastCausalEcho: '',

  setAnchors: (a) => {
    if (get().anchors.nodes.length !== 0) return;
    set({ anchors: cloneAnchors(a) });
  },

  replaceAll: (a) => set({ anchors: cloneAnchors(a) }),

  clearAll: () => set({ anchors: EMPTY, lastCausalEcho: '' }),

  setLastCausalEcho: (echo) => set({ lastCausalEcho: echo ?? '' }),

  buildContextInjection: (recentSummaries) => {
    // —— Task 5 改写,本 Task 暂保留原实现 ——
    const { nodes, constraints, threatDependencies } = get().anchors;
    if (nodes.length === 0) return '';
    // ... 原逻辑暂留 ...
  },
}));

/** 拷贝 anchors:nodes/constraints/threatDependencies 深拷贝;新字段浅拷贝(原始类型/数组)即可。 */
function cloneAnchors(a: PlotAnchors): PlotAnchors {
  return {
    nodes: a.nodes.map((n) => ({ ...n })),
    constraints: [...a.constraints],
    threatDependencies: [...a.threatDependencies],
    ...(a.theme ? { theme: a.theme } : {}),
    ...(a.worldFacts ? { worldFacts: [...a.worldFacts] } : {}),
    ...(a.characterArcs ? { characterArcs: a.characterArcs.map((c) => ({ ...c })) } : {}),
    ...(a.causalLinks ? { causalLinks: a.causalLinks.map((l) => ({ ...l })) } : {}),
  };
}
```

注意 `clearAll` 同时清 `lastCausalEcho`，避免跨会话泄漏（与 `sessionLifecycle` 已绑定的 `clearAll` 通路对齐）。

- [ ] **Step 2: 类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/stores/useAnchorStore.ts
git commit -m "feat(useAnchorStore): 加 lastCausalEcho state + setLastCausalEcho/cloneAnchors;clearAll 同步清"
```

---

## Task 5: 改 `useAnchorStore.buildContextInjection` 为 8 节文案

**Files:**
- Modify: `src/stores/useAnchorStore.ts`（`buildContextInjection` 约 :35-56）
- Test: `src/stores/__tests__/useAnchorStore.test.ts`（新建）

- [ ] **Step 1: 写失败测试 — 8 节文案 snapshot + 字段缺失整节降级**

创建 `src/stores/__tests__/useAnchorStore.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAnchorStore } from '../useAnchorStore';
import type { PlotAnchors } from '../../types';

describe('useAnchorStore.buildContextInjection — 8 节文案', () => {
  beforeEach(() => {
    useAnchorStore.getState().clearAll();
  });

  it('全字段齐全 + 有 recentSummaries + lastCausalEcho 时,8 节都出现且顺序正确', () => {
    const a: PlotAnchors = {
      nodes: [
        { id: 'n1', title: '抵达极地', description: '到达基地。' },
        { id: 'n2', title: '发现遗骸', description: '挖出化石。' },
      ],
      constraints: ['仅能徒步'],
      threatDependencies: ['仪式材料'],
      theme: '在不可名状面前,选择尊严。',
      worldFacts: ['极地有遗迹', '基地有渊源'],
      characterArcs: [
        { name: '调查员', from: '天真助理', to: '清醒报信者' },
        { name: '埃伦娜', from: '冷静学者', mid: '动摇', to: '殉道者' },
      ],
      causalLinks: [
        { fromNodeId: 'n1', toNodeId: 'n2', hookHint: '翻读队长遗物' },
      ],
    };
    useAnchorStore.getState().replaceAll(a);
    useAnchorStore.getState().setLastCausalEcho('上回合调查员翻箱 → 本回合可推动【发现遗骸】');

    const txt = useAnchorStore.getState().buildContextInjection(['到了基地','整理装备']);

    expect(txt).toMatch(/本局主题/);
    expect(txt).toMatch(/在不可名状面前,选择尊严。/);
    expect(txt).toMatch(/必经骨架节点/);
    expect(txt).toMatch(/抵达极地/);
    expect(txt).toMatch(/↓ 翻读队长遗物/);
    expect(txt).toMatch(/角色弧目标/);
    expect(txt).toMatch(/调查员:天真助理 → 清醒报信者/);
    expect(txt).toMatch(/埃伦娜:冷静学者 → 殉道者/);
    expect(txt).toMatch(/中段:动摇/);
    expect(txt).toMatch(/已发生事件时间线/);
    expect(txt).toMatch(/全局硬约束/);
    expect(txt).toMatch(/KP 视角世界硬事实/);
    expect(txt).toMatch(/极地有遗迹/);
    expect(txt).toMatch(/上回合因果回响/);
    expect(txt).toMatch(/上回合调查员翻箱/);
    expect(txt).toMatch(/威胁达成坏结局所依赖之物/);
  });

  it('字段缺失整节静默降级,不产生空标题行', () => {
    const a: PlotAnchors = {
      nodes: [{ id: 'n1', title: 'X', description: 'd' }],
      constraints: [],
      threatDependencies: [],
      // 不传 theme/worldFacts/characterArcs/causalLinks
    };
    useAnchorStore.getState().replaceAll(a);
    const txt = useAnchorStore.getState().buildContextInjection([]);

    expect(txt).not.toMatch(/本局主题/);
    expect(txt).not.toMatch(/角色弧目标/);
    expect(txt).not.toMatch(/KP 视角世界硬事实/);
    expect(txt).not.toMatch(/上回合因果回响/);
    expect(txt).not.toMatch(/全局硬约束/);
    expect(txt).not.toMatch(/威胁达成坏结局/);
    expect(txt).not.toMatch(/已发生事件时间线/);
    // 但必经骨架节点 + 推进要求恒出
    expect(txt).toMatch(/必经骨架节点/);
    expect(txt).toMatch(/推进要求/);
  });

  it('nodes 空时返回空串', () => {
    expect(useAnchorStore.getState().buildContextInjection(['x'])).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/stores/__tests__/useAnchorStore.test.ts --reporter=verbose`
Expected: FAIL — buildContextInjection 还是旧实现，未产出新节。

- [ ] **Step 3: 改 `buildContextInjection` 为 8 节**

替换 `useAnchorStore` 中 `buildContextInjection` 实现为：

```ts
buildContextInjection: (recentSummaries) => {
  const { anchors, lastCausalEcho } = get();
  const { nodes, constraints, threatDependencies, theme, worldFacts, characterArcs, causalLinks } = anchors;
  if (nodes.length === 0) return '';

  const lines: string[] = ['[剧情骨架与进程 — 仅限守秘人参考，用于把控剧情走向，绝不可照搬进正文]'];

  // ① 本局主题
  if (theme) {
    lines.push('');
    lines.push('【本局主题】（隐性回响,不让 NPC 当讲道文）');
    lines.push(`  ${theme}`);
  }

  // ② 必经骨架节点 + 节点间因果钩子(若有)
  lines.push('');
  lines.push('【必经骨架节点(默认推进路线,按序)】');
  const linkByFrom = new Map<string, string>();
  if (causalLinks) for (const l of causalLinks) linkByFrom.set(l.fromNodeId, l.hookHint);
  nodes.forEach((n, i) => {
    lines.push(`  ${i + 1}. ${n.title} —— ${n.description}`);
    const hook = linkByFrom.get(n.id);
    if (hook && i < nodes.length - 1) lines.push(`  ↓ ${hook}`);
  });

  // ③ 角色弧目标
  if (characterArcs && characterArcs.length > 0) {
    lines.push('');
    lines.push('【角色弧目标(KP 让角色长期朝终态收束,不强求每回合可见进度)】');
    for (const arc of characterArcs) {
      lines.push(`  · ${arc.name}:${arc.from} → ${arc.to}`);
      if (arc.mid) lines.push(`    (中段:${arc.mid})`);
    }
  }

  // ④ 已发生事件时间线
  if (recentSummaries.length > 0) {
    lines.push('');
    lines.push('【已发生事件时间线(旧→新;严禁重复以下场景/对话/事件)】');
    recentSummaries.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  }

  // ⑤ 全局硬约束
  if (constraints.length > 0) {
    lines.push('');
    lines.push('【全局硬约束(按默认推进时遵守,不凌驾合法整活胜利)】');
    for (const c of constraints) lines.push(`  · ${c}`);
  }

  // ⑥ KP 视角世界硬事实
  if (worldFacts && worldFacts.length > 0) {
    lines.push('');
    lines.push('【KP 视角世界硬事实(玩家未必发现,但据此判定一切合理性)】');
    for (const f of worldFacts) lines.push(`  · ${f}`);
  }

  // ⑦ 上回合因果回响
  if (lastCausalEcho) {
    lines.push('');
    lines.push('【上回合因果回响】');
    lines.push(`  ${lastCausalEcho}`);
  }

  // ⑧ 推进要求(恒出)
  lines.push('');
  lines.push('【推进要求】');
  lines.push('  参照已发生事件判断当前进度,让本回合 4 个行动选项中至少 1 个推动剧情朝「下一个尚未发生的骨架节点」前进;绝不重复已发生事件、场景或对话。');

  // 威胁达成坏结局所依赖之物 + 开放式胜利
  if (threatDependencies.length > 0) {
    lines.push('');
    lines.push('【威胁达成坏结局所依赖之物(玩家可瓦解的关键靶子)】');
    for (const d of threatDependencies) lines.push(`  · ${d}`);
    lines.push('  开放式胜利:玩家若用逻辑自洽的手段真正移除上述关键依赖,则暗线再无法逼近坏结局——此时你可跳过剩余骨架节点,用 1-2 回合收尾叙事直接导向好结局(剧情.阶段 可推进至「高潮」「结局」)。不得因「玩家没按剧本正面对决」而拒绝或把玩家硬拉回;唯有没有真正瓦解任何依赖的无意义跑题,才用合理理由软性重定向回主线。');
  }

  return lines.join('\n');
},
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/stores/__tests__/useAnchorStore.test.ts --reporter=verbose`
Expected: PASS — 3 个 case 全过。

- [ ] **Step 5: 提交**

```bash
git add src/stores/useAnchorStore.ts src/stores/__tests__/useAnchorStore.test.ts
git commit -m "feat(useAnchorStore): buildContextInjection 改 8 节文案(主题/骨架+因果钩子/角色弧/时间线/约束/世界事实/回响/推进要求);字段缺失整节静默"
```

---

## Task 6: `causal-echo-extractor.ts` 解耦子调用

**Files:**
- Create: `src/sillytavern/causal-echo-extractor.ts`
- Test: `src/sillytavern/__tests__/causal-echo-extractor.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/sillytavern/__tests__/causal-echo-extractor.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractCausalEcho } from '../causal-echo-extractor';
import * as subagentCall from '../subagent-call';

describe('extractCausalEcho', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path:LLM 返回 { echo: "..." } 时透传', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '',
      parsed: { echo: '上回合翻箱 → 本回合发现遗骸' },
    } as any);
    const r = await extractCausalEcho({
      lastSummary: '调查员翻了队长的箱子',
      nextNodeTitle: '发现遗骸',
      apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
    });
    expect(r.echo).toBe('上回合翻箱 → 本回合发现遗骸');
  });

  it('parsed === null 时返回空串', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '',
      parsed: null,
    } as any);
    const r = await extractCausalEcho({
      lastSummary: 'x', nextNodeTitle: 'y',
      apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
    });
    expect(r.echo).toBe('');
  });

  it('网络/HTTP 错误时返回空串(永不 throw)', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockRejectedValue(new Error('boom'));
    const r = await extractCausalEcho({
      lastSummary: 'x', nextNodeTitle: 'y',
      apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
    });
    expect(r.echo).toBe('');
  });

  it('signal 已 aborted 时早退,不发请求', async () => {
    const spy = vi.spyOn(subagentCall, 'callDsSubagent');
    const ac = new AbortController(); ac.abort();
    const r = await extractCausalEcho({
      lastSummary: 'x', nextNodeTitle: 'y',
      apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
      signal: ac.signal,
    });
    expect(r.echo).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });

  it('lastSummary 空字符串时早退', async () => {
    const spy = vi.spyOn(subagentCall, 'callDsSubagent');
    const r = await extractCausalEcho({
      lastSummary: '   ', nextNodeTitle: 'y',
      apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
    });
    expect(r.echo).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/sillytavern/__tests__/causal-echo-extractor.test.ts --reporter=verbose`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 新建 `causal-echo-extractor.ts`**

创建 `src/sillytavern/causal-echo-extractor.ts`：

```ts
// 因果回响子调用(2026-06-09):
// 主 API done 之后跑一次,从「上回合 page.summary + 下一个未达成节点」抽 1 句因果回响,
// 写入 useAnchorStore.lastCausalEcho,下回合 buildContextInjection 注入。
//
// 设计要点(per spec 2026-06-09-plot-arc-causality-theme-design.md):
//  - 不入主 JSON(规避「主 JSON 加字段会截断末尾」)
//  - 静态 system prefix 前置(提示缓存命中)
//  - rpmLane='mvu'(与 prologue/outfit-extractor 共桶)
//  - 永不 throw,失败回退空串

import { callDsSubagent } from './subagent-call';

const SYSTEM_PROMPT = `你是 COC 守秘人的助手。给你「上回合发生的事」(summary)与「剧情下一个需推动的节点」(nextNode),请用 1 句话(中文,≤40字)描述:上回合玩家的哪个行动可以成为本回合推动该节点的「因」。不要重复 summary,只点出因果钩子。

严格返回 JSON: { "echo": "string" }
不得输出 JSON 之外的任何文本。`;

export interface CausalEchoRequest {
  /** 上一回合 page.summary。空 / 空白 → 早退。 */
  lastSummary: string;
  /** 当前最可能未达成的下一节点 title。 */
  nextNodeTitle: string;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  /** AbortSignal 透传;abort 时早退。 */
  signal?: AbortSignal;
}

export interface CausalEchoResult {
  /** 1 句话因果钩子;失败 / 空响应时为空串。 */
  echo: string;
}

const EMPTY: CausalEchoResult = { echo: '' };

export async function extractCausalEcho(req: CausalEchoRequest): Promise<CausalEchoResult> {
  if (req.signal?.aborted) return EMPTY;
  if (!req.lastSummary || !req.lastSummary.trim()) return EMPTY;
  if (!req.nextNodeTitle || !req.nextNodeTitle.trim()) return EMPTY;
  if (!req.apiBaseUrl || !req.apiKey || !req.model) return EMPTY;

  const user = `上回合发生:\n${req.lastSummary.trim()}\n\n下一个需推动的节点:\n${req.nextNodeTitle.trim()}\n\n请输出 1 句因果钩子。`;

  try {
    const resp = await callDsSubagent({
      apiBaseUrl: req.apiBaseUrl,
      apiKey: req.apiKey,
      model: req.model,
      signal: req.signal,
      temperature: 0.4,
      maxTokens: 20000,
      rpmLane: 'mvu',
      label: 'causal-echo',
      jsonObject: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    });

    const parsed = resp.parsed as { echo?: string } | null;
    if (!parsed) return EMPTY;
    const echo = typeof parsed.echo === 'string' ? parsed.echo.trim() : '';
    return { echo: echo.slice(0, 60) };
  } catch {
    return EMPTY;
  }
}
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/sillytavern/__tests__/causal-echo-extractor.test.ts --reporter=verbose`
Expected: PASS — 5 个 case 全过。

- [ ] **Step 5: 提交**

```bash
git add src/sillytavern/causal-echo-extractor.ts src/sillytavern/__tests__/causal-echo-extractor.test.ts
git commit -m "feat(causal-echo-extractor): 解耦子调用,从上回合 summary 抽 1 句因果回响;永不 throw"
```

---

## Task 7: `pickNextUnreachedNode` 纯函数 + 单测

**Files:**
- Modify: `src/hooks/useChatPipeline.ts`（顶端 helpers 区域，约 :135 上方）或抽到独立文件 — 推荐内联在 useChatPipeline.ts 顶部 helpers 区
- Test: `src/hooks/__tests__/pickNextUnreachedNode.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

创建 `src/hooks/__tests__/pickNextUnreachedNode.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { pickNextUnreachedNode } from '../pickNextUnreachedNode';
import type { AnchorNode } from '../../types';

const nodes: AnchorNode[] = [
  { id: 'n1', title: '抵达极地', description: '' },
  { id: 'n2', title: '发现遗骸', description: '' },
  { id: 'n3', title: '城下之诡', description: '' },
];

describe('pickNextUnreachedNode', () => {
  it('summaries 涵盖前 2 节点 title → 返回第 3 节点 title', () => {
    expect(pickNextUnreachedNode(nodes, [
      '调查员抵达极地基地,开始整理装备。',
      '挖出古老遗骸,惊觉文明的痕迹。',
    ])).toBe('城下之诡');
  });

  it('summaries 全未涵盖任何 title → 返回第 1 节点 title', () => {
    expect(pickNextUnreachedNode(nodes, ['毫无相关的内容'])).toBe('抵达极地');
  });

  it('summaries 涵盖全部节点 title → 返回最后一节点 title(防 undefined)', () => {
    expect(pickNextUnreachedNode(nodes, [
      '抵达极地','发现遗骸','城下之诡里玩家踏入',
    ])).toBe('城下之诡');
  });

  it('nodes 为空 → 返回空串', () => {
    expect(pickNextUnreachedNode([], ['x'])).toBe('');
  });

  it('summaries 涵盖中间节点不涵盖第一节点 → 仍返回第一节点(顺序优先)', () => {
    expect(pickNextUnreachedNode(nodes, ['发现遗骸'])).toBe('抵达极地');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/hooks/__tests__/pickNextUnreachedNode.test.ts --reporter=verbose`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `pickNextUnreachedNode`**

创建 `src/hooks/pickNextUnreachedNode.ts`：

```ts
import type { AnchorNode } from '../types';

/** 按顺序找第一个 title 在所有 recentSummaries 里都没出现过的节点,返回它的 title。
 *  全部已涵盖 → 返回最后一节点 title(防 LLM 拿到空串);nodes 空 → 返回 ''。
 *  纯函数,无 store/网络依赖,可独立单测。 */
export function pickNextUnreachedNode(nodes: AnchorNode[], recentSummaries: string[]): string {
  if (nodes.length === 0) return '';
  const joined = recentSummaries.join('\n');
  for (const n of nodes) {
    if (!joined.includes(n.title)) return n.title;
  }
  return nodes[nodes.length - 1].title;
}
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/hooks/__tests__/pickNextUnreachedNode.test.ts --reporter=verbose`
Expected: PASS — 5 个 case 全过。

- [ ] **Step 5: 提交**

```bash
git add src/hooks/pickNextUnreachedNode.ts src/hooks/__tests__/pickNextUnreachedNode.test.ts
git commit -m "feat(pickNextUnreachedNode): 纯函数选下一个未达成节点 title(供 causal-echo-extractor 用)"
```

---

## Task 8: `useChatPipeline.ts` 钩入 causal-echo-extractor

**Files:**
- Modify: `src/hooks/useChatPipeline.ts`（导入区 + 主 API done 之后的 fire-and-forget 块附近，参考既有 prologue-megaagent 触发块约 :1787-1842）

> ⚠️ 这是 2000+ 行大文件，按记忆 `workflow-subagent-edit-large-files` 不要交给并行子代理盲改。本 Task 由你（主控）亲自 Edit。

- [ ] **Step 1: 添加 import**

定位 `src/hooks/useChatPipeline.ts` 导入区（约 :20 附近现有 `import { runPrologueMegaAgent }`），追加：

```ts
import { extractCausalEcho } from '../sillytavern/causal-echo-extractor';
import { pickNextUnreachedNode } from './pickNextUnreachedNode';
```

- [ ] **Step 2: 在现有 prologue-megaagent 触发块后挂入 causal-echo fire-and-forget**

定位现有 prologue-megaagent 触发块尾 `}` (约 :1842)，**之后**插入新块。新块走「anchors 已存在 + newPage.summary 非空 → fire-and-forget」逻辑：

```ts
// 因果回响:本回合主 API 已落,且 anchors 存在 → 从 newPage.summary + 下一未达成节点
// 抽 1 句因果钩子,写 useAnchorStore.lastCausalEcho,下回合 buildContextInjection 注入。
// fire-and-forget;extractor 永不 throw,失败 echo 为空串。
{
  const anchorsNow = useAnchorStore.getState().anchors;
  const lastSummary = (newPage.summary ?? '').trim();
  if (anchorsNow.nodes.length > 0 && lastSummary) {
    const recentSummariesCE = useBookStore.getState().pages
      .slice(-12)
      .map((p) => p.summary)
      .filter((s): s is string => !!s && s.trim().length > 0);
    const nextTitle = pickNextUnreachedNode(anchorsNow.nodes, recentSummariesCE);
    if (nextTitle) {
      const eff = settings.getEffectiveMvuApi();
      const aidCE = useChatStore.getState().activeId;
      void extractCausalEcho({
        lastSummary,
        nextNodeTitle: nextTitle,
        apiBaseUrl: eff.baseUrl,
        apiKey: eff.apiKey,
        model: eff.model,
        signal: controller.signal,
      }).then(({ echo }) => {
        if (useChatStore.getState().activeId !== aidCE) return;
        if (echo) {
          useAnchorStore.getState().setLastCausalEcho(echo);
          pushLog('debug', `[因果回响] ${echo}`, 'system');
          if (aidCE) void saveConversation(aidCE);
        }
      });
    }
  }
}
```

> 注意：使用 `useBookStore` / `useChatStore` / `useAnchorStore` 都已在文件顶部 import；`settings` 已在 useChatPipeline 闭包内拿到（参见 prologue 触发块同样用 `settings.getEffectiveMvuApi()`）。`controller` 是该 pipeline 局部 AbortController（与 prologue 块同名同源）。`pushLog` 已 import。

- [ ] **Step 3: 类型检查 + 既有测试不破**

Run: `npx tsc --noEmit && npx vitest run --reporter=verbose`
Expected: tsc 无错;现有测试不退化。

- [ ] **Step 4: 提交**

```bash
git add src/hooks/useChatPipeline.ts
git commit -m "feat(useChatPipeline): 主 API done 后 fire-and-forget 跑 causal-echo-extractor,写 useAnchorStore.lastCausalEcho"
```

---

## Task 9: 数据库 V10 升级

**Files:**
- Modify: `src/db/database.ts`

> ⚠️ 本 Task 同时为 outfit-image-injection plan 承担 V10 升级 — outfit plan 不再 bump version，只确保字段写入逻辑兼容老存档。

- [ ] **Step 1: 加 V10_SCHEMA + version 声明**

定位 `src/db/database.ts` V9 声明（约 :230-235），之后追加 V10：

```ts
db.version(9).stores(V9_SCHEMA);

/** v10: 剧情骨架升级(theme/worldFacts/characterArcs/causalLinks) + 装束-生图对齐(NpcProfile.outfit / CharacterSheet.outfit)。
 *  两个新增都不改 store 索引(都是值结构内字段新增),只 bump 让老 store recreate。 */
export const V10_SCHEMA = {
  ...V9_SCHEMA,
  // 无 store 索引变更
} as const;

db.version(10).stores(V10_SCHEMA);
```

- [ ] **Step 2: 验证 db 编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/db/database.ts
git commit -m "feat(db): bump to V10(剧情骨架新字段 + 装束字段;两个 plan 共享)"
```

---

## Task 10: 集成验证

**Files:** 无（仅运行验证）

- [ ] **Step 1: 全量测试**

Run: `npx vitest run --reporter=verbose`
Expected: 全部 PASS — 本 plan 加的 4 个测试文件全过；既有测试不退化。

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

UI 端验证（用户自测）：开新一局，触发首回合后看 `[综合 B·剧情锚点]` 与（如启用 debugLog）`[因果回响]` 日志；下回合查看 system prompt 注入文本含 8 节。

---

## 与 outfit-image-injection plan 的耦合

- **db V10 由本 plan 创建**(Task 9)。outfit plan 不再 bump 版本,只在 NpcProfile / CharacterSheet 加字段。
- 两份 plan 改的代码路径几乎不重叠(本 plan 改 anchors store / prologue megaagent / causal-echo / pickNextUnreached / useChatPipeline 一条触发块;outfit plan 改 npc store / sheet store / image-prompt 一组 + useChatPipeline 另一条触发块)。
- 实施时可两 plan 完全并行,本 plan 的 Task 9 先做即可(outfit plan 跳过 V10 Task,直接 patch 字段)。
