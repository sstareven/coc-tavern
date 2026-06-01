# NPC 记忆自我消化 + 线索演化归档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 NPC 互动记忆加「随回合 AI 折叠」的封顶+消化，给线索加「AI 显式声明演化+归档可回溯」，并让两者进入 LLM 上下文的体量有确定性上限。

**Architecture:** 纯前端（zustand store + 类型 + format-instruction 提示 + 两个面板 UI + 一个设置项）。记忆折叠复用每回合既有 LLM 调用：AI 在 `npcUpdates` 里给 `memorySummary`，store 据此把旧逐条记忆裁到最近 N 并保留梗概，另设硬上限兜底。线索演化由 AI 在新线索上声明 `evolvesFrom` 旧线索名，store 归档旧线索、上位新线索；上下文注入仅含 active 且封顶。全部非破坏性迁移（新字段可选，缺省按 active/无梗概处理）。

**Tech Stack:** TypeScript, React 19, zustand, vitest。

参考设计：`docs/superpowers/specs/2026-06-01-memory-digest-clue-evolution-design.md`

---

## File Structure

- `src/types/index.ts` — 扩展 `NpcProfile`/`NpcUpdate`/`Clue`/`ClueInput` 字段（可选，便于迁移）
- `src/stores/useSettingsStore.ts` — 新增 `npcMemoryKeep`
- `src/stores/useNpcStore.ts` — 记忆常量、折叠逻辑、注入提示
- `src/stores/useNpcStore.test.ts` — 折叠/兜底/注入测试（已存在，追加用例）
- `src/stores/useClueStore.ts` — 演化归档、注入过滤+封顶
- `src/stores/useClueStore.test.ts` — 新建，演化/注入/迁移测试
- `src/sillytavern/format-instruction.ts` — NPC `memorySummary` + 线索 `evolvesFrom` 协议说明
- `src/components/NPC/NpcOverlay.tsx` — 记忆梗概 + 最近 N 条展示
- `src/components/Inventory/InventoryPanel.tsx` — major 高亮 + 历史线索折叠区
- `src/components/Settings/SettingsPanel.tsx` — 「NPC 记忆保留条数」滑杆

---

## Task 1: 扩展类型定义

**Files:**
- Modify: `src/types/index.ts`（`ClueInput` 86-92；`Clue` 152-164；`NpcUpdate` 94-113；`NpcProfile` 210-211 附近）

- [ ] **Step 1: 给 `ClueInput` 增加 `evolvesFrom`**

将 86-92 行的接口改为：

```ts
export interface ClueInput {
  name: string;
  summary?: string;
  discoveryNarrative?: string;
  foundAtPage?: string;
  relatedTo?: string[];
  /** 演化：本条新线索由哪条已有线索（按名）升华而来；给出则系统归档旧线索 */
  evolvesFrom?: string;
}
```

- [ ] **Step 2: 给 `Clue` 增加演化/归档字段**

将 152-164 行的接口改为（在 `acquiredAt` 后追加四个可选字段，便于老存档迁移）：

```ts
export interface Clue {
  id: string;
  name: string;
  /** 一句话简述 */
  summary: string;
  /** 发现细节 —— 多句描述角色从中发现了什么蛛丝马迹 */
  discoveryNarrative: string;
  /** 在第几页/回合发现 */
  foundAtPage?: string;
  /** 关联的人/地/事关键词 */
  relatedTo?: string[];
  acquiredAt: number;
  /** 线索状态：active 显示并注入；archived 已演化、隐藏但保留可回溯。缺省视为 active */
  status?: 'active' | 'archived';
  /** 本线索由哪条线索演化而来（旧线索 id） */
  evolvedFrom?: string;
  /** 本线索（已归档）演化成了哪条新线索（新线索 id） */
  evolvedIntoId?: string;
  /** 显著程度：major 为演化出的更关键线索，UI 高亮、注入加★ */
  tier?: 'normal' | 'major';
}
```

- [ ] **Step 3: 给 `NpcUpdate` 增加 `memorySummary`**

在 107 行 `addMemory?: string;` 之后插入一行：

```ts
  addMemory?: string;
  /** 记忆梗概：AI 用 2-4 句浓缩此前关键互动；系统据此精简逐条旧记忆 */
  memorySummary?: string;
```

- [ ] **Step 4: 给 `NpcProfile` 增加 `memorySummary`**

在 211 行 `memories: string[];` 之后插入：

```ts
  memories: string[];
  /** 滚动「记忆梗概」：由 AI 折叠旧互动而成，配合 memories 的最近若干条一起展示/注入 */
  memorySummary?: string;
```

- [ ] **Step 5: 验证类型编译**

Run: `npx tsc -b`
Expected: EXIT 0（仅加可选字段，不应有错误）

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(类型): NPC memorySummary + 线索演化/归档字段"
```

---

## Task 2: 设置项 `npcMemoryKeep`

**Files:**
- Modify: `src/stores/useSettingsStore.ts`

- [ ] **Step 1: 在 `SettingsState` 增加字段**

在接口里 `maxSummaryEntries: number;`（34 行）之后插入：

```ts
  maxSummaryEntries: number;
  npcMemoryKeep: number;
```

- [ ] **Step 2: 在 `SettingsStore` 增加 setter 声明**

在 `setMaxSummaryEntries: (n: number) => void;`（78 行）之后插入：

```ts
  setMaxSummaryEntries: (n: number) => void;
  setNpcMemoryKeep: (n: number) => void;
```

- [ ] **Step 3: 在 `defaults` 增加默认值**

在 `maxSummaryEntries: 20,`（122 行）之后插入：

```ts
  maxSummaryEntries: 20,
  npcMemoryKeep: 6,
```

- [ ] **Step 4: 在 store 实现里增加 setter（带范围钳制 3–12）**

在 `setMaxSummaryEntries: (n) => set({ maxSummaryEntries: n }),`（170 行）之后插入：

```ts
      setMaxSummaryEntries: (n) => set({ maxSummaryEntries: n }),
      setNpcMemoryKeep: (n) => set({ npcMemoryKeep: Math.max(3, Math.min(12, Math.floor(n))) }),
```

- [ ] **Step 5: 验证编译**

Run: `npx tsc -b`
Expected: EXIT 0

- [ ] **Step 6: Commit**

```bash
git add src/stores/useSettingsStore.ts
git commit -m "feat(设置): 新增 npcMemoryKeep（NPC 记忆保留条数）"
```

---

## Task 3: NPC 记忆折叠逻辑 + 注入提示（TDD）

**Files:**
- Modify: `src/stores/useNpcStore.ts`
- Test: `src/stores/useNpcStore.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/stores/useNpcStore.test.ts` 末尾追加（若文件顶部已 import `useNpcStore`/`beforeEach` 复用现有；否则补充 import）：

```ts
import { MEMORY_HARD_CAP } from './useNpcStore';

describe('NPC 记忆折叠', () => {
  beforeEach(() => { useNpcStore.getState().clearAll(); });

  it('收到 memorySummary 后写入梗概并把记忆裁到 npcMemoryKeep（默认6）', () => {
    const store = useNpcStore.getState();
    // 先累积 9 条互动记忆
    for (let i = 1; i <= 9; i++) store.applyUpdates([{ name: '老者', addMemory: `互动${i}` }]);
    // 再给一次梗概
    store.applyUpdates([{ name: '老者', memorySummary: '与调查员多次交谈，渐生信任。' }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.memorySummary).toBe('与调查员多次交谈，渐生信任。');
    expect(p.memories.length).toBe(6);
    expect(p.memories[5]).toBe('互动9'); // 保留最近的
  });

  it('仅追加记忆、无梗概时也绝不超过 MEMORY_HARD_CAP（兜底）', () => {
    const store = useNpcStore.getState();
    for (let i = 1; i <= 20; i++) store.applyUpdates([{ name: '怪客', addMemory: `m${i}` }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.memories.length).toBe(MEMORY_HARD_CAP);
    expect(p.memories[p.memories.length - 1]).toBe('m20');
  });

  it('在场 NPC 注入：含记忆梗概，且记忆较多时附折叠提示', () => {
    const store = useNpcStore.getState();
    store.applyUpdates([{ name: '管家', identity: '宅邸管家', isPresent: true, memorySummary: '忠诚但隐瞒了地窖的事。' }]);
    for (let i = 1; i <= 10; i++) store.applyUpdates([{ name: '管家', addMemory: `事件${i}` }]);
    const inj = useNpcStore.getState().buildContextInjection();
    expect(inj).toContain('记忆梗概：忠诚但隐瞒了地窖的事。');
    expect(inj).toContain('memorySummary');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/stores/useNpcStore.test.ts`
Expected: FAIL（`MEMORY_HARD_CAP` 未导出 / memories 仍按旧 `.slice(-30)` 行为 / 注入无梗概行）

- [ ] **Step 3: 在 `useNpcStore.ts` 顶部导入 settings 并加常量**

把第 1-2 行的 import 区改为：

```ts
import { create } from 'zustand';
import type { NpcProfile, NpcUpdate } from '../types';
import { useSettingsStore } from './useSettingsStore';

export type { NpcUpdate };

/** 折叠后默认保留的最近原始记忆条数（被 settings.npcMemoryKeep 覆盖） */
export const MEMORY_RECENT_KEEP = 6;
/** 原始记忆数 ≥ 此值时，注入端提示 AI 提供 memorySummary 折叠 */
export const MEMORY_FOLD_THRESHOLD = 10;
/** 安全兜底：memories 绝不超过此数，超出本地丢最旧 */
export const MEMORY_HARD_CAP = 14;
```

- [ ] **Step 4: 改写 `applyUpdates` 里的记忆处理**

把第 79 行 `if (u.addMemory?.trim()) p.memories = [...p.memories, u.addMemory.trim()].slice(-30);` 整行替换为：

```ts
        if (u.addMemory?.trim()) p.memories = [...p.memories, u.addMemory.trim()];
        if (u.memorySummary?.trim()) {
          p.memorySummary = u.memorySummary.trim();
          const keep = useSettingsStore.getState().npcMemoryKeep ?? MEMORY_RECENT_KEEP;
          if (p.memories.length > keep) p.memories = p.memories.slice(-keep);
        }
        // 安全兜底：即便 AI 未提供梗概，也绝不无限增长
        if (p.memories.length > MEMORY_HARD_CAP) p.memories = p.memories.slice(-MEMORY_HARD_CAP);
```

- [ ] **Step 5: 在 `buildContextInjection` 注入梗概 + 折叠提示**

把 96-100 行（`const parts = [...]` 到 `return parts.join('\n');` 之前）的中间部分改为：

```ts
      const parts = [`- ${p.name}（${p.identity || '身份不明'}，对调查员好感度${p.favorability}/${fav}）`];
      if (p.personality) parts.push(`  性格：${p.personality}`);
      if (p.innerThoughts) parts.push(`  内心想法(KP视角)：${p.innerThoughts}`);
      if (p.memorySummary) parts.push(`  记忆梗概：${p.memorySummary}`);
      if (p.memories.length) parts.push(`  近期互动：${p.memories.slice(-3).join('；')}`);
      if (p.memories.length >= MEMORY_FOLD_THRESHOLD) parts.push(`  （"${p.name}"的互动记忆已较多，请本回合在其 npcUpdates 提供 memorySummary 浓缩既往关键互动以便归纳）`);
      return parts.join('\n');
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/stores/useNpcStore.test.ts`
Expected: PASS（含原有用例）

- [ ] **Step 7: Commit**

```bash
git add src/stores/useNpcStore.ts src/stores/useNpcStore.test.ts
git commit -m "feat(NPC): 互动记忆随回合 AI 折叠（梗概+最近N条，硬上限兜底）"
```

---

## Task 4: 线索演化归档 + 注入过滤封顶（TDD）

**Files:**
- Modify: `src/stores/useClueStore.ts`
- Test: `src/stores/useClueStore.test.ts`（新建）

- [ ] **Step 1: 写失败测试（新建测试文件）**

创建 `src/stores/useClueStore.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useClueStore } from './useClueStore';

describe('线索演化与注入', () => {
  beforeEach(() => { useClueStore.getState().clearAll(); });

  it('普通新增的线索默认 active', () => {
    useClueStore.getState().addClues([{ name: '血迹', summary: '门后有血迹' }]);
    const c = useClueStore.getState().clues[0];
    expect(c.status === 'archived').toBe(false);
    expect(c.tier).toBe('normal');
  });

  it('evolvesFrom 归档旧线索并上位新线索（major+链接）', () => {
    const store = useClueStore.getState();
    store.addClues([{ name: '模糊的脚印', summary: '走廊有脚印' }]);
    store.addClues([{ name: '凶手的足迹', summary: '脚印指向地窖', evolvesFrom: '模糊的脚印' }]);
    const clues = useClueStore.getState().clues;
    const oldC = clues.find((c) => c.name === '模糊的脚印')!;
    const newC = clues.find((c) => c.name === '凶手的足迹')!;
    expect(oldC.status).toBe('archived');
    expect(oldC.evolvedIntoId).toBe(newC.id);
    expect(newC.status).toBe('active');
    expect(newC.tier).toBe('major');
    expect(newC.evolvedFrom).toBe(oldC.id);
  });

  it('evolvesFrom 找不到旧线索时退化为普通新增', () => {
    useClueStore.getState().addClues([{ name: '新线索', summary: 'x', evolvesFrom: '不存在的线索' }]);
    const c = useClueStore.getState().clues[0];
    expect(c.status).toBe('active');
    expect(c.evolvedFrom).toBeUndefined();
  });

  it('注入仅含 active 线索；major 加★', () => {
    const store = useClueStore.getState();
    store.addClues([{ name: 'A', summary: 'aa' }]);
    store.addClues([{ name: 'B', summary: 'bb', evolvesFrom: 'A' }]);
    const inj = store.buildContextInjection();
    expect(inj).toContain('★B：bb');
    expect(inj).not.toContain('A：aa');
  });

  it('active 线索超过上限时截断并标注', () => {
    const store = useClueStore.getState();
    // 用等长零填充名（线索01..线索18）：彼此互不为子串，避免 findActiveByName 模糊匹配误并
    for (let i = 1; i <= 18; i++) store.addClues([{ name: `线索${String(i).padStart(2, '0')}`, summary: `s${i}` }]);
    const inj = store.buildContextInjection();
    expect(inj).toContain('线索18：s18');
    expect(inj).toContain('更早线索见线索库');
    expect(inj).not.toContain('线索01：s1');
  });

  it('缺 status 的老数据按 active 处理（迁移）', () => {
    useClueStore.getState().replaceAll([
      { id: 'x', name: '旧档线索', summary: 's', discoveryNarrative: '', acquiredAt: 1 },
    ]);
    expect(useClueStore.getState().buildContextInjection()).toContain('旧档线索：s');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/stores/useClueStore.test.ts`
Expected: FAIL（无 evolvesFrom 处理 / 注入未过滤未封顶 / 无 ★）

- [ ] **Step 3: 在 `useClueStore.ts` 顶部加常量与 active 查找助手**

在第 21 行 `function findByName` 之后（保留原 `findByName` 供 `removeClue` 用），新增：

```ts
/** 单次注入的 active 线索上限，超出只注入最近 N 条 */
const CLUE_INJECT_CAP = 15;

/** 仅在未归档线索中按名查找（精确优先，再宽松包含） */
function findActiveByName(clues: Clue[], name: string): number {
  const t = name.trim();
  const exact = clues.findIndex((c) => c.status !== 'archived' && c.name === t);
  if (exact >= 0) return exact;
  return clues.findIndex((c) => c.status !== 'archived' && (c.name.includes(t) || t.includes(c.name)));
}
```

并确保顶部 import 含 `Clue` 类型：把第 2 行改为

```ts
import type { Clue, ClueInput } from '../types';
```

- [ ] **Step 4: 改写 `addClues`**

把 26-59 行的 `addClues` 整体替换为：

```ts
  addClues: (inputs) => {
    set((s) => {
      const clues = [...s.clues];
      for (const input of inputs) {
        if (!input.name) continue;

        // 演化：新线索声明 evolvesFrom 旧线索名 → 归档旧线索、上位新线索
        if (input.evolvesFrom?.trim()) {
          const newClue: Clue = {
            id: crypto.randomUUID(),
            name: input.name,
            summary: input.summary ?? '',
            discoveryNarrative: input.discoveryNarrative ?? '',
            foundAtPage: input.foundAtPage,
            relatedTo: input.relatedTo,
            acquiredAt: Date.now(),
            status: 'active',
            tier: 'major',
          };
          const oldIdx = findActiveByName(clues, input.evolvesFrom);
          if (oldIdx >= 0) {
            clues[oldIdx] = { ...clues[oldIdx], status: 'archived', evolvedIntoId: newClue.id };
            newClue.evolvedFrom = clues[oldIdx].id;
          }
          clues.push(newClue);
          continue;
        }

        const idx = findActiveByName(clues, input.name);
        if (idx >= 0) {
          // 更新：补全/覆盖非空字段
          clues[idx] = {
            ...clues[idx],
            summary: input.summary || clues[idx].summary,
            discoveryNarrative: input.discoveryNarrative
              ? (clues[idx].discoveryNarrative
                  ? `${clues[idx].discoveryNarrative}\n${input.discoveryNarrative}`
                  : input.discoveryNarrative)
              : clues[idx].discoveryNarrative,
            foundAtPage: clues[idx].foundAtPage ?? input.foundAtPage,
            relatedTo: input.relatedTo?.length ? input.relatedTo : clues[idx].relatedTo,
          };
        } else {
          clues.push({
            id: crypto.randomUUID(),
            name: input.name,
            summary: input.summary ?? '',
            discoveryNarrative: input.discoveryNarrative ?? '',
            foundAtPage: input.foundAtPage,
            relatedTo: input.relatedTo,
            acquiredAt: Date.now(),
            status: 'active',
            tier: 'normal',
          });
        }
      }
      return { clues };
    });
  },
```

- [ ] **Step 5: 改写 `buildContextInjection`**

把 69-74 行的 `buildContextInjection` 替换为：

```ts
  buildContextInjection: () => {
    const active = get().clues.filter((c) => c.status !== 'archived');
    if (active.length === 0) return '';
    const truncated = active.length > CLUE_INJECT_CAP;
    const list = truncated ? active.slice(-CLUE_INJECT_CAP) : active;
    const lines = list.map((c) => `- ${c.tier === 'major' ? '★' : ''}${c.name}：${c.summary}`);
    if (truncated) lines.push(`- （更早线索见线索库，共 ${active.length} 条）`);
    return `[已掌握线索]\n${lines.join('\n')}`;
  },
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/stores/useClueStore.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/stores/useClueStore.ts src/stores/useClueStore.test.ts
git commit -m "feat(线索): AI 显式声明演化归档 + 注入仅含active并封顶"
```

---

## Task 5: format-instruction 协议说明

**Files:**
- Modify: `src/sillytavern/format-instruction.ts`（NPC 段 86 行；线索段 22 行）

- [ ] **Step 1: NPC 段补充 `memorySummary` 说明**

在 86 行 NPC 说明里，把 `addMemory(追加一条与调查员的互动记忆)` 改为：

```
addMemory(追加一条与调查员的互动记忆)、memorySummary(当某 NPC 互动记忆较多、或上下文中提示需要归纳时，用 2-4 句浓缩此前所有关键互动——含已有的旧梗概——系统会据此精简逐条旧记忆，仅保留最近若干条)
```

- [ ] **Step 2: 线索段补充 `evolvesFrom` 说明**

在 22 行线索说明结尾 `若本回合无新线索则省略clues字段。` 之前插入一句：

```
。当一条已有线索因剧情推进升华为更关键的新线索时，在新线索里加 evolvesFrom 字段引用旧线索名——系统会归档旧线索（隐藏但可回溯）、把新线索标为关键并上位；不要删改旧线索内容重写。若本回合无新线索则省略clues字段。
```

（注意：原句末尾已有「。若本回合无新线索则省略clues字段。」，替换时把该结尾整体换成上面这段，避免重复句号。实际操作：将 `。若本回合无新线索则省略clues字段。` 替换为上面整段。）

- [ ] **Step 3: 验证编译**

Run: `npx tsc -b`
Expected: EXIT 0

- [ ] **Step 4: Commit**

```bash
git add src/sillytavern/format-instruction.ts
git commit -m "feat(协议): 说明 NPC memorySummary 与线索 evolvesFrom"
```

---

## Task 6: NpcOverlay 展示记忆梗概 + 最近 N 条

**Files:**
- Modify: `src/components/NPC/NpcOverlay.tsx`（63 行附近）

- [ ] **Step 1: 替换互动记忆渲染**

把第 63 行 `{npc.memories.length > 0 && <Section title="互动记忆" body={npc.memories.join('\n')} />}` 替换为：

```tsx
          {(npc.memorySummary || npc.memories.length > 0) && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-ui)', color: 'var(--gold)', letterSpacing: 1, marginBottom: 2 }}>互动记忆</div>
              {npc.memorySummary && (
                <div style={{ fontSize: 11.5, fontFamily: 'var(--font-body)', color: 'var(--ink-subtle)', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 4, paddingBottom: 4, borderBottom: '1px dashed rgba(var(--ink-faded-rgb),0.2)' }}>
                  梗概：{npc.memorySummary}
                </div>
              )}
              {npc.memories.length > 0 && (
                <div style={{ fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                  {npc.memories.join('\n')}
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc -b`
Expected: EXIT 0

- [ ] **Step 3: Commit**

```bash
git add src/components/NPC/NpcOverlay.tsx
git commit -m "feat(人物名册): 互动记忆展示记忆梗概+最近N条"
```

---

## Task 7: InventoryPanel 线索 major 高亮 + 历史线索折叠区

**Files:**
- Modify: `src/components/Inventory/InventoryPanel.tsx`（`ClueRow` 52-85；`InventoryOverlay` 87-92 及右页 169-181）

- [ ] **Step 1: 扩展 `ClueRow` 支持 major 高亮与归档态**

把 `ClueRow` 的签名与名称行（52-64 行附近）改为带可选 props：

```tsx
function ClueRow({ clue, archived = false, evolvedIntoName }: { clue: Clue; archived?: boolean; evolvedIntoName?: string }) {
  const [expanded, setExpanded] = useState(false);
  const major = clue.tier === 'major';
  return (
    <div style={{ borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.1)', opacity: archived ? 0.55 : 1 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '8px 0', cursor: 'pointer', transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--ink-faded-rgb),0.06)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ flexShrink: 0, marginTop: 1, color: major ? 'var(--gold-bright)' : 'var(--gold)', display: 'inline-flex' }}>
          {major ? <span style={{ fontSize: 13 }}>★</span> : <IconClue size={14} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--ink)', letterSpacing: 1, fontWeight: major ? 700 : 400 }}>{clue.name}</div>
          {evolvedIntoName && (
            <div style={{ fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)', fontStyle: 'italic', marginTop: 1 }}>→ 已演化为 {evolvedIntoName}</div>
          )}
          {clue.summary && (
            <div style={{ fontSize: 11, fontFamily: 'var(--font-body)', color: 'var(--ink-subtle)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap' }}>{clue.summary}</div>
          )}
        </div>
        <span style={{ width: 12, flexShrink: 0, fontSize: 10, color: 'var(--ink-faded)', textAlign: 'center', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)', display: 'inline-block', marginTop: 2 }}>▸</span>
      </div>
```

（其余展开内容 71-83 行保持不变。）

- [ ] **Step 2: 在 `InventoryOverlay` 计算 active/archived 与名称映射 + 折叠状态**

在 `InventoryOverlay` 内（92 行 `const filtered = ...` 附近）追加：

```tsx
  const [showArchived, setShowArchived] = useState(false);
  const activeClues = clues.filter((c) => c.status !== 'archived');
  const archivedClues = clues.filter((c) => c.status === 'archived');
  const clueNameById = (id?: string) => (id ? clues.find((c) => c.id === id)?.name : undefined);
```

- [ ] **Step 3: 右页线索列表改用 activeClues + 历史折叠区**

把右页线索滚动区（169-181 行）替换为：

```tsx
        <div className="inv-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.06)' }}>
          {activeClues.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink-faded)', fontStyle: 'italic' }}>
              尚未发现任何线索……
            </div>
          ) : (
            activeClues.map((clue) => <ClueRow key={clue.id} clue={clue} />)
          )}

          {archivedClues.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div
                onClick={() => setShowArchived((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 0', fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)', letterSpacing: 1, borderTop: '1px dashed rgba(var(--ink-faded-rgb),0.2)' }}
              >
                <span style={{ transform: showArchived ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)', display: 'inline-block' }}>▸</span>
                已演化 · 历史线索 ({archivedClues.length})
              </div>
              <div style={{ overflow: 'hidden', maxHeight: showArchived ? 2000 : 0, opacity: showArchived ? 1 : 0, transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease' }}>
                {archivedClues.map((clue) => (
                  <ClueRow key={clue.id} clue={clue} archived evolvedIntoName={clueNameById(clue.evolvedIntoId)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid rgba(var(--ink-faded-rgb),0.15)', paddingTop: 8, marginTop: 6, fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)', letterSpacing: 2 }}>
          线索 {activeClues.length} 条{archivedClues.length > 0 ? ` · 历史 ${archivedClues.length}` : ''}
        </div>
```

- [ ] **Step 4: 确保 `Clue` 类型已导入**

确认 `InventoryPanel.tsx` 第 8 行 import 含 `Clue`（当前为 `import type { InventoryItem, ItemCategory, Clue } from '../../types';`，已含，无需改）。

- [ ] **Step 5: 验证编译**

Run: `npx tsc -b`
Expected: EXIT 0

- [ ] **Step 6: Commit**

```bash
git add src/components/Inventory/InventoryPanel.tsx
git commit -m "feat(背包线索): major线索高亮 + 历史线索折叠区可回溯"
```

---

## Task 8: SettingsPanel「NPC 记忆保留条数」滑杆

**Files:**
- Modify: `src/components/Settings/SettingsPanel.tsx`（选择器区 338-341 行；「上下文」分类 571-601 行附近）

- [ ] **Step 1: 增加 store 选择器**

在 340-341 行 `contextPageDepth`/`setContextPageDepth` 选择器之后插入：

```tsx
  const npcMemoryKeep = useSettingsStore((s) => s.npcMemoryKeep);
  const setNpcMemoryKeep = useSettingsStore((s) => s.setNpcMemoryKeep);
```

- [ ] **Step 2: 在「上下文」分类追加滑杆行**

在「上下文回顾页数」那一行的 `</div>`（约 601 行，`<CategoryBar label="生成与稳定性" />` 之前）后插入：

```tsx
                <div style={rowStyle}>
                  <span style={labelStyle}>
                    NPC 记忆保留条数
                    <HelpIcon text={'每个 NPC 的「互动记忆」在被 AI 折叠成「记忆梗概」后，保留的最近原始记忆条数。\n\n数值越小越紧凑、越省 token；越大保留越多近期逐字细节。\n\n更早的记忆会被浓缩进梗概，不会丢失语义。默认 6 条。'} />
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="range" min={3} max={12} step={1} value={npcMemoryKeep}
                      onChange={(e) => setNpcMemoryKeep(Number(e.target.value))}
                      style={{ width: 100, accentColor: 'var(--gold)' }}
                    />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 28 }}>{npcMemoryKeep}</span>
                  </div>
                </div>
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc -b`
Expected: EXIT 0

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings/SettingsPanel.tsx
git commit -m "feat(设置): 新增「NPC 记忆保留条数」滑杆"
```

---

## Task 9: 全量验证与推送

- [ ] **Step 1: 类型检查**

Run: `npx tsc -b`
Expected: EXIT 0

- [ ] **Step 2: 全量测试**

Run: `npm run test`
Expected: 全部通过（含新增 NPC/线索用例）

- [ ] **Step 3: 生产构建**

Run: `npm run build`
Expected: EXIT 0

- [ ] **Step 4: 推送 beta**

```bash
git push origin beta
```
Expected: 推送成功（各 Task 已分别 commit，无 Co-Authored-By）

---

## Self-Review 记录

- **Spec coverage**：A 记忆折叠 → Task 1/2/3/5/6/8；B 线索演化 → Task 1/4/5/7；设置项 → Task 2/8；测试 → Task 3/4；迁移 → 字段可选 + `!== 'archived'`/`?? 6` 兜底（Task 1/3/4 已覆盖，Task 4 含迁移用例）。无遗漏。
- **占位扫描**：无 TBD/TODO，所有代码步骤均给出完整代码。
- **类型一致**：`memorySummary`(NpcProfile/NpcUpdate)、`status/evolvedFrom/evolvedIntoId/tier`(Clue)、`evolvesFrom`(ClueInput)、`npcMemoryKeep/setNpcMemoryKeep`(Settings)、导出常量 `MEMORY_RECENT_KEEP/MEMORY_FOLD_THRESHOLD/MEMORY_HARD_CAP` 在各 Task 间命名一致；`findActiveByName` 仅在 useClueStore 内部使用。
