# 共享组件

**11 files.** 通用 UI 工具。无独立状态管理 — 全部通过 props 接收数据。

## OVERVIEW

Shared/ 包含跨模块复用的组件：骰子动画、Token 计数器、代码块渲染、关键词提示、页面编辑、调试日志等。所有组件为展示型（presentational），无内部 store 依赖（除 TokenCounter 导入 sillytavern 的计数器）。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 骰子检定动画 | `DiceAnimation.tsx` | 368 lines，WAV 音频 + AnimatePresence 动效 |
| 代码块渲染 | `CodeBlockRenderer.tsx` | 211 lines，`setInterval` 重试 ⚠️ |
| 页面内容编辑 | `PageEditor.tsx` | 185 lines，textarea 内联编辑器 |
| Token 计数 | `TokenCounter.tsx` | 169 lines，导入 `sillytavern/token-counter` |
| 关键词悬浮提示 | `KeywordTooltip.tsx` | 137 lines，嵌套 progress ring |
| 调试日志 | `DebugLog.tsx` | 98 lines |
| 流式预览 | `StreamingPreview.tsx` | 78 lines，AI 输出实时渲染 |
| 故事书工具 | `BookUtils.tsx` | 73 lines，文本处理辅助 |
| 文本美化 | `TextBeautifier.tsx` | 63 lines，正则格式化 |
| Token 展示 | `TokenDisplay.tsx` | 28 lines，用量条 |
| 暗色下拉 | `DarkSelect.tsx` | 85 lines，portal 渲染下拉菜单，走 CharSheet styles |

## CONVENTIONS

- **Props 接口** — 每个组件在文件顶部定义 `interface Props`
- **React.memo** — DiceAnimation 使用 `React.memo` 避免不必要的重渲染
- **自定义事件** — 部分组件通过 DOM 自定义事件通信（非典型 React 模式）

## ANTI-PATTERNS

- **`DiceAnimation.tsx` 有多处空 catch 块** — 音频加载失败的 fallback 为静默吞下
- **`CodeBlockRenderer.tsx` 的 `setInterval`** — 轮询重试未在组件卸载时清理，可能导致内存泄漏（line 138/149）
- **`DiceAnimation.tsx` 空 catch 块 (3 处)** — 音频加载失败静默吞下（lines 20, 33, 67）
- **TokenCounter 直接导入 sillytavern** — 唯一跨边界的 Shared 组件，其他均纯展示型
- **无 TypeScript strict 模式覆盖** — 共享组件依赖 props 接口约束，但无运行时校验
