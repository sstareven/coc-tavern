# 深渊档案馆 (Abyssal Archive)

克苏鲁召唤 7 版 TRPG 前端。故事书式 AI 叙事界面，融合 SillyTavern 酒馆架构。

## 技术栈

- React 18 + TypeScript
- Zustand 状态管理
- Dexie.js (IndexedDB)
- Framer Motion 动画
- Web Audio API 音效合成
- Vite 构建

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
- MP3 音乐播放器 + Web Audio 音效合成
- 悬停提示系统（进度环 + 关键词嵌套窗）

## 项目结构

```
src/
├── components/
│   ├── Book/          # 故事书组件
│   ├── CharSheet/     # 角色卡 + 创建向导
│   ├── Dice/          # 骰子面板 + 历史
│   ├── Landing/       # 开始界面
│   ├── Layout/        # 顶层布局
│   ├── Settings/      # 设置面板
│   └── Shared/        # 通用组件
├── stores/            # Zustand 状态管理
├── sillytavern/       # 酒馆引擎（世界书/变量/Prompt/API/正则/命令）
├── db/                # Dexie 数据库
├── audio/             # Web Audio 音效
├── hooks/             # React Hooks
├── types/             # TypeScript 类型
└── styles/            # 设计令牌 + 全局样式
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
