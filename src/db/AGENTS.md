# Dexie IndexedDB 持久化层

**Zustand persist + 关系型多表混合架构 (Dexie v2)。** kvStore 单表存全局态；conversations 父表 + 8 个 per-conversation 子表存会话态。含 localStorage→IndexedDB 自动迁移、v1→v2 关系化迁移、同步 KV 缓存。

## OVERVIEW

持久化分两层：
1. **全局态（kvStore 单表）** — settings/presets/TH脚本+渲染/静态lorebook 等仍走 Zustand persist + `createDexieStorage` 适配器，每个 store 占一行。`useChatStore` 也走 persist，但只持久化**轻量元数据**（id/name/messages/presetId/lorebookIds/pageCount），不含 pages/gameState。
2. **会话态（关系型子表，Dexie v2）** — pages + 6 个 gameState 域（角色卡/物品/暗线/关键词/MVU变量/宏变量）按 conversationId 分表存储。读写由 `sessionLifecycle.ts` 的 `saveConversation/loadConversation/deleteConversation` 显式编排，**不走 persist**（这 5 个 store 已改为纯内存）。这解决了旧架构「每回合全量 JSON.stringify 整个 coc_chat_v1 blob」的写放大问题。

`database.ts` 的 `.upgrade()` 把旧 v1 的 `coc_chat_v1` blob 炸开进关系表（per-session gameState WINS，幂等，失败写 `_v2_upgrade_failed` 标志且不删源 blob 作备份）。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Dexie schema (v1+v2) | `database.ts` | v1 `kvStore '&key'`；v2 `V2_SCHEMA` = conversations + pages/charsheets/inventory/darkThreads/keywords/gameVars/macroVars，含 Row 接口导出 |
| v1→v2 关系化迁移 | `database.ts` `upgradeV2(tx)` | 炸开 coc_chat_v1 blob；导出供测试直接调用 |
| 会话态读写编排 | `../stores/sessionLifecycle.ts` | saveConversation/loadConversation/deleteConversation + switchConversation 互斥 |
| Zustand persist 适配器 | `storage.ts` | `createDexieStorage()` 返回 `StateStorage`（仅 kvStore 系 store 用） |
| 同步 KV 缓存 | `kv.ts` | `initKvCache()` 预载 + localStorage 迁移；同步 get/set，写穿 Dexie |
| 数据迁移 | `migrations.ts` | `migrateFromLocalStorage()` — 一次性迁移多个 key，幂等 |
| 序列化安全 | `stripFunctions.ts` | `partialize` 辅助函数（kvStore 系 store 用） |
| 测试 | `database.test.ts` + `migrations.test.ts` | Vitest + fake-indexeddb，覆盖 CRUD + v2 关系表 + upgradeV2 8 场景 + 迁移幂等性 |

## ARCHITECTURE

```
database.ts  (Dexie v1 kvStore + v2 关系表 + upgradeV2)
     ↑                              ↑
storage.ts (persist 适配器)    sessionLifecycle.ts (save/load/deleteConversation)
     ↑                              ↑
全局态 store (settings/TH/      会话态：5 个纯内存 store + useBookStore
lorebook/charPresets/chat-meta)  (charsheet/inventory/darkThread/keyword/variable + TH.macroVars)
```

- **全局态** → persist → kvStore 单行。
- **会话态** → sessionLifecycle 显式读写 → 关系子表（按 conversationId）。load = clearAll + replaceAll；save = 单 rw 事务内 delete-then-bulkPut（bulkPut 不删旧行）；delete = 范围删全部子表。
- **switchConversation** = 链式 promise 互斥 + latest-wins，串行化 save(prev)→setActive→load(next)，防并发切档撕裂。
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
