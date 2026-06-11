# 时间管理系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 COC 跑团时间管理系统 — megaagent 输出结构化时间增量，系统累加防倒流，暗线节奏引导，休息提示。

**Architecture:** 纯逻辑层 `time-engine.ts` 提供时间累加/格式化/休息判定；megaagent 新增 `timeDelta` 字段输出增量；`dispatchMegaAgentResult` 累加到 statData；StatusBar 从 statData 读权威时间；RestHint 组件在 RightPage 上方显示休息提示。

**Tech Stack:** TypeScript, React, Zustand, Vitest

---

### Task 1: time-engine.ts — 纯逻辑层

**Files:**
- Create: `src/sillytavern/time-engine.ts`
- Create: `src/sillytavern/time-engine.test.ts`

核心函数：`parseTimeDelta`, `accumulateTime`, `formatEpochDisplay`, `canRestNow`, `executeRest`

### Task 2: ScenarioDoc 类型 + statData 初始化

**Files:**
- Modify: `src/types/scenario.ts` — ScenarioDoc 加 `startDateTime?`, `storyDurationMinutes?`
- Modify: `src/sillytavern/mvu-initial-statdata.ts` — 世界.时间 改为结构化对象

### Task 3: megaagent 类型 + prompt + 解析

**Files:**
- Modify: `src/sillytavern/mvu-megaagent.ts` — MegaAgentTrigger 加 `timeDelta`; MegaAgentResult 加 `timeDelta`; OUTPUT_SCHEMA_DESC 加 timeDelta; SYSTEM_PROMPT_A 加时间估算指导; parseMegaAgentResponse 加解析; EMPTY_RESULT 加 `timeDelta: null`; formatUserPayload 加当前时间上下文; buildMegaAgentInput 加时间状态; trigger 加 `timeDelta: true`

### Task 4: dispatchMegaAgentResult 累加 + 暗线钳位

**Files:**
- Modify: `src/sillytavern/mvu-megaagent.ts` (dispatchMegaAgentResult) — 累加 epoch, 重算 display, 暗线进度钳位
- Modify: `src/sillytavern/mvu-megaagent.ts` (DispatchOpts/DispatchSummary) — 加 storyDurationMinutes + timeAdvanced

### Task 5: StatusBar 时间源切换

**Files:**
- Modify: `src/components/Book/StatusBar.tsx` — time 优先从 statData.世界.时间.display 读取

### Task 6: 主回合 prompt 注入时间上下文

**Files:**
- Modify: `src/hooks/useChatPipeline.ts` (buildPromptMessages) — addFormatPart 注入当前剧情时间

### Task 7: RestHint 休息提示 UI

**Files:**
- Create: `src/components/Book/RestHint.tsx`
- Modify: `src/components/Book/RightPage.tsx` — 挂载 RestHint
