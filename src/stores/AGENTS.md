# Zustand 状态管理层

**12 stores.** 无 middleware，手写 localStorage 持久化，单域单 store。`require() + getState()` 跨 store 访问。

## OVERVIEW

所有状态管理集中于此。无 store 组合/切片 — 12 个独立扁平 store。Dexie schema 已定义但未接入任何 store。

## WHERE TO LOOK

| Store | Domain | Persistence |
|-------|--------|-------------|
| `useSettingsStore.ts` | API key、模型、音量、工具提示 | localStorage (`coc_settings_v2`) |
| `useTavernHelperStore.ts` | TH 脚本、渲染设置、宏变量 | localStorage (`coc_th_v2`) + session state |
| `useLorebookStore.ts` | 世界书 CRUD | localStorage (`coc_lorebooks_v1`) + 硬编码默认 |
| `useCharSheetStore.ts` | COC 角色卡 | localStorage (`coc_character`) |
| `useChatStore.ts` | 会话管理、预设加载 | 内存 (无持久化) ⚠️ |
| `useBookStore.ts` | 故事书页面、翻页状态 | 内存 |
| `useDiceStore.ts` | 骰子检定状态机 | 内存 |
| `useRegexStore.ts` | 全局/预设正则脚本 | 内存 |
| `useVariableStore.ts` | MVU 游戏变量 | 内存 |
| `usePanelStore.ts` | UI 面板开/关状态 | 内存 |
| `useLogStore.ts` | 调试日志缓冲 | 内存 |
| `usePromptViewerStore.ts` | Prompt 预览快照 | 内存 |

## CONVENTIONS

- **命名** — `useXxxStore` hook + `XxxStore` interface
- **构造函数** — `create<StoreType>()((set, get) => ...)`，无 middleware
- **持久化** — 手写 `save()/load()` 工具函数 + `localStorage.setItem/getItem`，非 `zustand/persist`
- **跨 store 懒加载** — `require('../stores/useCharSheetStore')` + `.getState()` 在 action 体内（非顶层）
- **内联 selectors** — 组件用 `useXxxStore((s) => s.field)`，无 `useShallow`、无 memoized selectors
- **同步 actions** — 零 async thunks，API 调用在 `sillytavern/` 服务层

## ANTI-PATTERNS

- **`require()` 懒加载** — `useVariableStore` 和 `useTavernHelperStore` 用 `require()` 访问 `useCharSheetStore`。绕过 Tree-shaking 和类型检查。最新 commit 中大部分 require 已被清理，剩余 2 处（useVariableStore L85、useTavernHelperStore L358）。
- **`useChatStore` 无持久化** — 关闭浏览器丢失所有会话。Dexie `chatSessions` 表未被使用。
- **`useSettingsStore.save()`** — 手动序列化/反序列化，缺少 `zustand/persist` 的版本迁移支持。
- **`PresetPanel` 直接写 `useRegexStore.setState()`** — 跨 store 协调逻辑泄漏到组件。
- **`useLorebookStore` (320 lines)** — 最大的 store，包含硬编码默认世界书 + localStorage CRUD。可考虑拆分为 core store + migration utility。
