# 移动端 UI 改造设计

- **日期**：2026-06-01
- **分支**：beta
- **状态**：已通过 brainstorming，待写实现计划

## 1. 背景与目标

当前 App 是横向（landscape）的「书皮 + 双页书本」UI：`GameView`（书皮背景）→ `Storybook`（左叙事页 + 2px 书脊 + 右选项页）→ `PageFlip3D`（CSS 3D rotateY 双页翻转）。

布局**没有任何移动端断点**，仅靠 `min(92vw, 960px) × min(65vh, 600px)` 流体缩放。在竖屏手机上，并排双页被压扁到无法阅读，书签栏、导航箭头会溢出。

**目标**：竖屏手机（宽度 ≤ 768px）上，把双页书本折叠成**单页便条（便条签）** 体验——一张羊皮纸卷轴，左右滑动翻页，行动选项收进底部"二级菜单"防误触。桌面 / 宽屏体验完全不变。

## 2. 关键决策（已与用户确认）

| # | 决策点 | 选定方案 |
|---|--------|----------|
| 1 | 实现策略 | **响应式 CSS 断点 + `useIsMobile()` hook**。复用同一套组件树与全部业务逻辑（store / 检定 / 库存 / 角色卡），仅在渲染层按 `isMobile` 切换布局。 |
| 2 | 断点 | `max-width: 768px` 进入手机模式。宽屏手机横屏（>768px）自动回退桌面双页。 |
| 3 | 单页布局 | 把左页叙事 + 右页选项折成**一张竖向便条**：上半叙事卷轴（标题/正文/骰子记录，可独立滚动），选项移出正文到底部抽屉。 |
| 4 | 翻页 | **左右滑动 swipe** 切上一张/下一张便条 + **保留半透明箭头按钮**兜底。横向滑入滑出动画替代桌面 3D 双页翻转。 |
| 5 | 二级菜单（防误触） | **底部"⚜ 选择行动 (n)"入口条 → 上滑抽屉（Action Sheet）**。平时只见入口条；点开抽屉覆盖便条、叙事变暗；点选项即生效；点暗区 / grip / "收起"收回。 |
| 6 | 多选项滚动暗示 | 抽屉高度封顶（约半屏）。选项 ≤4 直接铺开；**≥5 触发"下隐"三层暗示**：底部渐隐遮罩 + 半露下一项（半透明）+ 居中下弹箭头 ⌄（开始滚动后淡出）+ 顶部 grip 抓握条。 |
| 7 | 书签栏位置 | 移到**顶部**：标题栏（TopBar）下方一条 **Tab 工具条**（库存 / 角色卡 / 目录 / 骰子历史，四等分，选中态金色下划线高亮）。底部因此只剩输入栏 + 行动入口，少一层。 |
| 8 | 图标风格 | **古典铜版线描**：单色金线 SVG 图标（钱袋 / 卷轴卡 / 古书 / 多面骰）+ 衬线文字标签。**不用 emoji**（与克苏鲁气氛不搭）。 |
| 9 | 状态栏 | 压成**单行紧凑条**（时间·天气·地点 | HP·SAN·MP），横向可滚动避免溢出，置于 Tab 工具条下方。 |

## 3. 布局结构

### 桌面（不变）
```
100vh
 ├─ TopBar (48px)
 ├─ main: 书皮背景 + Storybook[左页 | 2px书脊 | 右页] + 左缘竖书签 + StatusBar(浮于书上)
 └─ InputBar
```

### 手机（≤768px，新增）
```
100vh
 ├─ TopBar      标题 + ☰ 菜单
 ├─ TabBar      🜔库存 | 🜔角色卡 | 🜔目录 | 🜔骰子  (古典线描图标 + 文字, 选中下划线)
 ├─ StatusBar   第N日·天气·地点 | HP SAN MP  (紧凑单行, 横向可滚动)
 ├─ main(flex:1):
 │    └─ NoteCard 单页便条 (羊皮纸卷轴, 可纵向滚动)
 │         ├─ 标题 + 正文 + 骰子记录
 │         └─ 左右半透明箭头 (‹ ›), 支持水平 swipe 翻页
 ├─ ActionEntry  "⚜ 选择行动 (n) ▲"  (仅当本便条有选项时显示)
 │    └─ 点开 → ActionSheet 抽屉上滑覆盖便条 + 叙事变暗 + 下隐滚动暗示
 └─ InputBar     输入 + ➤ 提交
```

## 4. 组件改造清单

| 文件 | 改动 |
|------|------|
| `src/hooks/useIsMobile.ts` | **新增**。`matchMedia('(max-width: 768px)')`，返回布尔，监听 resize/变化。 |
| `src/components/Layout/GameView.tsx` | 按 `isMobile` 分支：手机端不渲染书皮背景与固定书本尺寸，改为全宽全高列布局，挂载手机版结构。 |
| `src/components/Book/Storybook.tsx` | 按 `isMobile` 渲染 `MobileNoteView`（单页便条）而非双页书本。当前 `showToc / inventoryOpen / charSheetOpen` 本地态需上提或经回调暴露给顶部 TabBar 触发。 |
| `src/components/Book/MobileNoteView.tsx` | **新增**。单页便条：合并 `LeftPage` 叙事 + 骰子记录；水平 swipe / 箭头翻页（复用 `useBookStore.nextPage/prevPage`）；横向滑入滑出动画（Framer Motion）。 |
| `src/components/Book/ActionSheet.tsx` | **新增**。底部"选择行动"入口条 + 上滑抽屉；承接原 `RightPage` 的选项 / 检定 / 库存变更逻辑（抽出共享 hook 或组件，避免与 `RightPage` 重复实现）；下隐滚动暗示（渐隐 + 半露 + 下弹箭头 + grip）。 |
| `src/components/Layout/MobileTabBar.tsx` | **新增**。顶部四 Tab 工具条，古典线描 SVG 图标，点击触发库存 / 角色卡 / 目录覆盖层 与 `usePanelStore.open('diceHistory')`。 |
| `src/components/Book/StatusBar.tsx` | 增加手机紧凑单行变体（横向可滚动）。 |
| `src/components/Book/RightPage.tsx` | 抽出选项渲染 / 检定触发 / 库存变更逻辑为可复用单元，供 `ActionSheet` 与桌面右页共用，**不复制逻辑**。 |
| `src/styles/tokens.css` / 各组件 | 新增 `@media (max-width: 768px)` 样式；Tab 图标用内联 SVG（金线 `--gold`/`--brass`）。 |

## 5. 共享与隔离原则

- **业务逻辑零改动**：`useBookStore`、`useDiceStore`、`useInventoryStore`、`useCharSheetStore`、检定流水线全部复用。手机/桌面只是**渲染层**差异。
- **选项逻辑单一来源**：`RightPage` 的选项处理 / 检定 / 库存变更必须抽成共享单元，`ActionSheet` 与桌面右页共用，杜绝两套实现漂移。
- **覆盖层复用**：库存 / 角色卡 / 目录 / 骰子历史覆盖层沿用现有实现，仅入口从"左缘书签"换成"顶部 Tab"。

## 6. 不在本期范围（YAGNI）

- 不做横屏（landscape）手机的专属布局——横屏宽度通常 >768px，自动回退桌面双页即可。
- 不做平板专属中间态。
- 不改桌面端任何观感与交互。
- 不引入新的手势库（用原生 touch 事件 / Framer Motion 的 drag 即可）。

## 7. 验收标准

- 宽度 ≤768px 时：单页便条 + 顶部 Tab + 底部行动抽屉布局生效，无横向溢出。
- 左右滑动 / 箭头可翻页，动画顺滑。
- 行动抽屉：≤4 项直接铺开；≥5 项出现下隐渐隐 + 半露 + 下弹箭头；点选项正确触发原有检定 / 库存逻辑。
- 顶部四 Tab 正确打开对应覆盖层；图标为古典线描金线、无 emoji。
- 宽度 >768px 时桌面双页书本与现状**逐像素一致**。
- `tsc -b`、`vitest`、`vite build` 全绿。
