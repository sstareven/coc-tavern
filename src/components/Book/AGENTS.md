# 故事书翻页组件群

**6 files, ~1170 lines.** CSS 3D 双页翻页系统。自定义缓动数学、`transform-style: preserve-3d`、`backface-visibility`。不使用 Framer Motion。

## OVERVIEW

故事书是应用的核心视觉组件。左页显示叙事内容（带滚动发光粒子），右页显示交互选项和骰子检定结果。翻页动画完全由 CSS 3D transform 驱动（三次贝塞尔缓动），通过 `usePageFlip` hook 编排状态机。与 `InputBar.tsx` 通过自定义 DOM 事件通信。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 翻页编排器 | `Storybook.tsx` | 357 lines，书签标签、目录弹窗、翻页状态机 |
| 右页（交互/骰子） | `RightPage.tsx` | 295 lines，骰子检定解析、选项按钮、代码块渲染 |
| 左页（叙事） | `LeftPage.tsx` | 168 lines，滚动粒子发光效果，`@keyframes particleFloatUp/Down` |
| CSS 3D 翻页引擎 | `PageFlip3D.tsx` | 143 lines，`CSSFlipPage`/`FadingPage`/`AppearPage` 组件 |
| 场景状态栏 | `StatusBar.tsx` | 119 lines，页码/Token 显示 |
| 导航箭头 | `PageNav.tsx` | 88 lines，前进/后退按钮 |

## CONVENTIONS

- **翻页动画禁用 Framer Motion** — 全部使用原生 CSS `rotateY` + `transform-style: preserve-3d` + `backface-visibility`
- **`data-flip` 属性** — `CSSFlipPage` 使用 `data-flip="card"` / `"front"` / `"back"` 标记 DOM 节点
- **导出常量** — `FLIP_CONFIG = { TOTAL: 1500 }` 可调翻页时长
- **缓动函数** — `cubicBezier()`、`solveBezier()`、`stagedProgress()` 为纯数学函数，在组件内定义
- **100% 内联样式** — 使用 `var(--tokens)` + 内联 `@keyframes` 注入
- **`React.memo`** — PageFlip3D 的子组件使用避免不必要重渲染

## CROSS-DIRECTORY DEPENDENCIES

| 依赖方向 | 目标 | 用途 |
|---------|------|------|
| hooks | `usePageFlip.ts` | 翻页状态机 |
| stores | `useBookStore`、`useCharSheetStore`、`usePanelStore`、`useVariableStore`、`useTavernHelperStore`、`useDiceStore`、`useSettingsStore` | 7 个 store 连接 |
| sillytavern | `coc-data.ts` | COC 骰子数据 |
| Shared | `BookUtils`、`TokenDisplay`、`CodeBlockRenderer`、`TextBeautifier` | UI 辅助组件 |

## ANTI-PATTERNS

- **DOM 事件桥** — `RightPage.tsx` dispatch `dice-roll-animate` / `auto-submit-input` 自定义事件给 GameView/InputBar。非 React 通信模式
- **`console.warn` 残留在生产代码** — `Storybook.tsx` 中有调试日志
- **`PageFlip.tsx` 与 `PageFlip3D.tsx` 并存** — 前者使用 Framer Motion（已废弃），后者使用 CSS 3D。旧版未清理
- **`StatusBar.tsx` 有空 catch 块** — 静默吞下错误
