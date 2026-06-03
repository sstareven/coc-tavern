# 界面缩放（UI Scale）设计

- 日期：2026-06-03
- 分支：beta（实现+验证后按惯例 merge master 发版）
- 状态：设计已与用户确认，待实现

## 1. 目标

桌面端可在设置里把【整个界面（含字体、控件、浮层）】整体放大，照顾大屏电脑与近视用户。4 档预设：标准 100% / 大 115% / 特大 130% / 超大 150%。

## 2. 关键决策（已确认）
- 控件：4 档预设分段按钮（非滑块）。
- 上限：150%。合法档位集 `{1, 1.15, 1.3, 1.5}`。

## 3. 机制

给 `document.documentElement` 设置 `style.zoom = String(uiScale)`，等价于浏览器缩放，整体放大所有像素 UI + 字体 + position:fixed/absolute 浮层——无需改动项目中满屏的内联 px 样式（这是选 zoom 而非 rem/CSS 变量的根因）。

应用方式：新增 hook `useUiScale()`（src/hooks/useUiScale.ts），在 `App` 顶层调用；它订阅 `useSettingsStore` 的 `uiScale`，在变化时 `document.documentElement.style.zoom = String(scale)`（scale===1 时设为 '' 清除）。导出纯函数 `applyUiScale(scale: number)` 便于单测。

## 4. 设置项（store）

`src/stores/useSettingsStore.ts`：
- defaults 加 `uiScale: 1`。
- 加 setter `setUiScale: (v: number) => set({ uiScale: clampUiScale(v) })`。
- `clampUiScale(v)`：把任意输入吸附到最近的合法档位 `UI_SCALE_LEVELS = [1, 1.15, 1.3, 1.5]`（非法/越界回落最近档），导出供控件与测试复用。
- 走现有 `persist`（name `coc_settings_v2`，partialize stripFunctions）自动持久化、跨会话保留。

## 5. UI 控件

`src/components/Settings/SettingsPanel.tsx`：在「外观/通用」类（暗色模式、音效附近）加一行「界面缩放 / UI SCALE」：
- 4 个分段按钮：标准(100%) / 大(115%) / 特大(130%) / 超大(150%)，当前档高亮（金色）。
- 复用面板既有控件样式与动效（hover 增亮放大、active 按压、`cubic-bezier(0.4,0,0.2,1)` 过渡）。
- **仅桌面端显示**：`!useIsMobile()` 时才渲染该行（手机端隐藏）。

## 6. 边界处理

- **缩放无条件应用**（`useUiScale` 只读 `uiScale`，不读 isMobile）——规避反馈抖动：若按 isMobile 门控应用，放大可能令有效视宽跌破 768px → useIsMobile 翻转手机版 → 撤销放大 → 翻回，形成抖动循环。改为：控件仅桌面可见，手机端 uiScale 恒为默认 1，自然不缩放，且应用逻辑与 isMobile 解耦。
- 极端：窄桌面窗口开 150% 可能令有效宽度跌破 768px 触发手机版式——自洽的合理降级，可接受。
- `zoom` 在 Chromium 完整支持（项目桌面端为 Chromium/浏览器）；Firefox 126+ 亦支持。

## 7. 测试

- `clampUiScale`：合法档位原样返回；越界/非法吸附到最近合法档（2.0→1.5、0.5→1、1.2→1.15、NaN→1）。
- `applyUiScale`：scale=1.3 时 documentElement.style.zoom==='1.3'；scale=1 时为 ''（清除）。

## 8. 不做（YAGNI）
- 不做连续滑块、不做 <100% 缩小、不做每屏/每面板独立缩放、不做云端同步。
