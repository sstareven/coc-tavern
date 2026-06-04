# 战斗系统 Phase 2：状态 store + 持久化 + 会话隔离 Implementation Plan

> **For agentic workers:** 执行可用 superpowers:executing-plans。步骤用 `- [ ]` 跟踪。

**Goal:** 新建 `useCombatStore`（持有进行中 `Encounter | null`）+ db v10 `combat` 单行表 + `sessionLifecycle` 四处接线，使战斗半成品随存档保留（切档/刷新/回主菜单不丢），跨档隔离。

**Architecture:** 完全照搬 plotAnchors（单行/会话）范式。进行中战斗存 `combat` 表（一行/会话）；脱战后 `clearCombat()` 置 null、内容固化进 BookPage.combatLog（Phase 5 做）。Phase 2 只做状态容器 + 持久化，不做轮转/动作逻辑（Phase 4/5）。

**Tech Stack:** Zustand + Dexie + Vitest。依赖 Phase 1 类型 `Encounter`。

设计依据：`docs/superpowers/specs/2026-06-04-combat-panel-design.md` §11。

---

## Task 1: useCombatStore + 测试

**Files:** Create `src/stores/useCombatStore.ts` + `src/stores/useCombatStore.test.ts`

- [ ] **Step 1: 失败测试**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useCombatStore } from './useCombatStore';
import type { Encounter } from '../types';

const enc = (): Encounter => ({
  active: true, round: 1, turnOrder: ['p', 'e'], currentIdx: 0,
  combatants: [], bystanders: [], playerTargetId: 'e',
  log: [], diceRecords: [], status: 'active',
});

describe('useCombatStore', () => {
  beforeEach(() => useCombatStore.getState().clearAll());
  it('start 进战、setEncounter 写回、clearCombat 脱战置空', () => {
    useCombatStore.getState().start(enc());
    expect(useCombatStore.getState().encounter?.round).toBe(1);
    useCombatStore.getState().setEncounter({ ...enc(), round: 3 });
    expect(useCombatStore.getState().encounter?.round).toBe(3);
    useCombatStore.getState().clearCombat();
    expect(useCombatStore.getState().encounter).toBeNull();
  });
  it('replaceAll 读档恢复 / clearAll 隔离清空', () => {
    useCombatStore.getState().replaceAll(enc());
    expect(useCombatStore.getState().encounter?.active).toBe(true);
    useCombatStore.getState().clearAll();
    expect(useCombatStore.getState().encounter).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败** → `npx vitest run src/stores/useCombatStore.test.ts` → FAIL。

- [ ] **Step 3: 实现**

```ts
import { create } from 'zustand';
import type { Encounter } from '../types';

interface CombatStore {
  /** 进行中战斗；null = 未在战斗中。 */
  encounter: Encounter | null;
  /** 进入战斗。 */
  start: (e: Encounter) => void;
  /** 整体写回（每步引擎结算后更新 store；持久化与 UI 据此渲染）。 */
  setEncounter: (e: Encounter) => void;
  /** 脱战/固化进页之后清空。 */
  clearCombat: () => void;
  /** 读档恢复。 */
  replaceAll: (e: Encounter | null) => void;
  /** 会话隔离清空。 */
  clearAll: () => void;
}

export const useCombatStore = create<CombatStore>()((set) => ({
  encounter: null,
  start: (e) => set({ encounter: e }),
  setEncounter: (e) => set({ encounter: e }),
  clearCombat: () => set({ encounter: null }),
  replaceAll: (e) => set({ encounter: e ?? null }),
  clearAll: () => set({ encounter: null }),
}));
```

- [ ] **Step 4: 通过** → PASS。
- [ ] **Step 5: 提交** `git add src/stores/useCombatStore.ts src/stores/useCombatStore.test.ts && git commit -m "feat(战斗): useCombatStore(进行中Encounter容器 start/setEncounter/clearCombat/replaceAll/clearAll)"`

---

## Task 2: db v10 combat 表

**Files:** Modify `src/db/database.ts`

- [ ] **Step 1:** 在 `PlotAnchorRow`(:99) 之后加：

```ts
// 进行中战斗（一行/会话；脱战后删行、内容固化进 BookPage.combatLog）。
export interface CombatRow {
  conversationId: string;
  encounter: Encounter;
}
```
（确认 `Encounter` 已从 `../types` import；未 import 则在 import 区补 `Encounter`。）

- [ ] **Step 2:** db 声明（`plotAnchors:` 行 :121 之后）加：`combat: EntityTable<CombatRow, 'conversationId'>;`

- [ ] **Step 3:** `db.version(9).stores(V9_SCHEMA);`(:199) 之后加：

```ts
/** v10: 新增「进行中战斗」单行表（无数据迁移）。 */
export const V10_SCHEMA = {
  ...V9_SCHEMA,
  combat: '&conversationId',
} as const;

db.version(10).stores(V10_SCHEMA);
```

- [ ] **Step 4:** `npx tsc --noEmit` 干净。
- [ ] **Step 5:** 提交 `git add src/db/database.ts && git commit -m "feat(db): v10 combat 单行表"`

---

## Task 3: sessionLifecycle 四处接线（照搬 plotAnchors）+ 测试

**Files:** Modify `src/stores/sessionLifecycle.ts` + `src/stores/sessionLifecycle.test.ts`

- [ ] **Step 1: 失败测试**（在跨档隔离 describe 内追加；顶部 import `useCombatStore`，beforeEach 加 `db.combat.clear()` + `useCombatStore.getState().clearAll()`）

```ts
it('正玩存档A时开新游戏B：B不继承A的进行中战斗；切回A恢复', async () => {
  const a = await startNewConversation('A'); useChatStore.getState().setActive?.(a);
  useCombatStore.getState().start({
    active: true, round: 2, turnOrder: ['p'], currentIdx: 0,
    combatants: [], bystanders: [], playerTargetId: null, log: [], diceRecords: [], status: 'active',
  });
  await saveConversation(a);
  const b = await startNewConversation('B');
  expect(useCombatStore.getState().encounter).toBeNull();
  expect(await db.combat.get(b)).toBeUndefined();
  await switchConversation(a);
  expect(useCombatStore.getState().encounter?.round).toBe(2);
});
```
（若该测试文件 startNewConversation 返回 string 且无 setActive，复用文件既有的活跃会话设置方式，与 plotAnchors 用例一致。）

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 四处接线**（精确镜像 plotAnchors 的行）：
  - import 区（`useAnchorStore` :9 旁）：`import { useCombatStore } from './useCombatStore';`
  - clear（`useAnchorStore.getState().clearAll();` :59 之后）：`useCombatStore.getState().clearAll();`
  - save 读态（`const anchorState = ...` :146 之后）：`const combatEncounter = useCombatStore.getState().encounter;`
  - 三处事务表名数组（:190 save / :287 load / :424 delete）：每处在 `'plotAnchors',` 后加 `'combat',`
  - save 写入（plotAnchors put/delete 块 :241-245 之后）：
    ```ts
    if (combatEncounter) {
      await db.combat.put({ conversationId: cid, encounter: combatEncounter });
    } else {
      await db.combat.delete(cid);
    }
    ```
  - load 解构（:284 数组）：在 `plotAnchorRow,` 后插 `combatRow,`（与 Promise.all 顺序对应）
  - load Promise.all（`db.plotAnchors.get(cid),` :301 之后）：`db.combat.get(cid),`
  - load 恢复（`useAnchorStore...replaceAll(...)` :358 之后）：`useCombatStore.getState().replaceAll(combatRow?.encounter ?? null);`
  - delete（`await db.plotAnchors.delete(cid);` :438 之后）：`await db.combat.delete(cid);`

  ⚠️ load 解构变量顺序与 Promise.all 顺序必须严格对应——两处都把 `combat` 紧跟 `plotAnchors` 之后插入。

- [ ] **Step 4: 通过** → `npx vitest run src/stores/sessionLifecycle.test.ts` PASS。
- [ ] **Step 5: 提交** `git add src/stores/sessionLifecycle.ts src/stores/sessionLifecycle.test.ts && git commit -m "feat(战斗): sessionLifecycle 四处接线 combat(clear/save/load/delete) + 跨档隔离测试"`

---

## Task 4: 终检

- [ ] `npx tsc --noEmit && npx vitest run && npx vite build` 全绿。
- [ ] `git push origin beta`

## Self-Review
- Spec §11 持久化/隔离 → Task 1-3 ✅
- 类型一致：`useCombatStore.{encounter,start,setEncounter,clearCombat,replaceAll,clearAll}`、`CombatRow.encounter`、`V10_SCHEMA.combat` ✅
- 半成品保留：save 持久化进行中 encounter，load replaceAll 恢复 ✅
- 超出本 phase：轮转/动作/UI/检测/脱战固化 → Phase 3-5。
