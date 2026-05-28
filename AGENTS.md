# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-28
**Commit:** `3f5ab4c`
**Branch:** `master`

## OVERVIEW

深渊档案馆 — COC 7th TRPG 前端。故事书式 AI 叙事界面，融合 SillyTavern 酒馆架构（世界书、变量引擎、正则脚本、EJS 模板、斜杠命令）。

**Core stack**: React 19 + TypeScript 6 + Vite 8 + Zustand 5 + Dexie 4 + Framer Motion 12

## STRUCTURE

```
./
├── src/
│   ├── sillytavern/     # 引擎层 — 15 files, pure computation + store-glue split
│   ├── stores/          # 12 个 Zustand stores — 无 middleware，手写 localStorage 持久化
│   ├── components/
│   │   ├── Book/        # 故事书双页翻页 (6 files)
│   │   ├── CharSheet/   # COC 角色卡 + 创建向导 (6 files)
│   │   ├── Dice/        # d100 骰子系统 (3 files)
│   │   ├── Landing/     # 开始界面 (2 files)
│   │   ├── Layout/      # GameView + TopBar + InputBar (3 files)
│   │   ├── Settings/    # 设置面板群 (13 files) ⚠️ junk drawer
│   │   └── Shared/      # 共享组件 (10 files)
│   ├── hooks/           # usePageFlip, useAudio (2 files)
│   ├── types/index.ts   # 单一类型源 (296 lines, ~20 domains)
│   ├── styles/          # tokens.css + global.css — 无 Tailwind/CSS Modules
│   ├── audio/sfx.ts     # Web Audio 合成音效
│   └── db/database.ts   # Dexie schema (未接入任何 store)
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
| 状态管理 | `src/stores/useXxxStore.ts` | 12 stores，单域单 store |
| 角色创建 | `src/components/CharSheet/CharacterCreator.tsx` | 2079 lines ⚠️ god component |
| 故事书翻页 | `src/components/Book/Storybook.tsx` + `PageFlip3D.tsx` | CSS 3D transform |
| 骰子检定 | `src/components/Dice/DicePanel.tsx` + `src/stores/useDiceStore.ts` | 五级判定 + 奖励骰 |
| 聊天输入 | `src/components/Layout/InputBar.tsx` | 939 lines ⚠️ 架构中枢 |
| 所有类型 | `src/types/index.ts` | 296 lines，可考虑按域拆分 |
| TH 脚本引擎 | `src/sillytavern/th-script-engine.ts` | send/receive hook 生命周期 |

## CONVENTIONS

**TypeScript**: `verbatimModuleSyntax` (强制 `import type`)，`erasableSyntaxOnly` (禁止 enum/namespace)，`noUnusedLocals` + `noUnusedParameters` — 未使用变量 = 构建失败。

**导出**: 全部命名导出 (`export function` / `export const`)，无 `export default`。无 barrel `index.ts` — 所有 import 走显式相对路径。

**样式**: 100% 内联 `style={{}}`，用 `var(--gold)` 引用 `tokens.css` 中的 CSS 自定义属性。无 Tailwind、无 CSS Modules、无 styled-components。

**组件**: PascalCase + `interface Props` 在文件顶部，无 compound components / render props / slots。

**Zustand stores**: `useXxxStore` 命名，`create<XxxStore>()((set, get) => ...)`，无 middleware。跨 store 访问用 `require() + getState()` 懒加载。

**SillyTavern 引擎**: kebab-case 文件名，JSDoc 注明来源 ("inspired by SillyTavern's...")，纯计算函数与 store-glue 分层。

**Build**: `tsc -b && vite build`（项目引用模式，先类型检查后构建）。

## ANTI-PATTERNS (THIS PROJECT)

- **`as any` 强制转换** — 26 处，集中在 `format-converter.ts` (17 处)。禁止新增。应定义 Proper interface 消除。
- **`require()` 在 store/sillytavern 中** — 用于避免循环依赖，但绕过 Tree-shaking 和类型检查。除非绝对必要，否则不用。
- **无 barrel 导出** — 每个 import 走显式路径。新增模块时考虑添加 `index.ts`，但非强制。
- **`DEFAULT_PRESET` 重复定义** — InputBar.tsx 和 PresetEditor.tsx 各有一份。修改时需同步两边，或提取到共享常量。
- **内联 style 对象重复** — `closeBtnStyle` / `actionBtnStyle` / `inputStyle` 在 8+ 文件中重复定义。新增时的 CSSProperties 检查 `src/styles/` 是否已有。
- **JSON 应用数据在 `public/`** — 应移入 `src/data/` 作为静态 import，否则绕过打包和类型检查。
- **零测试** — 无 Vitest/Jest，无测试文件。新增复杂逻辑（dice、regex、lorebook）时应补测试。

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
npm run preview    # 预览生产构建
```

## NOTES

- `src/db/database.ts` — Dexie schema 已定义但零消费者。所有持久化走 localStorage。如需 IndexedDB，从 stores 接入。
- `src/components/Shared/MusicPlayer.tsx` — 从未挂载于 App.tsx（死代码）。
- `src/components/Book/PageFlip.tsx` 与 `PageFlip3D.tsx` 并存 — 前者用 Framer Motion，后者用 CSS 3D。
- Playwright `test-results/` 来自环境 agent，非项目测试。
- `src/sillytavern/types.ts` — 仅重导出 `../types`，冗余文件。
- 子目录 AGENTS.md：`src/sillytavern/` `src/stores/` `src/components/Settings/` `src/components/Layout/` `src/components/Shared/`
