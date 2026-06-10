# 结局总览 tab —— 拯救/坏结局/暗线 编辑布局重构

**日期**: 2026-06-10
**问题**: 拯救路径 / 坏结局矩阵 / 暗线时间线三个独立 tab 编辑不便。痛点：
  1. 拯救路径里挑 `failureVariantId` 时下拉只显示 `bad_xxxx` id，看不到坏结局内容
  2. 卡片标题只显示 id（`bad_xxxx` / `phase_xxxx` / `res_xxxx`），扫一眼认不出谁是谁
  3. 8 个剧本扩到每剧本 5 bad + 15 rescue 后，一打开 tab 全展开滚很久
  4. 拯救路径与坏结局/暗线散在 3 个 tab，看不到全局关联

## 决策

- **范围**：合并 `rescue` / `badEndings` / `darkTimeline` 三个 tab 为单个 `overview` "结局总览" tab；原 3 tab 保留为 `hidden: true` 细编入口
- **布局**：三栏 4:3:3（左拯救路径 / 中坏结局 / 右暗线 threshold 轴）
- **交互**：缩略卡片 + 右侧 460px 抽屉详情；移动端 60dvh 底部抽屉
- **联动高亮**：选 rescue → 高亮其 failureVariant；选 bad → 高亮所有引用它的 rescue；选 phase → 不联动其他栏

## 信息架构

`ScenarioEditor.tsx` TABS 数组：
- 现状：`rescue` / `darkTimeline` / `badEndings`（`badEndings` 已 hidden）
- 改后：
  - 新增 `{ key: 'overview', label: '结局总览' }`，位置放在 `meta` 之后、`locations` 之前（剧本进入编辑后第一眼看到）
  - `darkTimeline` / `badEndings` / `rescue` 改为 `hidden: true`（细编后备入口，沿用现有 hidden+IconStar 的视觉模式）

## 三栏总览布局

顶部固定一条工具栏：
- 全栏搜索（搜 rescue.name / bad.condition / phase.title / phase.triggers）
- 三个新增按钮：`+ 新拯救路径` / `+ 新坏结局` / `+ 新暗线阶段`

主区横向 flex 三栏，比例 **4 : 3 : 3**。每栏顶部 sticky 一个标题条：栏名 + 计数徽章 + 齿轮（点跳到对应细编 tab）。栏内 `overflow-y:auto` 独立滚动；栏间金色细分隔线。

### 左栏：拯救路径

每条缩略卡（高度 56–64px）：
- 行 1：圆形进度环（里程碑 delta 总和 / 100）+ 路径名（fallback id）+ `[N 里程碑]` 灰徽章 + 红色 `→ {failureVariant 名}` 或 `⚠ 未绑`
- 行 2：单行截断 `unlockHint`
- hover：抬起 + 加亮金边（沿用 `BarButton` 动效）
- 选中：左 3px 金竖条 + 背景加深 + `box-shadow` 内阴影

### 中栏：坏结局

每条缩略卡（高度 48–56px）：
- 行 1：菱形小图标 + 结局名（fallback id）+ `[绑定 N 条路径]` 灰徽章（hover tooltip 列路径名）
- 行 2：单行截断 `condition`

### 右栏：暗线时间线

垂直 threshold 轴布局：
- 左侧一条金色细线 0→100 刻度（每 25 一档）
- 每个 phase 卡片纵坐标按 `threshold` 排列，左侧连一条短线到主轴对应刻度
- 卡片内容：`[threshold]` 数字大字 + title + 单行截断 triggers

## 联动高亮模型

```ts
type Selection =
  | { kind: 'rescue'; id: string }
  | { kind: 'bad'; id: string }
  | { kind: 'phase'; id: string }
  | null
```

- 选 rescue：中栏 `b.id === r.failureVariantId` 的卡加金边
- 选 bad：左栏 `r.failureVariantId === b.id` 的卡加金边
- 选 phase：仅自身高亮，不联动（暗线 phase 与 rescue/bad 无数据级关联）
- 未选中态：所有卡保持正常亮度（不变暗，避免噪声放大）

高亮样式 = 1px 金边 + 微金背景 + 关键徽章金色，不影响 hover/click 反馈。

## 右侧抽屉详情

桌面端：
- 固定宽 460px，绝对定位在总览右侧，从右侧滑入：`transform: translateX(100%) → translateX(0)` 250ms `cubic-bezier(0.4, 0, 0.2, 1)`
- 抽屉打开时三栏总览仍可见可点（切换抽屉内容即可，无关闭/重开）

移动端（`compact === true`）：
- 底部 60dvh 全宽抽屉，沿用 `ScenarioEditor` 现有 `CompanionChat` 移动抽屉模式

抽屉内容 = 复用现有详情编辑组件：
- `kind: 'rescue'` → `<RescueCard>` （现位于 `RescueEndingsTab.tsx`，需 export）
- `kind: 'bad'` → `<EndingCard>` （现位于 `BadEndingsTab.tsx`，需 export）
- `kind: 'phase'` → `<PhaseCard>` （现位于 `DarkTimelineTab.tsx`，需 export）

抽屉头部：返回箭头 + 当前实体名 + 删除按钮（取代原 Card 内嵌的右上角删除）。

关闭：抽屉外金面板点空白 / `Esc` / 头部返回箭头 → 清 `selection`，三栏回到无选中态。

## 工程落地

### 新文件

```
src/components/Scenario/tabs/overview/
  OverviewTab.tsx                — 容器：工具栏 + 三栏 + 抽屉
  RescueOverviewRow.tsx          — 左栏缩略卡
  BadEndingOverviewRow.tsx       — 中栏缩略卡
  DarkPhaseOverviewRow.tsx       — 右栏暗线缩略卡（轴布局由 OverviewTab 负责）
  OverviewDetailDrawer.tsx       — 抽屉容器 + 按 kind 渲染对应 Card
```

### 改动旧文件（主控收口）

- `src/components/Scenario/tabs/RescueEndingsTab.tsx` — 把 `RescueCard` 加 `export const RescueCard = memo(...)`；同时 export `MilestoneRow` 不需要（RescueCard 内部用）
- `src/components/Scenario/tabs/BadEndingsTab.tsx` — `export const EndingCard`
- `src/components/Scenario/tabs/DarkTimelineTab.tsx` — `export const PhaseCard`
- `src/components/Scenario/ScenarioEditor.tsx`：
  - `TabKey` 加 `'overview'`
  - `TABS` 数组顶端（meta 之后）插入 `{ key: 'overview', label: '结局总览' }`
  - `'darkTimeline'` / `'badEndings'` / `'rescue'` 三项加 `hidden: true`
  - `renderTab()` switch 加 `case 'overview': return <OverviewTab ... />`
  - `activeTab` 默认值改为 `'overview'`（剧本进入后第一眼看到的）

### 不动

- `ScenarioDoc` 类型、`applyScenarioPatch` reducer、`RescueEnding` / `BadEnding` / `DarkPhase` 结构 — 完全不动
- 数据持久化、内置剧本数据 — 不动
- 内置剧本初始化、`initFromScenario` — 不动
- 拯救路径运行时（`RescueBar`、`useRescuePathStore`） — 不动

### 视觉/动效约束

遵循 user memory 偏好（见 `MEMORY.md`）：
- 动效一律 `cubic-bezier(0.4, 0, 0.2, 1)`
- 按钮 hover 增亮抬起 + active 按压
- 不出 emoji，icons 用现有 `IconStar`/`IconClose` 等铜版线描；如缺新增同风格 SVG
- 不允许横向滚动条；按钮内字号一般不接 `var(--system-ratio)`
- 中文 label 不附英文对照
- 所有滚动条遵循 `.scenario-editor` 铜版风（tab 自管 `overflow:auto + minHeight:0`）

### Beta-no-backward-compat

按 `beta-no-backward-compat` 偏好：直接断 `activeTab` 默认值；不写迁移；老 localStorage 中可能存在的 `activeTab: 'rescue'` 等读到后保持原样工作（旧 tab 仍存在仅 `hidden`）。

## 测试

仅类型检查 + build；UI 测试由用户进行（见 user memory `user-does-ui-testing`）：
- `npm run typecheck`
- `npm run build`

## 提交

- commit message: `feat(scenario): 拯救/坏结局/暗线 三 tab 合并为「结局总览」三栏 tab + 抽屉详情`
- 不带 Co-Authored-By（user memory）
- 推 beta 分支（user memory）
