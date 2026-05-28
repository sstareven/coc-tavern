# Zustand 状态管理层

**13 stores.** 6 个使用 Zustand persist 中间件持久化至 IndexedDB (Dexie)，7 个纯内存。跨 store 访问使用 ESM import + `getState()`。

## OVERVIEW

所有状态管理集中于此。13 个独立扁平 store，无 store 组合/切片。持久化通过 `zustand/persist` + `createDexieStorage` 适配器，非手动 `localStorage`。`useCharSheetStore` 是跨 store 的中心依赖（2 个 store 直接访问）。

## WHERE TO LOOK

| Store | Domain | Persistence | Key |
|-------|--------|-------------|-----|
| `useSettingsStore.ts` | API key、模型、音量、工具提示 | Dexie persist | `coc_settings_v2` |
| `useTavernHelperStore.ts` | TH 脚本、渲染设置、宏变量 | Dexie persist | `coc_th_v2` |
| `useLorebookStore.ts` | 世界书 CRUD | Dexie persist | `coc_lorebooks_v1` |
| `useCharSheetStore.ts` | COC 角色卡 | Dexie persist | `coc_character` |
| `useChatStore.ts` | 会话管理、预设加载 | Dexie persist | `coc_chat_v1` |
| `useCharacterPresetsStore.ts` | 角色创建预设 | Dexie persist | `coc_char_presets` |
| `useBookStore.ts` | 故事书页面、翻页状态 | 内存 | — |
| `useDiceStore.ts` | 骰子检定状态机 | 内存 | — |
| `useRegexStore.ts` | 全局/预设正则脚本 | 内存 | — |
| `useVariableStore.ts` | MVU 游戏变量 | 内存 | — |
| `usePanelStore.ts` | UI 面板开/关状态 | 内存 | — |
| `useLogStore.ts` | 调试日志缓冲 | 内存 | — |
| `usePromptViewerStore.ts` | Prompt 预览快照 | 内存 | — |

## CROSS-STORE DEPENDENCIES

```
useCharSheetStore ← useVariableStore      (getState().sheet)
useCharSheetStore ← useTavernHelperStore  (getState().sheet)
```

均为 ESM 顶层 import，非 `require()` 懒加载。单向依赖，无循环。

## CONVENTIONS

- **命名** — `useXxxStore` hook + `XxxStore` interface
- **构造函数** — `create<StoreType>()(persist((set, get) => ..., { name, storage, partialize }))` — 6 个持久化 store 使用 persist middleware
- **持久化** — `createJSONStorage(createDexieStorage)` 适配器写入 IndexedDB；`stripFunctions(state)` 序列化前剥离函数字段
- **跨 store 访问** — `import { useXxxStore }` + `.getState()` 在 action 体内（非顶层）
- **内联 selectors** — 组件用 `useXxxStore((s) => s.field)`，无 `useShallow`、无 memoized selectors
- **同步 actions** — 零 async thunks，API 调用在 `sillytavern/` 服务层
- **迁移** — `src/db/migrations.ts` 自动从 localStorage 迁移 6 个 key，幂等

## ANTI-PATTERNS

- **ESM 跨 store import** — `useVariableStore` 和 `useTavernHelperStore` 使用 ESM import 而非 `require()` 懒加载。若 `useCharSheetStore` 初始化失败，模块加载即崩溃
- **双重持久化** — `PresetPanel.tsx` 直接 `localStorage.setItem`（7 处），`useChatPipeline.ts` 直接 `localStorage.getItem`（2 处），绕过 Dexie persist 层。数据可能分叉
- **`useLorebookStore` (359 lines)** — 最大的 store，硬编码默认世界书内联。可考虑提取默认数据到独立 JSON
- **`useTavernHelperStore` (311 lines)** — 硬编码 TH 默认脚本。`merge` 逻辑复杂（重新注入 MVU 默认值）
- **`useLogStore` 的 `pushLog()` 导出** — 既作为 store 方法又作为独立函数导出，混用两种访问方式
- **`useDiceStore` 导入 `dice-engine.ts`** — store 反向导入引擎层（engine → store 路径反向），形成可疑的依赖方向
