# 深渊档案馆 (Abyssal Archive)

克苏鲁召唤 7 版 TRPG 前端。故事书式 AI 叙事界面，融合 SillyTavern 酒馆架构。

## 技术栈

- React 19 + TypeScript 6 + Vite 8
- Zustand 5 状态管理 + persist 中间件
- Framer Motion 12 动画
- CSS 3D Transform 翻页
- Web Audio API 音效合成
- IndexedDB (Dexie.js 4)

## 快速开始

```bash
npm install
npm run dev
```

## 功能

- 故事书双页翻页叙事（状态栏 + 桌面视觉）
- COC 7th 角色创建向导（6 步完整创建流程）
- d100 骰子检定（五级判定 + 奖励/惩罚骰 + SAN 检定 + 大成功/大失败动效）
- 世界书管理系统（多本独立数据 + 条目编辑器）
- MVU 变量引擎（自动提取 LLM 回复中的变量，支持独立 API 通道）
- 正则脚本系统（全局/预设，查找替换 + 测试模式）
- 提示词查看器（发送前预览编辑 + Token 分解）
- Token 计数器（上下文用量分解 + 手动计数）
- 聊天预设管理（采样参数 / Prompt 模板）
- 斜杠命令系统（/roll /var /set /help）
- EJS 模板引擎（<% %> JavaScript 逻辑在 Prompt 中执行）
- 对话会话管理 + 扩展脚本管理
- Web Audio 音效合成 + WAV 音频
- 悬停提示系统（进度环 + 关键词嵌套窗）

## 测试

```bash
npm test         # Vitest (50 tests: 骰子 + COC 规则 + 数据库)
```

## 项目结构

```
src/                          # ~99 source files (52 .tsx, 45 .ts, 2 .css)
├── components/
│   ├── Book/                 # 故事书翻页 (6 files, ~870 lines)
│   ├── CharSheet/            # 角色卡 + 创建向导 (14 files, ~2760 lines)
│   │   ├── steps/            #   6 步向导组件 (new)
│   │   │   ├── StepIdentity.tsx
│   │   │   ├── StepCharacteristics.tsx
│   │   │   ├── StepDerivedStats.tsx
│   │   │   ├── StepSkills.tsx
│   │   │   ├── StepBackground.tsx
│   │   │   └── StepReview.tsx
│   │   ├── CharacterCreator.tsx   # 编排器 (2221 → 1010 lines)
│   │   └── styles.ts              # 共享 CSSProperties (new)
│   ├── Dice/                 # 骰子面板 + 历史 (3 files, ~790 lines)
│   ├── Landing/              # 开始界面 (2 files)
│   ├── Layout/               # 顶层布局 + InputBar (3 files, ~610 lines)
│   │   └── InputBar.tsx      #   982 → 444 lines
│   ├── Settings/             # 设置面板群 (13 files, ~4400 lines)
│   └── Shared/               # 通用组件 (11 files, ~1600 lines)
│       └── DarkSelect.tsx    #   可复用下拉组件 (new)
├── hooks/                    # React Hooks (4 files)
│   ├── useChatPipeline.ts    #   聊天管道 hook (~540 lines)
│   └── useStreamingRenderer.ts #  流式渲染 hook (new)
├── stores/                   # Zustand 状态管理 (13 stores)
│   └── 全部接入 IndexedDB (Dexie persist 中间件)
├── sillytavern/              # 酒馆引擎 (22 files, ~2800 lines)
│   ├── coc-rules.ts          #   COC 规则数据 + 纯函数 (new, 测试覆盖)
│   ├── dice-engine.ts        #   骰子检定引擎 (new, 27 tests)
│   ├── format-converter.ts   #   格式转换 (all `any` 已消除)
│   ├── format-instruction.ts #   LLM 格式指令 (new)
│   ├── post-processor.ts     #   LLM 响应后处理 (new)
│   ├── character-variables.ts #  角色变量管理 (new)
│   ├── context-builder.ts    #   上下文组装 (new)
│   ├── llm-response-parser.ts #  LLM 响应解析 (new)
│   └── ...
├── db/                       # Dexie IndexedDB 持久化层 (5 files) (new)
│   ├── database.ts           #   kvStore 单表 + Dexie schema
│   ├── storage.ts            #   Zustand persist 适配器
│   └── migrations.ts         #   localStorage→IndexedDB 自动迁移
├── test/                     # Vitest 测试环境 (new)
├── audio/                    # Web Audio 音效合成 (1 file)
├── constants/                # 共享常量 (new, 1 file)
├── types/                    # TypeScript 类型 (1 file, 296 lines)
└── styles/                   # 设计令牌 + 全局样式 (3 files)
```

## 代码来源

本项目部分功能受以下开源项目启发：

| 功能 | 来源 | 许可证 |
|------|------|--------|
| 斜杠命令执行 | [N0VI028/JS-Slash-Runner](https://github.com/N0VI028/JS-Slash-Runner) | AFPL |
| EJS 模板引擎 | [zonde306/ST-Prompt-Template](https://github.com/zonde306/ST-Prompt-Template) | AGPL v3 |
| MVU 变量引擎 | [MagicalAstrogy/MagVarUpdate](https://github.com/MagicalAstrogy/MagVarUpdate) | — |
| 正则脚本架构 | [SillyTavern/SillyTavern](https://github.com/SillyTavern/SillyTavern) | AGPL v3 |
| 世界书引擎 | [SillyTavern/SillyTavern](https://github.com/SillyTavern/SillyTavern) | AGPL v3 |

以上功能的实现为参照原始设计思路，以 React + TypeScript 重新编写。

## 许可证

非商业使用许可证 — 开源可用，禁止商业销售，详见 [LICENSE](LICENSE)
