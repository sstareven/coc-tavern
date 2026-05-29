# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-29
**Commit:** `451a4db`
**Branch:** `master`

## OVERVIEW

深渊档案馆 — COC 7th TRPG 前端。故事书式 AI 叙事界面，融合 SillyTavern 酒馆架构（世界书、变量引擎、正则脚本、EJS 模板、斜杠命令）。

**Core stack**: React 19 + TypeScript 6 + Vite 8 + Zustand 5 + Dexie 4 + Framer Motion 12

## STRUCTURE

```
./
├── src/
│   ├── sillytavern/     # 引擎层 — 22 files, 纯计算 + store-glue + dice engine
│   ├── stores/          # 13 个 Zustand stores — 全部接入 IndexedDB (Dexie persist)
│   ├── components/
│   │   ├── Book/        # 故事书双页翻页 (6 files)
│   │   ├── CharSheet/   # COC 角色卡 + 创建向导 (7 files + steps/ 子目录 6 files)
│   │   ├── Dice/        # d100 骰子系统 (3 files)
│   │   ├── Landing/     # 开始界面 (2 files)
│   │   ├── Layout/      # GameView + TopBar + InputBar (3 files)
│   │   ├── Settings/    # 设置面板群 (13 files) ⚠️ junk drawer
│   │   └── Shared/      # 共享组件 (11 files)
│   ├── hooks/           # usePageFlip, useAudio, useChatPipeline, useStreamingRenderer (4 files)
│   ├── types/index.ts   # 单一类型源 (296 lines, ~20 domains)
│   ├── styles/          # tokens.css + global.css — 无 Tailwind/CSS Modules
│   ├── audio/sfx.ts     # Web Audio 合成音效
│   ├── db/              # Dexie IndexedDB 持久化层 — kvStore 单表 + 迁移 + 适配器 (5 files)
│   ├── test/setup.ts     # Vitest 环境 (fake-indexeddb + localStorage polyfill)
└── public/              # 应用 JSON 数据错放在此处 ⚠️
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| LLM API 调用 | `src/sillytavern/api-router.ts` | stream + non-stream |
| Prompt 组装 | `src/sillytavern/prompt-assembler.ts` | 世界书注入 + 模板渲染 |
| 正则脚本执行 | `src/sillytavern/regex-engine.ts` | LRU 缓存 Provider |
| 变量提取/合并 | `src/sillytavern/variables.ts` + `mvu-extractor.ts` | XML + LLM-based |
| 斜杠命令 | `src/sillytavern/slash-commands.ts` | `/roll /var /set /help` |
| EJS 模板 | `src/sillytavern/ejs-template.ts` | LRU 缓存，沙箱 eval |
| 状态管理 | `src/stores/useXxxStore.ts` | 13 stores，全部 Dexie persist 中间件持久化 |
| Dexie 数据库 | `src/db/database.ts` | kvStore 单表，`&key` 主键 |
| 数据迁移 | `src/db/migrations.ts` | localStorage→IndexedDB 自动迁移 |
| 角色创建 | `src/components/CharSheet/CharacterCreator.tsx` | 922 lines, 编排器（steps/ 子目录拆分） |
| 故事书翻页 | `src/components/Book/Storybook.tsx` + `PageFlip3D.tsx` | CSS 3D transform |
| 骰子检定 | `src/components/Dice/DicePanel.tsx` + `src/stores/useDiceStore.ts` + `src/sillytavern/dice-engine.ts` | 五级判定 + 奖励骰，骰子引擎已提取 |
| 聊天输入 | `src/components/Layout/InputBar.tsx` | 429 lines 薄壳（逻辑已提取到 useChatPipeline.ts） |
| 所有类型 | `src/types/index.ts` | 296 lines，可考虑按域拆分 |
| 宏引擎 | `src/sillytavern/unified-macro-engine.ts` | ST 兼容统一宏——占位符 / 变量简写 / 条件 / outlet / 嵌套（详见 `docs/macro-engine.md`） |
| TH 脚本引擎 | `src/sillytavern/th-script-engine.ts` | send/receive hook 生命周期 |
| COC 规则数据 | `src/sillytavern/coc-rules.ts` | CHAR_ROLL, getDBBuild, resolveSkillBase 等纯函数 |
| LLM 响应解析 | `src/sillytavern/llm-response-parser.ts` | parseLlmResponse（从 InputBar 提取） |
| Chat 管道 | `src/hooks/useChatPipeline.ts` | 561 lines, 主聊天管道 hook |

## CONVENTIONS

**TypeScript**: `verbatimModuleSyntax` (强制 `import type`)，`erasableSyntaxOnly` (禁止 enum/namespace)，`noUnusedLocals` + `noUnusedParameters` — 未使用变量 = 构建失败。注意：**未启用 `strict: true`**（无 `strictNullChecks`、`noUncheckedIndexedAccess`），采用显式 strict-adjacent 标志。

**导出**: 全部命名导出 (`export function` / `export const`)，无 `export default`。无 barrel `index.ts` — 所有 import 走显式相对路径。

**样式**: 100% 内联 `style={{}}`，用 `var(--gold)` 引用 `tokens.css` 中的 CSS 自定义属性。无 Tailwind、无 CSS Modules、无 styled-components。

**组件**: PascalCase + `interface Props` 在文件顶部，无 compound components / render props / slots。

**Zustand stores**: `useXxxStore` 命名，`create<XxxStore>()(persist(...))`，6 个 store 使用 persist middleware + Dexie 持久化。跨 store 访问用 ESM `import` + `getState()`。

**SillyTavern 引擎**: kebab-case 文件名，JSDoc 注明来源 ("inspired by SillyTavern's...")，纯计算函数与 store-glue 分层。

**Build**: `tsc -b && vite build`（项目引用模式，先类型检查后构建）。

## ANTI-PATTERNS (THIS PROJECT)

- **`as any` 强制转换** — `format-converter.ts` 的 17 处已全部消除 (31 any → 0)。禁止新增。
- **`require()` 在 sillytavern 引擎中** — `slash-commands.ts` (5 处) 和 `ejs-template.ts` (3 处) 用于避免循环依赖，绕过 Tree-shaking 和类型检查。stores 已改用 ESM import。
- **无 barrel 导出** — 每个 import 走显式路径。唯一的 barrel 是 `src/types/index.ts`（22 个消费者）。
- **`DEFAULT_PRESET` 已提取至 `src/constants/presets.ts`** ✅ — InputBar 用 `DEFAULT_INPUT_PRESET`，PresetEditor 用 `DEFAULT_EDITOR_PRESET`。
- **内联 style 对象重复** — `closeBtnStyle` / `actionBtnStyle` / `inputStyle` 在 10+ 文件中重复定义。`src/styles/panelStyles.ts` 仅提供 `closeBtnStyle`。新增 CSSProperties 前检查是否已有。
- **空 catch 块** — 44 处遍布 22 个文件，静默吞下错误。至少应加 `console.warn`。
- **直接 `localStorage` 绕过 Dexie** — `PresetPanel.tsx` (7 处)、`ExtManager.tsx` (2 处)、`useChatPipeline.ts` (2 处) 等绕过 persist 层直接操作 localStorage。
- **测试覆盖极低** — 仅 182 个 test（dice-engine 27 + coc-rules 18 + database 5 + char-variables 33 + macro-engine 99）。新增复杂逻辑应补测试。

## UNIQUE STYLES

- 洛夫克拉夫特式暗色主题：`--parchment` / `--leather` / `--abyss` / `--void` / `--gold` / `--blood`
- 字体：Georgia (标题) + Crimson Text (正文) + Inter (UI) + JetBrains Mono (代码) + Noto Serif SC (中文)
- 过渡：`0.35s cubic-bezier(0.4, 0, 0.2, 1)` (CSS `--transition-smooth`)
- 3D 翻页用原生 CSS `rotateY` + `transform-style: preserve-3d`，非 Framer Motion
- Framer Motion 仅用于出现/消失类动画 (modal, menu, tab switch)

## COMMANDS

```bash
npm run dev        # Vite 开发服务器
npm run build      # tsc -b 类型检查 + Vite 构建
npm run lint       # ESLint (flat config v10)
npm test           # Vitest (182 tests)
npm run preview    # 预览生产构建
```

## NOTES

- `src/db/database.ts` — Dexie schema + Zustand persist 中间件已激活（6 个 store 持久化至 IndexedDB）。白屏问题已修复
- `src/components/Book/PageFlip.tsx` 与 `PageFlip3D.tsx` 并存 — 前者用 Framer Motion，后者用 CSS 3D。
- Playwright `test-results/` 来自环境 agent，非项目测试。
- 测试覆盖：182 tests (27 dice + 18 COC rules + 5 database + 33 char-variables + 99 macro-engine)，Vitest + fake-indexeddb
- 子目录 AGENTS.md：`src/sillytavern/` `src/stores/` `src/hooks/` `src/db/` `src/components/Book/` `src/components/CharSheet/` `src/components/Dice/` `src/components/Layout/` `src/components/Settings/` `src/components/Shared/`

## 待办 / 已知问题

- [ ] 剩余 ~110 lint 警告（多为故意的 setState/沙箱 eval/Zustand selector 误报）
- [x] ~~`macro-engine.ts` + `tavern-helper-macros.ts` 已合并为 `unified-macro-engine.ts`~~ (99 tests)
- [ ] 预设角色档案的 personality/scenario/personaDescription 仅保留默认值（创建流程未收集）
- [ ] `src/sillytavern/llm-response-parser.ts` 从 `../components/Shared/KeywordTooltip` 导入 — 引擎→组件跨层违规，`addKeywordMeanings` 应移到引擎层
- [ ] `CodeBlockRenderer.tsx` 的 `setInterval` 未在 unmount 时清理，可能内存泄漏
- [ ] `PageFlip.tsx`（Framer Motion 版）与 `PageFlip3D.tsx`（CSS 3D 版）并存，旧版待清理
