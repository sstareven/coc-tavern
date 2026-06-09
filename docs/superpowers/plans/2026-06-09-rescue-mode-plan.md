# 拯救模式 实施计划

> **For agentic workers:** 本计划由主控（Claude Code）按 phase 顺序执行。每个 phase 完成后跑 vitest + tsc + commit + push beta。spec：`docs/superpowers/specs/2026-06-09-rescue-mode-design.md`。

**目标**：让玩家在游戏中看到「拯救可能性」状态条；剧本作者可在剧本编辑器为每剧本预设多条 RescueEnding，每条由若干「里程碑」推进；与已有暗线 progress 形成赛跑。

**架构**：新建 `useRescueStore`（运行态）+ statData 镜像 + BookPage 快照三件套，对称暗线现有形状。LLM 走主回执 JSONPatch 写 `剧情.救援.*`，megaAgent 末尾 `hydrateFromStatData` 反向回灌 store。剧本侧加 `ScenarioDoc.rescueEndings: RescueEnding[]` + `RescueEndingsTab`。UI 在 `StatusBar` 内嵌 `RescueBar`（潜伏隐藏 / 对峙横条 / 锁定铭牌）。

**Tech Stack**：TypeScript + React + zustand + vitest + Dexie。

---

## Canonical 类型签名

**`src/types/scenario.ts`**（剧本侧静态契约）
```ts
export interface RescueMilestone {
  id: string;
  name: string;
  delta: number;       // 推进点数，默认 25
  hint?: string;       // 给 LLM 的判定提示
}

export interface RescueEnding {
  id: string;
  name: string;
  description: string;
  unlockHint: string;
  milestones: RescueMilestone[];
  failureVariantId?: string;  // → ScenarioDoc.badEndings[].id
}

// ScenarioDoc 加字段：
// rescueEndings?: RescueEnding[];

// ScenarioPatch 加字段：
// rescueEndings?: { upsert?: RescueEnding[]; removeIds?: string[]; replaceAll?: RescueEnding[] };
```

**`src/stores/useRescueStore.ts`**（运行态契约 — 类型 + store 同文件，不重复 re-export）
```ts
export type RescueGlobalStatus = '潜伏' | '对峙' | '锁定';

export interface RescuePathState {
  endingId: string;
  unlocked: boolean;
  progress: number;          // 0-100
  achievedMilestoneIds: string[];
  lastNarration?: string;
}

export interface RescueSnapshot {
  paths: RescuePathState[];
  globalStatus: RescueGlobalStatus;
  winningEndingId: string | null;
}
```

`BookPage.rescue?: RescueSnapshot` 由 `useRescueStore` 直接 re-import（不在 types/index.ts 重复定义）。

## 改动文件清单（17 项）

按 phase 顺序：
- **A**：`src/types/scenario.ts` + `src/scenario/scenario-patch.ts` + `src/stores/useScenarioStore.ts`
- **B**：`src/stores/useRescueStore.ts`（新） + 单元测试
- **C**：`src/sillytavern/mvu-initial-statdata.ts` + `mvu-schema.ts` + `format-instruction.ts` + `mvu-megaagent.ts` + `useLorebookStore.ts` 两个 YAML 条目
- **D**：`src/scenario/scenario-engine.ts` + `scenario-injection.ts` + `src/db/database.ts` + `src/stores/sessionLifecycle.ts`
- **E**：`src/components/Scenario/ScenarioEditor.tsx` + `tabs/RescueEndingsTab.tsx`（新） + `tabs/BadEndingsTab.tsx`
- **F**：`src/components/Book/RescueBar.tsx`（新） + `StatusBar.tsx` + `src/types/index.ts`(BookPage.rescue) + `useBookStore.ts` + `useChatPipeline.ts` + `Storybook.tsx`
- **收尾**：`src/scenario/rescue-flow.integration.test.ts`（新 e2e）+ tsc + vitest 全套 + build

## 执行策略

- 主控直接落码，不用 subagent 改大文件（记忆：「workflow 子代理改大文件不可靠」）
- 每个 phase 内先看现有文件 + 写小测试 → 落实现 → 跑测试 → commit + push beta
- 大文件修改（useChatPipeline / Storybook / ScenarioEditor / sessionLifecycle）逐点 Edit 不重写
- 类型路径单一原则：`RescueEnding` 仅 `src/types/scenario.ts`；`RescueSnapshot/RescuePathState/RescueGlobalStatus` 仅 `src/stores/useRescueStore.ts`；其他文件按需 import，不重复定义

## 关键设计点（critic 已修）

1. **hydrateFromStatData 看到胜出路径已填，自动 lockOutcome**（不止填 winningEndingId）
2. **RescueBar 用 TabIcons SVG**（IconLuck 图标，禁用字面 ◆/⚜）
3. **RescueBar 显示暗线 progress 红色赛跑数字**（读 `useDarkThreadStore.entries.at(-1)?.progress`）
4. **锁定态显示其他路径变灰行**（不丢弃，只是不可推进）
5. **buildContextInjection 暗线赛跑提示**（暗线 ≥75 时附加文本）
6. **scenario-injection 构造常驻 lore entry「拯救路径状态」**（不止 statData seed）
7. **删 RescueEnding 改 name 时同步 rename statData 子键**（reducer 内）
8. **RescueEndingsTab 统计三项**（路径 / 里程碑 / 未绑失败变体计数）
9. **集成测试** `src/scenario/rescue-flow.integration.test.ts` 端到端覆盖 unlock→milestone×N→lock 完整链路

## Phase A - 剧本类型 + Scenario reducer 同步

### A.1 types/scenario.ts 加 RescueMilestone/RescueEnding/ScenarioDoc.rescueEndings? + ScenarioPatch.rescueEndings?
### A.2 isValidScenarioDoc + validateScenarioPatch 守卫
### A.3 applyScenarioPatch reducer（upsert/removeIds/replaceAll + name rename 同步 statData）
### A.4 useScenarioStore.mergePatch 同步 reducer（双 reducer 对齐）

每个 task 含失败测试 → 实现 → 跑 → commit。

## Phase B - useRescueStore

### B.1 store 骨架 + initFromScenario（含 statData 镜像写入）
### B.2 unlockPath（'潜伏'→'对峙'）
### B.3 advanceMilestone（推进 + milestoneId 幂等去重）
### B.4 applyDelta（0..100 饱和）
### B.5 lockOutcome（自动 100% 触发 + 非胜路径冻结）
### B.6 buildContextInjection（含暗线赛跑提示）
### B.7 toSnapshot / hydrateFromSnapshot 往返一致
### B.8 hydrateFromStatData（看到胜出路径自动 lockOutcome）
### B.9 clear 全清 + 类型 export 收口

## Phase C - MVU 集成

### C.1 createInitialStatData 种入 剧情.救援
### C.2 COC_MVU_SCHEMA 加 4 条 rule
### C.3 mvu_update_rules YAML 加 剧情.救援 子树
### C.4 mvu_initvar stub YAML
### C.5 FORMAT_INSTRUCTION 加救援推进示例
### C.6 dispatchMegaAgentResult 末尾调 hydrateFromStatData

## Phase D - 引擎接入 + dexie + sessionLifecycle

### D.1 scenario-injection buildScenarioStatDataSeed 种入 路径.* + 常驻 lore entry
### D.2 scenario-engine activateScenario/unloadScenario 接 useRescueStore
### D.3 database.ts v13 加 rescue 单行表
### D.4 sessionLifecycle 4 处接入（save/load/clear/delete）

## Phase E - 剧本编辑器

### E.1 ScenarioEditor 加 'rescue' TabKey + TABS + renderTab
### E.2 RescueEndingsTab 完整 UI（含三项统计 / 失败变体下拉 / 里程碑子列表）
### E.3 BadEndingsTab 加「已被路径绑定为失败变体」提示
### E.4 删 BadEnding 时清空 rescueEndings[].failureVariantId

## Phase F - UI + 快照回溯

### F.1 BookPage 加 rescue?: RescueSnapshot
### F.2 useBookStore.setPageRescue
### F.3 RescueBar 组件（TabIcons + 暗线赛跑数 + 灰显冻结行 + 潜伏隐藏 / 对峙横条 / 锁定铭牌 / compact）
### F.4 StatusBar 嵌入 RescueBar（桌面 + compact 两态）
### F.5 useChatPipeline 回执后 setPageRescue
### F.6 Storybook 删页 rebuildRescueFromPages

## 收尾

### Z.1 rescue-flow.integration.test.ts（端到端：unlock→milestone×N→lock→其他冻结→hydrate 往返）
### Z.2 npx tsc --noEmit 全绿
### Z.3 npx vitest run 全绿
### Z.4 npm run build 烟测
### Z.5 push beta（每 phase 已 push，最后保险）

## Commit 规约

- `feat(rescue): ...` 大改 / `fix(rescue): ...` 修 / `test(rescue): ...` 测 / `chore(rescue): ...` 杂
- 不含 Co-Authored-By（记忆：feedback_git_push_no_coauthor）
- 每个 phase 内多 commit 也无所谓，全部 push beta（记忆：feedback_beta_branch_workflow）
- 不动 master，「更新」由用户喊（记忆：update-only-when-user-says-update）
