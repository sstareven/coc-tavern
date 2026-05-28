# 布局层 — 应用外壳

**3 files.** GameView 是顶层容器，InputBar 是架构中枢。所有 SillyTavern 引擎与 10 个 store 在此交汇。

## OVERVIEW

Layout/ 提供应用的三段式外壳（TopBar + 故事书桌面 + InputBar）。InputBar.tsx 是全局唯一的引擎消费点 — 导入 10 个 sillytavern 引擎文件和 8 个 Zustand stores。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 聊天输入 / API 调度 | `InputBar.tsx` | 939 lines ⚠️ 架构中枢，30 import |
| 桌面布局 | `GameView.tsx` | TopBar + Storybook + 桌面纹理 |
| 顶部状态栏 | `TopBar.tsx` | 45 lines，返回菜单 + 骰子/角色卡按钮 |

## CONVENTIONS

- **100% 内联样式** — 桌面纹理用内联 CSS gradient + SVG noise 实现，无图片资源
- **Panel store 驱动** — 面板开关由 `usePanelStore` 控制，GameView 仅响应 dice-roll-animate 自定义事件
- **InputBar 的 FORMAT_INSTRUCTION** — 32 行 JSON 模板（文学代理人格式），硬编码在文件顶部

## ANTI-PATTERNS

- **InputBar.tsx (939 lines)** — 处理斜杠命令、EJS 渲染、世界书激活、正则执行、MVU 提取、API 调用、Th 脚本 hook、上下文裁剪 — 全部在一个组件中。应拆分为独立 hook 或服务层。
- **`DEFAULT_PRESET` 在 InputBar.tsx** — 与 PresetEditor.tsx 中的拷贝独立维护（L34-50）。任何预设 schema 变更需同步两处。
- **跨组件 DOM 侵入** — GameView.tsx L29 通过 `document.querySelector('footer textarea')` 操作 InputBar 的 DOM，而非使用 React ref/props。
- **`FORMAT_INSTRUCTION` 硬编码** — 32 行文学代理人格式字符串。应提取到预设配置或世界书条目中。
