# 深渊档案馆 (Abyssal Archive)

克苏鲁的呼唤 7 版 TRPG 前端。故事书式 AI 叙事界面，融合 SillyTavern 酒馆架构（世界书、变量引擎、正则脚本、EJS 模板、斜杠命令）。

## 技术栈

- **核心**: React 19 + TypeScript 6 + Vite 8
- **状态管理**: Zustand 5 + Dexie 4（IndexedDB 关系型混合持久化：全局态 kvStore + 会话态 conversations 父子表）
- **动画**: Framer Motion 12 + CSS 3D Transform
- **音效**: Web Audio API 合成
- **测试**: Vitest + fake-indexeddb

## 快速开始

```bash
npm install
npm run dev
```

## 功能特性

### 叙事界面
- 故事书双页翻页叙事（CSS 3D 翻页 + 状态栏 + 桌面视觉）
- 状态栏实时显示场景信息（日期/天气/地点）与角色 HP/SAN/MP
- 物品变化提示（每页顶部显示获取/消耗，可点击直达背包）
- 流式渲染引擎（打字机效果 + 思考块折叠）
- 关键词悬停提示（释义浮窗 + 相似词归一化匹配）
- 背包 / 调查员记录 / 目录 均为书内双页翻页式浮层

### COC 规则系统
- COC 7th 角色创建向导（6 步完整创建流程，属性点数池支持拖拽骰子分配）
- d100 骰子检定（五级判定 + 奖励/惩罚骰 + SAN 检定 + 对抗骰 + 暗骰）
- 大成功/大失败动效 + 粒子效果
- 物品栏管理（按职业生成起始物品 + 分类 + 装备态，物品得失需有剧情叙事支撑）

### SillyTavern 引擎
- 世界书管理系统（多本独立数据 + 条目编辑器）
- **[统一宏引擎](docs/macro-engine.md)**（`{{...}}` 语法：占位符 / 变量简写 / 条件判断 / Outlet / 嵌套宏，兼容 ST）
- MVU 变量引擎（自动提取 LLM 回复中的变量，支持独立 API 通道）
- 正则脚本系统（全局/预设，查找替换 + 测试模式）
- EJS 模板引擎（`<% %>` JavaScript 逻辑在 Prompt 中执行）
- 斜杠命令系统（`/roll` `/var` `/set` `/help` `/testopposed`）

### 聊天系统
- 提示词查看器（发送前预览编辑 + Token 分解）
- Token 计数器（上下文用量分解 + 手动计数）
- 聊天预设管理（采样参数 / Prompt 模板）
- 多对话会话管理（每个会话独立存档，游戏状态按会话隔离：角色卡 / 物品 / 暗线 / 关键词 / MVU变量 / 宏变量 / 故事页面 / 剧情摘要 互不串档；注入 LLM 的每一项参数都严格服务于当前对话）
- 扩展脚本管理
- 目录系统（自动生成章节摘要）

### 数据持久化（Dexie v2 关系型混合架构）
- **关系型多表存储**：会话态由 `conversations` 父表 + 7 张按 `conversationId` 分表的子表（pages / charsheets / inventory / darkThreads / keywords / gameVars / macroVars）承载，全局态（设置 / 预设 / 世界书 / 酒馆脚本）仍走 kvStore 单表
- **解决写放大**：每回合只写当前会话的相关子表，告别旧版「全量 JSON.stringify 整库」（50 对话 × 50 页时单 blob 可达 ~10MB），保存与启动显著提速
- **会话隔离零串档**：切换存档时先清空所有按会话隔离的内存态再从关系表恢复（`clearAllGameState` + `loadConversation`），角色卡 / 变量 / 摘要 等绝不跨对话泄漏
- **自动迁移 + 失败安全**：启动时 v1 单 blob 自动炸开进关系表（`upgradeV2`），per-session 数据优先；迁移失败则中止版本提交、保留源数据、下次重试，杜绝部分迁移与白屏
- **切档串行化**：save / load / delete / switch 统一经单一序列化链，防并发切档撕裂与孤儿数据
- **剧情摘要派生**：每页「剧情回顾」摘要随页面持久化，切档时从页面重建注入世界书，不单独冗余存储

## 测试

```bash
npm test         # Vitest (519 tests: 宏引擎 + LLM响应解析 + MVU ZOD(JSON Patch/YAML/角色卡重定向) + 骰子引擎 + COC 规则 + 数据库迁移 + 会话生命周期 + 选项匹配 + 提示词组装 + 轻量补写 + 物品获取 等)
npm run build    # tsc -b 类型检查 + Vite 构建
```

## 项目结构

```
src/                          # ~110 source files
├── components/
│   ├── Book/                 # 故事书翻页 + 状态栏 + 右页交互 (9 files)
│   ├── CharSheet/            # 角色卡 overlay + 创建向导 (含 steps/ 子目录)
│   ├── Inventory/            # 背包/物品栏浮层
│   ├── Dice/                 # 骰子面板 + 历史 (3 files)
│   ├── Landing/              # 开始界面 + 读档 (3 files)
│   ├── Layout/               # GameView + TopBar + InputBar (3 files)
│   ├── Settings/             # 设置面板群 (13 files)
│   └── Shared/               # 共享组件 (14 files)
├── hooks/                    # React Hooks (5 files)
│   ├── useChatPipeline.ts    #   聊天管道 hook
│   ├── useStreamingRenderer.ts #  流式渲染 hook
│   └── usePageFlip.ts        #   翻页 hook
├── stores/                   # Zustand 状态管理 (18 store/helper)
│   ├── sessionLifecycle.ts   #   会话游戏态 保存/恢复/清空 + 关系表读写 + 切档串行化
│   └── 全局态 5 store 经 Dexie persist；会话态 store 纯内存,由 sessionLifecycle 写关系子表
├── sillytavern/              # SillyTavern 引擎 (23 files)
│   ├── api-router.ts         #   LLM API 调用 (stream + non-stream)
│   ├── prompt-assembler.ts   #   提示词组装 + 世界书注入
│   ├── regex-engine.ts       #   正则脚本执行 (LRU 缓存)
│   ├── variables.ts          #   变量提取/合并
│   ├── slash-commands.ts     #   斜杠命令系统
│   ├── ejs-template.ts       #   EJS 模板引擎 (LRU 缓存)
│   ├── unified-macro-engine.ts #   统一宏引擎 (99 tests, 详见 docs/macro-engine.md)
│   ├── dice-engine.ts        #   骰子检定引擎 (35 tests)
│   ├── llm-response-parser.ts #  LLM 响应解析 (含物品叙事一致性校验)
│   ├── coc-rules.ts          #   COC 规则数据 + 纯函数
│   └── ...
├── db/                       # Dexie IndexedDB 持久化层 (5 files)
│   ├── database.ts           #   Dexie v2 schema：kvStore 全局态 + conversations 父表 + 7 子表 + upgradeV2 迁移
│   ├── storage.ts            #   Zustand persist 适配器（全局态 store 用）
│   └── migrations.ts         #   localStorage→IndexedDB 自动迁移
├── test/                     # Vitest 测试环境
├── types/                    # TypeScript 类型定义
├── styles/                   # 设计令牌 + 全局样式
├── constants/                # 共享常量
└── audio/                    # Web Audio 音效合成
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
