# React Hooks 层

**4 files.** 自定义 hooks，涵盖页面翻页、音频、聊天管道、角色预设 CRUD。useChatPipeline 是从 InputBar 提取的 541 lines 核心逻辑。

## OVERVIEW

Hooks 层是组件与引擎间的桥梁。useChatPipeline 是最大的 hook — 从 InputBar.tsx 提取出的完整聊天管道（斜杠命令、EJS、世界书、正则、MVU、API 调用）。useCharacterPresets 管理 localStorage 预设 CRUD。

## WHERE TO LOOK

| Hook | File | Notes |
|------|------|-------|
| 聊天管道 | `useChatPipeline.ts` | 541 lines，主聊天流程 hook（从 InputBar 提取） |
| 角色预设 | `useCharacterPresets.ts` | localStorage 预设 CRUD，状态持久化 |
| 页面翻页 | `usePageFlip.ts` | 故事书翻页状态机 |
| 音频控制 | `useAudio.ts` | Web Audio 播放控制 |

## CONVENTIONS

- **命名导出** — `export function useXxx(...)`，与项目全局一致
- **Props/返回值类型** — hook 在文件顶部定义返回类型 interface
- **store 消费** — 直接 `useXxxStore()` 调用，非依赖注入
- **无 barrel 导出** — 各文件独立 import 路径

## ANTI-PATTERNS

- **useChatPipeline 541 lines** — hook 承担过多职责（7 个步骤），可拆分为子 hooks（useSlashCommands, useWorldbookMatch, useRegexEngine 等）
- **无依赖追踪** — 所有 store subscriptions 在组件内用 selector 提取，无 explicit dependency arrays 注释
