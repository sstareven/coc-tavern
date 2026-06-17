# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-30
**Commit:** `4447b73`
**Branch:** `master`

## OVERVIEW

深渊档案馆 — COC 7th TRPG 前端。故事书式 AI 叙事界面，融合 SillyTavern 酒馆架构（世界书、变量引擎、正则脚本、EJS 模板、斜杠命令）。

**Core stack**: React 19 + TypeScript 6 + Vite 8 + Zustand 5 + Dexie 4 + Framer Motion 12

## STRUCTURE

```
./
├── src/
│   ├── sillytavern/     # 引擎层 — 37 源文件 (+test), 纯计算 + store-glue + dice engine + MVU ZOD
│   ├── stores/          # 18 个 store/helper (+3 test) — 7 个接入 IndexedDB (Dexie persist)
│   ├── components/
│   │   ├── Book/        # 故事书双页翻页 (9 files, PageFlip.tsx 已删除)
│   │   ├── CharSheet/   # COC 角色卡 + 创建向导 (7 files + steps/ 子目录 6 files)
│   │   ├── Dice/        # d100 骰子系统 (3 files)
│   │   ├── Landing/     # 开始界面 (3 files)
│   │   ├── Layout/      # GameView + TopBar + InputBar (3 files)
│   │   ├── Settings/    # 设置面板群 (13 files) ⚠️ junk drawer
│   │   └── Shared/      # 共享组件 (14 files + 1 test)
│   ├── hooks/           # usePageFlip, useAudio, useChatPipeline, useStreamingRenderer, useCharacterPresets (5 files)
│   ├── types/index.ts   # 单一类型源 (382 lines, ~20 domains)
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
| MVU ZOD 变量系统 | `mvu-jsonpatch.ts` + `mvu-charsheet-redirect.ts` + `mvu-var-access.ts` + `mvu-flatten.ts` + `mvu-format.ts` + `mvu-initial-statdata.ts` | JSON Patch(replace/delta/insert/remove/move) over statData 嵌套树;调查员.* 重定向角色卡(单源真理);`{{format_message_variable::stat_data}}` 宏;statData 存 useVariableStore 树 + blob 持久化 |
| 斜杠命令 | `src/sillytavern/slash-commands.ts` | `/roll /var /set /help` |
| EJS 模板 | `src/sillytavern/ejs-template.ts` | LRU 缓存，沙箱 eval |
| 状态管理 | `src/stores/useXxxStore.ts` | 18 store/helper，7 个 Dexie persist 持久化，其余纯内存 |
| Dexie 数据库 | `src/db/database.ts` | kvStore 单表，`&key` 主键 |
| 数据迁移 | `src/db/migrations.ts` | localStorage→IndexedDB 自动迁移 |
| 角色创建 | `src/components/CharSheet/CharacterCreator.tsx` | 959 lines, 编排器（steps/ 子目录拆分） |
| 故事书翻页 | `src/components/Book/Storybook.tsx` + `PageFlip3D.tsx` | CSS 3D transform（PageFlip.tsx 已删除） |
| 骰子检定 | `src/components/Dice/DicePanel.tsx` + `src/stores/useDiceStore.ts` + `src/sillytavern/dice-engine.ts` | 五级判定 + 奖励骰，骰子引擎已提取 |
| 聊天输入 | `src/components/Layout/InputBar.tsx` | 502 lines 薄壳（逻辑已提取到 useChatPipeline.ts） |
| 所有类型 | `src/types/index.ts` | 382 lines，可考虑按域拆分 |
| 宏引擎 | `src/sillytavern/unified-macro-engine.ts` | ST 兼容统一宏——占位符 / 变量简写 / 条件 / outlet / 嵌套（详见 `docs/macro-engine.md`） |
| TH 脚本引擎 | `src/sillytavern/th-script-engine.ts` | send/receive hook 生命周期 |
| COC 规则数据 | `src/sillytavern/coc-rules.ts` | CHAR_ROLL, getDBBuild, resolveSkillBase 等纯函数 |
| LLM 响应解析 | `src/sillytavern/llm-response-parser.ts` | parseLlmResponse（从 InputBar 提取） |
| Chat 管道 | `src/hooks/useChatPipeline.ts` | 851 lines, 主聊天管道 hook |
| RPM 限流 | `src/sillytavern/rpm-limiter.ts` | 滑动窗口，每 API 独立桶 (main/mvu/rewrite) |
| 行动补写 | `src/sillytavern/rewrite-instruction.ts` + `choice-match.ts` | 序章/补写模式只产 4 选项，解析失败重试 |
| 物品栏 | `src/stores/useInventoryStore.ts` | 按职业生成起始物品，分类 + 装备态 |
| 暗线引擎 | `src/stores/useDarkThreadStore.ts` | 伏笔/威胁进度追踪 |
| 暗骰 | `src/sillytavern/hidden-roll.ts` | 心理学等技能掷骰对玩家隐藏 |
| 世界书作用域 | `src/sillytavern/worldinfo-scope.ts` | global/chat 书激活与插入策略 |
| 会话生命周期 | `src/stores/sessionLifecycle.ts` | 跨 store 恢复游戏状态 |

## CONVENTIONS

**TypeScript**: `verbatimModuleSyntax` (强制 `import type`)，`erasableSyntaxOnly` (禁止 enum/namespace)，`noUnusedLocals` + `noUnusedParameters` — 未使用变量 = 构建失败。注意：**未启用 `strict: true`**（无 `strictNullChecks`、`noUncheckedIndexedAccess`），采用显式 strict-adjacent 标志。

**导出**: 全部命名导出 (`export function` / `export const`)，无 `export default`。无 barrel `index.ts` — 所有 import 走显式相对路径。

**样式**: 100% 内联 `style={{}}`，用 `var(--gold)` 引用 `tokens.css` 中的 CSS 自定义属性。无 Tailwind、无 CSS Modules、无 styled-components。

**组件**: PascalCase + `interface Props` 在文件顶部，无 compound components / render props / slots。

**Zustand stores**: `useXxxStore` 命名，`create<XxxStore>()(persist(...))`。全局态 5 个 store 用 persist + Dexie 持久化（settings/th/lorebooks/chat-meta/charPresets）；会话态（charsheet/inventory/darkThread/keyword/variable/book pages + TH.macroVars）为纯内存，由 `sessionLifecycle` 显式读写 Dexie v2 关系子表（按 conversationId 分表）。跨 store 访问用 ESM `import` + `getState()`。

**SillyTavern 引擎**: kebab-case 文件名，JSDoc 注明来源 ("inspired by SillyTavern's...")，纯计算函数与 store-glue 分层。

**Build**: `tsc -b && vite build`（项目引用模式，先类型检查后构建）。

## ANTI-PATTERNS (THIS PROJECT)

- **`as any` 强制转换** — 全 src 树 **0 处**（`format-converter.ts` 的 31 any → 0）。禁止新增。
- **`require()` 在 sillytavern 引擎中** — `slash-commands.ts` 的 5 处 require 已改顶层 ESM import（原 CJS 写法在纯 ESM 浏览器运行时恒抛 ReferenceError 被 catch 吞掉，致 /var /set /thvar 等命令永久失效）。引擎内现已无 require()，stores 全走 ESM import。
- **无 barrel 导出** — 每个 import 走显式路径。唯一的 barrel 是 `src/types/index.ts`（22 个消费者）。`@ts-ignore`/`@ts-expect-error` 全树 0 处，`export default` 全树 0 处。
- **`DEFAULT_PRESET` 已提取至 `src/constants/presets.ts`** ✅ — InputBar 用 `DEFAULT_INPUT_PRESET`，PresetEditor 用 `DEFAULT_EDITOR_PRESET`。
- **内联 style 对象重复** — `closeBtnStyle` / `actionBtnStyle` / `inputStyle` 在 10+ 文件中重复定义。`src/styles/panelStyles.ts` 仅提供 `closeBtnStyle`。新增 CSSProperties 前检查是否已有。
- **空 catch 块** — 已大幅清理至 **2 处**（`ExtManager.tsx:12`、`migrations.ts:33`）。`ejs-template.ts` 内的 catch 在模板字符串里（生成代码），非真实捕获。新增 catch 至少加 `console.warn`。
- **直接 `localStorage` 绕过 Dexie** — 现仅剩 `db/` 层合法用法（`kv.ts`、`migrations.ts` 共 4 处）。`PresetPanel.tsx`/`ExtManager.tsx`/`useChatPipeline.ts` 的旧绕过已消除。
- **测试覆盖** — 536 个 test，32 个 `.test.ts` 文件（macro-engine 102 + llm-response-parser 60 + mvu-jsonpatch 47 + dice-engine 35 + mvu-format 29 + resolvePlayerValue 23 + coc-rules 18 + mvu-charsheet-redirect 13 + keyword-injection 6 + extension-runtime 5 + regex-engine 4 + mvu-flatten/mvu-var-access/mvu-initial-statdata + prompt-assembler + rewrite-lite + item-acquisition 等）。新增复杂逻辑应补测试。

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
npm test           # Vitest (536 tests)
npm run preview    # 预览生产构建
```

## NOTES

- `src/db/database.ts` — Dexie schema + Zustand persist 中间件已激活（7 个 store 持久化至 IndexedDB）。白屏问题已修复
- `src/components/Book/PageFlip.tsx` 已删除 — 翻页统一由 `PageFlip3D.tsx`（CSS 3D）实现。
- Playwright `test-results/` 来自环境 agent，非项目测试。
- 测试覆盖：536 tests / 32 文件（macro-engine 102 + llm-response-parser 60 + mvu-jsonpatch 47 + dice-engine 35 + mvu-format 29 + resolvePlayerValue 23 + coc-rules 18 + mvu-charsheet-redirect 13 + choice-match 15 + keyword-injection 6 + extension-runtime 5 + prompt-assembler + rewrite-lite + item-acquisition + mvu-flatten/var-access/initial-statdata + ...），Vitest + fake-indexeddb
- 子目录 AGENTS.md：`src/sillytavern/` `src/stores/` `src/hooks/` `src/db/` `src/components/Book/` `src/components/CharSheet/` `src/components/Dice/` `src/components/Layout/` `src/components/Settings/` `src/components/Shared/`

## TESTING GUIDELINES

- **不要用 Chrome 或者 Playwright 去测试。** 本项目的前端验证以源码修复、类型检查（`tsc -b`）和单元测试（`npm test`）为主，不通过浏览器自动化工具做端到端测试。

## 待办 / 已知问题

- [ ] 剩余 ~110 lint 警告（多为故意的 setState/沙箱 eval/Zustand selector 误报）
- [x] ~~`macro-engine.ts` + `tavern-helper-macros.ts` 已合并为 `unified-macro-engine.ts`~~ (99 tests)
- [ ] 预设角色档案的 personality/scenario/personaDescription 仅保留默认值（创建流程未收集）
- [x] ~~`llm-response-parser.ts` 引擎→组件跨层违规已消除；`KeywordTooltip` 的死桩 `addKeywordMeanings` 已删除~~
- [x] ~~`CodeBlockRenderer.tsx` 的 `setInterval` 已在 useEffect cleanup 中 `clearInterval`，无泄漏~~
- [ ] 行动补写拾取（`itemGain`）：玩家点拾取选项A（已入库+记 `acquiredItems`）后再「重新续写」，会清空该页 `acquiredItems` 但**不移除已入库的物品A**；若随后再拾取B，则A、B皆在物品栏（v1 已接受的边界，re-roll 仅清去重记录不回滚物品）
- [x] ~~`PageFlip.tsx`（Framer Motion 版）已删除，翻页统一由 `PageFlip3D.tsx`（CSS 3D 版）实现~~
