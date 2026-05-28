# React Hooks 层

**5 files.** 自定义 hooks，涵盖页面翻页、音频、聊天管道、流式渲染、角色预设。useChatPipeline 是从 InputBar 提取的 561 lines 核心逻辑。

## OVERVIEW

Hooks 层是组件与引擎间的桥梁。useChatPipeline 是最大的 hook — 从 InputBar.tsx 提取出的完整聊天管道（斜杠命令、EJS、世界书、正则、MVU、API 调用）。useCharacterPresets 管理 localStorage 预设 CRUD。

## WHERE TO LOOK

| Hook | File | Notes |
|------|------|-------|
| 聊天管道 | `useChatPipeline.ts` | 561 lines，主聊天流程 hook（从 InputBar 提取） |
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

- **useChatPipeline 561 lines** — hook 承担过多职责（7 个步骤），可拆分为子 hooks（useSlashCommands, useWorldbookMatch, useRegexEngine 等）
- **`useCharacterPresets.ts` 是 1-line facade** — 违反"无 barrel 导出"约定，直接 import store 即可
- **`useChatPipeline` 直接读 `localStorage`** — line 186/190 读 `coc_last_preset`/`coc_presets_v1`，绕过 Dexie 层
