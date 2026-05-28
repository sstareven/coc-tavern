# Dexie IndexedDB 持久化层

**6 files (4 source + 2 test).** Zustand persist 与 IndexedDB 之间的适配器。kvStore 单表架构，含 localStorage→IndexedDB 自动迁移。

## OVERVIEW

持久化层实现 Zustand persist middleware 的 `StateStorage` 接口，通过 Dexie 将 6 个 store 持久化到 IndexedDB。`stripFunctions` 用于序列化前剥离函数字段。`migrations` 从旧版 localStorage 一次性迁移数据。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Dexie schema | `database.ts` | 单表 `kvStore`，`&key` 主键，`value` 任意 |
| Zustand persist 适配器 | `storage.ts` | `createDexieStorage()` 返回 `StateStorage`，实现 `getItem/setItem/removeItem` |
| 数据迁移 | `migrations.ts` | `migrateFromLocalStorage()` — 一次性迁移 6 个 key，幂等 |
| 序列化安全 | `stripFunctions.ts` | `partialize` 辅助函数，移除 store 中的函数字段 |
| 测试 | `database.test.ts` + `migrations.test.ts` | Vitest + fake-indexeddb，覆盖 CRUD + 迁移幂等性 |

## ARCHITECTURE

```
database.ts  (Dexie schema)
     ↑
storage.ts   (Zustand StateStorage 适配器)    stripFunctions.ts  (partialize)
     ↑                                                ↑
     └──────────── 6 Zustand stores ─────────────────┘
```

**消费者** (6 个 store，均使用 `persist` middleware):
- `useChatStore` → key `coc_chat_v1`
- `useTavernHelperStore` → key `coc_th_v2`（自定义 `merge` 重新注入 MVU 默认值）
- `useLorebookStore` → key `coc_lorebooks_v1`
- `useCharSheetStore` → key `coc_character`
- `useSettingsStore` → key `coc_settings_v2`
- `useCharacterPresetsStore` → key `coc_char_presets`

## MIGRATION FLOW

`migrateFromLocalStorage()` 按以下顺序迁移 6 个 key：
1. 检查 flag `coc_db_migrated_v1`
2. 逐个读取 localStorage → 写入 Dexie kvStore
3. 删除旧 localStorage key
4. 设置 flag

迁移在应用启动时调用。幂等：flag 已存在则跳过。

## KNOWN ISSUES

- **白屏回退** — `persist` 中间件曾导致白屏，当前版本已修复。若再次出现：检查 `createDexieStorage` 是否同步返回（Zustand persist 要求同步 storage adapter）
- **双重持久化** — `PresetPanel.tsx` 和 `useChatPipeline.ts` 直接读写 `localStorage`（`coc_presets_v1`、`coc_last_preset`），绕过了 Dexie 层。数据可能分叉
- **`stripFunctions` 不够彻底** — 仅剥离顶层函数字段，嵌套对象中的函数（如 promptItems 内的回调）不会被剥离

## CONVENTIONS

- **`createDexieStorage`** — 每次调用返回新实例，不可在 store 间共享 adapter
- **`stripFunctions(state)`** — 必须作为 `persist({ partialize: stripFunctions })` 使用
- **新增持久化 store** — 需同时导入 `createDexieStorage` 和 `stripFunctions`，在 `migrations.ts` 中添加对应的 key

## ANTI-PATTERNS

- **直接 `localStorage` 绕过 Dexie** — `PresetPanel.tsx`、`ExtManager.tsx`、`ChangelogModal.tsx` 直接操作 localStorage。应通过 store 或 Dexie 层
- **`stripFunctions` 误用于包含 Map/Set/Date 的 state** — JSON 序列化会丢失类型信息
