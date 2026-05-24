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

- 故事书双页翻页叙事
- COC 7th 角色创建向导（6 步完整创建流程）
- d100 骰子检定（五级判定 + 奖励/惩罚骰 + SAN 检定）
- 世界书管理系统（多本独立数据 + 条目编辑器）
- 聊天预设管理（采样参数 / Prompt 模板 / Prompt 排序）
- 对话会话管理
- 扩展脚本管理
- MP3 音乐播放器
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
├── sillytavern/       # 酒馆引擎（世界书/变量/Prompt/API）
├── db/                # Dexie 数据库
├── audio/             # Web Audio 音效
├── hooks/             # React Hooks
├── types/             # TypeScript 类型
└── styles/            # 设计令牌 + 全局样式
```

## 许可证

MIT
