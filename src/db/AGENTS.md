# Dexie IndexedDB 持久化层

**7 files (5 source + 2 test).** Zustand persist 与 IndexedDB 之间的适配器。kvStore 单表架构，含 localStorage→IndexedDB 自动迁移与同步 KV 缓存。

## OVERVIEW

持久化层实现 Zustand persist middleware 的 `StateStorage` 接口，通过 Dexie 将 7 个 store 持久化到 IndexedDB。`stripFunctions` 用于序列化前剥离函数字段。`migrations` 从旧版 localStorage 一次性迁移数据。`kv.ts` 提供同步内存缓存 + localStorage 回退，供需同步读取的场景使用。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Dexie schema | `database.ts` | 单表 `kvStore`，`&key` 主键，`value` 任意 |
| Zustand persist 适配器 | `storage.ts` | `createDexieStorage()` 返回 `StateStorage`，实现 `getItem/setItem/removeItem` |
| 同步 KV 缓存 | `kv.ts` | `initKvCache()` 预载 + localStorage 迁移；同步 get/set，写穿 Dexie |
| 数据迁移 | `migrations.ts` | `migrateFromLocalStorage()` — 一次性迁移多个 key，幂等 |
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

**消费者** (7 个 store，均使用 `persist` middleware):
- `useChatStore` → key `coc_chat_v1`
- `useTavernHelperStore` → key `coc_th_v2`（自定义 `merge` 重新注入 MVU 默认值）
- `useLorebookStore` → key `coc_lorebooks_v1`
- `useCharSheetStore` → key `coc_character`
- `useSettingsStore` → key `coc_settings_v2`
- `useCharacterPresetsStore` → key `coc_char_presets`
- `useKeywordStore` → key `coc_keywords`

## MIGRATION FLOW

`migrateFromLocalStorage()` 按以下顺序迁移 6 个 key：
1. 检查 flag `coc_db_migrated_v1`
2. 逐个读取 localStorage → 写入 Dexie kvStore
3. 删除旧 localStorage key
4. 设置 flag

迁移在应用启动时调用。幂等：flag 已存在则跳过。

## KNOWN ISSUES

- **白屏回退** — `persist` 中间件曾导致白屏，当前版本已修复。若再次出现：检查 `createDexieStorage` 是否同步返回（Zustand persist 要求同步 storage adapter）
- **双重持久化已消除** — 旧版 `PresetPanel.tsx`/`useChatPipeline.ts` 直接读写 localStorage 的绕过已清理；现仅 `db/` 层（kv.ts/migrations.ts）合法使用 localStorage
- **`stripFunctions` 不够彻底** — 仅剥离顶层函数字段，嵌套对象中的函数（如 promptItems 内的回调）不会被剥离

## CONVENTIONS

- **`createDexieStorage`** — 每次调用返回新实例，不可在 store 间共享 adapter
- **`stripFunctions(state)`** — 必须作为 `persist({ partialize: stripFunctions })` 使用
- **新增持久化 store** — 需同时导入 `createDexieStorage` 和 `stripFunctions`，在 `migrations.ts` 中添加对应的 key

## ANTI-PATTERNS

- **直接 `localStorage` 仅 db/ 层合法** — `kv.ts`、`migrations.ts` 共 4 处（get/removeItem），用于同步缓存与迁移。组件/store 层的旧绕过（PresetPanel/ExtManager/useChatPipeline）已消除，禁止新增
- **`stripFunctions` 误用于包含 Map/Set/Date 的 state** — JSON 序列化会丢失类型信息
- **新增持久化 store 需同步 `migrations.ts`** — 否则旧 localStorage 数据不会迁移
