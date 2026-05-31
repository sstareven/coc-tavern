# Zustand 状态管理层

**18 store/helper (+3 test).** 7 个使用 Zustand persist 中间件持久化至 IndexedDB (Dexie)，其余纯内存。`sessionLifecycle.ts` 是跨 store 恢复 helper（非 store）。跨 store 访问使用 ESM import + `getState()`。

## OVERVIEW

所有状态管理集中于此。17 个独立扁平 store + 1 个生命周期 helper，无 store 组合/切片。全局态（settings/th/lorebook/chat-meta/charPresets）通过 `zustand/persist` + `createDexieStorage` 持久化；会话态（charsheet/inventory/darkThread/keyword/variable/book pages + TH.macroVars）为纯内存，由 `sessionLifecycle.saveConversation/loadConversation` 显式读写 Dexie v2 关系子表。`useCharSheetStore` 是跨 store 的中心依赖。`sessionLifecycle.restoreSessionGameState()`/`loadConversation()` 在切换会话时从关系表一次性恢复所有会话态 store（先 `clearAllGameState` 再 replaceAll，角色卡无行时回退 `defaultSheet`，杜绝跨会话泄漏）。

## WHERE TO LOOK

| Store | Domain | Persistence | Key |
|-------|--------|-------------|-----|
| `useSettingsStore.ts` | API key、模型、音量、工具提示、RPM 限流配置 | Dexie persist | `coc_settings_v2` |
| `useTavernHelperStore.ts` | TH 脚本、渲染设置（macroVars 已移出持久化，改按会话存关系表） | Dexie persist | `coc_th_v2` |
| `useLorebookStore.ts` | 世界书 CRUD、会话书绑定 | Dexie persist | `coc_lorebooks_v1` |
| `useChatStore.ts` | 会话管理、预设加载（仅轻量元数据 + pageCount） | Dexie persist | `coc_chat_v1` |
| `useCharacterPresetsStore.ts` | 角色创建预设 | Dexie persist | `coc_char_presets` |
| `useCharSheetStore.ts` | COC 角色卡 | 内存（会话态，存关系表 `charsheets`） | — |
| `useKeywordStore.ts` | 关键词释义累积 | 内存（会话态，存关系表 `keywords`） | — |
| `useInventoryStore.ts` | 物品栏（按职业起始物品 + 分类 + 装备态） | 内存（会话态，存关系表 `inventory`） | — |
| `useDarkThreadStore.ts` | 暗线/伏笔/威胁进度条目 | 内存（会话态，存关系表 `darkThreads`） | — |
| `useErrorModalStore.ts` | 全局错误弹窗状态（配 Shared/ErrorModal） | 内存 | — |
| `useBookStore.ts` | 故事书页面、翻页状态 | 内存（会话态，存关系表 `pages`） | — |
| `useDiceStore.ts` | 骰子检定状态机 | 内存 | — |
| `useRegexStore.ts` | 全局/预设正则脚本 | 内存 | — |
| `useVariableStore.ts` | MVU 游戏变量 | 内存 | — |
| `usePanelStore.ts` | UI 面板开/关状态 | 内存 | — |
| `useLogStore.ts` | 调试日志缓冲 | 内存 | — |
| `usePromptViewerStore.ts` | Prompt 预览快照 | 内存 | — |
| `sessionLifecycle.ts` | 跨 store 游戏态恢复 helper（非 store） | — | — |

## CROSS-STORE DEPENDENCIES

```
useCharSheetStore ← useVariableStore      (getState().sheet)
useCharSheetStore ← useTavernHelperStore  (getState().sheet)
sessionLifecycle  → useChatStore / useBookStore / useCharSheetStore /
                    useInventoryStore / useDarkThreadStore / useKeywordStore /
                    useVariableStore / useLorebookStore   (恢复时 getState/setState)
```

均为 ESM 顶层 import，非 `require()` 懒加载。单向依赖，无循环。

## CONVENTIONS

- **命名** — `useXxxStore` hook + `XxxStore` interface
- **构造函数** — `create<StoreType>()(persist((set, get) => ..., { name, storage, partialize }))` — 7 个持久化 store 使用 persist middleware
- **持久化** — `createJSONStorage(createDexieStorage)` 适配器写入 IndexedDB；`stripFunctions(state)` 序列化前剥离函数字段
- **跨 store 访问** — `import { useXxxStore }` + `.getState()` 在 action 体内（非顶层）
- **内联 selectors** — 组件用 `useXxxStore((s) => s.field)`，无 `useShallow`、无 memoized selectors
- **同步 actions** — 零 async thunks，API 调用在 `sillytavern/` 服务层
- **迁移** — `src/db/migrations.ts` 自动从 localStorage 迁移持久化 key，幂等

## ANTI-PATTERNS

- **ESM 跨 store import** — `useVariableStore` 和 `useTavernHelperStore` 使用 ESM import 而非 `require()` 懒加载。若 `useCharSheetStore` 初始化失败，模块加载即崩溃
- **`useLorebookStore` (602 lines)** — 最大的 store，硬编码默认世界书内联。可考虑提取默认数据到独立 JSON
- **`useTavernHelperStore` (205 lines)** — 硬编码 TH 默认脚本。`merge` 逻辑复杂（重新注入 MVU 默认值）
- **`useInventoryStore` (230 lines)** — 按职业生成起始物品逻辑硬编码内联，可考虑数据化
- **`useLogStore` 的 `pushLog()` 导出** — 既作为 store 方法又作为独立函数导出，混用两种访问方式
- **`useDiceStore` 导入 `dice-engine.ts`** — store 反向导入引擎层（engine → store 路径反向），形成可疑的依赖方向
- **`sessionLifecycle.ts` 硬编码 8 个 store 的恢复顺序** — 新增需要会话持久化的 store 时必须同步更新此文件，易遗漏
