# 行动补写（Action Rewrite）设计文档

日期：2026-05-30
状态：已与用户确认设计方向，待写实现计划

## 1. 背景与目标

当前每一页右栏提供恰好 4 个预设行动选项（`I–IV`）。玩家若想做这 4 个选项之外的自定义行动，只能在输入框手敲，但界面缺乏针对"选项外行动"的专门支持。

**目标**：当玩家在输入框写下既非 `/` 指令、也不匹配任何现有选项的自定义行动时，提供"行动补写"能力——由 AI 承接玩家意图，生成一小段过渡叙述 + 4 个具体的候选行动选项，**就地追加在原 4 个选项下方，且不推进剧情**。玩家可反复"重新续写"换一批选项（带动效），或点击任一选项才真正推进。

## 2. 核心交互流程

1. 玩家在输入框输入文字。
2. 底部按钮根据输入内容**实时判定状态**（见 §3）：高亮「推进」或「行动补写」之一。
3. 玩家点击：
   - 高亮「推进」→ 走现有 `pipeline.submit`（正常推进一回合）。
   - 高亮「行动补写」→ 走新的 `pipeline.rewriteAction`（生成续写文字 + 4 候选选项，写入当前页 `rewrite` 字段，不推进）。
4. 补写产出后，输入框内容不变（仍是那句自定义文字，仍不匹配选项）→「行动补写」保持高亮。玩家：
   - 再点「行动补写」= **重新续写**：覆盖当前 `rewrite` 字段，新选项带随机变化动效。
   - 点击右栏任一选项（原 I–IV 或补写的 V–VIII）= 真正推进，走选项原有点击逻辑。
5. 补写产出随当前页 `savePages` 持久化，读档后仍在。

## 3. 双态推进按钮（`src/components/Layout/InputBar.tsx`）

将现有单一「推 进」按钮（`InputBar.tsx:342-372`）替换为**上下两行的复合按钮**：上行 `推 进`、下行 `行动补写`。

**判定规则**（输入框 `input` 实时计算，理论上只满足其一）：

| 条件 | 高亮行 | 点击动作 |
| --- | --- | --- |
| `input` 为空 | 推进（默认态） | 点击 = `pipeline.submit('')`，沿用现有 `submit` 对空输入的行为（当前为无操作，不臆造新语义） |
| `input` 以 `/` 开头 | 推进 | `pipeline.submit(input)`（指令） |
| `input` 强相关匹配当前页某选项（见 §4） | 推进 | `pipeline.submit(input)` |
| 以上都不满足（选项外自定义文字） | 行动补写 | `pipeline.rewriteAction(input)` |

- 高亮行：正常的金色描边/高亮（沿用现有按钮配色 `var(--gold)` 系）。
- 非高亮行：变暗、`pointer-events: none`，视觉上明确"当前不可用"。
- `pipeline.loading` 时整个按钮禁用（沿用现有逻辑）。
- 状态切换用 `var(--transition-smooth)` 平滑过渡（高亮在两行间滑动/淡变）。

## 4. 强相关匹配（`src/sillytavern/` 新增纯函数）

新增纯函数 `matchesExistingChoice(input: string, choices: ChoiceItem[]): boolean`，放在新文件 `src/sillytavern/choice-match.ts`（便于单测）。

**算法**：对每个选项的 `text` 与 `action` 分别做规范化后**严格相等**比对：

- 规范化 `normalize(s)`：去首尾空白、折叠内部连续空白为单个、移除常见标点（`，。！？、；：,.!?;:` 与中英引号括号）、全角转半角、统一小写。
- 任一选项的 `normalize(text)` 或 `normalize(action)` 等于 `normalize(input)` → 返回 `true`。

**理由**：点击选项时输入框被填入选项原文（`action`），规范化后必然相等 → 判为推进；玩家手敲自己的话几乎不可能逐字相等 → 判为补写。采用严格相等而非模糊相似度，避免"意思相近"的误判（用户明确要求"强相关"）。`action` 中可能含 `<var .../>` 标记，规范化时一并剥离（复用 `stripMvu` 或局部去标签）。

匹配的选项集合 = 当前页 `rightChoices` ∪ `rewrite.choices`（若存在）。

## 5. 数据模型（方案 A，`src/types/index.ts`）

`BookPage` 新增可选字段，与原 `rightChoices`/`rightContent` 完全隔离：

```ts
export interface RewriteBlock {
  /** 承接玩家意图的过渡叙述，不含结果、不推进剧情 */
  text: string;
  /** 4 个候选行动选项，编号续接原选项（V–VIII） */
  choices: ChoiceItem[];
  /** 玩家触发补写时的原始输入，用于"重新续写"复用与匹配 */
  sourceInput: string;
}

export interface BookPage {
  // ...现有字段...
  rewrite?: RewriteBlock;
}
```

- 重新续写：整体覆盖 `page.rewrite`。
- 隔离的好处：原选项不被污染；可整体重 roll；保存/清理干净；渲染层易于区分。

## 6. 补写生成（`src/hooks/useChatPipeline.ts` 新增 `rewriteAction`）

新增方法 `rewriteAction(input: string): Promise<void>`，加入 pipeline 返回对象。

**流程**：

1. 校验：`loadingRef` 空闲、API key 已配置；否则 `setError`。
2. 复用现有 `buildPromptMessages` 的上下文组装（世界书、变量、检定规则、当前页摘要等），保证候选选项贴合情境。
3. 在消息末尾追加**专门的补写指令**（新增 `src/sillytavern/rewrite-instruction.ts`，类似 `format-instruction.ts`）：
   - 要求只输出 JSON：`{ "text": "...", "choices": [{num,text,action} x4] }`。
   - 明确："这是玩家的选项外自定义行动，请承接其意图写一段简短过渡叙述（不产生结果、不推进剧情、不掷骰），并给出 4 个具体的后续行动候选选项（含 action 与检定标记，遵循现有检定格式）。"
   - 选项 `num` 续接为 `V–VIII`。
   - 重新续写时（`page.rewrite` 已存在）追加："请给出与上次明显不同的 4 个方案。"
4. 调用 API（API 选择见 §8），解析返回 JSON（复用/扩展 `llm-response-parser` 的修复逻辑，含 §错误处理的引号兜底）。
5. 解析成功 → 写入当前页 `page.rewrite`（通过 `useBookStore` 新增 action `setPageRewrite(index, block)`）→ `chatStore.savePages` 持久化。
6. 解析失败 → `setError('行动补写生成失败')`，不改动页面。

补写**不**新增页面、**不**调用 darkThread/inventory 等推进副作用，只产出 `RewriteBlock`。

## 7. UI 渲染（`src/components/Book/RightPage.tsx`）

`RightPage` 接收当前页 `rewrite`（新增 prop）。渲染顺序：

```
正文 content
原选项 I–IV（现有 ChoiceButton 列表）
── 若存在 rewrite ──
  分隔线 + 续写文字（rewrite.text，叙述样式）
  补写选项 V–VIII（复用 ChoiceButton）
```

- 补写选项点击行为与原选项**完全一致**（复用 `ChoiceButton` → `fillInputBar`），不做特殊处理。
- 续写文字用与正文一致的羊皮纸叙述排版，前置一条细分隔线以示"AI 补写区"。

## 8. 设置项（`src/stores/useSettingsStore.ts` + 设置面板）

复用现有 MVU 独立 API 范式（`mvuUseIndependentApi` 等，`useSettingsStore.ts:17-20`）：

```ts
rewriteUseIndependentApi: boolean;   // 默认 false = 用主 API
rewriteApiBaseUrl: string;
rewriteApiModel: string;
rewriteApiKey: string;
```

- 默认 `false`：补写走主 API（`apiBaseUrl/apiModel/apiKey`）。
- `true`：走独立 API。`rewriteAction` 内据此选择参数（复用 `api-router` 的调用方式，仿照 MVU 独立 API 的分支）。
- 设置面板中新增一组配置，紧邻 MVU 独立 API 那组，交互/样式一致。

## 9. 动效（重新续写时，framer-motion）

- 旧补写选项整体淡出 + 轻微下移（`y: +8, opacity: 0`）。
- 新选项**逐个错位淡入上滑**（`AnimatePresence` + stagger，每项延迟 ~50ms，`y: 8→0, opacity: 0→1`）。
- 续写文字淡入。
- 过渡曲线统一用项目约定的 `cubic-bezier(0.4, 0, 0.2, 1)`。
- 首次补写产出也用同一入场动效。

## 10. 错误处理

- API 未配置 / 网络失败 → `setError`，不改页面。
- JSON 解析失败 → 复用 `llm-response-parser` 的修复管线（含已落地的裸引号兜底 `escapeStrayInnerQuotes`）；仍失败则 `setError('行动补写生成失败')`，保留旧 `rewrite`（若有）。
- 补写返回选项数 ≠ 4 → 截断/补足到 4（复用 parser 现有 choices 补足逻辑）。
- `loading` 期间禁止重复触发（`loadingRef`）。

## 11. 测试计划

- `choice-match.test.ts`：规范化相等/不等、空白与标点边界、`action` 含 `<var>` 标记、全半角、空输入、`/` 指令不进入匹配。
- 补写 JSON 解析：合法、缺字段、选项数 ≠ 4、裸引号修复。
- 按钮状态判定纯函数（抽出 `resolveButtonMode(input, choices): 'advance' | 'rewrite'`）单测：空/指令/匹配/不匹配四类。
- `useBookStore.setPageRewrite` + 保存恢复（`rewrite` 字段随 `savePages`/`getActivePages` 往返）。

## 12. 涉及文件清单

新增：
- `src/sillytavern/choice-match.ts`（+ test）
- `src/sillytavern/rewrite-instruction.ts`
- 按钮模式判定纯函数（可并入 `choice-match.ts`，+ test）

修改：
- `src/types/index.ts`（`RewriteBlock` + `BookPage.rewrite`）
- `src/components/Layout/InputBar.tsx`（双态按钮）
- `src/hooks/useChatPipeline.ts`（`rewriteAction`）
- `src/components/Book/RightPage.tsx`（渲染 rewrite 区 + 动效）
- `src/stores/useBookStore.ts`（`setPageRewrite` action）
- `src/stores/useSettingsStore.ts`（4 个设置字段 + setter）
- 设置面板组件（新增独立 API 配置组）
- 当前页传递链路：`Storybook.tsx`/`GameView` 把 `rewrite` 传到 `RightPage`

## 13. 非目标（YAGNI）

- 不支持补写选项的"多层嵌套补写"（对补写选项再补写）——补写选项点击即走正常推进。
- 不为补写单独建页/单独的对话记录条目，仅作为当前页的附属字段。
- 不做选项"部分保留、部分替换"的精细重 roll，重新续写整体覆盖。
- 不引入与 MVU 不同的第三套 API 抽象，复用现有范式。
