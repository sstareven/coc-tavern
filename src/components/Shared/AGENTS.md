# 共享组件

**14 files (+1 test).** 通用 UI 工具。多数为展示型（presentational），通过 props 接收数据；少数接入 store（ErrorModal→useErrorModalStore、DebugConsole→useBookStore、TokenCounter→sillytavern/token-counter）。

## OVERVIEW

Shared/ 包含跨模块复用的组件：骰子动画、Token 计数器、代码块渲染、关键词提示、页面编辑、调试日志/控制台、错误边界/弹窗、文本美化等。大部分组件为展示型，无内部 store 依赖；例外见上。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 骰子检定动画 | `DiceAnimation.tsx` | 531 lines，WAV 音频 + AnimatePresence 动效，`React.memo` |
| 代码块渲染 | `CodeBlockRenderer.tsx` | 212 lines，`setInterval` 重试 ⚠️ 未清理 |
| 页面内容编辑 | `PageEditor.tsx` | 189 lines，textarea 内联编辑器 |
| 调试控制台 | `DebugConsole.tsx` | 128 lines，`` ` ``/`~` 唤起命令行，导入 `useBookStore` |
| Token 计数 | `TokenCounter.tsx` | 169 lines，导入 `sillytavern/token-counter` |
| 关键词悬浮提示 | `KeywordTooltip.tsx` | 168 lines，嵌套 progress ring |
| 文本美化 | `TextBeautifier.tsx` | 96 lines，`{{keyword}}` + 对话橘色高亮，输出 React 节点（+ `TextBeautifier.test.ts` 8 tests） |
| 错误弹窗 | `ErrorModal.tsx` | 91 lines，全局错误模态，订阅 `useErrorModalStore` |
| 调试日志 | `DebugLog.tsx` | 98 lines |
| 错误边界 | `ErrorBoundary.tsx` | 62 lines，class 组件 `getDerivedStateFromError` |
| 流式预览 | `StreamingPreview.tsx` | 60 lines，AI 输出实时渲染 |
| 故事书工具 | `BookUtils.tsx` | 141 lines，文本处理辅助 |
| 暗色下拉 | `DarkSelect.tsx` | 98 lines，portal 渲染下拉菜单，走 CharSheet styles |
| Token 展示 | `TokenDisplay.tsx` | 28 lines，用量条 |

## CONVENTIONS

- **Props 接口** — 多数组件在文件顶部定义 `interface Props`
- **React.memo** — DiceAnimation 使用 `React.memo` 避免不必要的重渲染
- **class 组件** — 仅 `ErrorBoundary.tsx`（React 错误边界必须用 class）
- **自定义事件** — 部分组件通过 DOM 自定义事件通信（非典型 React 模式）

## ANTI-PATTERNS

- **`CodeBlockRenderer.tsx` 的 `setInterval`** — 轮询重试未在组件卸载时清理，可能导致内存泄漏（line 138/149）
- **`DiceAnimation.tsx` 空 catch 块** — 音频加载失败静默吞下（仍存在；新增 catch 应加 `console.warn`）
- **跨边界导入 store** — `ErrorModal`、`DebugConsole` 接入 store，`TokenCounter` 导入 sillytavern；其余保持纯展示型
- **`TextBeautifier.test.ts` 类型断言** — 访问 `ReactElement.props` 需用带 props 泛型的 `ReactElement<...>` 断言（React 19 默认 props 为 `{}`/`unknown`）
