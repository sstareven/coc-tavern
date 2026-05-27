# SillyTavern 引擎层

**15 files.** 纯计算模块 + store-glue 模块分层。组件不直接引用引擎内部，通过 stores 和 InputBar.tsx 间接消费。

## OVERVIEW

SillyTavern 兼容引擎：世界书、变量、正则、Prompt 组装、斜杠命令、EJS 模板、API 路由。分为 **纯计算层**（无 store 依赖）和 **胶水层**（导入 stores）。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 发送 API 请求 | `api-router.ts` | stream + non-stream，OpenAI 兼容 |
| 组装 prompt 消息 | `prompt-assembler.ts` | 世界书注入，按 `prompt_order` 排序 |
| 正则脚本执行 | `regex-engine.ts` | `RegexProvider` 单例，LRU 缓存 |
| 斜杠命令 | `slash-commands.ts` | `initBuiltinCommands()` 注册 /roll /var /set /help |
| EJS 模板渲染 | `ejs-template.ts` | LRU 缓存模板，沙箱 eval |
| 世界书匹配 | `lorebook-engine.ts` | 关键词匹配，`lorestore` 注入 |
| Token 估算 | `token-counter.ts` | CJK 启发式算法 |
| 上下文裁剪 | `context-manager.ts` | Token 预算管理 |
| 变量操作 | `variables.ts` | 创建/提取/合并/剥离纯函数 |
| MVU 变量提取 | `mvu-extractor.ts` | LLM-based XML 变量提取，可选独立 API |
| 宏处理 | `macro-engine.ts` | `{{setvar/getvar/incvar/decvar}}` |
| 酒馆助手宏 | `tavern-helper-macros.ts` | `{{get_scope_variable}}` 解析 |
| 格式转换 | `format-converter.ts` | ST 格式 import/export ⚠️ 17 处 as any |
| 流解析 | `stream-parser.ts` | SSE chunk parser |
| 类型定义 | `types.ts` | 仅重导出 `../types` ⚠️ 冗余文件 |

## CONVENTIONS

- **kebab-case 文件名** — `prompt-assembler.ts`，非 PascalCase
- **JSDoc 注明来源** — 每个函数标注 "inspired by SillyTavern's..."
- **纯计算层** (`variables`, `regex-engine`, `prompt-assembler`, `token-counter`, `lorebook-engine`, `stream-parser`, `context-manager`, `ejs-template`, `format-converter`, `slash-commands`) — 不导入 stores，零副作用
- **胶水层** (`macro-engine`, `tavern-helper-macros`) — 导入 `stores/useTavernHelperStore`
- **LRU 缓存** — `RegexProvider` 和 `ejs-template` 使用 `Map` 实现 LRU 驱逐
- **命名导出** — 无 `export default`，与项目全局一致
- **懒加载 stores** — `slash-commands.ts` 内部用 `require()` 懒加载 stores（防循环引用）

## ANTI-PATTERNS

- `format-converter.ts` 有 17 处 `(p as any)` — 请求定义 Proper interface 消除
- `slash-commands.ts` 内联 roll 逻辑 — 应与 `useDiceStore.determineResult()` 合并
- `types.ts` 仅重导出 `../types` — 可删除，直接 import `../types`
- `lorebook-engine.ts` 的 `matchLorebooks()` 未在任何组件中被导入 — 可能死代码
