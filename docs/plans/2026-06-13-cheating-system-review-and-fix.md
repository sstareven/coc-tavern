# 领受赐福（作弊系统）代码审查与修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对「领受赐福」作弊系统做全面代码审查，修复已发现的 5 处 CoC7e 规则 bug，补充缺失的测试覆盖，清理过时注释与死代码。

**Architecture:** 作弊系统横跨 4 层——算法层（cheating-helpers.ts 纯函数）+ 存储层（useSettingsStore.ts 字段）+ 解锁层（useKonamiCode.ts Konami 序列）+ UI 层（CheatingGrid + OptionResolutionOverlay + CheatingContent）。核心算法 pickRollForResult 依赖 dice-engine.determineResult 的规则一致性。

**Tech Stack:** React 19 + TypeScript + Zustand + Vitest（jsdom）。纯函数用 Vitest TDD。UI 组件无独立测试，手动 + tsc 验证。

**约定：** commit 不含 Co-Authored-By；每个任务完成即 git commit，全部完成后由执行者统一 git push。

---

## Phase 1: 审查（Review）

此阶段只读、不写代码，产出审查发现清单。

### Review Task 1: 审查 cheating-helpers.ts — 算法正确性

检查清单：
- [ ] 每个 case 的区间数学是否正确（fifth、half 运算）
- [ ] 边界条件：target=0、target=1、target=50、target=100
- [ ] 是否处理非法输入（NaN、Infinity、负数、>100）
- [ ] success 的 hi 界是否排除了 100
- [ ] failure 的 lo 界当 target=0 时是否会产生误判为大成功
- [ ] failure 的 hi 界与 dice-engine.determineResult 的大失败规则是否一致

### Review Task 2: 审查 dice-engine.ts determineResult — CoC7e p.88 规则

检查清单：
- [ ] target < 50 是否应为 target <= 50
- [ ] 注释第 26 行是否同步更新

### Review Task 3: 审查 cheating-helpers.test.ts — 测试覆盖

检查清单：
- [ ] 是否覆盖 target=0、target=100 边界
- [ ] 是否覆盖 getCheatingDisabledTypes 函数
- [ ] 测试断言是否与 determineResult 规则一致

### Review Task 4: 审查 CheatingGrid.tsx

检查清单：
- [ ] disabledTypes 是否正确传递给 button
- [ ] 注释中 DicePanel 引用是否过时

### Review Task 5: 审查 OptionResolutionOverlay.tsx 第 85-119 行

检查清单：
- [ ] handleCheatingPick 是否处理 null
- [ ] dice record 字段是否完整

### Review Task 6: 审查 useSettingsStore.ts

检查清单：
- [ ] cheatingEnabled/cheatingUnlocked 默认值
- [ ] 老字段迁移是否正确

### Review Task 7: 审查 useKonamiCode.ts + App.tsx

检查清单：
- [ ] Konami 序列完整性
- [ ] input/textarea 排除
- [ ] 死注释清理

---

## Review Findings

### F1 [dice-engine] target<50 -> target<=50
- 文件: src/sillytavern/dice-engine.ts:43
- 描述: CoC7e p.88 规定 target<=50 时 96-00 为大失败。当前用 target<50。
- 影响: target=50 时 roll>=96 被错误判为普通失败。

### F2 [cheating-helpers] success 档 hi 界含 100
- 文件: src/sillytavern/cheating-helpers.ts:65
- 描述: hi = sanCheck ? Math.min(target,95) : target，100 总是大失败不应在 success 档。
- 影响: target=100 时作弊选成功可能得到 100 被判大失败。

### F3 [cheating-helpers] failure 档 lo 界 target=0 时误判大成功
- 文件: src/sillytavern/cheating-helpers.ts:73
- 描述: lo = target + 1，target=0 时 lo=1 被判定为大成功。

### F4 [cheating-helpers] failure 档 hi 界 parity
- 文件: src/sillytavern/cheating-helpers.ts:75
- 描述: hi = sanCheck || target < 50 ? 95 : 99，应为 target <= 50。
- 影响: 与 F1 同一来源。

### F5 [cheating-helpers] 缺少 target 合法性校验
- 文件: src/sillytavern/cheating-helpers.ts
- 描述: NaN/Infinity/负数/超 100 会静默传播。

### F6 [CheatingGrid] 死注释引用已删除的 DicePanel
- 文件: src/components/Dice/CheatingGrid.tsx:1-3

### F7 [useKonamiCode] 死注释代码
- 文件: src/hooks/useKonamiCode.ts:9

### F8 [test] 缺失测试覆盖
- 文件: src/sillytavern/__tests__/cheating-helpers.test.ts
- 描述: 缺少 getCheatingDisabledTypes、target=0、target=100、非法 target 测试。

---

## Phase 2: 修复（Fix）

### Fix Task 1: 修复 dice-engine.ts — CoC7e p.88 规则

- [ ] **修改 target < 50 为 target <= 50**
  修改 src/sillytavern/dice-engine.ts:43
  同步更新注释第 26 行

- [ ] **运行测试**: npm test -- --run src/sillytavern/__tests__/dice-engine.test.ts

- [ ] **Commit**

### Fix Task 2: 更新 dice-engine.test.ts 断言

- [ ] 将 target=50 的断言从 failure 改为 crit-failure
- [ ] 新增 target>50 96-99 -> failure 测试保留原始覆盖

- [ ] **运行测试**: npm test -- --run src/sillytavern/__tests__/dice-engine.test.ts

- [ ] **Commit**

### Fix Task 3: 修复 cheating-helpers.ts — 5 处 bug

- [ ] **F5: 增加 target 合法性校验**
  if (typeof target !== 'number' || !Number.isFinite(target) || target < 0 || target > 100) return null;

- [ ] **F2: 修复 success 档 hi 界**
  const hi = sanCheck ? Math.min(target, 95) : Math.min(target, 99);

- [ ] **F3: 修复 failure 档 lo 界**
  const lo = Math.max(target + 1, 2);

- [ ] **F4: 修复 failure 档 hi 界**
  const hi = sanCheck || target <= 50 ? 95 : 99;

- [ ] **运行测试**: npm test -- --run src/sillytavern/__tests__/cheating-helpers.test.ts

- [ ] **Commit**

### Fix Task 4: 更新 cheating-helpers.test.ts

- [ ] 修复 failure target=50 断言（99 -> 95）
- [ ] 新增 target=0 边界测试（所有档位 null）
- [ ] 新增 target=100 边界测试（success <= 99, crit-failure = 100）
- [ ] 新增非法 target 防御测试（NaN/Infinity/负数/>100 -> null）
- [ ] 新增 getCheatingDisabledTypes 测试

- [ ] **运行测试**: npm test -- --run src/sillytavern/__tests__/cheating-helpers.test.ts

- [ ] **Commit**

### Fix Task 5: 清理死注释

- [ ] 更新 CheatingGrid.tsx 顶部注释（删除 DicePanel 引用）
- [ ] 删除 useKonamiCode.ts 第 9 行注释代码

- [ ] **Commit**

### Fix Task 6: 完整性验证

- [ ] npx tsc --noEmit（预期 0 errors）
- [ ] npm test（预期全部 passing）
- [ ] npm run build（预期成功）
