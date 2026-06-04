# COC7e 规则完成路线图 — 设计文档

**日期**: 2026-06-04
**分支**: beta
**作者**: Claude (workflow ultracode, 22 agents, 2.3M tokens)
**验证基线**: COC7th2002c.pdf 第三/五/六/七/八章原文交叉验证

---

## 0. 背景

即时战斗已落地 beta，但 ⚠️ 部分实现与 ❌ 完全缺失 共计 25+ 项规则尚未机械化（只靠 LLM 叙事兜底）。本设计给出**全量蓝图**：4 个里程碑 / 9 个特性桶 / ~50 个 ticket，外加 3 道地基级 blocker 与 8 条经 PDF 原文校验的规则锁定条款。

**优先级方法论**: 高 narrative_impact × 低 complexity 优先；新面板（追逐、法术）延后；纯 schema/规则改动并行扇出。

---

## 1. 三道地基 Blocker（任何里程碑动土前必须封堵）

> 这三个问题在子代理逆向验证中被反复命中。任何 sheet 字段 / MVU 路径 / 触发器扩展若不先解决它们，会产生**静默失效**——代码看着对，运行时数据 rollback 或被 swallow。

### G1 — useCharSheetStore 没有 persist 中间件

**现状**: `src/stores/useCharSheetStore.ts:41` 是裸 `create<>()`，没有 `persist` 与 `onRehydrateStorage`。Sheet 由 `sessionLifecycle.loadConversation` 直接 `setSheet(dbRow ?? defaultSheet)` 灌入。所有桶里的「`onRehydrateStorage` 迁移」承诺都是想象的。

**风险**: 老存档 sheet 缺新字段 → `sheet.pillars.map(...)` / `sheet.conditions.forEach(...)` 等任何引用立刻崩。

**修法**: 抽 `migrateSheet(raw: Partial<CharacterSheet>): CharacterSheet`，在 `sessionLifecycle.loadConversationInner` 灌入处包一层；`defaultSheet` 也走它。M1 第一个 ticket（A0.1）。

### G2 — applyMvuOpsToTree 静默吞掉未注册的 `调查员.*` 路径

**现状**: `useVariableStore.ts:79-81` 对所有 `isCharsheetPath` 无条件 `return true`，即使 `applyCharsheetRedirect` 返回 undefined。

**风险**: 任何新 `调查员.*` 路径（A1 `/调查员/幸运`、D1 `/调查员/持续状态/*`、D2 `/调查员/支柱/*`）若忘扩 `mvu-charsheet-redirect.ts`，patchReport 报成功但 sheet 不变；自纠也救不了；只能靠测试发现。

**修法**:
1. 任何新 `调查员.*` 路径都把「扩 redirect」列为该 ticket 的首步骤。
2. 改造 `applyMvuOpsToTree`：未注册的 `调查员.*` 路径不再静默 consume，改为 push 到 errors[]（向后兼容：所有现有路径都在 redirect map 内，不会回归）。

### G3 — MVU 在阻塞路径，触发器再触发 setSheet 会被 rollback

**现状**: 内存条目 `mvu-extraction-off-critical-path` 已反转——MVU 现在走阻塞路径。`applyMvuOpsToTree` 在 line 58 捕获 `let sheet` 快照，处理完所有 ops 后 line 85 `if (sheetChanged) setSheet(sheet)`。

**风险**: 若 A2 的「SAN delta → 自动 INT 检定」/ D1 的「tick 在 advanceTurn 内」 / B1 的「重伤 CON 检定」**在 processResponse 内**再触发 `setSheet`，原 patch 的 `sheet` 快照会**覆盖**触发器的写入。结果：tick 写完后被 rollback，看着像没生效。

**修法**: 引入 **post-settle evaluator phase**——`useChatPipeline.processResponse` 完整 drain MVU 与 applyCorrectiveOps 之后，再跑触发器；触发器要 emit 的状态改变走**第二批** applyCorrectiveOps。禁止 evaluator 在 applyMvuOpsToTree 内执行。M1 的 A0.3 ticket。

---

## 2. PDF 原文锁定的 8 条规则裁决

> 8 个并行 agent 跑通 ch3/ch5/ch6/ch7/ch8 原文，给出 verdict + verbatim quote。**所有 spec 文本以本节为准**，其他章节的规则措辞若冲突以本节覆盖。

### R1 急救与医学（First Aid / Medicine）— **confirm-correction**

- **急救（First Aid）**：受伤后 1 小时内进行；成功恢复 **1 点生命值（固定值，非 1D3）**。
- 急救对同一伤者只能尝试一次；之后再试视为孤注一掷（Pushing）。两人可共同施救，任一检定成功即算成功。
- **医学（Medicine）**：至少花费 1 小时，可在受伤后任意时间进行；非当日处理须困难成功。
- 医学成功恢复 **1D3 生命值，叠加在急救恢复之上**（普通伤者：先 +1，再 +1D3）。
- **濒死（Dying）角色特例**：仅急救可稳定伤势（医学不能直接救濒死者）；稳定后获 1 点临时生命值。
- 濒死稳定后由医学成功检定救治：擦除濒死标记并恢复 1D3 生命值（不叠加急救的 1 HP，因临时 HP 被擦除）。

**PDF**: `.tmp_combat_research/ch6_combat.txt:1084-1104`（主体）；`1115-1126`（濒死特例）；`1135-1136`（示例分别结算）

**Spec 落地**: 治疗流程模块需区分「**普通受伤**」（1+1D3 叠加）与「**濒死救援**」（先 1 临时→擦除→1D3）两条 code path。

### R2 濒死状态（Dying）— **confirm-correction**

- 触发：HP 归零且已 majorWound（重伤）→ 立刻昏迷 + 进入濒死。
- CON 检定节奏：**从下一轮结束开始，每一轮结束做一次 CON 检定；任何一次失败立刻死亡。无 N 轮固定倒计时。**
- 稳定路径：仅「急救」可稳定濒死（医学不可，须先稳定）。急救成功 → +1 临时 HP，节奏切换为**每小时**一次 CON 检定。
- 失稳：稳定后每小时 CON 失败 → 失去临时 HP，重新陷入濒死，恢复每轮结束 CON 检定。
- 恢复：稳定后「医学」成功 → 擦除濒死标记 + 恢复 1D3 HP；其后进入重伤每周恢复流程。
- 例外：一次攻击造成的伤害 > 最大生命值时**直接死亡**，跳过濒死流程。

**PDF**: `ch6_combat.txt:1106-1126`；`1081-1082`（一击致死）；`1085-1088`（急救协作与孤注一掷）

**Spec 落地**: `Combatant.flags.dying` 标记不带固定 `dyingRoundsLeft`；`advanceTurn` 末尾对 `dying=true` 的 combatant 触发 `openCheck('CON', target=con)`，失败 → `flags.dead=true`。脱战切「每小时 CON」频率走 `useChatPipeline` 的跨场景钩子。

### R3 持枪先攻（Firearm & DEX Order）— **confirm-original**

> ⚠️ 此条**推翻**之前的「first-round override」修正——原 brief 才是对的。

- 持有已准备枪械且声明射击的角色，在按敏捷排定行动顺序时以「**敏捷 + 50**」计入排序。
- 该 +50 修正**每轮持续生效**，只要枪械保持准备状态；**非第一轮限定**。
- 多名持枪准备者之间按各自的「敏捷 + 50」分高低（等同按原始敏捷排序）；与冷兵器或徒手者比较时，持枪方因 +50 通常先手。
- 一旦放下/失去/未准备枪械（或本轮选择「寻找掩体」放弃下次攻击），下一轮按原始敏捷排序。

**PDF**: `ch6_combat.txt:659-662`（条款本体）；`834-836, 845-846`（示例一：哈维第二轮仍 105）；`964, 976-977`（示例二：罗杰第二轮拔枪后 70+50=120 抢先）；`992-993`（寻找掩体放弃下次攻击）

**Spec 落地**: `combat-engine.ts:228` `nextTurnOrder` 接受 `effectiveDex = baseDex + (firearmReady ? 50 : 0)`，每轮重排（而非 start() 一次性预排）。新增 combatant 字段 `firearmReady: boolean`，在玩家武器选择 / 寻找掩体 / 重装填等动作时切换。

### R4 孤注一掷与对抗检定（Pushed Roll & Opposed）— **needs-nuance**

- 禁令仅针对**战斗检定**：格斗、射击；**闪避**作为战斗反应同理禁推。理由：战斗已是连续多轮检定，"再试一次"即下一次攻击轮。
- **对抗形式本身不构成禁令**——非战斗类对抗技能（潜行 vs 侦查、说服 vs 心理学/INT 等）可以孤注一掷；规则书原文以「哈维在游乐园潜行检定孤注一掷失败」为佐证。
- 推骰必备双前提：(a) 玩家提出言之成理的额外努力 / 新方法；(b) 失败后果由守秘人决定，且失败后不可再推。

**PDF**: `ch6_combat.txt:221-227`（战斗禁推条款）；`1230-1234`（潜行对抗推骰范例）；`1087`（急救推骰）；`1649`（体质推骰）

**Spec 落地**: `isPushEligible(skillCategory, resultType, sanCheck, isDamageRoll)` 禁用条件改为 `skillCategory ∈ {fighting, firearms, dodge}` 或 `sanCheck=true` 或 `isDamageRoll=true`；与「是否对抗」解耦。

### R5 幕间成长排除项（Development Phase）— **confirm-correction**

- 排除项仅有：**克苏鲁神话**（Cthulhu Mythos）、**信用评级**（Credit Rating）——角色卡上无成长方框。
- **语言（母语 / 其他语言）可正常成长**，无排除。
- 每个带成长标记的技能在幕间成长仅骰 1D100 一次：**> 当前技能值 或 > 95** → +1D10（可超过 100%）；否则不变。
- 使用奖励骰成功的检定**不计成长标记**；对抗检定**仅胜者**计标记。
- 因幕间成长达到 **≥90% 的技能**，一次性 **+2D6 SAN**。

**PDF**: COC7th2002c.pdf p.80-81 §5.11 经验奖励：幕间成长

**Spec 落地**: `developmentPhase` pipeline 的 `excludedSkills` 集合仅含 `['cthulhu_mythos','credit_rating']`；languages 全部纳入；成长检定结果 > 95 走「忽略当前值」的成功分支；≥90% 触发器接 +2D6 SAN 副作用一次。`A3.3 ticking` 时**只在 `resultType ∈ {success, hard-success, extreme-success, crit-success}`** 且**未用奖励骰**才打 tick。

### R6 疯狂发作两种模式（Bout of Madness Modes）— **needs-nuance**

- 疯狂发作（疯狂阶段 1）有两种处理形式，由守秘人按场景决定：
  - **即时症状 / Real-time**（**表Ⅶ**）：持续 1D10 战斗轮，逐轮处理。**默认触发条件「有其他调查员在场」**，或 KP 认为需要逐轮展示。
  - **总结症状 / Summary**（**表Ⅷ**）：KP 简单快进并描述结果；时长通常 1D10 小时（或 KP 自行决定）。**默认触发条件「调查员独自一人」或「在场所有调查员同时疯狂发作」**。
- **1D10 轮 是疯狂发作本身的时长；整个临时性疯狂阶段（阶段 1+阶段 2 潜在疯狂）总长 1D10 小时**，与模式选择无关。
- KP 可覆盖默认触发条件（独自也可逐轮展示，反之亦然）。

**PDF**: `ch8_sanity.txt`（章 8.3 疯狂的影响，PDF p.131-133）

**Spec 落地**: `CharacterSheet.temporaryInsanity` 加 `bout.mode: 'realtime' | 'summary'`。默认由 `isAlone(investigator) || groupAllInsane()` 推断；玩家代为 KP 可手动切换。realtime 模式驱动战斗回合内 1D10 轮倒计时与 Table VII 抽签；summary 模式跳过回合循环，**直接消耗 1D10 小时叙事时间并抽 Table VIII**——这是 A2 必须新增的独立 LLM 子调用（不能塞进主 JSON，max_tokens ≥ 20000）。

### R7 花费幸运值（Luck Spend）— **needs-nuance**

> ⚠️ 此条**推翻**之前的「不能跨档升级」约束——可以升档到极难/大成功。

- 玩家在掷出 d100 后可按 **1:1 比例**消耗当前幸运值，等额降低骰面结果（仅限技能/属性检定）。
- **可把失败拉进任何成功档，包括极难/大成功**——官方示例：哈维花 30 点把 35 改为 5，升至极难成功。
- 禁止：幸运检定本身、伤害检定、理智检定、决定理智损失的掷骰；孤注一掷的结果。
- **大成功(01)、大失败(96-100)与枪械故障 总是要应用**，不能用幸运改写。
- 单次检定可花费任意点数（≤当前幸运），但一次掷骰只能被修改一次；**花费幸运改写过的检定不获得技能成长标记**。
- 已声明孤注一掷之后不能再用幸运补救；二者择一。

**PDF**: COC7th2002c.pdf p.84-85 §5.16 可选规则「花费幸运值」

**Spec 落地**: `applyLuckToRoll(roll, target, spend, sanCheck, isDamageRoll, isLuckRoll, isFumbleOrCrit)`：
- 拒绝条件：`sanCheck || isDamageRoll || isLuckRoll || isFumbleOrCrit(roll)`（其中 `isFumbleOrCrit` 检查原始骰面 1 或 96-100，**在 luck 应用前判断**）；
- 否则 `finalRoll = max(1, roll - spend)`；
- 重新 `determineResult(finalRoll, target)` 可能升至 hard/extreme 成功——**允许**；
- 走幸运修改的 DiceRecord 标记 `luckSpent: spend, growthTickEligible: false`。

### R8 年龄修正（Age Modifiers §3.6 / §5.15）— **confirm-correction**

按调查员所属单一年龄档位应用：

| 年龄段 | 体能扣减（合计） | APP | MOV | EDU 改善次数 | 备注 |
|---|---|---|---|---|---|
| 15-19 | STR+SIZ 合计 -5 | — | — | — | EDU -5；幸运 2 次取高 |
| 20-39 | — | — | — | 1 | — |
| 40-49 | STR·CON·DEX 合计 -5 | -5 | -1 | 2 | — |
| 50-59 | STR·CON·DEX 合计 -10 | -10 | -2 | 3 | — |
| 60-69 | STR·CON·DEX 合计 -20 | -15 | -3 | 4 | — |
| 70-79 | STR·CON·DEX 合计 -40 | -20 | -4 | 4 | — |
| 80-89 | STR·CON·DEX 合计 -80 | -25 | -5 | 4 | — |

- 40+ 的 STR/CON/DEX 扣减为「**合计值**」，由玩家在三项间自行分配（COC7e 与 6e 的关键差异）。
- EDU 改善：1D100 > 当前 EDU 则 +1D10（上限 99）。
- 属性降至 1 以下即视同丧失该属性。

**PDF**: `ch3_create.txt:169-181`（七档简表）；`698-722`（§3.6 老化主条款）；`ch5_game_system.txt:597-637`（§5.15 老化）

**Spec 落地**: `CharacterCreator` 的 `applyAgeModifiers(chars, age)` 替换为上述七档；当前若按「逐项各扣 N」实现须改为「合计 N 点由玩家分配」；EDU 改善次数按档位循环；15-19 档触发 luck 双骰取高 + EDU -5；MOV 衰减写入 `deriveSecondaryStats`。

---

## 3. 修正后的里程碑与依赖图

### 3.1 全局依赖图（重排后）

```
                       ┌─────── A0 (G1+G2+G3 fix) ─────┐
                       │   migrateSheet + redirect      │
                       │   + post-settle evaluator      │
                       └─────────────┬──────────────────┘
                                     │
        ┌──────────────┬─────────────┼──────────────┬───────────────┐
        │              │             │              │               │
       A1            A2            A3            D2              (M1 并行扇出)
   推骰+运气      SAN 疯狂      技能成长      社会关系
   含 openCheck   含 Bout       含年龄        Pillars/CR/Org
                  双模式
        │              │             │              │
        ├──────────────┴─────────────┴──────────────┘
        │
        ▼
   D1.1 + D1.2 ──> applyMajorWoundConCheck (primitive)   (M2 前置)
        │
        ▼
        B1 ──> B2  (M2，串行避免 performAttack 同行冲突)
   重伤 + 治疗   火器射程/连发/+50/cover
        │
        ▼
   D1.3 ~ D1.6  (M3 状态机扩展)
   exploration tick + LLM 翻译 + MVU redirect + UI tooltip
        │
        ▼
   PanelLockStore (M4 前置)
        │
        ├───> C1 (追逐 + vehicle 子系统)
        │
        └───> C2 (法术 + POW 对抗)
```

### 3.2 里程碑表

#### M1 — Rules-only 基础设施（5 桶并行，5-6 周）

| 桶 | 标题 | 复杂度 | 叙事影响 | 主要 ticket |
|---|---|---|---|---|
| **A0** | 地基修复（G1+G2+G3） | 3 | — | A0.1 migrateSheet · A0.2 redirect 收口 · A0.3 post-settle phase |
| **A1** | 推骰 + 运气消费 + openCheck API | 3 | 5 | A1.1~A1.7 |
| **A2** | SAN 疯狂系统（Bout 双模式） | 4 | 5 | A2.1~A2.7 |
| **A3** | 技能改良 + 99 上限 + 年龄修正 | 3 | 4 | A3.1~A3.6 |
| **D2** | 社会层（Pillars/CR/Org） | 4 | 4 | D2.1~D2.6 |

**DoD**:
- [ ] A0.1 `migrateSheet()` 单测：legacy sheet 缺新字段不崩；defaultSheet 走 migrate
- [ ] A0.2 `applyMvuOpsToTree` 未注册 `调查员.*` 路径 push 到 errors[]（向后兼容回归测试）
- [ ] A0.3 post-settle evaluator phase：MVU drain → evaluators 一次性跑 → 第二批 applyCorrectiveOps
- [ ] A1.7 `openCheck({skill, target, bonus, penalty, sanCheck, onResolve})` API 导出
- [ ] A1: 推骰按钮 + 幸运滑条 + 升档预览实时刷新；luck 不可改 01/96-100/枪故障；luck 改写不计成长标记
- [ ] A2: bout.mode 双驱动；summary 模式独立 LLM 子调用（max_tokens ≥ 20000）抽 Table VIII 并消耗 1D10 小时叙事时间
- [ ] A3: tick 只在 `resultType=success+`且未用奖励骰；语言可成长；信用评级 / 克苏鲁神话排除；≥90% 触发 +2D6 SAN
- [ ] D2: pillar 调用必须显式 player action（chip 按钮），LLM 提到不自动触发；CR drift 仅走 MVU delta
- [ ] 五桶共用：保存迁移测试（legacy chat 加载不崩）；DS cache 前缀稳定（byte 比较）；beta 部署 + 用户 UI 测试通过

#### M2 — 战斗规则补全（D1 前置 + B1→B2 串行，4-5 周）

| 桶 | 标题 | 复杂度 | 叙事影响 | 备注 |
|---|---|---|---|---|
| **D1.1-D1.2** | ConditionSpec + tickCondition + applyMajorWoundConCheck（**primitive 提前**） | — | — | 仅类型+纯函数，无 hook |
| **B1** | 重伤 CON + 治疗 + 濒死状态机 | 4 | 5 | 消费 D1.2 的 primitive |
| **B2** | 火器射程档 + 连发 + +50 DEX + cover | 4 | 4 | 串在 B1 之后（同 performAttack 改） |

**DoD**:
- [ ] D1.2 `applyMajorWoundConCheck(target, rng)` + 所有 ConditionSpec 模板存在但**未挂 hook**
- [ ] B1: 重伤 CON 走 openCheck 动画；fail → unconscious；急救 1HP / 医学 +1D3 双路径；濒死每轮 CON 一失即死；急救稳定切每小时 CON
- [ ] B1: `sheet.recovery` 进 sheetSnapshot，deletePage 回放正确
- [ ] B2: weapon.fireMode (single|burst3|auto)，Combatant.cover (none|partial|full)，Encounter.targetDistance，rehydrate 默认值
- [ ] B2: `nextTurnOrder` 接 `effectiveDex = baseDex + (firearmReady?50:0)`，每轮重排（**不是** start() 一次性预排）
- [ ] B2: 连发循环按 RAW 累计惩罚骰，按发扣弹，聚合伤害；AI 默认单发
- [ ] 串行约束：B1.2 改完 `performAttack` 4 处 applyDamage call site 后，B2 才动远程分支

#### M3 — 状态机展开 + 探索循环（D1 后段，4-5 周）

| 桶 | 标题 | 复杂度 | 叙事影响 |
|---|---|---|---|
| **D1.3-D1.6** | combat tick hook + exploration tick + LLM 标签翻译 + UI tooltip | 4 | 5 |

**DoD**:
- [ ] D1.3 `combat-controller.advanceTurn` 顶部跑 `processConditionTicks`；checkEndReason 在 tick 之后
- [ ] D1.5 `useChatPipeline` 页提交后 BEFORE sheetSnapshot 跑 `tickConditions(intervalScenes)`；走 post-settle phase（G3）
- [ ] LLM 标签翻译白名单：中毒/溺水/灼烧/坠落/病/窒息/药物过量
- [ ] MVU `调查员.持续状态.*` 字段加 redirect（A0.2 守护已确保不会静默吞掉）
- [ ] 战斗日志支持折叠 / tooltip 显示 remainingTicks/lastRoll/damageFormula
- [ ] 时间单位转换：condition 在战斗→脱战切换时按 transitionRule 处理（combat-round → scene）

#### M4 — 新面板系统（PanelLockStore + C1 + C2 串行，10-14 周）

| 桶 | 标题 | 复杂度 | 叙事影响 | 备注 |
|---|---|---|---|---|
| **PanelLock** | 单页 anchorPageId 互斥 {combat, chase, ritual} | 2 | — | M4 前置 |
| **C1 + C1b** | 追逐 panel + 车辆战斗子系统 | 5 | 5 | ch7 +85 行 vehicle 规则原 C1 未覆盖 |
| **C2** | 法术系统 + POW vs POW 对抗 | 5 | 5 | 串在 C1 之后避免双 panel 同时打磨 |

**DoD**:
- [ ] PanelLockStore：enterChase / useCombatStore.start 互拒同页 anchorPageId
- [ ] C1: useChaseStore 镜像 useCombatStore；chase-engine 纯函数 + vitest；chase-detector 独立 LLM 子调用 max_tokens ≥ 20000
- [ ] C1b: vehicle Build vs Build 碰撞，每 10 dmg -1 Build；vehicle 撞物 1D10/Build；机动 Build 差对应惩罚骰
- [ ] C1: chase 进度入页快照，deletePage 回放 distance/round/MOV-loss
- [ ] C2: `resistance(atkPow, defPow)` 纯函数；SPELL_REGISTRY 5-8 个种子法术；`SpellTemplate.allowHpSubstitution` 默认 true 但允许仪式法术置 false
- [ ] C2: 学法术 → SAN 损失 + Mythos +5% + 入 known_spells 入快照；HP-cost ≥ ceil(maxHp/2) 触发 majorWound CON（B1.2 链）
- [ ] C2: SPELL_REGISTRY 进静态前缀 lore；known_spells 进动态尾置 lore；DS 缓存 byte-diff 检查通过

---

## 4. 九桶特性卡（详尽版）

### A0 — 地基修复（M1 前置）

**作用**: 修 G1/G2/G3 三个 blocker，让后续所有桶能依赖一致的 sheet/MVU/触发器契约。

| ID | Title | One-line |
|---|---|---|
| A0.1 | `migrateSheet` helper | 在 `useCharSheetStore.ts` 加 `migrateSheet(raw)`：合并 `defaultSheet` 后逐字段补默认（pillars=[], conditions=[], insanity={...}, recovery={...}, known_spells=[], skills 每条补 ticked=false）；`sessionLifecycle.loadConversationInner` 调用处包一层；defaultSheet 走它；单测 legacy sheet 反序列化不崩 |
| A0.2 | redirect 收口 + 未注册路径报错 | 改造 `applyMvuOpsToTree`：未注册 `调查员.*` 路径不再静默 consume，改为 push 到 patchReport.errors[]；同时在 `mvu-charsheet-redirect.ts` 把所有现有路径列全（已有的不变，做存量审计） |
| A0.3 | post-settle evaluator phase | 在 `useChatPipeline.processResponse` 加 `runPostSettleEvaluators(sheet, statData)`：drain 全部 MVU 与自纠后调用，触发器 emit 的 patch 走 `applyCorrectiveOps` 第二批；提供 `registerEvaluator(name, fn)` 注册接口给 A2/B1/D1 |

### A1 — 推骰 + 运气消费 + openCheck API

| ID | Title | One-line |
|---|---|---|
| A1.1 | DiceRecord schema 扩展 | optional `pushed/luckSpent/pushReason/pushedFrom/growthTickEligible`，向后兼容；types/index.ts |
| A1.2 | dice-engine 纯函数 | `applyLuckToRoll(roll, target, spend, sanCheck, isDamageRoll, isLuckRoll)`：先判 isFumbleOrCrit(原始 roll)→拒；否则 `max(1, roll-spend)` 再 `determineResult`。`isPushEligible(skillCategory, resultType, sanCheck)`：按 R4 仅 fighting/firearms/dodge 禁推 |
| A1.3 | useDiceStore 分阶段化 | 保留 `roll()` 一击式作为 legacy wrapper；新增 `rollStaged()` 与 `commitWithLuck(spend)`/`commitAsPush(reason)`；`lastRollContext` 缓存便于推骰复用 skill/target |
| A1.4 | 幸运 MVU delta 路径 | A0.2 已扩 `/调查员/幸运` redirect；commit 时 emit `{op:'delta', path:'/调查员/幸运', value:-N}` 经 applyCorrectiveOps，page snapshot 自动捕获 |
| A1.5 | DicePanel 子状态机 + UI | idle → rolled → luck-slider (可选) → committed → optional push（仅 isPushEligible 时显示）；升档预览实时刷新（35→5 显示「极难成功」预览）；cubic-bezier + SVG icon + hover/active |
| A1.6 | 历史与展示 | DiceRecord 内 `pushed=true` 显示「推」徽标，`luckSpent>0` 显示「幸-N」徽标；CombatPanel DiceRecordsExpander 也支持 |
| **A1.7** | **openCheck programmatic API**（共享给 B1/D1） | `openCheck({skill, target, bonus, penalty, sanCheck, onResolve(level, roll)})`：engine 程序触发动画掷骰，结束回写。是 B1.2/D1.2/A2.4 的共用基础设施 |

### A2 — SAN 疯狂系统（含 Bout 双模式）

| ID | Title | One-line |
|---|---|---|
| A2.1 | CharacterSheet schema 扩展 | `temporaryInsanity/indefiniteInsanity/permanentInsanity` 子树；`phobias[]/manias[]` 结构化数组；`dailySanLoss` 累计窗口（按 sceneInfo.date 重置）；走 A0.1 `migrateSheet` |
| A2.2 | sanity-engine.ts + 1D10/1D100 表 | `evaluateSanLoss(oldSan, delta, sanMax, dailyAcc)` 返回 triggers；`BOUT_BEHAVIOR_TABLE`（Table Ⅶ）= 1D10 即时；`BOUT_SUMMARY_TABLE`（Table Ⅷ）= 1D10 总结；`PHOBIA_TABLE`/`MANIA_TABLE` 1D100 |
| A2.3 | MVU 写入侧抓 delta + redirect | `mvu-charsheet-redirect.ts` 加 `调查员.临时疯狂.*/不定性疯狂.*/恐惧症/狂躁症` 分支；schema 加受控字段；A0.2 守护防静默吞 |
| A2.4 | 阈值评估 → 触发器 | 在 A0.3 post-settle phase 里跑：sanDelta ≥5 → INT 检定走 openCheck；累计 ≥SAN/5 → indefinite；单次 = maxSan → permanent；触发后 emit 第二批 patch 写回 |
| A2.5 | Bout 双模式驱动 | `bout.mode = isAlone(investigator) \|\| groupAllInsane() ? 'summary' : 'realtime'`（玩家可手动覆盖）；realtime 在 combat-controller.advanceTurn 倒计时 roundsLeft；summary 跳过倒计时，调 `runSummaryBoutNarration()`（独立 LLM 子调用） |
| A2.6 | Summary Bout 独立 LLM 子调用 | 新 generator：max_tokens ≥ 20000；给 LLM 喂当前场景 + Table Ⅷ 抽签结果 + 1D10 小时时长，返回叙事段落 + sceneInfo 时间跳更新 |
| A2.7 | Lore/Prompt 注入 + StateChips | `ejs_san_state` lore 改读 `sheet.temporaryInsanity.active` 等真实 flag（非纯 SAN 数值）；StatusBar StateChips 显示「临时疯狂/不定性疯狂/永久疯狂」chip（颜色分级） |

### A3 — 技能成长（含年龄修正 R8）

| ID | Title | One-line |
|---|---|---|
| A3.1 | types + 纯函数 | `CharacterSheet.skills` 元素加 `ticked?:boolean`；coc-rules.ts 加 `applyAgeModifiers(chars, age)`（按 R8 七档）+ `rollSkillImprovement(currentValue, useBonusDie, won?)`；附单测 |
| A3.2 | 创建器集成年龄修正 | CharacterCreator.tsx sheet 构造前调 `applyAgeModifiers`；MOV 不再硬编码 8；15-19 档触发 luck 双骰取高 + EDU -5；40+ 让玩家在 StepCharacteristics 选 STR/CON/DEX 合计扣分配 |
| A3.3 | 成功打勾（gated） | `useDiceStore.commitRoll` 中：当 `resultType ∈ {success, hard, extreme, crit-success}` **且未用 bonusDie** **且** 对抗检定的胜方 → `markTicked(skillName)`；用 `combat-detector skill()` 容错匹配 |
| A3.4 | 发展期面板 | DevelopmentPhaseModal：列 ticked 技能 → 动画骰 1D100 → > current 或 > 95 +1D10 → Math.min(99, current+gain) → 神话特殊上限 → 排除 CR/克苏鲁神话（语言**纳入**） |
| A3.5 | ≥90% +2D6 SAN 触发器 | 发展期面板检定结束时，若有技能升至 ≥90%，弹一次 +2D6 SAN 加成动画；走 sheet san redirect |
| A3.6 | 触发入口与快照 | CharSheetOverlay 加「结束本章·发展期」按钮（禁静默触发）；ticked 字段进 sheetSnapshot；deletePage 回滚一致性单测 |

### B1 — 重伤 CON + 治疗（M2，依赖 A1.7 + D1.2）

| ID | Title | One-line |
|---|---|---|
| B1.1 | 已并入 A1.7 | openCheck API 已在 A1.7 ship |
| B1.2 | applyDamage → pendingConCheck | combat-controller.performAttack 4 处 applyDamage 调用点：majorWound=true 时入 pendingConCheck 队列；UI 弹 openCheck 动画；fail → flags.unconscious；NPC 走静默 inline |
| B1.3 | healing-engine.ts 纯函数（按 R1） | `firstAidHeal()→1HP 固定`；`medicineHeal(rng)→1D3`；`naturalHealWeekly(level)→1D3 或 2D3 extreme`；`stabilizeDying(rng)→{success, tempHp:1}`；双路径：普通伤 (1+1D3 叠加) vs 濒死救援（1 临时 → 擦除 → 1D3） |
| B1.4 | 急救动作按钮 | CombatPanel 加「急救自己/急救 X」ActionBtn（SVG，cubic-bezier）；触发 openCheck；按 woundId 写 Combatant.woundLog 防重复 |
| B1.5 | 濒死每轮 CON（按 R2） | advanceTurn 末尾对 `flags.dying=true` 走 openCheck CON 检定，**失败立即** flags.dead=true；急救稳定后切「每小时 CON」（脱战期间走 useChatPipeline 跨场景钩子） |
| B1.6 | 长程治疗 + 时间推进 | sceneInfo.date 跨周 → 重伤者 medicineWeekly + naturalHeal；mvu-schema 加 recovery 字段；sheetSnapshot 加 recovery |

### B2 — 战斗补全（M2 串在 B1 之后）

| ID | Title | One-line |
|---|---|---|
| B2.1 | 类型与存档迁移 | `CombatWeapon.fireMode (single\|burst3\|auto)`、`burstAllowed`、`Combatant.cover (none\|partial\|full)`、`concealed`、`Encounter.targetDistance`、`Combatant.firearmReady`；useCombatStore.onRehydrateStorage 默认值 |
| B2.2 | 射程档自动选择 | combat-controller.ts:140 硬编码 normal 改为按 encounter.targetDistance / weapon.baseRange 派生 tier；helper `pickRangeTier(distance, baseRange)` |
| B2.3 | 掩体与隐蔽 | partial 给守方 1 奖励骰（攻方 1 惩罚骰）；full 直接 miss + 日志「需先破墙」；concealed 走潜行 short-circuit |
| B2.4 | 连发/全自动 | combat-engine.ts 加 `resolveBurst(weapon, fireMode, ...)`：1-3 次 d100 累计惩罚骰（burst3）或 build-grouped（auto）；`consumeAmmoN(weapon, n)`；剩弹不足按规则部分发 |
| B2.5 | 火器先攻 +50 DEX（按 R3） | combat-engine.ts:228 nextTurnOrder 接收 `effectiveDex = baseDex + (firearmReady?50:0)`，**每轮重排**（不是 start() 一次性）；ready 状态由 firearmReady flag 控制，寻找掩体放下次攻击会清零 |
| B2.6 | UI 接通 + AI 默认 + 单测 | CombatPanel.tsx 加 fireMode 三选一按钮、距离档下拉、cover 切换；AI 默认 single 除非武器仅 auto；新建 combat-engine.test.ts 覆盖 4 个新场景 |

### C1 — 追逐 panel + 车辆战斗（M4）

| ID | Title | One-line |
|---|---|---|
| C1.1 | 数据模型 + useChaseStore | Chase/ChaseParticipant/ChaseLocation/ChaseHazard 类型；useChaseStore 复刻 useCombatStore（anchorPageId/seenLogLen/replaceAll/clearAll/isOrphanedChase）；新 Dexie 表 + schema bump |
| C1.2 | chase-engine 纯函数 | `distanceFromMov`/`applyMoveCheck`/`applyHazardEffect`/`conEnduranceCheck`（每5轮）/`checkChaseEnd`；条件 tick 复用 D1 的 mode='chase-round' |
| C1.3 | chase-controller | playerMove/playerDodgeHazard/playerDropPack/playerVehicleManeuver/aiAdvanceTurn |
| C1.4 | chase-entry + chase-detector | enterChase（LLM 建场 + 兜底 + entering 锁 + orphan + anchorPageId + saveConversation）；chase-detector 独立 LLM 子调用（max_tokens ≥ 20000，不入主 JSON） |
| **C1b** | **车辆战斗子系统** | Combatant.isVehicle + drivenById；CombatWeapon kind='vehicle-ram' damage=`${build}D10`；performManeuver 接受 vehicle Build 比较；applyCrash 复用 applyDamage |
| C1.5 | ChasePanel + ChaseTrack 渲染 | 横向位置条（猎食者/猎物方块沿格滑动，cubic-bezier），动作栏「移动/规避 hazard/丢弃/呼救/脱队」；TabIcons SVG |
| C1.6 | 选项探针 + Pipeline + 持久化 + 互斥 | RightPage 加 CHASE_RE 探针（与 COMBAT_OPPOSED_RE 互斥）；useChatPipeline 触发 enterChase / 脱追回写；sessionLifecycle 四处接 chase store；PanelLockStore 守卫 |

### C2 — 法术与 POW 对抗（M4 串在 C1 之后）

| ID | Title | One-line |
|---|---|---|
| C2.1 | resistance() + 法术注册表 | coc-rules.ts 加 `resistance(atkPow, defPow)` 纯函数；新 coc-spells.ts 定义 SpellTemplate（含 `allowHpSubstitution`）与 SPELL_REGISTRY 5-8 种子法术 |
| C2.2 | Sheet/MVU 扩展 | CharacterSheet.known_spells: string[]，走 A0.1 migrate；mvu-schema 加 `角色.MP.*/克苏鲁神话/已知法术.*`；redirect 加分支（A0.2 守护） |
| C2.3 | spell-engine.castSpell + 学法术 | castSpell 校验 MP（按 SpellTemplate.allowHpSubstitution 决定 HP 抵扣）；HP 损失 ≥ ceil(maxHp/2) 触发 majorWound CON（B1.2 链）；learnSpell SAN 损失 + Mythos +5% + 入快照 |
| C2.4 | 战斗集成 + UI 入口 | combat-engine 施法为 1 action（NPC mage MP 跟踪）；RightPage cast 选项仅 known_spells.length > 0 显示；SpellModal cost 预览 + 目标选择 + 释放动画 |
| C2.5 | LLM 注入与 lore 桶 | SPELL_REGISTRY 进静态前缀 lore（DS 缓存享）；known_spells 进动态尾置；不入主 JSON 末尾 |
| C2.6 | 存档迁移 + 测试 + DS 桶位 | spell-engine.test 覆盖 MP→HP 抵扣 / 学法术副作用 / 删页回溯；DS 缓存 byte-diff 测试 |

### D1 — 通用 Tick 框架（M2 前置 + M3 展开）

| ID | Title | One-line |
|---|---|---|
| D1.1 | Type + catalog（**M2**） | condition-engine.ts 定义 ConditionKind 联合类型；ConditionSpec + ActiveCondition；CONDITION_CATALOG（poison_mild/strong/lethal、drowning、burning、falling、disease、suffocation、drug_od） |
| D1.2 | 纯函数 tick + applyMajorWoundConCheck（**M2**） | `tickCondition(active, target, rng)`；`processConditionTicks(target, ctx)` 优先级（drowning > burning > poison > disease）；`applyMajorWoundConCheck(target, rng)`（B1.2 复用） |
| D1.3 | 战斗 round-end tick hook（M3） | Combatant.conditions[] 字段；buildCombatantFromNpc/buildPlayerCombatant 初始化；advanceTurn 顶部跑 processConditionTicks，merge dmg via applyDamage（source='condition'）；checkEndReason 在 tick 之后 |
| D1.4 | CharSheet 细粒度 mutators + MVU redirect | `applyHpDelta/applySanDelta/addCondition/removeCondition/tickConditions`；mvu-schema 加 `调查员.持续状态.*`；redirect 分支（A0.2 守护） |
| D1.5 | 探索 tick + LLM 标签翻译 | useChatPipeline 在 post-settle phase 跑 `tickConditions(intervalScenes)`；LLM 标签白名单 中毒/溺水/灼烧/坠落/病/窒息/药物过量；歧义标签留在 statusConditions string |
| D1.6 | UI: chip tooltip + SVG 图标 | StatusBar.StateChips hover tooltip（remainingTicks/lastRoll/damageFormula）；TabIcons 加每种 ConditionKind 的 SVG；CombatPanel.CombatantRow 同步 |

### D2 — 社会关系（M1，独立扇出）

| ID | Title | One-line |
|---|---|---|
| D2.1 | 结构化 pillars[] + organizations[] | CharacterSheet 加 pillars[]/organizations[]/lifestyle 字段；CharacterCreator 把四类 backstory 文本（信念/重要之人/重要地点/珍视物品）→结构化 pillars；走 A0.1 migrate 把 legacy `sheet.description` 解析为 pillars |
| D2.2 | MVU schema + redirect | 加 `调查员.信誉度.当前 (0..99)`、`调查员.支柱.*.状态 (intact\|shaken\|lost)`、`调查员.组织.*.声望 (-100..100)`；A0.2 守护 |
| D2.3 | Pillar 调用 SAN 恢复（显式 action） | UI 「调用 pillar」chip：只有 player 显式点击触发（**不**靠 LLM 提到自动判定，避免 SAN 经济崩盘）；一次/会话/pillar 冷却；intact 才能调用；shaken/lost 不能；调用 → 1D6 SAN 恢复经 MVU delta；pillar 状态变 lost → 1D6 SAN 损失 |
| D2.4 | Credit Rating drift + lifestyle | 检测 MVU `调查员.信誉度.当前` delta ops 写入 wealthEvents tail（页快照持久化）；派生 lifestyle bucket（Penniless..Super Rich）；暴露 `{{lifestyle}}` 宏 |
| D2.5 | Org roster + ally/enemy 汇总 + 注入 | sheet.organizations[] 与 useNpcStore 按 faction+favorability 汇总 ally/enemy；新 `buildSocialContextInjection` 与 NPC injection 拼接；走 constant-prefix lore 不破 DS 缓存 |
| D2.6 | UI 绑定 | CharSheet overlay 渲染 pillars 列表 + organizations 列表；「调用 pillar」chip dispatch 叙事 cue；cubic-bezier + TabIcons SVG |

---

## 5. 关键风险与缓解策略

| # | 风险 | 缓解 |
|---|---|---|
| **K1** | useCharSheetStore migrate 漏字段 | A0.1 单测覆盖 legacy chat 加载；CI 跑一份「五年前格式」的固定 fixture |
| **K2** | MVU 阻塞路径 + 触发器再触发 setSheet rollback | A0.3 post-settle phase 强制约束，触发器不允许在 applyMvuOpsToTree 内执行 |
| **K3** | MVU schema 加严 enum → LLM 拼写差异触发自纠循环 | enum 字段在 FORMAT_INSTRUCTION 或 lore 显式列举词汇；narrative-domain 字段（phobias/manias）保持 `kind:'string'` 列表非 enum |
| **K4** | DS 缓存：constant lore 含运行时字符串拼接（snapshotYaml/kwInjection）被 hasDynamicMarker 漏检 | M3/M4 新增 addFormatPart 必须经 helper 进 dynamic 尾置；CI 加 byte-equality 测试 |
| **K5** | sheetSnapshot 不覆盖 store-only 状态（useInsanityStore/useChaseStore 倒计时） | 倒计时字段优先放 sheet 子树（自动随 sheetSnapshot），store 仅做 UI 同步；如必须在 store 则 page 加专属 snapshot 字段 |
| **K6** | combat-controller 串行约束失效 | B1/B2 分开 PR；B2 PR 必须 rebase 在 B1 merged 之上；CI 跑双 PR 顺序测试 |
| **K7** | PanelLockStore 漏挂导致 chase + combat 同页双 panel | enterChase / useCombatStore.start 互拒同 anchorPageId；PageView mount 防御 |
| **K8** | Phobia 名称冲突（A2 结构化 vs CharacterCreator backgroundPhobias 自由文本） | M1 必须先重命名创建器字段为 `backgroundFears`（或并入 description）；A2.1 与 D2.1 同一 PR 走 migrate |
| **K9** | LLM 提到 pillar 自动触发 SAN 恢复破坏经济 | D2.3 强制玩家显式 action；一次/会话/pillar 冷却；status=intact 才能触发 |
| **K10** | Bout summary 模式独立 LLM 子调用 max_tokens 不足 | A2.6 强制 max_tokens ≥ 20000；thinking 模型 JSON 截断会导致 sceneInfo 缺字段 |

---

## 6. 测试策略

- **纯函数**：所有 `*-engine.ts` 模块 vitest 全覆盖；seeded RNG 确定性
- **存档迁移**：每个 schema 变更附 legacy fixture 测试
- **DS 缓存**：CI 跑 prefix-cache-diagnostics 双轮对比，验证静态前缀 byte-stable
- **session 隔离**：startNewConversation → load → save → load 往返测试新增 store
- **UI 测试**：由用户自行验证（按记忆 user-does-ui-testing）；tsc/vitest/build CI 跑通
- **集成回归**：M1/M2/M3 各自结束前跑一组「开新游戏 → 几个章节 → 删页回滚」的 e2e

---

## 7. 落地顺序（建议日程）

```
W1-2   A0 三人天/G1+G2+G3 修复 + 测试（必须先 merge 到 beta）
W3-6   A1 + A2 + A3 + D2 四桶并行（一人主导一桶）
W7     M1 整合 + 老存档迁移测试 + beta 部署 + 用户验收
W8-9   D1.1 + D1.2 primitive 就位（一人）
W10-12 B1 → B2 串行（同一人）
W13    M2 整合 + 测试
W14-15 D1.3 ~ D1.6 展开（一人，与 M2 部分重叠也可）
W16    M3 整合
W17    PanelLockStore（一人，一周）
W18-22 C1 + C1b（一人）
W23-25 C2（一人）
W26    M4 整合 + 全量回归 + 发布
```

总周期 ~26 周（半年）。若并行人手不足，砍 D2（社会层）与 C2（法术）可省 10 周；只做 M1+M2+M3 核心规则补全需约 16 周。

---

## 8. Open Questions（落地前需对齐）

1. **D2 在 M1 是否真要并行**：本设计推 D2 提前以共享 schema 迁移，但若仓库内只有一人开发，可拆回 M3 末尾（少冒同期改 sheet 的并发风险）
2. **A2.6 Summary Bout 独立 LLM 子调用**：要不要做一个**统一的「时间跳转」叙事 generator**（追逐脱场/疯狂总结/医学疗养都用），还是各自独立？前者共享 prompt 缓存桶，后者按需调
3. **C1b 车辆战斗**：要在 C1 同一里程碑出，还是单独砍成 M4.5？车辆规则细节多但叙事必要性强（1920s COC 常用）
4. **A1.5 升档预览**：哈维 30 luck → 35 改 5 升至极难成功——UI 是显示「将升档至 极难成功」并要求二次确认，还是滑条实时刷新结果档？前者反悔友好但多一步
5. **B1.6 跨周时间推进信号源**：靠 sceneInfo.date 跨周比较，但当前 date 字段是字符串非结构化日期——要不要先做一个 date 解析 + 跨日/周/月通用钩子（同时也供 A3 老化检定、D2 CR drift 用）

---

## 9. 相关材料

- `.tmp_combat_research/ch3_create.txt`（创建+老化）
- `.tmp_combat_research/ch5_game_system.txt`（推骰+幕间成长+运气）
- `.tmp_combat_research/ch6_combat.txt`（战斗+治疗+濒死）
- `.tmp_combat_research/ch7_chase.txt`（追逐+车辆）
- `.tmp_combat_research/ch8_sanity.txt`（SAN+Bout+恐惧症）
- COC7th2002c.pdf §3/§5/§6/§7/§8/§9 章原文（PDF 抽取见上列文件，未抽 §9 法术）
- `src/sillytavern/combat-engine.ts`、`combat-controller.ts`、`dice-engine.ts`、`coc-rules.ts`、`mvu-schema.ts`、`mvu-charsheet-redirect.ts`、`useDiceStore.ts`、`useCharSheetStore.ts`、`useVariableStore.ts`、`sessionLifecycle.ts`
- 内存条目：`worldbook-injection-architecture`、`mvu-extraction-off-critical-path`、`page-delete-rollback-snapshot-pattern`、`session-isolation-invariant`、`max-tokens-min-20000`、`inline-llm-fields-truncate-trailing`、`worldbook-ds-cache-optimization`、`no-emoji-use-ui-icons`、`feedback_animation_bezier`、`feedback_button_interaction`、`user-does-ui-testing`
