# 设置面板组件群

**12 files.** 单个扁平目录，覆盖 7+ 独立子域。`SettingsPanel.tsx` 是侧边栏编排器。所有文件 100% 内联样式。

## OVERVIEW

Settings/ 包含世界书、预设、聊天、扩展、变量、正则、Prompt 模板等管理面板。功能按文件划分，但都在同一层目录，无子目录分组。`closeBtnStyle` / `actionBtnStyle` / `inputStyle` 在 8+ 文件中重复定义。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 设置面板入口 | `SettingsPanel.tsx` | 侧边栏 tab 切换，AnimatePresence 过渡 |
| 预设管理 | `PresetPanel.tsx` + `PresetEditor.tsx` | Studio 风格 UI，含 Prompt item 拖拽排序 |
| 世界书管理 | `WorldbookPanel.tsx` + `LorebookEditor.tsx` | 条目表 + 详情弹窗，世界书匹配逻辑在 `sillytavern/prompt-assembler.ts` |
| 正则脚本编辑 | `RegexEditor.tsx` | 查找/替换 + 测试模式 |
| 变量面板 | `VariablePanel.tsx` | MVU 变量 CRUD |
| 聊天列表 | `ChatlistPanel.tsx` | 会话管理 |
| 扩展管理 | `ExtManager.tsx` | 导入/管理扩展脚本 |
| Prompt 查看器 | `PromptViewer.tsx` | 发送前预览（由 InputBar.tsx 导入，非独立挂载） |
| Prompt 模板 | `PromptTemplateContent.tsx` | EJS/Prompt 模板设置 |
| 酒馆助手 | `TavernHelperContent.tsx` | TH 脚本/渲染/优化设置 |
| 领受赐福（作弊） | `CheatingContent.tsx` | Konami 序列解锁后才显示；骰子档位锁定作弊系统 |
| 公共组件 | `_shared.tsx` | HelpIcon / Toggle / CategoryBar / 样式常量 |

## CONVENTIONS

- **PascalCase 文件名** — 与组件命名一致
- **`interface Props`** — 所有组件在文件顶部定义本地 Props 接口
- **100% 内联样式** — `style={{}}` + `var(--gold)` 引用 tokens
- **样式常量** — 在模块顶层 `const closeBtnStyle: React.CSSProperties = {...}` 提取
- **Framer Motion** — `AnimatePresence + motion.div` 用于 tab 切换过渡
- **One file = one panel** — 无 compound components，无 render props

## ANTI-PATTERNS

- **`closeBtnStyle` / `actionBtnStyle` / `inputStyle` 在 8+ 文件中重复** — 应提取到 `src/styles/panelStyles.ts`
- **`SettingsPanel.tsx` (839 lines)** — 内嵌 `RegexSettingsContent` 和 `ExtensionsSettingsContent` 子组件，应拆分到独立文件
- **`DEFAULT_PRESET` 已提取至 `src/constants/presets.ts`** ✅ — InputBar 用 `DEFAULT_INPUT_PRESET`，PresetEditor 用 `DEFAULT_EDITOR_PRESET`。旧注释可移除
- **Dropdown 组件 3 种实现** — `DarkSelect` (CharacterCreator)、`Dropdown` (PresetEditor)、内联 ModelPicker (SettingsPanel) — 行为相同 API 不同
- **无子目录分组** — Worldbook、Preset、Regex、Variable、Chat 应各自独立子目录
- **`PresetEditor.tsx` 有 27 处 `any`** — 类型建模不完整，`_contentReadOnly` hack 通过 `as any` 访问未定义属性
