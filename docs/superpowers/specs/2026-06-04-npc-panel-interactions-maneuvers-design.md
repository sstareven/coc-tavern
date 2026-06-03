# NPC 记录面板 + 互动系统 + 战斗战技 设计

日期：2026-06-04 · 分支：beta · 状态：设计定稿待实现
规则范本：`COC7th2002c.pdf`（见 memory coc7e-rulebook-canonical）；战技规则 ch6 6.3（已抽取 `.tmp_combat_research/ch6_combat.txt:313-398`）。

## 1. 目标
- 人物名册的 NPC 也有「类似主角的记录面板」：基础属性 / 衍生属性 / 随身物品（结构化展示）。
- 在场 NPC 有**互动菜单**：攻击 / 快速交谈 / 偷窃 / 更多▾（更多展开 COC7e 全套「对人行动」）。
- 战斗面板加**更多▾**，可选战技（缴械/擒抱/推倒/击晕），按 COC7e 战技规则处理。

## 2. NPC 记录面板（升级 `NpcOverlay.tsx` 的 `NpcCard` 展开区，贴主角 CharSheet 风）

展开区改为结构化分区（用 `var(--ink)` + 网格，名册两栏结构不变）：
1. **基础属性**：8 格网格（STR/CON/SIZ/DEX/APP/INT/POW/EDU），值取 `npc.characteristics?.[K]`，缺则显「—」。
2. **衍生属性**：HP / SAN / MP / DB / MOV / 体格(Build)。
   - 新增纯函数 `parseNpcDerived(npc): { hp?, san?, mp?, db?, mov?, build? }`：先从 `npc.derived` 文本正则解析（已是「HP12/SAN55/DB+1D4/MOV8」格式，容错中英分隔），解析不到的从 characteristics 推算（HP=⌊(CON+SIZ)/10⌋、MP=⌊POW/5⌋、SAN=POW、DB/Build 用 `buildAndDamageBonus(STR,SIZ)`）；仍无则「未知」。
3. **随身物品**：`npc.possessions` 列表（标签/逐行）。
4. **保留**：性格/动机(KP视角)/背景/经历/技能/互动记忆（沿用现有 Section）。

`NpcCard` 拆出子组件 `NpcRecordSheet`（接收 npc，渲染上述分区），保持文件聚焦。

## 3. NPC 互动菜单（仅**在场** NPC）

`NpcCard` 在场时（`npc.isPresent`）在卡片头部加「互动」按钮（金色文本，区别于展开箭头）。点击 → 展开互动菜单（在卡片内，非全屏）：
- 快捷行：**攻击** · **快速交谈** · **偷窃** · **更多▾**
- **更多▾** 展开「所有可对人进行的行动」，按组列出（来自可扩展常量 `NPC_ACTIONS`）：
  - **社交**：说服(说服) / 取悦(魅惑) / 恐吓(恐吓) / 心理学(读心) / 精神分析(安抚)
  - **调查**：侦查(观察·搜身) / 聆听(偷听) / 潜行(尾随)
  - **战技**：擒抱 / 缴械 / 推倒 / 击晕（→进战斗，见 §6）
  - **医疗**：急救 / 医学(对其施救)

**`NPC_ACTIONS` 常量**（`src/sillytavern/npc-actions.ts`，可扩展）：
```ts
interface NpcAction { id: string; label: string; group: '快捷'|'社交'|'调查'|'战技'|'医疗'; skill?: string; kind: 'combat'|'check'; difficulty?: '普通'|'困难'|'极难'; }
```
- `kind:'combat'` → 攻击 / 4 个战技：进战斗（§4/§6）。
- `kind:'check'` → 快速交谈/偷窃/社交/调查/医疗：走「检定+提交」（§5），`skill` 为治理技能（话术/妙手/说服/取悦/恐吓/心理学/精神分析/侦查/聆听/潜行/急救/医学）。

## 4. 攻击 / 战技 → 进战斗：`buildCombatantFromNpc(npc)`

新增 `buildCombatantFromNpc(npc: NpcProfile): Combatant`（`combat-detector.ts`，仿 `buildPlayerCombatant`）：
- 属性：`npc.characteristics?.[K] ?? 50`。
- HP：`parseNpcDerived` 的 hp，缺则 ⌊(CON+SIZ)/10⌋。
- con/dex：characteristics（缺 50）。
- 技能：`npc.skills` 里 `格斗(斗殴)`/`躲闪`/`枪械(手枪)`（按 `skill()` 别名兜底），缺则默认（fighting 40 / dodge 25）。
- damageBonus：derived 的 db / `buildAndDamageBonus(STR,SIZ).db`；build 同。
- 武器：`npc.possessions` 经 `coc-weapons` 表映射（`mapInventoryToWeapons` 思路，但 possessions 是 string[]，写个 `mapNamesToWeapons(names, sheetlessSkillResolver)`）；无可用武器→徒手。
- 倾向 tendency：据 `favorability`——`favorability<=-30` → `{attack:85, flee:10}`；`>=30` 友好通常不参战（攻击发起场景仍按中性）；中性 `{attack:60, flee:30}`。
- flags 全 false。

点「攻击」→ 用该 NPC 建 enemy combatant + 玩家 combatant 组 `Encounter`（`useCombatStore.start`），`playerTargetId` 锁该 NPC，进战斗面板。**非 test**（脱战后正常翻页叙述）。

## 5. check 动作 → 检定 + 提交（复用现有掷骰提交）

快速交谈/偷窃/社交/调查/医疗：构造行动文本并走与「点选项」相同的【掷骰→提交】流程。
- 抽取可共用入口：现有掷骰逻辑在 `RightPage.fillInputBar`（私有）。把「据 action 文本掷检定 → 拼结果 → 触发提交」抽成可复用函数（`src/sillytavern/choice-action.ts` 的 `runChoiceAction(text, action)`，或暴露事件 `npc-action`），供 NpcOverlay 调用。
- 行动文本：`text` = 「对{NPC}{动作}」（如「试图偷窃{npc}随身的财物」「与{npc}快速交谈」），`action` 含检定标记「进行{skill}检定({难度})」。check 动作经掷骰得 `[X d100=a/b 成功]` 拼进输入，提交主管线 → 推进正文。
- 不做完整社交对抗（MVP 单向技能检定）。

## 6. 战斗面板战技（更多▾，按 COC7e 6.3）

战斗面板动作栏加 **更多▾** → 展开 4 个战技按钮：**缴械 / 擒抱 / 推倒 / 击晕**。

新增 `performManeuver(enc, attackerId, targetId, kind, rng)` + `playerManeuver(enc, kind, rng)`（`combat-controller.ts`）：
1. **体格比较**（COC7e 6.3 步骤1）：`diff = target.build - attacker.build`。`diff>=3` → 战技无效（log「目标体格过于庞大，战技无效」，消耗回合）；`penaltyDice = clamp(diff,0,2)`（目标更大→攻方惩罚骰）。
2. **对抗检定**（步骤2）：攻方 `格斗` vs 目标 `闪避/反击`（`resolveOpposed`，带 penaltyDice）。
3. **效果**（攻方胜，不致伤）：
   - 缴械 → `target.flags.weaponJammed = true`（武器被打落，暂不可用）+ log。
   - 擒抱 / 推倒 → `target.flags.prone = true`（被压制/倒地，起身耗动作）+ log。
   - 击晕 → `target.flags.prone = true` + log「被击晕」（MVP 不做 stun 轮计数）。
   - 守方反击胜 → 攻方受伤（同近战反击）；守方闪避胜/平手 → 战技未果。
4. 之后 `advanceUntilPlayerOrEnd`（同 playerAttack）。
- 检定记录 `purpose:'战技-缴械/擒抱/推倒/击晕'`。

## 7. 不做（YAGNI / 后续）
独立全屏 NPC 模态、NPC 多回合对话子系统、社交完整双向 opposed、战技的「持续劣势惩罚骰/盟友奖励骰/脱离压制」完整链、stun 轮计数、击晕昏迷判定。

## 8. 文件结构
| 文件 | 职责 | 动作 |
|---|---|---|
| `src/sillytavern/npc-actions.ts` | `NPC_ACTIONS` 可扩展动作目录 + 类型 | 新建 |
| `src/sillytavern/npc-derived.ts` | `parseNpcDerived(npc)` 解析/推算衍生属性（纯函数+单测） | 新建 |
| `src/sillytavern/combat-detector.ts` | `buildCombatantFromNpc` + possessions→武器映射 | 改 |
| `src/sillytavern/combat-controller.ts` | `performManeuver`/`playerManeuver`（+测试） | 改 |
| `src/sillytavern/choice-action.ts` 或事件 | 抽取可复用「检定+提交」入口供名册调用 | 新建/改 |
| `src/components/NPC/NpcOverlay.tsx` | 记录面板升级 + 互动菜单 | 改 |
| `src/components/Combat/CombatPanel.tsx` | 战技 更多▾ 按钮 | 改 |
| `src/components/Book/RightPage.tsx` | 抽出 fillInputBar 可复用部分（若走抽取方案） | 改 |

## 9. 风险
- 攻击友好/在场 NPC 进战的语义：玩家主动攻击友好 NPC 也允许（建敌），favorability 只影响其 AI 倾向。
- `fillInputBar` 抽取需谨慎不破坏现有选项掷骰（大文件 RightPage，主控亲自）。
- NpcProfile 数据稀疏：记录面板/建敌都要对缺字段稳健兜底（显「未知」/默认值），不崩。
- 战技效果 MVP 简化（prone/weaponJammed 代理），与规则书完整效果有差距，已在 §7 标注。
- 检定记录/提交复用要避免与正常选项流冲突（同一掷骰+提交通道）。
