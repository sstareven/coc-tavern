# JSON Patch 取代 &lt;var&gt; + statData 快照注入 — 设计文档

**日期:** 2026-05-31
**状态:** 待实现（高风险：触及叙事/存档/AI 遵从）
**范围（用户确认）:** 1A + 1B（彻底退役 &lt;var&gt;）+ 2A（快照全量注入生效）
**调查依据:** workflow `wf_2c4b417b-b92`（5 维度只读调查）

## 背景（调查证实的现状）

- **JSON Patch 引擎已就绪并接入**：`mvu-jsonpatch.ts` 全 5 op + `extractJsonPatchBlocks`/`applyMvuPatch`，唯一生产调用者 `useVariableStore.processResponse`（useVariableStore.ts:84-106），已接入 `useChatPipeline`（:595/605/608）。
- **迁移半途、指令打架** 🔴：`COC_KP_PRESET.systemPrompt`（presets.ts:105 `【变量管理】`）已教 JSON Patch；`FORMAT_INSTRUCTION`（format-instruction.ts:1）仍教 `<var>`。同一 payload 两条矛盾指令。
- **静默丢值 bug** 🔴：`extractXmlVariables`（variables.ts:17）正则只认双引号，FORMAT_INSTRUCTION 示例用单引号 → LLM 照抄时变量被 strip 抹掉、不进任何存储。
- **lastAction/lastCheck 无消费者**：全树无 `variables['lastAction']` 读取，纯 write-only 死变量。
- **statData 快照默认未注入** 🟠：`{{format_message_variable::stat_data}}` 宏已实现（全量整树 YAML，mvu-format.ts:119），但默认预设/指令未携带该宏；且宏仅在 `useChatPipeline` 对 `[systemPrompt, lore 条目, 用户输入, formatInstruction]`（:415-421）解析，promptItem content 不在解析范围。
- **读侧 flat 优先**：`buildFullSubstitutionMap`（useVariableStore.ts:118-128）与 `readVar`（mvu-var-access.ts:56-58）让 flat var 优先级最高，会压制 statData 真值。`useChatPipeline.ts:633` 直接读 `variables['剧情.阶段']`。
- **存档**：`__statData__` blob 持久化已就绪（sessionLifecycle.ts:107-117/237-245）；老存档只有 flat gameVars（含点路径变量如 `剧情.阶段`）；v1→v2 迁移只平铺、无 statData。

## 实施方案

### 阶段 1A — 统一指令为 JSON Patch + 修引号 bug（中风险）

1. **`format-instruction.ts` FORMAT_INSTRUCTION 改写**：删除所有 `<var name='...'/>` 教学与示例，改为与 `systemPrompt【变量管理】`一致的 JSON Patch 协议：回复**末尾**输出 `<UpdateVariable><JSONPatch>[{op,path,value},...]</JSONPatch></UpdateVariable>`，path 用 `/调查员/生命值/当前` 形式。SAN/伤害段改 `delta`（如 `{"op":"delta","path":"/调查员/理智值/当前","value":-5}`）。**JSON 示例 leftContent 内删除内嵌 `<var>`，变量块移出 JSON 放回复尾部**（避免破坏外层 JSON 引号）。保持信息量（handoff「不裁剪」= 不删功能性指引，仅改格式语法）。
2. **`rewrite-instruction.ts:10`**：删除 action 内 `<var name='lastAction'/>/<var name='lastCheck'/>` 示例。
3. **修引号 bug**：`variables.ts:17` `extractXmlVariables` 正则 `name="..."` → `name=['"]...['"]`，同时认单/双引号（读侧兼容，防历史/兜底 `<var>` 静默丢失）。
4. **不删** `<var>` 读侧解析（保留兼容老消息、AI 过渡期偶发）。

### 阶段 1B — 退役 &lt;var&gt; 写路径 + 读侧兼容（高风险）

5. **删除 lastAction/lastCheck**：无消费者，直接从 FORMAT_INSTRUCTION/rewrite-instruction 的 choices.action 示例移除（1A 已顺带），不迁移、不保留。
6. **processResponse legacy 降级**（useVariableStore.ts:76-114）：保留 `extractAllVariables`/`parseStatChanges` 读侧解析（兼容老消息 + AI 偶发 `<var>`），但**调查员.\* 的 flat 写也走 `isCharsheetPath` 重定向**（修复 mergeVariables 不重定向导致的平行真理叶子）。新 AI 输出由 1A 指令保证只产 JSON Patch。
7. **读侧优先级调整**（useVariableStore.ts:118-128 buildFullSubstitutionMap）：让 statData（JSON Patch 真值）**优先于历史 flat var**，flat 仅兜底缺失键（当前是反的）。保留 locked flat 的最高优先（手动锁定语义）。
8. **`useChatPipeline.ts:633`** `variables['剧情.阶段']` 改读 statData（`flattenStatData` 或 `mvu-var-access` 路径访问），纯 Patch 下剧情.阶段在 statData 树。
9. **老存档读侧双读**（sessionLifecycle.ts:236-248 load）：把 name 含 `.` 且**非** `isCharsheetPath` 的 legacy flat 行回灌进 statData 树（排除 调查员.\* 防违反单源边界），让老存档世界/剧情变量在纯 Patch 下仍可读。
10. **保留** `stripVariableMarkup`（variables.ts:84）、`choice-match.ts:6`（防 LLM 偶发 `<var>` 残留污染显示/选项比对）。

### 阶段 2A — statData 快照全量注入生效（中风险）

11. **新增常驻世界书条目**承载快照宏：在默认 `coc_lore` 世界书幂等 upsert 一个 `constant: true` 条目（如 `__statdata_snapshot__`），content = `[当前状态 — 守秘人参考]\n{{format_message_variable::stat_data}}`。该条目 content 属"lore 条目"，会被 `resolveAllMacrosBatch`（useChatPipeline.ts:421）解析成 YAML 注入。
12. **幂等确保存在**：参照现有 summary 条目机制，在 lorebook 初始化/加载时确保该条目存在（不依赖老存档迁移，每次启动幂等 upsert）。
13. **缓存友好**：作为常驻 lore 在动态区注入，不污染 systemPrompt/FORMAT_INSTRUCTION 前缀缓存。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| FORMAT_INSTRUCTION 改写令 AI 遵从波动 | systemPrompt 早已教 JSON Patch，改写是**消除冲突**而非引入新格式；JSON Patch 引擎+47 测试已稳 |
| 前缀缓存首次失配 | 一次性成本；快照走 lore 不碰前缀 |
| 老存档 flat 点路径变量读不出 | 步骤 9 读侧回灌 statData + 步骤 7 保留 flat 兜底 |
| 老存档 `调查员.*` flat 叶子违反单源 | 步骤 6/9 显式 `isCharsheetPath` 排除/重定向 |
| 全量 statData YAML token 膨胀 | 本期接受（2A 范围内）；按需裁剪是后续 2B（未选） |
| 快照宏误读为"已注入" | 步骤 11/12 显式接线 + 测试验证宏被解析 |

## 测试策略

- `variables.test.ts`（新增/扩展）：单/双引号 `<var>` 均能解析；调查员.\* flat 重定向。
- `useVariableStore` 优先级：statData 优先于历史 flat、flat 兜底缺键、locked 最高。
- 快照注入：常驻条目存在性 + 宏解析产出 YAML（可在 unified-macro-engine 或集成层测）。
- 现有 536 测试全绿；`tsc -b` + `vitest` + `vite build` 三连。

## 分批提交计划（每批独立验证+推送，无 Co-Authored-By）

1. `fix(mvu)` 1A：FORMAT_INSTRUCTION/rewrite 统一 JSON Patch + 修引号正则 + 删 lastAction/lastCheck
2. `refactor(mvu)` 1B：processResponse 调查员.\* flat 重定向 + 读侧优先级反转 + useChatPipeline 剧情.阶段读 statData + sessionLifecycle 老存档回灌
3. `feat(mvu)` 2A：常驻世界书快照条目 + 幂等确保 + 测试

## 不做（YAGNI / 超范围）

- 2B 按需裁剪（需相关性基建，本期未选）。
- 不删 `<var>` 读侧解析（兼容必需）。
- 不批量改库迁移老存档（靠读侧双读，遵「改默认不迁移老存档」）。
- 不动 mvu-jsonpatch.ts 引擎本身（已就绪）。
