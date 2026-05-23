# 深渊档案馆 — COC TRPG 酒馆前端设计文档

## 概述

基于 SillyTavern 架构的克苏鲁召唤（Call of Cthulhu 7th Edition）TRPG 前端。核心交互为故事书翻页叙事，融合酒馆的聊天/世界书/预设/角色卡管理体系。

**美学方向**：维多利亚档案 + 暗黑神秘学融合。暖调旧纸/皮革/古金配色，泛黄书页为中心视觉。

## 技术栈

| 层 | 选型 |
|---|------|
| 框架 | React 18 + TypeScript |
| 状态管理 | Zustand |
| 样式 | CSS Modules + CSS 自定义属性（设计令牌） |
| 持久化 | Dexie.js（IndexedDB） |
| 动画 | Framer Motion |
| 音效 | Web Audio API（合成） |
| 音乐播放 | HTML5 Audio + File API |

## 设计令牌

```css
--parchment: #f4e4c1;     /* 书页主色 */
--gold: #c4a855;           /* 古金强调 */
--leather: #2a1f14;        /* 皮革暗色 */
--abyss: #1a1410;          /* 深渊底色 */
--blood: #8b3a3a;          /* 血墨/失败 */
--success: #3a6b5a;        /* 成功绿 */
--brass: #3d2b13;          /* 黄铜边框 */
--font-display: Georgia, Noto Serif SC, serif;
--font-body: Crimson Text, Noto Serif SC, serif;
--font-ui: Inter, PingFang SC, sans-serif;
--font-mono: JetBrains Mono, monospace;
```

## 组件树

```
App
├── LandingScreen          # 开始菜单
│   ├── ChangelogModal     # 更新日志弹窗（localStorage 版本控制）
│   └── SettingsModal      # 设置面板（可独立呼出）
├── GameView
│   ├── TopBar             # 导航栏（设置/世界书/预设/对话）
│   ├── MusicPlayer        # 可拖动 MP3 播放器
│   ├── BookContainer
│   │   ├── BookmarkTabs   # 书底便签（调查员记录/掷骰/检定记录）
│   │   ├── PageNav        # 圆形翻页箭头
│   │   ├── BookUtils     # 书本外侧工具按钮（编辑/删除/日志）
│   │   └── Storybook      # 故事书双页
│   │       ├── TokenDisplay # 右下角 Token 用量文字
│   │       ├── LeftPage   # 叙事+检定结果+楼层页码
│   │       └── RightPage  # 选项列表+翻页系统（MVU输出，无页码）
│   ├── DebugLog           # 顶部调试日志面板
│   └── InputBar           # 底部输入栏
├── CharSheetOverlay       # 角色卡侧面板（左滑出）
│   ├── CharGrid           # COC 7th 基础属性 8 项
│   ├── SecStats           # 衍生属性网格（3×2）
│   ├── SkillsTable        # 可折叠技能表格
│   └── InvestigatorCard   # 名片式身份卡（含肖像位）
├── DiceOverlay            # 骰子检定弹窗（居中弹出）
│   ├── DiceCube           # d100 骰子视觉
│   └── ResultDisplay      # 检定结果（扑克牌式布局+水印）
├── DiceHistoryOverlay     # 检定历史表（居中）
├── WorldbookOverlay       # 世界书列表
├── LorebookEditorOverlay  # 世界书条目编辑器（左侧列表+右侧表单）
├── PresetOverlay          # 预设列表
├── PresetEditorOverlay    # 预设三Tab编辑器
├── ChatlistOverlay        # 对话会话列表
├── SettingsOverlay        # 设置面板
└── ExtManagerOverlay      # 扩展脚本管理
```

## 数据模型

### 世界书 (LoreBooks)
```ts
interface LoreBook {
  id: string;
  name: string;
  entries: Record<string, LoreEntry>;
}
interface LoreEntry {
  name: string;       // 条目名
  keys: string;        // 触发关键词（逗号分隔）
  content: string;     // 注入内容
  logic: 'AND' | 'OR' | 'NOT';
  priority: number;    // 1-100
}
```

### 角色卡 (Character Sheet)
```ts
interface CharacterSheet {
  characteristics: { [key in COC7Char]: number };  // 8 项基础属性
  secondary: { hp: number; san: number; mp: number; luck: number; mov: number; db: string; };
  skills: Record<string, { base: number; current: number }>;
  identity: { name: string; occupation: string; age: number; gender: string; birthplace: string; residence: string; };
}
```

### 扩展脚本 (Extension)
```ts
interface Extension {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  enabled: boolean;
  entryPoint: string;    // 全局入口变量
  installUrl?: string;   // GitHub URL
}
```

## 交互流程

### 翻页系统（楼层制）
- 每层（页）对应酒馆的一个对话楼层，左页显示叙事/检定结果，右页显示选项（由 MVU 输出）
- 仅左页显示页码（如「— 3 —」），右页不显示
- 翻页流程：
  1. 用户点击翻页箭头
  2. 当前页文字淡出 (0.35s)
  3. 翻转动画 (1.2s，音效同步)：向前=右页绕左缘左转 / 向后=左页绕右缘右转
  4. 新页文字淡入 (0.8s)，选项依次滑入

### 楼层编辑器
- ✎ 按钮弹出编辑器面板，仅编辑**左页**内容（标题 + 正文，支持 HTML）
- 右页由 MVU 系统自动输出，不在编辑器内修改
- 楼层数（页码）自动对应 pageIndex，不可手动编辑

### 骰子检定

**两种触发方式**：
1. **手动模式**：点击掷骰便签 → 面板弹出 → 玩家自由设置参数并投掷
2. **剧情触发模式**：故事书翻到需要检定的页面时，自动弹出检定窗口，预设好技能名与目标值。玩家投掷后，结果自动填入输入栏，推动剧情前进。

**CoC 7th 五级判定**（target=技能值，half=floor(target/2)，fifth=floor(target/5)）：

| 等级 | 条件 | 视觉效果 |
|------|------|----------|
| 大成功 | roll = 1 | 金色粒子+闪光+书本变亮 |
| 极限成功 | 1 < roll ≤ fifth | 海绿色辉光+水印 ○ |
| 困难成功 | fifth < roll ≤ half | 翠绿色辉光+水印 ○ |
| 一般成功 | half < roll ≤ target | 绿色辉光+水印 ○ |
| 失败 | target < roll < fumble 阈值 | 红色辉光+水印 ✘ |
| 大失败 | roll=100 或 (target<50 且 roll≥96) | 红色粒子+暗角+书本震颤+水印 ✘ |

**剧情联动流程**：
1. 故事书检测到检定需求 → 弹出检定窗口（预设技能名+目标值）
2. 窗口显示检定名称（如「侦查检定」）和目标值（如 65）
3. 玩家点击「掷骰」按钮 → d100 投掷 + 动画 + 音效
4. 结果展示后，将判定文本填入底部输入栏（如「侦查检定 42/65 普通成功」）
5. 玩家点「推进」→ 翻页继续剧情

**面板功能**：
- 模式切换：技能检定 / 对抗检定 / 自由掷骰
- 自定义目标值（localStorage 记忆）
- 奖励/惩罚骰：额外十位骰，取较小（奖励）/ 较大（惩罚）
- SAN 检定模式：96-100 均为大失败
- 对抗检定：绿色玩家骰 VS 红色对方骰，五级对比

**关键规则**：
- 100 必定大失败（包括技能 > 100 的情况）
- SAN 检定不可消耗幸运、不可孤注一掷
- 大失败不可孤注一掷

### 悬停提示
1. 光标进入可提示元素 → 圆形进度环开始填充（延迟可在设置调节）
2. 环满 → 悬浮窗弹出（左上角锚点对齐光标）
3. 窗内关键词（金色下划线）→ 再次悬停进度环 → 嵌套窗弹出
4. 光标离开 0.3s → 自动隐藏

## 状态管理（Zustand Store）

```ts
interface AppStore {
  // 翻页
  pageIndex: number;
  nextPage: () => void;
  prevPage: () => void;

  // 角色卡
  charSheet: CharacterSheet | null;
  isCharSheetOpen: boolean;

  // 骰子
  diceHistory: DiceRecord[];
  triggerRoll: (skill: string, target: number) => void;

  // 世界书
  activeLorebook: string | null;
  loreBooks: Record<string, LoreBook>;

  // 设置
  soundEnabled: boolean;
  tooltipDelay: number;
  musicVolume: number;
}
```

### 书本工具按钮

书本右上角外侧 3 个浅色纸色小按钮：
- ✎ 编辑楼层 — 弹出左页编辑器（标题 + 正文），保存更新。页码自动对应楼层，右页 MVU 输出不在此编辑
- ✕ 删除当前页 — 确认后删除
- ⚑ 调试日志 — 顶部展开日志面板（时间戳 + 级别标记）

书本右下角 Token 用量文字：各页独立统计 Token 消耗，格式 `1.2k tokens`

### Token 用量

每页渲染时模拟 Token 消耗（300-1500），右下角实时显示总计。各页独立统计，翻页时累加。调试日志同步记录每次渲染的 Token 使用。

---

## 关键交互规则

- **ESC** 关闭所有面板/弹窗
- 角色卡面板关闭时 → 所有浮动窗强制消失
- 悬浮窗与进度环 z-index 最高层，不受任何面板遮挡
- 书底便签点击触发对应面板/功能
- 翻页箭头首层左箭头灰显，末层右箭头灰显

## 待实现阶段

1. React 项目脚手架 + 组件拆分
2. Dexie 数据库层
3. MVU 变量引擎（扩展脚本形式）
4. LLM API 路由 + 流式解析
5. 酒馆助手扩展
6. SillyTavern 格式导入/导出
