# 双人成行融合预设（DeepSeek）+ 功能开关悬浮窗 — 设计文档

日期：2026-06-02
分支：beta
状态：待用户 review

## 1. 背景与目标

用户提供了一份成熟的 SillyTavern 通用 RP 预设「双人成行 V6.1—向斜阳」（233 个 prompt 条目，作者 Atri&Deach），希望：

1. **由开发侧自动导入**到应用（写进 IndexedDB 的 `coc_presets_v1`），用户无需手动操作。
2. 把双人成行**全量融入**一个新预设，**直接替掉**原有的「深渊守秘人 COC 7th」主预设。
3. **默认只开必要选项**，其余（文风/人称/NSFW/模型专属）默认关、保留备用。
4. 预设面向 **DeepSeek** 模型。
5. 加一个**功能开关悬浮窗**，游戏内顶栏打开，列出当前预设全部条目（含 marker）并即时开关。
6. **硬约束**：不得改动会话/存档框架（`conversations/pages/charsheets` 等），旧存档零影响。

## 2. 关键现状（已核实）

- 预设存储：`kvStore` 的 `coc_presets_v1`（`Record<id, ChatPreset>`，同步缓存 `kv.ts`）。当前预设 id = 会话 `presetId` ‖ `coc_last_preset` ‖ `'p2'`。
- `ChatPreset.promptItems[]` 每项含 `enabled`，`kind: 'marker' | 'prompt'`。
- `assemblePrompt`（`prompt-assembler.ts`）：按 `order` 排序、按 `enabled` 过滤；`kind:'prompt'` 条目**直接注入** `item.content`；`format-instruction` 有兜底（无 marker 则强制追加，"never silently dropped"）。
- 世界书走独立的 `worldInfoBefore/After` marker + constant 注入，不依赖预设条目。
- 已有 `importPresetFromST`（`format-converter.ts`）：能解析 `prompt_order` 的 enabled → `promptItems`。
- 双人成行自带 marker：`main`(人设,非marker kind)、`worldInfoBefore/After`、`charDescription/charPersonality`、`scenario`、`personaDescription`、`dialogueExamples`、`chatHistory`、`enhanceDefinitions`、`jailbreak`。**缺** `formatInstruction` marker 与 COC 的 JSON 双页提醒（`postHistoryInstructions`）。

## 3. 架构设计

### 3.1 预设资源
- `双人成行 V6.1.json`（1.3MB）放入 `src/assets/presets/shuangren-v6.json`，作为静态资源随包发布。

### 3.2 融合转换：`buildFusionPreset(stJson) → ChatPreset`
新增纯函数（建议 `src/sillytavern/fusion-preset.ts`），步骤：
1. `importPresetFromST` 解析双人成行 → 基础 `promptItems`（保留全部 233 条目与原 enabled）。
2. **强制注入/置顶 COC 机制命脉条目**（缺则补、已存在则保留并确保 enabled+正确 order）：
   - 守秘人主指令：以 COC_KP_PRESET 的 `systemPrompt` 内容作为一条高优先级 `system` 条目（order 极小，排在双人成行 `main` 之前）。
   - `formatInstruction` marker（order 0.5）。
   - COC `postHistoryInstructions`（JSON 双页提醒，order ~110，置于历史后）。
   - 确认 `worldInfoBefore/After`、`chatHistory`、`dialogueExamples` marker 存在且 enabled。
3. **默认 enabled 重写**（见 §4 分类规则）。
4. **DeepSeek 采样参数**：`temperature` 等覆写为 DeepSeek 友好默认（如 temperature 1.0、topP 0.95 等，最终值在实现时定）。

> `main`(双人成行人设) 冲突处理：保留该条目但**默认关闭**；COC 守秘人指令作为独立高优先级 system 条目始终在前。用户可用悬浮窗自行开启双人成行人设做实验。

### 3.3 启动幂等种入：`migrations.ts` 同级新增 `seedFusionPreset()`
- 在 `App` 启动序列（`migrateFromLocalStorage` 之后）调用。
- 用 `kvStore` 的版本标记（如 `coc_fusion_preset_seeded = 'v6.1'`）保证**幂等只种一次**：
  - 若标记不存在：`buildFusionPreset` → 写入 `coc_presets_v1[<id>]` → 设 `coc_last_preset = <id>` → 写标记。
  - 若标记已存在：跳过（**不覆盖用户后续对开关的修改**）。
- "替掉旧预设"：新预设占据主 COC 预设位（沿用 id `p2` 或新 id 并设为默认；旧 `COC_KP_PRESET` 的守秘人内容已融入新预设的守秘人条目，不再单列）。最终 id 策略在实现时定，确保不破坏 `BUILTIN_PRESET_IDS` 与现有引用。

### 3.4 功能开关悬浮窗
- `TopBar` 加按钮 → 打开浮层（新组件 `src/components/Settings/PresetSwitchOverlay.tsx` 或挂 `usePanelStore`）。
- 数据：读当前 active 预设的 `promptItems`（按 order）；切换 → 改 `enabled` → `kvSet('coc_presets_v1', ...)` → 下一回合 `assemblePrompt` 生效。
- UI：当前预设名 + 搜索框；列表逐条（保留 emoji 名）+ 开关；按 `🔽/⬇️/⤵️` 开头的"分隔符条目"（content 空）自动分组、可折叠；结构性 marker 归"结构项"组置底并标注"谨慎关闭"。
- 复用项目动效规范（bezier 过渡、hover 增亮放大 + active 按压）。

## 4. 默认 enabled 分类规则

按条目名 emoji 前缀 + 关键词批量判定（少量人工微调）：

| 类别 | 判定 | 默认 |
|---|---|---|
| COC 机制 marker | 守秘人指令 / formatInstruction / worldInfo / chatHistory / dialogueExamples / postHistory(JSON提醒) | **开** |
| 杀八股 / 反套路 | `❎`、`⬇️杀八股`组、反神化/杀比拟/杀揭示/反全知/反固定/反转述只续写 | **开** |
| 叙事增强（中性） | 推剧情COT、防打断、生动化、物理规则、字数设定、摘要、防重复 | **开** |
| 模型专属 | `🤖模型选择`、Gemini/Claude/GLM 的 Core 与思维链 | DeepSeek：**关**这些（保留通用） |
| 文风 | 散文/西幻/古风/网文/红楼/ASMR 等具体文风 | **关**（备用） |
| 人称视角 | `🕐第一人称`/`🕑第二人称`/`🕒第三人称`/群像视角 | **关**（JSON 输出由 format 控制） |
| NSFW | `🔞` 系列、`🐬` 部位特化、色情COT、官能凝视 | **关**（备用） |
| 双人成行人设 | `main`(✅双人成行 Atri&Deach) | **关**（COC 守秘人优先） |
| 说明/占位 | `📑使用指南`、`🔽/⬇️/⤵️` 分隔符（content 空） | enabled 无意义，仅作悬浮窗分组标题 |

实现时产出一份「条目 id → 默认 enabled」的完整映射（基于上表规则跑一遍 233 条目，人工复核边界项）。

## 5. COC 机制保护（不可破坏项）

- `format-instruction`（JSON 双页契约）必注入且高优先级。
- COC `postHistoryInstructions`（恰好 4 选项、中文直角引号、JSON 字段）必注入于历史后。
- 世界书 marker 保留 → coc_lore / 文风推进 / 状态注入等内置世界书照常工作。
- 验证：融合预设跑一回合，输出仍为合法 JSON 双页（实测 + 解析器单测）。

## 6. 分阶段实现计划

**Phase 1（核心，先跑通）**：资源文件 + `buildFusionPreset` + `seedFusionPreset` 启动幂等种入 + DeepSeek 参数 + 默认 enabled 映射。验收：启动后预设列表出现融合预设并为默认，跑一回合输出合法 JSON 双页、COC 机制（检定/世界书/双页）正常。

**Phase 2（悬浮窗）**：`TopBar` 入口 + 浮层 UI + 开关读写 enabled + 搜索/分组。验收：开关即时改 enabled 并持久化、下一回合生效；不碰存档。

## 7. 测试

- `buildFusionPreset`：注入了 COC 机制 marker、默认 enabled 符合分类规则、DeepSeek 参数正确（纯函数单测）。
- `seedFusionPreset`：幂等（二次调用不覆盖)、首次种入写对 key（store 单测，复用 fake-indexeddb）。
- 注入兜底：融合预设经 `assemblePrompt` 后含 format-instruction（单测）。
- UI：悬浮窗开关、搜索、分组由用户实测。

## 8. 不做 / 边界

- 不改 `conversations/pages/charsheets` 等存档表与会话框架。
- 不删双人成行任何条目（启用与否交悬浮窗）。
- 不引入新依赖。
- 1.3MB 资源会增大包体（可接受；如需可后续做按需加载优化，非本期）。
