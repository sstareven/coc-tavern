# 骰子检定组件群

**3 files, ~742 lines.** d100 骰子系统 UI。Framer Motion 动画 + Web Audio 音效 + 粒子特效。COC 7th 规则：五级判定 + 奖励/惩罚骰 + SAN 检定。

## OVERVIEW

骰子系统由三个组件构成：主面板 `DicePanel`（骰子模式选择 + 掷骰动画）、历史记录 `DiceHistory`（按颜色编码的五级结果表）、单骰动画 `DiceDie`（滚动效果 + 颜色变体）。骰子逻辑委托给 `sillytavern/dice-engine.ts`（纯计算），状态管理在 `useDiceStore`（内存，不持久化）。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 骰子主面板 | `DicePanel.tsx` | 446 lines，模式选择（技能/对抗/自由/SAN）、奖励/惩罚骰、粒子特效、音效 |
| 掷骰历史 | `DiceHistory.tsx` | 232 lines，按颜色编码的结果表格（大成功=金、极难=橙、困难=绿、成功=白、失败=红、大失败=暗红） |
| 骰子动画 | `DiceDie.tsx` | 64 lines，滚动动画效果、3 种颜色变体（默认/成功/失败） |

## CONVENTIONS

- **Framer Motion** — 使用 `AnimatePresence` + `motion.div`（scale/shake/glow），是少数使用 Framer Motion 的组件群之一
- **Web Audio API** — `sfxSuccess`/`sfxFailure`/`sfxCritSuccess`/`sfxCritFailure` 来自 `src/audio/sfx.ts`
- **粒子特效** — `useRef` + `useCallback` 生成 canvas 粒子（大成功/大失败时触发）
- **DOM 操作** — `fillResultText()` 使用 `Object.getOwnPropertyDescriptor` hack 修改 textarea 值（非 React 方式）
- **结果六元组** — `crit-success` > `extreme-success` > `hard-success` > `success` > `failure` > `crit-failure`
- **样式** — `closeBtnStyle` 从 `src/styles/panelStyles.ts` 共用

## DEPENDENCIES

| 方向 | 目标 | 用途 |
|------|------|------|
| store | `useDiceStore` | 唯一的 store 依赖（内存状态） |
| sillytavern | `dice-engine.ts` | 纯计算（通过 store 间接调用） |
| audio | `sfx.ts` | Web Audio 音效合成 |
| styles | `panelStyles.ts` | 共享 `closeBtnStyle` |

## ANTI-PATTERNS

- **`fillResultText` DOM hack** — 通过 `Object.getOwnPropertyDescriptor` 获取原生 setter 并强制赋值。应替换为 callback 或 store 驱动
- **`DiceAnimation.tsx`（Shared/）空 catch 块** — 音频加载失败静默吞下（3 处）
- **结果文本格式化在 UI 层** — `formatResultText()` 在 `DicePanel.tsx` 内定义，应提取到工具函数
