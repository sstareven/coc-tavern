# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-06
**Branch:** `master`

## OVERVIEW

深渊档案馆 — COC 7th TRPG 前端。故事书式 AI 叙事界面，融合 SillyTavern 酒馆架构（世界书、变量引擎、正则脚本、EJS 模板、斜杠命令）。

**Core stack**: React 19 + TypeScript 6 + Vite 8 + Zustand 5 + Dexie 4 + Framer Motion 12

**App entry**: `src/main.tsx` → `src/App.tsx`. App starts with loading sequence: init slash commands → init KV cache → seed fusion preset → migrate localStorage → open DB (v2 upgrade) → restore active session from Dexie.

**Build**: `tsc -b && vite build` (project references mode: typecheck then bundle). Chunk size warning at 1024 KiB.

## STRUCTURE

```
src/
├── sillytavern/     # 引擎层 — 100+ 源文件 (+~60 test), 纯计算 + 胶水 + 骰子 + MVU ZOD
│   ├── api-router.ts               # LLM API 调用 (stream + non-stream)
│   ├── prompt-assembler.ts         # 世界书注入 + prompt 编排
│   ├── unified-macro-engine.ts     # ST 兼容统一宏
│   ├── deepseek-cache*.ts          # DeepSeek 前缀缓存命中优化 (3 files)
│   ├── combat-*.ts                 # 战斗引擎 (detector/engine/controller/entry/bout-*)
│   ├── mvu-*.ts                    # MVU ZOD 变量系统 (~8 files)
│   ├── dice-engine.ts              # d100 五级判定 + 奖励/惩罚骰
│   ├── coc-rules.ts                # COC 7th 规则纯函数
│   ├── subagent-call.ts            # 子调用 API 请求封装
│   ├── sanity-*.ts                 # 理智检定系统
│   └── …                           # ~80 more files
├── stores/          # 25+ Zustand stores — 5 个 Dexie persist, 其余纯内存
├── components/
│   ├── Book/        # 故事书双页 3D 翻页 (CSS rotateY + preserve-3d)
│   ├── CharSheet/   # COC 角色卡 + 6 步创建向导
│   ├── Combat/      # 即时战斗面板
│   ├── Dice/        # d100 骰子系统
│   ├── Inventory/   # 物品栏/线索浮层
│   ├── Landing/     # 开始界面/读档/更新日志
│   ├── Layout/      # GameView + TopBar + InputBar
│   ├── Map/         # 地点地图网络
│   ├── NPC/         # 人物名册
│   ├── Settings/    # 设置面板群 (17 files) ⚠️ junk drawer
│   └── Shared/      # 共享组件 (21 files)
├── hooks/           # 11 hooks — useChatPipeline, useStreamingRenderer, usePageFlip 等
├── types/index.ts   # 单一类型源
├── styles/          # tokens.css + global.css — 无 Tailwind/CSS Modules
├── db/              # Dexie IndexedDB 持久化层 (v1 kvStore + v2 关系子表)
├── constants/       # presets.ts + prompt-library.ts
├── audio/sfx.ts     # Web Audio 合成音效
├── utils/           # auto-name-form-fields.ts (form field polyfill)
└── test/setup.ts    # Vitest 环境 (fake-indexeddb + localStorage polyfill)
```

## SIZING (verified 2026-06-06)

| Metric | Value |
|--------|-------|
| Source files (.ts + .tsx) | 214 |
| Test files (.test.ts/.tsx) | 110 |
| Tests (all passing) | **1471** |
| SillyTavern engine files | ~130 (source + test) |
| Zustand stores | 25+ |
| IndexedDB persist stores | 5 (`settings/th/lorebook/chat-meta/charPresets`) |
| Session stores (memory) | 7+ (`charsheet/inventory/darkThread/keyword/variable/book pages/TH.macroVars`) |
| Run time | ~6s (transform 28s, setup 17s, import 51s, tests 9s) |

## WHERE TO LOOK (key files)

| Task | Location | Notes |
|------|----------|-------|
| LLM API 调用 | `src/sillytavern/api-router.ts` | stream + non-stream, OpenAI 兼容, 子调用封装在 `subagent-call.ts` |
| Prompt 组装 | `src/sillytavern/prompt-assembler.ts` | 世界书注入 + 模板渲染 + 三区重组 |
| DeepSeek 缓存 | `src/sillytavern/deepseek-cache-restructure.ts` + `deepseek-cache.ts` + `prefix-cache-diagnostics.ts` | 消息三区重组 + 静态前置/动态尾置 + 前缀漂移诊断 |
| 战斗引擎 | `combat-detector.ts` → `combat-engine.ts` → `combat-controller.ts` → `combat-entry.ts` + `bout-dispatch.ts` + `bout-evaluator.ts` | 完整 COC 7th 战斗流程 |
| 理智检定 | `sanity-engine.ts` + `sanity-prompt-engine.ts` | 被动 SAN 气泡 + 检定面板 |
| 统一宏引擎 | `unified-macro-engine.ts` | ST 兼容——占位符/变量简写/条件/outlet/嵌套 |
| MVU ZOD 变量系统 | `mvu-jsonpatch.ts` + `mvu-charsheet-redirect.ts` + `mvu-var-access.ts` + `mvu-flatten.ts` + `mvu-format.ts` + `mvu-initial-statdata.ts` | JSON Patch over statData 嵌套树 |
| 斜杠命令 | `slash-commands.ts` | `/roll /var /set /help`, 用 `initBuiltinCommands()` 在 App 启动时注册 |
| 状态管理 | `src/stores/useXxxStore.ts` | 25+ stores |
| Dexie 数据库 | `src/db/database.ts` | kvStore (v1) + 关系子表 (v2) |
| Chat 管道 | `src/hooks/useChatPipeline.ts` | 541 lines, 主聊天管道 |
| 会话生命周期 | `src/stores/sessionLifecycle.ts` | 跨 store 恢复/保存游戏状态, 串行化 enqueue |
| 行动补写 | `rewrite-instruction.ts` + `choice-match.ts` + `rewrite-lite.ts` | 轻量补写只留 constant worldbook |
| 骰子检定 | `DicePanel.tsx` + `useDiceStore.ts` + `dice-engine.ts` + `parse-dice-input.ts` | 五级判定 + 奖励骰 |
| COC 规则数据 | `coc-rules.ts` + `coc-data.ts` + `coc-weapons.ts` + `coc7e-tables.ts` | 纯函数 |

## CONVENTIONS

**TypeScript**: `verbatimModuleSyntax` (强制 `import type`), `erasableSyntaxOnly` (禁止 enum/namespace), `noUnusedLocals` + `noUnusedParameters` — 未使用变量 = 构建失败. **未启用 `strict: true`** (无 `strictNullChecks`, `noUncheckedIndexedAccess`). `target: es2023`, `moduleResolution: bundler`.

**导出**: 全部命名导出 (`export function` / `export const`), 无 `export default`. 无 barrel `index.ts` — 所有 import 走显式相对路径. 唯一的例外是 `src/types/index.ts` (22 个消费者).

**样式**: 100% 内联 `style={{}}`, 用 `var(--gold)` 引用 `tokens.css` 中的 CSS 自定义属性. 无 Tailwind, 无 CSS Modules, 无 styled-components. 共享样式常量存在 `src/styles/panelStyles.ts`.

**组件**: PascalCase + `interface Props` 在文件顶部, 无 compound components / render props / slots.

**Zustand stores**: `useXxxStore` 命名, `create<XxxStore>()(persist(...))`. 5 个全局态 store 用 persist + Dexie 持久化 (`settings`/`th`/`lorebook`/`chat-meta`/`charPresets`). 会话态 stores 为纯内存, 由 `sessionLifecycle` 显式读写 Dexie v2 关系子表 (按 `conversationId` 分表). 跨 store 访问用 ESM `import` + `getState()`.

**SillyTavern 引擎**: kebab-case 文件名, JSDoc 注明来源 ("inspired by SillyTavern's..."), 纯计算函数与 store-glue 分层.

## ARCHITECTURE NOTES

**图层分层 (sillytavern/)**:
- **纯计算层** (零 store 导入): `variables`, `regex-engine`, `prompt-assembler`, `token-counter`, `stream-parser`, `context-manager`, `format-converter`, `dice-engine`, `coc-rules`, `coc-data`, `post-processor`, `mvu-extractor`, `format-instruction`, `rewrite-instruction`, `unified-macro-engine`, `choice-match`, `hidden-roll`, `parse-dice-input`, `worldinfo-scope`, `keyword-injection`, `extension-runtime`
- **胶水层** (导入 stores): `character-variables`, `context-builder`, `llm-response-parser`, `th-script-engine`, `rpm-limiter`, `slash-commands`
- **混合层**: `ejs-template` (内部 `require()` 懒加载 stores 防循环引用)

**持久化架构**: 双层 — 全局态走 Zustand persist + `createDexieStorage` 适配器 → kvStore 单表; 会话态由 `sessionLifecycle.ts` 显式读写 Dexie v2 关系子表 (conversations 父表 + pages/charsheets/inventory/darkThreads/keywords/gameVars/macroVars 子表). 见 `src/db/AGENTS.md` 详细架构图.

**App 启动顺序**:
1. `initBuiltinCommands()` — 注册斜杠命令
2. `initKvCache()` — 预热同步 KV 缓存
3. `seedFusionPreset()` — 种入默认融合预设
4. `migrateFromLocalStorage()` — 幂等迁移旧数据
5. `db.open()` — 打开 Dexie (含 v2 upgrade)
6. 恢复活跃会话 `loadConversation(activeId)`

**CSP**: `index.html` 含宽松 CSP — `'unsafe-eval'` (EJS/TH 脚本用 `new Function`), `'unsafe-inline'` (React 内联 style), `connect-src *` (任意 OpenAI 兼容端点). 纯前端 SPA, 无服务器, 攻击面有限, 此 CSP 可接受.

**Mobile**: 视口 ≤768px 自动切单页便条式, `100dvh` 稳定高度, `visualViewport` 键盘跟随. 见 `useIsMobile.ts` / `useResponsiveZoom.ts` / `useViewportHeight.ts`.

## ANTI-PATTERNS (STOP BEFORE ADDING)

- **`as any` 强制转换** — 全 src 树 0 处 (格式转换已清理). 禁止新增.
- **`require()` 在 sillytavern 引擎中** — 已全部改为 ESM import. 引擎内无 require. (仅 `ejs-template.ts` 内部用 `require()` 懒加载 stores 防循环引用, 是例外.)
- **`export default`** — 全树 0 处. 禁止新增.
- **`@ts-ignore` / `@ts-expect-error`** — 全树 0 处. 禁止新增.
- **直接 `localStorage` 绕过 Dexie** — 仅 `db/` 层合法 (kv.ts/migrations.ts). 组件/store 层禁止直接读写 localStorage.
- **空 catch 块** — 现有 ~2 处 (ExtManager.tsx, migrations.ts). 新增 catch 至少加 `console.warn`.
- **内联 style 对象重复** — `closeBtnStyle`/`actionBtnStyle`/`inputStyle` 在 Settings/* 中大量重复. 新增前检查 `src/styles/panelStyles.ts`.
- **PresetEditor.tsx 有 27 处 `any`** — 明知的技术债务, 新增代码不要在附近加更多 any.
- **`useLogStore` 的 `pushLog()` 双重导出** — 既是 store 方法又是独立函数. 新 store 避免这种模式.
- **`useDiceStore` 导入 `dice-engine.ts`** — store 反向导入引擎层, 依赖方向可疑. 新 store 不要反向导入.

## COMMANDS

```bash
npm run dev        # Vite 开发服务器 (默认 :5173)
npm run build      # tsc -b 类型检查 + Vite 生产构建
npm run lint       # ESLint (flat config v10) — 约 110 已知 warning (setState/沙箱 eval/Zustand selector 误报)
npm test           # Vitest — 1471 tests (11 个 test files, ~6s)
npm test -- --watch # Vitest 监听模式
npm run preview    # 预览生产构建 (dist/)
```

**Note**: `npm test` uses `vitest run` (CI mode, single run). `npm test -- --watch` for watch mode. Test environment is `node` (not jsdom) with `fake-indexeddb`.

## CONFIG FILES

| File | Purpose |
|------|---------|
| `.mcp.json` | codegraph MCP server (stdio, `codegraph serve --mcp`) |
| `.claude/settings.json` | Claude Desktop permissions (codegraph tools) |
| `.opencode/oh-my-openagent.jsonc` | OpenCode team mode (enabled, max 4 parallel) |
| `vite.config.ts` | Minimal — only `@vitejs/plugin-react` + chunk size warning 1024 |
| `vitest.config.ts` | `environment: 'node'`, setup: `src/test/setup.ts` |
| `eslint.config.js` | Flat config v10, `tseslint.recommended` + `reactHooks` + `reactRefresh` |
| `tsconfig.json` | Project references → `tsconfig.app.json` + `tsconfig.node.json` |

## TESTS

- **Framework**: Vitest + `fake-indexeddb` + `fetch-mock` (in `mvu-fetch` tests)
- **Pattern**: Files co-located next to source as `*.test.ts` under `src/`
- **Top coverage modules**: `unified-macro-engine` (99), `llm-response-parser` (60), `mvu-jsonpatch` (47), `dice-engine` (35), `mvu-format` (29), `resolvePlayerValue` (23), `coc-rules` (18), `mvu-charsheet-redirect` (13), `choice-match` (15)
- **Store tests**: All major stores have `.test.ts` files in `src/stores/__tests__/`
- **Setup**: `src/test/setup.ts` provides `fake-indexeddb` + `localStorage` polyfill

## KNOWN ISSUES / TODOS

- [ ] ~110 lint warnings (mostly intentional: setState deps, sandbox eval, Zustand selector false positives)
- [ ] PresetEditor.tsx has 27 `any` — partial type modeling, `_contentReadOnly` hacks via `as any`
- [ ] `useChatPipeline` (541 lines) — hook taking too many responsibilities, could split
- [ ] `SettingsPanel.tsx` (839 lines) — inline sub-components should be extracted
- [ ] `useLorebookStore` (602+ lines) — largest store, default lorebooks hardcoded inline
- [ ] Preset character `personality`/`scenario`/`personaDescription` only have defaults (not collected in creation flow)
- [ ] Action rewrite re-roll: picks item A (saved), re-rolls → doesn't remove item A from inventory, subsequent picks cause duplicates (accepted v1 boundary)

## SUBDIRECTORY AGENTS.md FILES

Each major directory has its own `AGENTS.md` with deeper detail:
- `src/sillytavern/AGENTS.md` — 引擎层分层 + 文件映射
- `src/stores/AGENTS.md` — 所有 store 列表 + 持久化策略 + 跨 store 依赖
- `src/hooks/AGENTS.md` — hook 职责 + anti-patterns
- `src/db/AGENTS.md` — 持久化架构图 + migration flow + v1/v2 schema
- `src/components/Book/AGENTS.md` — 翻页系统 + 跨目录依赖
- `src/components/CharSheet/AGENTS.md` — 角色创建 6 步流程
- `src/components/Shared/AGENTS.md` — 共享组件清单
- `src/components/Layout/AGENTS.md` — 应用外壳 + InputBar 重构说明
- `src/components/Settings/AGENTS.md` — 设置面板群 + duplicate style anti-patterns

## UNIQUE STYLES

- 洛夫克拉夫特式暗色主题: `--parchment` / `--leather` / `--abyss` / `--void` / `--gold` / `--blood`
- 字体: Georgia (标题) + Crimson Text (正文) + Inter (UI) + JetBrains Mono (代码) + Noto Serif SC (中文)
- 过渡: `0.35s cubic-bezier(0.4, 0, 0.2, 1)` (CSS `--transition-smooth`)
- 3D 翻页用原生 CSS `rotateY` + `transform-style: preserve-3d`, 非 Framer Motion
- Framer Motion 仅用于出现/消失类动画 (modal, menu, tab switch)
