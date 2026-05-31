# React Hooks 层

**5 files.** 自定义 hooks，涵盖页面翻页、音频、聊天管道、流式渲染、角色预设。useChatPipeline 是从 InputBar 提取的 851 lines 核心逻辑。

## OVERVIEW

Hooks 层是组件与引擎间的桥梁。useChatPipeline 是最大的 hook — 从 InputBar.tsx 提取出的完整聊天管道（斜杠命令、EJS、世界书、正则、MVU、RPM 限流、行动补写、API 调用）。useCharacterPresets 重新导出预设 store。

## WHERE TO LOOK

| Hook | File | Notes |
|------|------|-------|
| 聊天管道 | `useChatPipeline.ts` | 851 lines，主聊天流程 hook（从 InputBar 提取） |
| 流式渲染 | `useStreamingRenderer.ts` | 流式 AI 响应渲染 hook |
| 角色预设 | `useCharacterPresets.ts` | 重新导出 `useCharacterPresetsStore`（1 line facade） |
| 页面翻页 | `usePageFlip.ts` | 故事书翻页状态机 |
| 音频控制 | `useAudio.ts` | Web Audio 播放控制 |

## CONVENTIONS

- **命名导出** — `export function useXxx(...)`，与项目全局一致
- **Props/返回值类型** — hook 在文件顶部定义返回类型 interface
- **store 消费** — 直接 `useXxxStore()` 调用，非依赖注入
- **无 barrel 导出** — 各文件独立 import 路径

## ANTI-PATTERNS

- **useChatPipeline 851 lines** — hook 承担过多职责（斜杠命令/EJS/世界书/正则/MVU/RPM/补写/API），可拆分为子 hooks（useSlashCommands, useWorldbookMatch, useRegexEngine 等）
- **`useCharacterPresets.ts` 是 1-line facade** — 违反"无 barrel 导出"约定，直接 import store 即可
- **`useChatPipeline` 残留 localStorage 注释** — 旧的 `coc_last_preset`/`coc_presets_v1` 直接读取已移除，仅剩注释引用
