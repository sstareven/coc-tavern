# 剧情骨架与约束（剧情锚点 + 不重复）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 开局独立生成本局「剧情蓝图」（有序骨架节点 + 全局硬约束 + 威胁可瓦解依赖），每主回合注入「剧情骨架与进程」让 KP 防剧情乱跑、不重复已发生剧情、并认可逻辑自洽的整活胜利（可提前结局）。

**Architecture:** 完全照搬现有「坏结局/真相支柱」范式——独立 LLM 生成器（仿 `bad-ending-generator.ts`）+ 单行/会话 store（仿 `useKeyClueStore.ts`）+ 单行表（仿 `keyClues`，db v9）+ `sessionLifecycle` 四处隔离接线 + 运行期 constant LoreEntry 注入（仿暗线桶）。不动主 JSON 格式（防截断），不新增「已发生事件」存储（复用 `page.summary`）。

**Tech Stack:** React + TypeScript + Zustand + Dexie(IndexedDB) + Vitest。

设计依据：`docs/superpowers/specs/2026-06-04-plot-anchors-no-repeat-design.md`。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/types/index.ts` | `AnchorNode` / `PlotAnchors` 类型 | 修改（追加） |
| `src/stores/useAnchorStore.ts` | 锚点 store（setAnchors 幂等/replaceAll/clearAll/buildContextInjection） | 新建 |
| `src/stores/useAnchorStore.test.ts` | store 单测 | 新建 |
| `src/sillytavern/anchor-generator.ts` | `generateAnchors` 独立 LLM 生成器 | 新建 |
| `src/sillytavern/anchor-generator.test.ts` | 生成器解析单测（mock fetch） | 新建 |
| `src/db/database.ts` | `PlotAnchorRow` + db 声明 + V9_SCHEMA + version(9) | 修改 |
| `src/stores/sessionLifecycle.ts` | 会话隔离四处（clear/save/load/delete）+ 事务表名数组 | 修改 |
| `src/stores/sessionLifecycle.test.ts` | 跨档隔离 + 往返恢复用例 | 修改（追加） |
| `src/sillytavern/rewrite-lite.ts` | `LoreBuckets.anchor` + select/dropped 登记 | 修改 |
| `src/sillytavern/rewrite-lite.test.ts` | anchor 桶非 lite 含、lite 丢弃 | 修改（追加） |
| `src/hooks/useChatPipeline.ts` | 注入 anchorBucket + loreBuckets.anchor；fire-and-forget 生成触发块 | 修改（大文件，谨慎） |

> ⚠️ `useChatPipeline.ts` 是 1400+ 行大文件，两处改动（注入 + 生成触发）必须由主控亲自精确 Edit，不要交给并行子代理盲改（见 MEMORY `workflow-subagent-edit-large-files`）。

---

## Task 1: 类型 `AnchorNode` / `PlotAnchors`

**Files:**
- Modify: `src/types/index.ts`（在 `KeyPillar` 接口附近，约 :207-217 之后追加）

- [ ] **Step 1: 追加类型定义**

在 `src/types/index.ts` 的 `KeyPillar` 接口定义之后追加：

```ts
/** 剧情锚点：开局生成的一个「必达节点」（默认推进路线上的里程碑）。 */
export interface AnchorNode {
  id: string;
  title: string;        // 简短节点名，如「抵达极地死城」
  description: string;  // 1-2 句：该节点剧情应发生什么
}

/** 本局剧情蓝图：开局一次生成、整局固定（单行/会话）。 */
export interface PlotAnchors {
  /** 3-6 个有序必达节点（默认推进路线）。 */
  nodes: AnchorNode[];
  /** 3-5 条全局硬约束（地理/因果保证）。 */
  constraints: string[];
  /** 威胁达成坏结局所依赖之物（= 玩家可逻辑性瓦解的关键靶子）。 */
  threatDependencies: string[];
}
```

- [ ] **Step 2: 类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无错误（仅新增类型，无引用）。

- [ ] **Step 3: 提交**

```bash
git add src/types/index.ts
git commit -m "feat(类型): 新增剧情锚点 AnchorNode/PlotAnchors"
```

---

## Task 2: `useAnchorStore`（store + buildContextInjection）

**Files:**
- Create: `src/stores/useAnchorStore.ts`
- Test: `src/stores/useAnchorStore.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/stores/useAnchorStore.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnchorStore } from './useAnchorStore';
import type { PlotAnchors } from '../types';

const sample: PlotAnchors = {
  nodes: [
    { id: 'n1', title: '接受邀约', description: '调查员接下极地探险的委托' },
    { id: 'n2', title: '抵达极地死城', description: '穿越冰原，抵达远古者死城' },
  ],
  constraints: ['暗线威胁必在极地爆发', '核心场景在极地，不在出发港'],
  threatDependencies: ['探险队的补给与船只', '唤醒仪式所需的化石样本'],
};

describe('useAnchorStore', () => {
  beforeEach(() => useAnchorStore.getState().clearAll());

  it('setAnchors 幂等：已有节点时第二次写入被忽略', () => {
    useAnchorStore.getState().setAnchors(sample);
    useAnchorStore.getState().setAnchors({ nodes: [{ id: 'x', title: 'X', description: 'x' }], constraints: [], threatDependencies: [] });
    expect(useAnchorStore.getState().anchors.nodes).toHaveLength(2);
    expect(useAnchorStore.getState().anchors.nodes[0].id).toBe('n1');
  });

  it('clearAll 清空、replaceAll 整体替换（读档）', () => {
    useAnchorStore.getState().setAnchors(sample);
    useAnchorStore.getState().clearAll();
    expect(useAnchorStore.getState().anchors.nodes).toHaveLength(0);
    useAnchorStore.getState().replaceAll(sample);
    expect(useAnchorStore.getState().anchors.constraints).toHaveLength(2);
  });

  it('buildContextInjection：无节点返回空串', () => {
    expect(useAnchorStore.getState().buildContextInjection(['某事件'])).toBe('');
  });

  it('buildContextInjection：含节点/约束/依赖/事件时间线/关键指令', () => {
    useAnchorStore.getState().setAnchors(sample);
    const txt = useAnchorStore.getState().buildContextInjection(['玩家在港口登船', '航行中遭遇风暴']);
    expect(txt).toContain('抵达极地死城');
    expect(txt).toContain('暗线威胁必在极地爆发');
    expect(txt).toContain('唤醒仪式所需的化石样本');
    expect(txt).toContain('航行中遭遇风暴');
    expect(txt).toContain('开放式胜利');
    expect(txt).toContain('绝不重复');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/stores/useAnchorStore.test.ts`
Expected: FAIL（`useAnchorStore` 模块不存在）。

- [ ] **Step 3: 实现 store**

创建 `src/stores/useAnchorStore.ts`：

```ts
import { create } from 'zustand';
import type { PlotAnchors } from '../types';

const EMPTY: PlotAnchors = { nodes: [], constraints: [], threatDependencies: [] };

interface AnchorStore {
  /** 本局剧情蓝图；未生成时 nodes 为空数组。 */
  anchors: PlotAnchors;
  /** 写入蓝图——仅当当前 nodes 为空时生效（幂等防重复生成覆盖）。 */
  setAnchors: (a: PlotAnchors) => void;
  /** 读档恢复：整体替换。 */
  replaceAll: (a: PlotAnchors) => void;
  /** 清空（会话隔离）。 */
  clearAll: () => void;
  /**
   * 构造守秘人视角「剧情骨架与进程」注入文本；nodes 为空返回 ''。
   * @param recentSummaries 最近若干页的 page.summary（事件时间线，旧→新），由调用方现算传入。
   */
  buildContextInjection: (recentSummaries: string[]) => string;
}

export const useAnchorStore = create<AnchorStore>()((set, get) => ({
  anchors: EMPTY,

  setAnchors: (a) => {
    if (get().anchors.nodes.length !== 0) return; // 幂等防覆盖
    set({ anchors: { nodes: a.nodes.map((n) => ({ ...n })), constraints: [...a.constraints], threatDependencies: [...a.threatDependencies] } });
  },

  replaceAll: (a) =>
    set({ anchors: { nodes: a.nodes.map((n) => ({ ...n })), constraints: [...a.constraints], threatDependencies: [...a.threatDependencies] } }),

  clearAll: () => set({ anchors: EMPTY }),

  buildContextInjection: (recentSummaries) => {
    const { nodes, constraints, threatDependencies } = get().anchors;
    if (nodes.length === 0) return '';
    const lines: string[] = ['[剧情骨架与进程 — 仅限守秘人参考，用于把控剧情走向，绝不可照搬进正文]'];
    lines.push('本局必经骨架节点（默认推进路线，按序）：');
    nodes.forEach((n, i) => lines.push(`  ${i + 1}. ${n.title} —— ${n.description}`));
    if (constraints.length) {
      lines.push('全局硬约束（若剧情按默认推进则须遵守；不凌驾于玩家合法的整活胜利之上）：');
      for (const c of constraints) lines.push(`  · ${c}`);
    }
    if (recentSummaries.length) {
      lines.push('已发生事件时间线（旧→新；严禁重复以下已发生过的事件/场景/对话）：');
      recentSummaries.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    }
    lines.push('推进要求：参照已发生事件判断当前进度，让本回合 4 个行动选项中至少 1 个推动剧情朝「下一个尚未发生的骨架节点」前进；绝不重复已发生过的事件、场景或对话。');
    if (threatDependencies.length) {
      lines.push('威胁达成坏结局所依赖之物（玩家可瓦解的关键靶子）：');
      for (const d of threatDependencies) lines.push(`  · ${d}`);
      lines.push('开放式胜利：玩家若用逻辑自洽的手段真正移除上述关键依赖，则暗线再无法逼近坏结局——此时你可跳过剩余骨架节点，用 1-2 回合收尾叙事直接导向好结局（剧情.阶段 可推进至「高潮」「结局」）。不得因「玩家没按剧本正面对决」而拒绝或把玩家硬拉回；唯有没有真正瓦解任何依赖的无意义跑题，才用合理理由软性重定向回主线。');
    }
    return lines.join('\n');
  },
}));
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/stores/useAnchorStore.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 提交**

```bash
git add src/stores/useAnchorStore.ts src/stores/useAnchorStore.test.ts
git commit -m "feat(锚点): useAnchorStore（幂等setAnchors/replaceAll/clearAll/buildContextInjection）"
```

---

## Task 3: `anchor-generator.ts`（独立 LLM 生成器）

**Files:**
- Create: `src/sillytavern/anchor-generator.ts`
- Test: `src/sillytavern/anchor-generator.test.ts`

- [ ] **Step 1: 写失败测试（mock fetch）**

创建 `src/sillytavern/anchor-generator.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAnchors } from './anchor-generator';

function mockChatResponse(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }], usage: {} }) };
}

afterEach(() => vi.unstubAllGlobals());

describe('generateAnchors', () => {
  it('解析合法 JSON → PlotAnchors（补全 node id）', async () => {
    const json = JSON.stringify({
      nodes: [{ title: '接受邀约', description: '接下委托' }, { title: '抵达极地', description: '到达死城' }],
      constraints: ['威胁在极地爆发'],
      threatDependencies: ['船只补给'],
    });
    vi.stubGlobal('fetch', vi.fn(async () => mockChatResponse(json)));
    const r = await generateAnchors('开场', '坏结局', [{ title: '真相', secret: 's' }], 'http://x', 'k', 'm');
    expect(r).not.toBeNull();
    expect(r!.nodes).toHaveLength(2);
    expect(r!.nodes[0].id).toBeTruthy();
    expect(r!.constraints).toContain('威胁在极地爆发');
    expect(r!.threatDependencies).toContain('船只补给');
  });

  it('无效内容且重试用尽 → 返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockChatResponse('这不是JSON')));
    const r = await generateAnchors('开场', '坏结局', [], 'http://x', 'k', 'm', undefined, 0.9, 20000, 2);
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/sillytavern/anchor-generator.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现生成器**

创建 `src/sillytavern/anchor-generator.ts`（结构镜像 `bad-ending-generator.ts:40-96`，新增 `signal` 透传，仿 `dark-thread-generator.ts`）：

```ts
import { rpmAcquire } from './rpm-limiter';
import { appIdHeaders } from './api-router';
import { coerceJsonObject } from './llm-response-parser';
import type { PlotAnchors } from '../types';

/**
 * 开局「剧情蓝图」生成提示词：据开场情境 + 已生成的坏结局/真相支柱，产出本局必经骨架节点 +
 * 全局硬约束 + 威胁可瓦解依赖。内嵌 5 个开局母题「规律模板」——只在此生成阶段使用，运行期绝不注入。
 */
const ANCHOR_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人，正在为本局编排「剧情骨架」。下面给出开场情境、本局注定的坏结局（守秘人机密）、以及 3 个真相支柱（守秘人机密）。请据此产出本局的剧情蓝图，让剧情既不漫无目的地乱跑，又能容纳玩家的合理创意。

请先判断本局最贴近以下哪种开局母题，按其「规律」编排骨架（也可融合）：
1. 禁书诅咒型（导师急信/密大残籍）：单点深挖、解谜驱动、阅读禁书伴随理智流失；骨架围绕同一核心场景层层揭密。
2. 封闭敌镇型（海风遗产/印斯茅斯）：敌意小镇、时限压迫（如天黑/末班车）、全镇合谋；骨架=入镇→探秘→暴露血统/真相→逃出或反抗。
3. 不可见威胁型（山丘委托/敦威治）：乡村孤立、威胁初期不可见只由环境异变间接呈现、家族秘密；骨架=入村→揭异常→威胁显形→反制仪式。
4. 线性探险型（极地邀约/疯狂山脉）：地理纵深、场景线性递进不可跳跃、真相是衰落文明而非小镇人心；骨架=起疑→抵达目的地→深入→撤离/封存。
5. 多线收束型（镇上异变/阿卡姆）：开放主场、多条怪事并行、调查员是本地人；骨架=多线并起→串联→指向同一真相核心→阻止。

要求：
1. nodes：产出 3-6 个【有序】必经节点，每个含 title（简短节点名）与 description（1-2 句该节点应发生什么）。节点应与坏结局、3 真相支柱连贯（节点推进 ≈ 逐步逼近真相）。
2. constraints：3-5 条全局硬约束——「若剧情按默认推进」须遵守的地理/因果保证（如「暗线威胁必在极地爆发」「核心场景在极地不在出发港」）。
3. threatDependencies：列出威胁要达成上述坏结局所【依赖】之物（资金、法器、信众集结、秘密性、某关键人物、补给、仪式材料等）——这是玩家日后可用合理手段瓦解的关键靶子。

只输出严格 JSON，不要任何额外文字、解释或代码围栏：
{
  "nodes": [ {"title": "……", "description": "……"} ],
  "constraints": ["……"],
  "threatDependencies": ["……"]
}`;

export async function generateAnchors(
  openingCtx: string,
  badEnding: string,
  pillars: { title: string; secret: string }[],
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
  temperature = 0.9,
  maxTokens = 20000, // 思考型模型防截断（项目硬下限 ≥20000）
  retries = 3,
): Promise<PlotAnchors | null> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  const pillarText = pillars.length
    ? pillars.map((p, i) => `${i + 1}. ${p.title}：${p.secret}`).join('\n')
    : '（暂无）';
  const userContent = `开场情境：\n${openingCtx}\n\n本局注定的坏结局（机密）：${badEnding || '（暂无）'}\n\n3 真相支柱（机密）：\n${pillarText}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    if (signal?.aborted) return null;
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    await rpmAcquire('main');
    if (signal?.aborted) return null;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...appIdHeaders() },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: ANCHOR_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      signal,
    });

    if (!response.ok) throw new Error(`剧情锚点生成 API 错误 ${response.status}`);

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content ?? '';
    const { parsed } = coerceJsonObject(content);
    const pObj = parsed as Record<string, unknown> | null;
    if (pObj) {
      const rawNodes = Array.isArray(pObj.nodes) ? (pObj.nodes as Record<string, unknown>[]) : [];
      const nodes = rawNodes
        .filter((x) => x && (typeof x.title === 'string' || typeof x.description === 'string'))
        .map((x) => ({
          id: crypto.randomUUID(),
          title: typeof x.title === 'string' && x.title.trim() ? x.title.trim() : '节点',
          description: typeof x.description === 'string' ? x.description.trim() : '',
        }))
        .slice(0, 6);
      const constraints = (Array.isArray(pObj.constraints) ? pObj.constraints : [])
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        .map((c) => c.trim())
        .slice(0, 5);
      const threatDependencies = (Array.isArray(pObj.threatDependencies) ? pObj.threatDependencies : [])
        .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
        .map((d) => d.trim())
        .slice(0, 8);
      if (nodes.length > 0) return { nodes, constraints, threatDependencies };
    }
    // parsed 为 null 或无有效 nodes → 继续重试。
  }
  return null;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/sillytavern/anchor-generator.test.ts`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 提交**

```bash
git add src/sillytavern/anchor-generator.ts src/sillytavern/anchor-generator.test.ts
git commit -m "feat(锚点): anchor-generator 独立生成器（内嵌5开局母题规律模板，输出骨架/约束/威胁依赖）"
```

---

## Task 4: 数据库 v9（`plotAnchors` 单行表）

**Files:**
- Modify: `src/db/database.ts`

- [ ] **Step 1: 加 Row 类型 + import**

在 `src/db/database.ts` 顶部 import 区确认/追加 `PlotAnchors` 类型 import（与 `KeyPillar`/`BadEnding` 同来源 `../types`）。在 `KeyClueRow`（:91-95）之后追加：

```ts
// 本局剧情蓝图（骨架+约束+威胁依赖），一行/会话（守秘人机密，开局生成）。
export interface PlotAnchorRow {
  conversationId: string;
  anchors: PlotAnchors;
}
```

- [ ] **Step 2: db 类型声明加表**

在 `db` 声明（:97-114）的 `keyClues: EntityTable<KeyClueRow, 'conversationId'>;` 之后追加：

```ts
  plotAnchors: EntityTable<PlotAnchorRow, 'conversationId'>;
```

- [ ] **Step 3: 加 V9_SCHEMA + version(9)**

在 `db.version(8).stores(V8_SCHEMA);`（:183）之后追加：

```ts
/** v9: 新增「剧情锚点」单行表（一行/会话，无数据迁移）。 */
export const V9_SCHEMA = {
  ...V8_SCHEMA,
  plotAnchors: '&conversationId',
} as const;

db.version(9).stores(V9_SCHEMA);
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/db/database.ts
git commit -m "feat(db): v9 新增 plotAnchors 单行表"
```

---

## Task 5: `sessionLifecycle` 会话隔离四处接线

**Files:**
- Modify: `src/stores/sessionLifecycle.ts`
- Test: `src/stores/sessionLifecycle.test.ts`

> 五处事务表名数组（:187 save / :277 load / :411 delete）都要追加 `'plotAnchors'`，否则事务内访问该表抛 `NotFoundError`。

- [ ] **Step 1: 写失败测试（跨档隔离 + 往返）**

在 `src/stores/sessionLifecycle.test.ts` 顶部 import 区加 `import { useAnchorStore } from './useAnchorStore';`，并在「开新游戏的跨存档隔离」describe（约 :263）内追加用例（仿暗线隔离 :280-297）：

```ts
it('正玩存档A时开新游戏B：B不继承A的剧情锚点；切回A可恢复', async () => {
  const a = await startNewConversation('A');
  useAnchorStore.getState().setAnchors({
    nodes: [{ id: 'n1', title: '抵达极地', description: '到达死城' }],
    constraints: ['威胁在极地爆发'],
    threatDependencies: ['船只补给'],
  });
  await saveConversation(a);

  const b = await startNewConversation('B');
  expect(useAnchorStore.getState().anchors.nodes).toHaveLength(0); // B 不继承
  expect(await db.plotAnchors.get(b)).toBeUndefined();

  await switchConversation(a); // 切回 A 恢复
  expect(useAnchorStore.getState().anchors.nodes).toHaveLength(1);
  expect(useAnchorStore.getState().anchors.constraints).toContain('威胁在极地爆发');
});
```

（若该测试文件已 import 了 `db`/`startNewConversation`/`saveConversation`/`switchConversation`，复用现有 import；并在文件顶部 beforeEach 的 `clearAll` 批量里加 `useAnchorStore.getState().clearAll()`，与 `db.darkThreads.clear()` 等同列，确保用例间不串。）

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/stores/sessionLifecycle.test.ts`
Expected: FAIL（B 继承了 A 的锚点 / plotAnchors 表未接线）。

- [ ] **Step 3: clear 接线**

在 `clearAllGameState`（:43-65）内 `useKeyClueStore.getState().clearAll();`（:57）之后追加：

```ts
  useAnchorStore.getState().clearAll();
```

并在文件顶部确认 `import { useAnchorStore } from './useAnchorStore';`。

- [ ] **Step 4: save 接线**

(a) 读态：在 `const keyClueState = useKeyClueStore.getState();`（:143）之后追加：

```ts
  const anchorState = useAnchorStore.getState();
```

(b) 事务表名数组（:187）在 `'keyClues',` 后追加 `'plotAnchors',`。

(c) 写入：在 keyClues 的 put/delete 块（:230-235）之后追加（仿同范式）：

```ts
      // 剧情锚点（单行/会话）：有节点则 put，无则删残留行。
      if (anchorState.anchors.nodes.length > 0) {
        await db.plotAnchors.put({ conversationId: cid, anchors: anchorState.anchors });
      } else {
        await db.plotAnchors.delete(cid);
      }
```

- [ ] **Step 5: load 接线**

(a) 解构数组（:274）末尾加 `plotAnchorRow`：把 `..., keywordRows, gameVarRows, macroVarRows]` 改为在 `keyClueRow` 后插入 `plotAnchorRow`（保持与 Promise.all 顺序一致——见下）。

(b) 事务表名数组（:277）在 `'keyClues',` 后追加 `'plotAnchors',`。

(c) Promise.all（:289-290 区）在 `db.keyClues.get(cid),` 之后追加：

```ts
          db.plotAnchors.get(cid),
```

  ⚠️ 解构顺序与 Promise.all 顺序必须严格对应：在两处都把 `plotAnchors` 紧跟在 `keyClues` 之后插入。

(d) 恢复：在 `useKeyClueStore.getState().replaceAll(...)`（:345）之后追加：

```ts
  useAnchorStore.getState().replaceAll(plotAnchorRow?.anchors ?? { nodes: [], constraints: [], threatDependencies: [] });
```

- [ ] **Step 6: delete 接线**

(a) 事务表名数组（:411）在 `'keyClues',` 后追加 `'plotAnchors',`。

(b) 在 `await db.keyClues.delete(cid);`（:424）之后追加：

```ts
      await db.plotAnchors.delete(cid);
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run src/stores/sessionLifecycle.test.ts`
Expected: PASS（含新用例 + 既有全部）。

- [ ] **Step 8: 提交**

```bash
git add src/stores/sessionLifecycle.ts src/stores/sessionLifecycle.test.ts
git commit -m "feat(锚点): sessionLifecycle 四处接线 plotAnchors（clear/save/load/delete）+ 跨档隔离测试"
```

---

## Task 6: `rewrite-lite` 登记 anchor 桶

**Files:**
- Modify: `src/sillytavern/rewrite-lite.ts`
- Test: `src/sillytavern/rewrite-lite.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/sillytavern/rewrite-lite.test.ts` 的 `buckets()` 工厂（约 :16-26）里给返回对象加 `anchor: [mkEntry('锚点')]`（沿用该文件已有的造 LoreEntry 辅助；若辅助名不同则按其签名造一条 name 为「锚点」的 entry），并追加用例：

```ts
it('非 lite：包含 anchor 桶', () => {
  const out = selectLoreForRewrite(buckets(), { lite: false });
  expect(out.some((e) => e.name === '锚点')).toBe(true);
});

it('lite：丢弃 anchor 桶', () => {
  const out = selectLoreForRewrite(buckets(), { lite: true });
  expect(out.some((e) => e.name === '锚点')).toBe(false);
  expect(droppedLoreForRewrite(buckets(), { lite: true }).some((e) => e.name === '锚点')).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/sillytavern/rewrite-lite.test.ts`
Expected: FAIL（anchor 桶未被纳入/丢弃）。

- [ ] **Step 3: 实现——三处登记**

(a) `LoreBuckets` 接口（:18 `darkThread` 之后）加：

```ts
  /** 剧情骨架与进程注入（开局锚点+约束+已发生事件+软引导+开放式胜利判定）。可选，缺省视为空。 */
  anchor?: LoreEntry[];
```

(b) `selectLoreForRewrite` 非 lite 分支（:57-66）在 `...buckets.darkThread,` 之后加 `...(buckets.anchor ?? []),`。

(c) `droppedLoreForRewrite`（:81-88）在 `...buckets.darkThread,` 之后加 `...(buckets.anchor ?? []),`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/sillytavern/rewrite-lite.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sillytavern/rewrite-lite.ts src/sillytavern/rewrite-lite.test.ts
git commit -m "feat(锚点): rewrite-lite 登记 anchor 桶（非lite注入、lite补写丢弃）"
```

---

## Task 7: `useChatPipeline` 注入「剧情骨架与进程」

**Files:**
- Modify: `src/hooks/useChatPipeline.ts`（大文件，主控亲自精确 Edit）

> 顶部确认/追加 import：`import { useAnchorStore } from '../stores/useAnchorStore';`

- [ ] **Step 1: 构造 anchorBucket（紧跟暗线桶之后，约 :292 之后）**

在 darkThreadBucket 块（:277-292）之后、keywordBucket 块（:296）之前插入（**完全照搬暗线桶 LoreEntry 字段**）：

```ts
      // 剧情骨架与进程（开局锚点+硬约束+已发生事件时间线+软引导+开放式胜利判定）。
      // 像暗线一样常驻注入，补写 lite 模式由 selectLoreForRewrite 丢弃。事件时间线取最近 N 页 page.summary 现算。
      const anchorBucket: LoreEntry[] = [];
      const recentSummaries = useBookStore.getState().pages
        .slice(-12)
        .map((p) => p.summary)
        .filter((s): s is string => !!s && s.trim().length > 0);
      const anchorCtx = useAnchorStore.getState().buildContextInjection(recentSummaries);
      if (anchorCtx) {
        anchorBucket.push({
          name: '剧情骨架与进程', keys: '', content: anchorCtx,
          logic: 'AND_ANY', priority: 2, disabled: false,
          constant: true, position: 0, depth: 0, probability: 100,
          secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
          groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
          groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
          preventRecursion: false, delayUntilRecursion: false, excludeRecursion: false,
          ignoreReplyLimit: false,
          _source: 'global',
        } as LoreEntry);
      }
```

- [ ] **Step 2: 接进 loreBuckets（:361-370）**

在 `darkThread: darkThreadBucket,` 之后追加：

```ts
        anchor: anchorBucket,
```

- [ ] **Step 3: 类型检查 + 全量测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 无类型错误；测试全绿。

- [ ] **Step 4: 提交**

```bash
git add src/hooks/useChatPipeline.ts
git commit -m "feat(锚点): useChatPipeline 注入「剧情骨架与进程」constant LoreEntry（事件时间线取近12页summary）"
```

---

## Task 8: `useChatPipeline` 开局生成触发块

**Files:**
- Modify: `src/hooks/useChatPipeline.ts`（大文件，主控亲自精确 Edit）

> 顶部确认/追加 import：`import { generateAnchors } from '../sillytavern/anchor-generator';`
> 设计取舍：独立 fire-and-forget 块，**门控要求 badEnding 与 pillars 已存在**——首回合它们也在异步生成、可能尚未落地，则本回合跳过、下回合补生成（与坏结局「本局尚无→回合后补生成」一致）。

- [ ] **Step 1: 插入生成触发块（紧跟坏结局/支柱块之后，约 :1026 之后）**

在坏结局/支柱 fire-and-forget 块（:996-1026）之后插入：

```ts
        // 剧情锚点（守秘人机密，剧情蓝图）：本局尚无锚点、且坏结局+支柱已就绪 → 用【独立 LLM 调用】据情境生成。
        // 与主输出彻底解耦（绝不挤占主 JSON）；fire-and-forget + 会话守卫；后日谈不生成；需 API 齐全。
        // 首回合坏结局/支柱也在异步生成、可能尚未落地，则本回合跳过、下回合补生成。
        {
          const dtNow = useDarkThreadStore.getState().badEnding;
          const kcNow = useKeyClueStore.getState().pillars;
          if (useAnchorStore.getState().anchors.nodes.length === 0 && dtNow && kcNow.length > 0 && !isEpilogue
              && settings.apiKey?.trim() && settings.apiBaseUrl?.trim() && settings.apiModel?.trim()) {
            const aidAN = useChatStore.getState().activeId;
            const prologue = useBookStore.getState().pages[0];
            const opening = [prologue?.leftContent, newPage.leftContent].filter(Boolean).join('\n').slice(0, 1500);
            void (async () => {
              try {
                const anchors = await generateAnchors(
                  opening,
                  dtNow.description,
                  kcNow.map((p) => ({ title: p.title, secret: p.secret })),
                  settings.apiBaseUrl, settings.apiKey, settings.apiModel,
                  controller.signal,
                );
                if (!anchors || useChatStore.getState().activeId !== aidAN) return; // 失败或切档 → 放弃
                if (useAnchorStore.getState().anchors.nodes.length > 0) return; // 期间已生成 → 不覆盖
                useAnchorStore.getState().setAnchors(anchors);
                if (aidAN) await saveConversation(aidAN);
                pushLog('info', `[剧情锚点] 本局剧情蓝图已生成（守秘人机密）：${anchors.nodes.map((n) => n.title).join(' → ')}`, 'system');
              } catch (e) {
                if (controller.signal.aborted) return;
                pushLog('warn', `[剧情锚点] 生成失败：${e instanceof Error ? e.message : String(e)}`, 'api');
              }
            })();
          }
        }
```

- [ ] **Step 2: 类型检查 + 全量测试 + 构建**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: 全绿、构建成功。

- [ ] **Step 3: 提交**

```bash
git add src/hooks/useChatPipeline.ts
git commit -m "feat(锚点): useChatPipeline 开局后 fire-and-forget 生成剧情蓝图（坏结局+支柱就绪后触发，会话守卫）"
```

---

## Task 9: 终检与推送

- [ ] **Step 1: 全量验证**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: tsc 干净；vitest 全绿（含新增用例）；build 成功。

- [ ] **Step 2: ESLint 改动文件**

Run: `npx eslint src/stores/useAnchorStore.ts src/sillytavern/anchor-generator.ts src/db/database.ts src/stores/sessionLifecycle.ts src/sillytavern/rewrite-lite.ts src/hooks/useChatPipeline.ts`
Expected: 新增代码无新 error（既有基线 error 不在本次改动行则忽略）。

- [ ] **Step 3: 推送 beta**

```bash
git push origin beta
```

---

## Self-Review（覆盖核对，已在写作后自查）

- **Spec §4 数据结构** → Task 1 ✅
- **Spec §5 生成器 + 触发** → Task 3（生成器）+ Task 8（触发块，依赖 badEnding/pillars）✅
- **Spec §6 注入五段** → Task 2（buildContextInjection 五段）+ Task 7（接入桶）✅
- **Spec §7 不重复（page.summary 时间线）** → Task 7 Step 1（近 12 页 summary）+ Task 2 注入第 3 段 ✅
- **Spec §6 lite 丢弃** → Task 6 ✅
- **Spec §8 持久化/隔离（db v9 + store + 四处）** → Task 4 + Task 5 ✅
- **Spec §9 测试** → Task 2/3/5/6 各含单测 ✅
- **类型一致性**：`PlotAnchors{nodes,constraints,threatDependencies}`、`AnchorNode{id,title,description}`、`setAnchors/replaceAll/clearAll/buildContextInjection(recentSummaries)`、`generateAnchors(openingCtx,badEnding,pillars,base,key,model,signal?,temp?,maxTokens?,retries?)` —— 全文一致 ✅
- **无占位符**：每个 step 含完整代码/命令/期望 ✅
- **YAGNI**：未做节点 reached 追踪、选项级硬过滤、UI 面板（Spec §10）✅
