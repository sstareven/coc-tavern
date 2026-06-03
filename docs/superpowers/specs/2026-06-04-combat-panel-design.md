# 即时战斗面板系统设计

日期：2026-06-04 · 分支：beta · 状态：设计定稿待实现

> 调研依据：workflow `wxyfscqu6`（COC7e 规则消化 + 全链路代码锚点）。规则原文抽取在 `.tmp_combat_research/`（gitignored，本 spec 实现完成后删）。

## 1. 目标

把战斗从「纯叙事 + 单次检定」升级为**即时战斗面板**：进战斗时右页变战斗面板，前端按 COC7e 确定性结算骰子、累计战斗日志、敌/友方 AI 自主行动；脱战后整段日志交 MVU/主 API 一次生成右页叙事 + 后续选项。支持**多敌人**与**友方 NPC 助战**。战斗半成品随存档保留（中途离开/刷新不丢演出）。

## 2. 核心架构（已定）

战斗中**不调主 LLM**。前端确定性骰子引擎结算 → 结果+演出累计进战斗日志 → 敌/友方 AI 按倾向阈值 d100 决策。脱战时整段日志交 **MVU API（优先，回退主 API）一次**生成右页正文 + 后续选项。战斗态在可持久化的 `useCombatStore`（每步落库），脱战后固化进归属页 `BookPage.combatLog` 并 `clearCombat()`。

数据流：
```
主回合落页 → [独立检测+建场调用(优先MVU,廉价预筛)] → 进战?
  是 → useCombatStore.start(Encounter) → 右页渲染 CombatPanel
       ↺ 轮制循环(玩家点动作/AI倾向roll → 引擎结算 → 追加日志 → saveConversation)
       → 脱战(6条) → status='resolving' → 战斗日志交 MVU/主 API 生成右页
       → 落新页 + combatLog 固化进该页 + clearCombat()
```

## 3. 已定设计抉择

| 抉择 | 选定 |
|---|---|
| 战斗循环 | **A：本地结算 + 脱战一次性生成**（战斗中不调主 LLM） |
| 骰子 | **前端确定性引擎**（COC7e，自动判级，可复现，进检定记录） |
| 参战方 | **三方**：调查员(玩家操控) / 友方NPC(AI) / 敌方(AI)；多敌+多友 |
| AI 行为 | LLM/MVU 给 statblock + 倾向阈值(1-100)；AI 回合前端 d100 决策；友方**自主**不需玩家指挥 |
| 战斗触发 + statblock | **独立检测+建场调用**（每主回合后，廉价启发式预筛，优先 MVU API，不动主 JSON；偷袭/玩家发起都覆盖） |
| 规则深度 | **核心循环 MVP**（见 §10）；逃跑折叠成一次速度检定+叙事 |
| 检定记录 | **面板内实时展开 + 脱战后并入主「检定记录」**（带页码+用途标签） |
| 面板布局 | **A：敌顶 · 日志中 · 玩家状态条 · 动作底** |
| 脱战生成 | **MVU API 优先、回退主 API**；走 formatOverride/独立调用，**绝不往主 JSON 加字段** |

## 4. 数据模型（`src/types/index.ts` 追加）

```ts
export type CombatFaction = 'player' | 'ally' | 'enemy';

export interface CombatWeapon {
  name: string;
  skill: number;           // 该武器使用的技能值(格斗/射击)
  damage: string;          // 伤害骰式，如 "1D10"、"1D3"
  impaling: boolean;       // 是否贯穿武器(刀刃/子弹)
  ranged: boolean;         // true=射击(非对抗,按距离难度)
  baseRange?: number;      // 基础射程(码/英尺)，ranged 用
  attacksPerRound: number; // 每轮攻击次数(默认1)
}

export interface Combatant {
  id: string;
  name: string;
  faction: CombatFaction;
  controlledBy: 'player' | 'ai';
  dex: number;
  build: number;           // 体格
  damageBonus: string;     // 伤害加值 DB，如 "+1D4"、"0"、"-1"
  mov: number;
  fighting: number;        // 格斗技能
  dodge: number;           // 闪避技能(= 用户说的「闪避概率」来源)
  firearm?: number;        // 射击技能(可无)
  hp: number; maxHp: number;
  armor: number;
  weapons: CombatWeapon[];
  ammo?: number;           // 当前弹药(枪械)
  flags: { majorWound: boolean; dying: boolean; unconscious: boolean; dead: boolean; prone: boolean };
  tendency?: { attack: number; flee: number };  // AI 倾向阈值 1-100(LLM/MVU 给)；player 可无
  roundDefenses: number;   // 本轮已闪避/反击次数(寡不敌众结算)
}

export type CombatEndReason = 'victory' | 'defeat' | 'disengage' | 'flee' | 'enemy_retreat' | 'surrender';

export interface CombatLogEntry { kind: 'narrative' | 'roll'; text: string; }

export interface Encounter {
  active: boolean;
  round: number;
  turnOrder: string[];      // combatant id，按派生 DEX 序，每轮重排
  currentIdx: number;
  combatants: Combatant[];
  playerTargetId: string | null;
  log: CombatLogEntry[];
  diceRecords: DiceRecord[];  // 战斗检定(DiceRecord 扩 context/purpose)
  status: 'active' | 'resolving' | 'ended';
  endReason?: CombatEndReason;
}
```

`DiceRecord`（types/index.ts:325-335）扩两字段：`context?: 'combat'`、`purpose?: string`（攻击命中/伤害骰/闪避/反击/体质对抗/速度检定…）。
`BookPage` 加 `combatLog?: { entries: CombatLogEntry[]; endReason: CombatEndReason }`（脱战固化、页锚定、删页可重放）。

## 5. 骰子引擎（`src/sillytavern/combat-engine.ts`，纯函数、可单测）

复用现有 `useDiceStore`/dice-engine 的 d100 与对抗能力，但战斗需自动判级 + 奖惩骰 + 伤害。纯函数集合：
- `rollD100WithDice(skill, difficulty, bonusDice, penaltyDice)` → `{ tens[], ones, finalRoll, level }`：多十位骰取优/取劣（净惩罚上限 2，第 3 个改难度+1），返回全部十位骰。
- `successLevel(roll, skill)` → 大成功/极难/困难/普通/失败/大失败。
- `resolveMelee(attacker, defender, defense:'dodge'|'fightback')` → 对抗：成功等级高者胜，平手判定按 PDF（反击平手攻方胜、闪避平手守方胜）。
- `resolveRanged(attacker, target, distanceTier)` → 非对抗，难度按距离档（基础/2倍困难/4倍极难）。
- `rollDamage(weapon, db, impale)` → 伤害（贯穿：伤害骰+DB 取满 + 贯穿武器追加一骰）。
- `applyDamage(combatant, dmg)` → 扣 HP - armor、判轻/重伤(≥半 maxHp → majorWound+CON 检定避昏迷)、>maxHp 即死、归零分轻/重伤态、濒死。
- `outnumberBonus(defender)` → 据 `roundDefenses` 给后续近战攻击的奖励骰数。
- `nextTurnOrder(combatants)` → 按 DEX(射击+50 可后置 phase2)排序。
- `decideAiAction(combatant, encounter, rng)` → AI 回合：d100 vs tendency → 'attack'(选目标:玩家方最近/最弱) | 'flee'；被攻击防御选择：默认反击，倾向逃则闪避。

> rng 以可注入函数传入（测试用固定种子），生产用 `Math.random` 包装。引擎不触 store，便于纯单测。

## 6. 战斗触发 + 建场（`src/sillytavern/combat-detector.ts`）

`detectAndBuildEncounter(narrative, sceneNpcs, sheet, baseUrl, key, model, signal)` → `Encounter | null`：
- 调用前廉价启发式预筛（`shouldDetectCombat`：叙事含 攻击/扑/拔枪/咬/冲突 等暴力线索才调，省 token；仿 `shouldUseLlmExtraction`）。
- 独立 LLM 调用（优先 MVU 独立 API，否则主 API；`rpmAcquire('mvu')`；`coerceJsonObject`；max_tokens≥20000；retries）。prompt 要求：判断本回合是否进入战斗；若是，列出全部参战者（敌方 + 在场友方 NPC），给每个 statblock（DEX/HP/格斗/闪避/射击/Build/DB/MOV/武器/护甲/弹药）+ tendency(attack/flee 1-100)。调查员自身 statblock 从角色卡/MVU 读，不由此生成。
- 输出 `{ inCombat: bool, combatants: [...] }`；inCombat 为真且至少一个 enemy → 组装 Encounter（补 id、player combatant 从角色卡构造、按 DEX 排 turnOrder）。
- 接线：useChatPipeline 主回合落页后 fire-and-forget（会话守卫），仿坏结局块；进战 → `useCombatStore.start(encounter)` + saveConversation。

## 7. 面板 UI（`src/components/Combat/CombatPanel.tsx`，布局 A）

`Storybook.tsx:367-392` 右页容器按 `useCombatStore.active` 条件渲染 `<CombatPanel>` 而非 `<RightPage>`（左页正文壳不动）。纵向：
- **顶**：轮次/当前回合者 + 敌人卡列表（HP 条、状态标志、友/敌分色、**点卡切换 `playerTargetId`**）。
- **中**：战斗日志（滚动累计 `encounter.log`）；末尾「检定记录（N 条）」可展开（读 `encounter.diceRecords`，记页码+用途）。
- **状态条**：玩家 HP/SAN/MP/弹药 常显。
- **底**：动作按钮（射击/近战/瞄准/找掩体/逃跑），仅玩家回合可点。
- 演出复用 `dice-roll-animate`/`DiceAnimation`/`PolyRollAnimation`/粒子/音效（但战斗内**不触发主 submit**，需「仅演出不提交」通道——事件 detail 加 `noSubmit` 或战斗专用事件）。

**按键音效反馈**（用户明确要求）：动作按钮按下播 `sfxClickPrimary()`、次要操作(切目标/展开记录)播 `sfxClick()`/`sfxClickSoft()`，均受 `useSettingsStore.soundEnabled` 门控；攻防结算复用 `sfxSuccess/sfxFailure/sfxCritSuccess/sfxCritFailure`。所有按钮遵循 [[feedback_button_interaction]]（hover 增亮放大 + active 按压）与 [[feedback_animation_bezier]]（`var(--transition-smooth)`）；图标用 TabIcons 铜版线描、禁 emoji（[[no-emoji-use-ui-icons]]）。音效模块现成：`src/audio/sfx.ts` 的 `sfxClick/sfxClickPrimary/sfxClickSoft`。

## 8. 每回合流程

按 `turnOrder` 轮转，每轮开头重排 + 清各 combatant `roundDefenses`。
- **玩家回合**：点动作 + 选目标 → `combat-engine` 结算 → 追加 log + diceRecords → 播演出/音效 → `advanceTurn()` → `saveConversation`。
- **AI 回合（友/敌）**：`decideAiAction` → 结算（攻击则对目标，目标防御按其 tendency 选闪避/反击）→ 追加 log → 演出 → 推进。
- 每次「被攻击」按对抗结算 + 寡不敌众奖励骰；伤害走 `applyDamage`。
- 每步检查脱战条件。

## 9. 脱战 → 右页生成

脱战 6 条触发器（§3 row）。命中 → `status='resolving'`：
- 把 `encounter.log` 汇成文本，作为独立生成输入交 **MVU API（优先）否则主 API** 生成右页正文 + 后续选项（走 `formatOverride` 专用战斗结算指令，或独立调用 + 复用主解析；**不往主 FORMAT_INSTRUCTION 加字段**）。
- 生成成功 → `bookStore.appendPage(newPage)`，把 `encounter.log/endReason` 固化进 `newPage.combatLog`，把 `encounter.diceRecords`（带 page）并入该页 `diceResults`（context='combat'）→ 主「检定记录」面板可见 → `useCombatStore.clearCombat()` → savePages/saveConversation。
- 逃跑：先一次速度检定（CON/驾驶），成功=逃脱→走脱战生成；失败=仍被困→继续战斗（完整追逐 phase2）。

## 10. MVP 范围 / 不做

**做**：轮制+DEX 序、多敌+友方、选目标、近战对抗(闪避/反击)、射击(距离难度)、伤害+护甲+贯穿、轻/重伤/濒死/HP 归零、寡不敌众奖励骰、AI 倾向 roll、6 脱战条件、逃跑折叠速度检定、面板+音效+检定记录、会话隔离+半成品保留。
**Phase 2（不做）**：完整第七章追逐（地点/行动点/险境/载具战）、战技(缴械/擒抱/击晕)、全自动弹幕、武器故障、毒素/环境伤害表 III、部位命中、精确移动格距、射击+50DEX 次序、怪物目击 SAN 结算（先沿用现有 SAN 机制）。

## 11. 持久化与会话隔离

- 新 `useCombatStore`（per-conversation）：`encounter`、`start/advanceTurn/playerAction/setTarget/appendLog/clearCombat/replaceAll/clearAll`。
- db **v10** `combat` 单行表（`&conversationId`，存进行中 Encounter）。
- `sessionLifecycle` 四处接线（clear/save/load/delete）+ 三处事务表名数组追加 `'combat'`（MEMORY [[session-isolation-invariant]]）。
- 战斗中每步 `saveConversation(activeId)` → 切档/刷新/回主菜单保留半成品（瞬态如流式不可依赖，须建可持久 store）。
- 脱战后 Encounter 清空、内容固化进 `BookPage.combatLog`（页锚定，`Storybook.tsx` 删页重放循环加一行）。

## 12. 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/types/index.ts` | Combatant/Encounter/CombatWeapon/CombatLogEntry + DiceRecord 扩 + BookPage.combatLog | 改 |
| `src/sillytavern/combat-engine.ts` | COC7e 纯函数结算引擎 | 新建 |
| `src/sillytavern/combat-engine.test.ts` | 引擎单测(判级/对抗/奖惩骰/贯穿/伤害/寡不敌众) | 新建 |
| `src/sillytavern/combat-detector.ts` | 独立检测+建场调用 | 新建 |
| `src/stores/useCombatStore.ts` | 战斗态 store | 新建 |
| `src/components/Combat/CombatPanel.tsx` | 战斗面板 UI(布局A+音效) | 新建 |
| `src/components/Combat/*` | 敌人卡/动作栏/日志/检定展开 子组件 | 新建 |
| `src/db/database.ts` | combat 表 + v10 | 改 |
| `src/stores/sessionLifecycle.ts` | 隔离四处 | 改 |
| `src/components/Book/Storybook.tsx` | 右页条件渲染 CombatPanel + 删页重放 combatLog（大文件，主控亲自） | 改 |
| `src/hooks/useChatPipeline.ts` | 检测建场触发块 + 脱战生成（大文件，主控亲自） | 改 |
| `src/components/Dice/DiceHistory.tsx` | 战斗检定标签/分组 | 改 |

## 13. 风险

- 脱战生成主 JSON 截断红线（[[inline-llm-fields-truncate-trailing]]）：走独立调用/formatOverride。
- 新 store 漏接隔离四处 → 跨档串档/半成品丢失（[[session-isolation-invariant]]）。
- 大文件 `useChatPipeline`/`Storybook` 改动主控亲自来（[[workflow-subagent-edit-large-files]]）。
- 引擎规则多 → 严格限定 MVP、纯函数化充分单测；rng 可注入以可复现。
- DB/Build 加值表（ch3 p27）、SAN 规则（第八章）本次未抽取——做伤害加值前需补抽或硬编码 STR+SIZ→DB/Build 映射。
- 演出复用 `dice-roll-animate` 经 GameView 会触发主 submit，战斗内须新增「仅演出不提交」通道，否则每次战斗掷骰误发主请求。
- 战斗触发预筛误判（漏检/误检）：宁可漏检（玩家可手动发起），避免每回合都误进战斗。
