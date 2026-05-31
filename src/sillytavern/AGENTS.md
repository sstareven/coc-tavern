# SillyTavern 引擎层

**28 源文件 (+test/support).** 纯计算模块 + store-glue 模块 + 骰子引擎分层。组件不直接引用引擎内部，通过 stores 和 hooks 间接消费。

## OVERVIEW

SillyTavern 兼容引擎：世界书、变量、正则、Prompt 组装、斜杠命令、EJS 模板、API 路由、TH 脚本、统一宏引擎、骰子引擎、COC 规则。分为 **纯计算层**（无 store 依赖）和 **胶水层**（导入 stores）。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 发送 API 请求 | `api-router.ts` | stream + non-stream，OpenAI 兼容 |
| 组装 prompt 消息 | `prompt-assembler.ts` | 世界书注入，按 `prompt_order` 排序 |
| 正则脚本执行 | `regex-engine.ts` | `RegexProvider` 单例，LRU 缓存 |
| 斜杠命令 | `slash-commands.ts` | `initBuiltinCommands()` 注册 /roll /var /set /help |
| EJS 模板渲染 | `ejs-template.ts` | LRU 缓存模板，沙箱 eval |
| 世界书匹配 | `prompt-assembler.ts` + `worldinfo-scope.ts` | `matchLoreEntries()` 在 assembler；global/chat 作用域与插入策略已提取到 `worldinfo-scope.ts` |
| 世界书作用域 | `worldinfo-scope.ts` | `resolveActiveBooks()` — global/chat 书激活，`evenly`/`global-first`/`chat-first` 插入策略 |
| Token 估算 | `token-counter.ts` | CJK 启发式算法 |
| 上下文裁剪 | `context-manager.ts` | Token 预算管理 |
| 变量操作 | `variables.ts` | 创建/提取/合并/剥离纯函数 |
| MVU 变量提取 | `mvu-extractor.ts` | LLM-based XML 变量提取，可选独立 API；`shouldUseLlmExtraction()` 按叙事数值线索门控 LLM 调用 |
| **统一宏引擎** | `unified-macro-engine.ts` | ST 兼容宏系统 — 占位符 + 变量简写 + 条件 + outlet + 嵌套（详见 `docs/macro-engine.md`） |
| TH 脚本引擎 | `th-script-engine.ts` | send/receive hook 生命周期，new Function 沙箱 |
| 格式转换 | `format-converter.ts` | ST 格式 import/export，所有 any 已消除 (31→0) |
| 流解析 | `stream-parser.ts` | SSE chunk parser |
| 骰子引擎 | `dice-engine.ts` | randD10, d100, determineResult 纯函数 |
| COC 规则数据 | `coc-rules.ts` | CHAR_ROLL, getDBBuild, resolveSkillBase 等纯函数 |
| COC 职业数据 | `coc-data.ts` | 职业列表 + 技能关联静态数据 |
| 格式指令 | `format-instruction.ts` | FORMAT_INSTRUCTION JSON 模板（从 InputBar 提取） |
| 后处理 | `post-processor.ts` | applyPostProcessing 消息合并函数 |
| 角色变量 | `character-variables.ts` | buildCharacterVariables 函数 |
| 上下文构建 | `context-builder.ts` | buildContextFromPages + computeNextPageNumber |
| LLM 响应解析 | `llm-response-parser.ts` | parseLlmResponse（从 InputBar 提取） |
| RPM 限流 | `rpm-limiter.ts` | 滑动窗口（60s），`main`/`mvu`/`rewrite` 三桶独立，`rpmEvaluate()` 纯函数 + 等待计算 |
| 行动补写指令 | `rewrite-instruction.ts` | `REWRITE_INSTRUCTION` 模板：补写模式只产过渡描述 + 4 候选选项，不推进剧情/不掷骰 |
| 轻量补写选择 | `rewrite-lite.ts` | `selectLoreForRewrite()` / `droppedLoreForRewrite()`：轻量补写只留 constant 世界书(可选保留匹配世界书)，丢弃摘要/暗线/注入，省 token |
| 选项匹配 | `choice-match.ts` | `normalizeChoiceText()` / `matchesExistingChoice()`，剥离 `<var>`/骰子标记后严格比对 |
| 暗骰 | `hidden-roll.ts` | `isHiddenRollSkill()`（心理学等），结果对玩家隐藏，token 占位提交真值给 LLM |
| 骰子输入解析 | `parse-dice-input.ts` | 解析玩家骰子输入表达式 |
| 骰子测试 | `dice-engine.test.ts` | 35 个 characterization test |
| 宏引擎测试 | `unified-macro-engine.test.ts` | 99 个测试，覆盖所有宏类型 |

## CONVENTIONS

- **kebab-case 文件名** — `prompt-assembler.ts`，非 PascalCase
- **JSDoc 注明来源** — 每个函数标注 "inspired by SillyTavern's..."
- **纯计算层** (`variables`, `regex-engine`, `prompt-assembler`, `token-counter`, `stream-parser`, `context-manager`, `format-converter`, `dice-engine`, `coc-rules`, `coc-data`, `post-processor`, `mvu-extractor`, `format-instruction`, `rewrite-instruction`, `unified-macro-engine`, `choice-match`, `hidden-roll`, `parse-dice-input`, `worldinfo-scope`) — 不导入 stores，零副作用
- **胶水层** (`character-variables`, `context-builder`, `llm-response-parser`, `th-script-engine`, `rpm-limiter`) — 导入 stores（`rpm-limiter` 读 `useSettingsStore` 的 RPM 配置）
- **混合层** (`ejs-template`, `slash-commands`) — 内部使用 `require()` 懒加载 stores，防止循环引用
- **LRU 缓存** — `RegexProvider` 和 `ejs-template` 使用 `Map` 实现 LRU 驱逐
- **命名导出** — 无 `export default`，与项目全局一致
- **懒加载 stores** — `slash-commands.ts` 内部用 `require()` 懒加载 stores（防循环引用）

## ANTI-PATTERNS

- `format-converter.ts` 所有 17 处 `(p as any)` 已消除 — 禁止新增
- `slash-commands.ts` 内联 roll 逻辑已委托给 `dice-engine.ts`
- **跨层违规** — `llm-response-parser.ts` 从 `../components/Shared/KeywordTooltip` 导入 `addKeywordMeanings`。引擎层不应依赖组件层。应将该函数移到引擎层或 store 层
- `ejs-template.ts` 和 `th-script-engine.ts` 使用 `new Function` + `with()` — 有意为之（仿 ST 沙箱），但需审计作用域污染
- **图层分类不精确** — `character-variables.ts`、`context-builder.ts`、`llm-response-parser.ts` 均导入 stores，应从"纯计算层"移至"胶水层"
