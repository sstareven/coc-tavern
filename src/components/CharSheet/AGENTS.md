# 角色卡组件群

**7 files + steps/ 子目录 (6 files).** CharacterCreator 已从 2221 lines god component 拆分为编排器 + 6 个步骤子组件。styles.ts 提供 9 个共享 CSSProperties。

## OVERVIEW

角色卡系统包含创建向导、属性网格、面板展示、技能表、次级属性。创建流程 6 步（身份→属性→衍生属性→技能→背景→复核），每步独立文件。DarkSelect 在 Shared/ 中单独维护。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 角色创建编排器 | `CharacterCreator.tsx` | 922 lines，步骤编排 + 提交逻辑 |
| 共享样式 | `styles.ts` | 9 个 CSSProperties（inputStyle, labelStyle 等） |
| 身份填写 | `steps/StepIdentity.tsx` | Step 0，姓名/年龄/职业 |
| 属性投点 | `steps/StepCharacteristics.tsx` | Step 1，STR/DEX/INT/CON/APP/POW/SIZ/EDU/LUCK |
| 衍生属性 | `steps/StepDerivedStats.tsx` | Step 2，HP/MP/SAN/DB/MOV/Build/Dodge |
| 技能分配 | `steps/StepSkills.tsx` | Step 3，职业/兴趣技能点分配 |
| 背景设定 | `steps/StepBackground.tsx` | Step 4，背景故事/肖像 |
| 复核与提交 | `steps/StepReview.tsx` | Step 5，最终确认 |
| 角色展示 | `CharSheetPanel.tsx` | 角色卡详情面板 |
| 属性网格 | `CharGrid.tsx` | 当前属性值网格展示 |
| 调查员卡片 | `InvestigatorCard.tsx` | 名片式摘要 |
| 技能表 | `SkillsTable.tsx` | 技能列表 + 检定 |
| 次级属性 | `SecStats.tsx` | 衍生属性行 |

## CONVENTIONS

- **步骤子组件** — 统一接口：`value` + `onChange` props，无本地状态
- **100% 内联样式** — 所有样式走 `style={{}}` + `var(--tokens)`，styles.ts 提供复用常量
- **DarkSelect** — 下拉选择走 `Shared/DarkSelect.tsx`，非本地实现
- **PascalCase** — 文件名与组件名一致

## ANTI-PATTERNS

- **CharacterCreator 仍有 922 lines** — 编排逻辑 + 提交逻辑仍在一个文件。可考虑提取提交逻辑到独立 hook。
- **styles.ts 被 CharSheet 和 Shared 同时引用** — DarkSelect 从 CharSheet 目录导入样式，形成跨域依赖。
- **步骤组件无状态** — 所有状态靠 CharacterCreator 的 useState 集线器逐层传递，props drilling 深。
