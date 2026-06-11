# COC 7e 规则补完设计

日期：2026-06-11 · 分支：beta · 状态：设计定稿待实现

> 依据：workflow `wf_4cebfe4f` 8 维度规则覆盖率审计（134 条规则，当前 57.6% 覆盖）。  
> 目标：补完 15 个最重要缺口，预计覆盖率提升至 ~75%。

## 总览

| 子项目 | 缺口数 | 规模 | 核心改动文件 |
|--------|--------|------|-------------|
| A. 职业变量技能点 | 1 | 小 | `coc-data.ts`, `CharacterCreator.tsx` |
| B. 战斗引擎增强 | 5 | 中 | `combat-engine.ts`, `combat-controller.ts`, `CombatPanel.tsx` |
| C. 理智系统增强 | 5 | 中 | `sanity-engine.ts`, `bout-dispatch.ts`, `time-engine.ts` |
| D. 魔法机制化 | 3 | 中大 | 新 `magic-engine.ts`, 新 `creature-data.ts`, `time-engine.ts` |
| E. 追逐系统 | 1(大) | 大 | 全新 engine/controller/store/detector/panel |

实施顺序：A → B → C → D → E（小到大，每完成一个提交一次）。

---

## A. 职业变量技能点公式

### 现状

`Occupation` 接口只有 `name/crMin/crMax/skills`，技能点全部按 `EDU * 4` 计算。COC7e 规则书 p28-31 规定每个职业有独立公式（如演员 `EDU*2+APP*2`、运动员 `EDU*2+STR*2`）。

### 改动

#### 1. 数据层 — `src/sillytavern/coc-data.ts`

```ts
export interface Occupation {
  name: string;
  crMin: number;
  crMax: number;
  skills: string[];
  // 新增：职业技能点公式，如 'EDU*4', 'EDU*2+APP*2', 'EDU*2+DEX*2'
  // 缺省 'EDU*4'（兼容老数据/剧本自定义职业）
  formula?: string;
}
```

为 50 个内置职业补充 `formula` 字段。COC7e 公式类型共 ~10 种：

| 公式 | 适用职业示例 |
|------|-------------|
| `EDU*4` | 会计、律师、教授、医生（默认） |
| `EDU*2+APP*2` | 演员、艺人、记者 |
| `EDU*2+STR*2` | 运动员、消防员、矿工 |
| `EDU*2+DEX*2` | 窃贼、赌徒、飞行员 |
| `EDU*2+POW*2` | 神职人员、神秘学家 |
| `EDU*2+INT*2` | 作家、设计师 |
| `EDU*2+CON*2` | 探险家、水手 |
| `EDU*2+SIZ*2` | （罕见，保留解析能力） |
| `EDU*2+BEST*2` | 军官、警察（BEST=除 EDU/SIZ 外最高属性） |

#### 2. 解析器 — `src/sillytavern/coc-data.ts` 新增

```ts
export function calcOccSkillPoints(
  formula: string | undefined,
  chars: Record<COC7Characteristic, number>,
): number
```

解析公式字符串，计算总技能点。`BEST` 取 `STR/CON/DEX/APP/POW/INT` 最高值（排除 EDU 和 SIZ）。

#### 3. UI 层 — `CharacterCreator.tsx`

技能分配步骤中，把硬编码的 `edu * 4` 替换为 `calcOccSkillPoints(selectedOcc.formula, charValues)`。UI 显示当前公式文本（如"EDU×2 + APP×2 = 130"）。

#### 4. 剧本自定义职业兼容

`ScenarioDoc.occupations` 里的自定义职业若无 `formula` 字段，回落到 `EDU*4`。`OccupationsTab` 加一个公式编辑下拉框（预设 + 自由输入）。

---

## B. 战斗引擎增强

### B1. 濒死逐轮失血

**规则书 p101**：HP 降到 0 且受过重伤的调查员进入**濒死**状态。每轮开始时失去 1 HP。HP 降到负 `maxHp` 时死亡。成功的急救检定可稳定伤者（停止失血）。

**改动**：

`combat-controller.ts` — `advanceTurn()` 在每个 combatant 的回合开始时：
```
if (c.flags.dying && !c.flags.dead && !c.flags.stabilized) {
  c.hp -= 1;
  log: "X 因伤势持续失血 (HP -1)"
  if (c.hp <= -(c.maxHp)) {
    c.flags.dead = true;
    log: "X 因失血过多死亡"
  }
}
```

`Combatant.flags` 新增 `stabilized: boolean`（急救成功时设为 true）。

`combat-engine.ts` — `performFirstAid()` 成功时：设 `stabilized = true`，清除 `dying`（如果 hp > 0）。

### B2. 重伤 CON 检定

**规则书 p101**：受到重伤（单次伤害 ≥ maxHp/2）时，必须通过 CON 检定否则昏迷。

**改动**：

`combat-engine.ts` — `applyDamage()` 返回结果新增 `conCheckRequired: boolean`：
```
conCheckRequired = damage >= Math.ceil(target.maxHp / 2) && !target.flags.dead
```

`combat-controller.ts` — 收到 `conCheckRequired` 时，投 CON 检定（d100 vs CON）：
- 成功：保持清醒，设 `flags.majorWound = true`
- 失败：设 `flags.unconscious = true` + `flags.majorWound = true`
- 昏迷的 combatant 跳过回合（AI 不行动，玩家按钮禁用）

### B3. 瞄准动作

**规则书 p98**：花费一个回合瞄准目标，下次对该目标射击获得 +1 奖励骰。

**改动**：

`Combatant.flags` 新增 `aimingAt?: string`（目标 combatant id）。

`combat-controller.ts` 新增 `playerAim(enc, targetId)`：
- 消耗玩家回合
- 设 `player.flags.aimingAt = targetId`
- 日志："调查员瞄准 X"

`combat-engine.ts` — `performRangedAttack()` 检查 `attacker.flags.aimingAt === target.id`：
- 是：+1 奖励骰
- 攻击后清除 `aimingAt`

`CombatPanel.tsx` — 动作栏增加"瞄准"按钮（仅有远程武器时显示）。

### B4. 掩护修正

**规则书 p99**：半掩护（+1 惩罚骰射击），全掩护（不可射击，除非等待目标露头）。

**改动**：

`Encounter` 新增 `coverMap?: Record<string, 'none' | 'half' | 'full'>`（每个 combatant 的掩护状态）。

`combat-detector.ts` — `detectAndBuildEncounter()` 的 LLM 建场 prompt 增加请求：为每个敌人判定掩护等级。

`combat-engine.ts` — `performRangedAttack()` 查 `coverMap[target.id]`：
- `half`：射击 +1 惩罚骰
- `full`：射击命中直接 fail（不投骰），日志"目标处于全掩护"

`CombatPanel.tsx` — 敌人行显示掩护图标（半掩护=盾牌半透明，全掩护=盾牌实心）。

### B5. 分层治疗规则

**规则书 p102-103**：

| 治疗 | 条件 | 恢复 | 时限 |
|------|------|------|------|
| 急救 | 受伤后 1 小时内 | 1D3 HP | 战斗中已有 |
| 医学 | 急救后同日 | 1D3 HP | 新增 |
| 自然恢复 | 每周休养 | 1D3 HP | 改进现有 |

**改动**：

`time-engine.ts` — `executeRest()` 改造：
- 现有：固定 +1 HP
- 改为：按休息时长计算。8h 休息 = 0 HP（仅消除疲劳）；满 7 天休养 = +1D3 HP（自然恢复）
- 新增 `executeMedicalCare(medicineSkill: number)`：d100 vs 医学技能，成功 +1D3 HP

`combat-engine.ts` — `performFirstAid()` 已返回 1D3，无需改。

`RestHint.tsx` — 如果队伍中有医学技能的 NPC（查 `useNpcStore`），显示"接受治疗"按钮。

---

## C. 理智系统增强

### C1. 心理分析恢复 SAN

**规则书 p140**：精神分析师可对患者进行心理治疗。检定**精神分析**技能，成功恢复 1D3 SAN。每个游戏周（7 天）可进行一次。

**改动**：

`sanity-engine.ts` 新增：
```ts
export function rollPsychoanalysis(
  analystSkill: number,
  currentSan: number,
  sanMax: number,
  rng?: () => number,
): { recovered: number; roll: number; success: boolean }
```

接入点有两个：
1. `RestHint.tsx` — 如果队伍中有 NPC 具有**精神分析**技能 > 0，且距上次治疗 ≥ 7 天，显示"心理治疗"按钮
2. 调查员自身有**精神分析**技能时，可在休息时对自己进行治疗（COC7e 允许自我治疗但难度为困难级）

### C2. 调查里程碑恢复 SAN

**规则书 p180**：完成重大调查目标时，守秘人可奖励 +1D6 SAN。

**改动**：

利用现有的 **plot anchor** 系统。`useAnchorStore` 中锚点节点完成时（`node.completed = true`），触发 SAN 奖励：

`src/sillytavern/post-settle-evaluators.ts` 新增 `milestoneSanRecovery` 评估器：
- 检查本回合是否有锚点节点从未完成变为已完成
- 是：投 1D6，恢复 SAN（钳制到 sanMax）
- 通过 `applyCorrectiveOps` 写入角色卡
- UI 通过 `useNotificationStore`（或现有 toast 机制）显示"+N SAN（调查里程碑）"

### C3. 潜伏疯狂 Phase 2

**规则书 p132**：临时疯狂发作结束后，调查员进入**潜伏疯狂**阶段，持续 1D10 小时。在此期间，任何 ≥1 点的 SAN 损失都会立即触发新一轮发作。

**改动**：

角色卡 `secondary.san` 扩展：
```ts
latentInsanity?: {
  active: boolean;
  expiresAtEpoch: number; // 游戏内时间戳，潜伏期结束
}
```

`bout-dispatch.ts` — `triggerBout()` 结束时（`roundsLeft` 倒到 0 / summary 模式结束后），写入 `latentInsanity = { active: true, expiresAtEpoch: currentEpoch + rollD10() * 60 }`（1D10 小时）。

`sanity-engine.ts` — SAN 损失判定时增加检查：
```
if (latentInsanity.active && epochNow < latentInsanity.expiresAtEpoch && sanLoss >= 1) {
  → 跳过 INT 检定，直接触发新发作
}
```

`time-engine.ts` — 时间推进时检查是否过期，过期则清除 `latentInsanity`。

### C4. 现实检定

**规则书 p133**：疯狂期间，调查员可能产生幻觉。其他角色可以尝试帮助调查员回到现实——进行一次 **INT 检定**或**精神分析检定**（困难级）来判断看到的是否真实。

**改动**：

这是一个 **LLM 引导 + 轻机制** 混合实现：

`sanity-prompt-engine.ts` — 当调查员处于临时/不定期疯狂或潜伏期时，注入世界书条目：
```
[守秘人规则·现实检定]
调查员正处于 {疯狂状态}。你可以在叙事中加入可疑的感知描写（幻觉、幻听、不存在的人物）。
当调查员试图辨别真假时，在选项中嵌入检定：
<check skill="INT" difficulty="hard" context="现实检定"/>
成功：告知玩家该感知是虚假的。
失败：调查员无法区分，你继续维持幻觉。
```

`RightPage.tsx` — `parseCheckAction` 已支持 `<check>` 标签解析，无需额外改动。

### C5. 恐惧症/躁狂惩罚骰

**规则书 p133-138**：获得恐惧症后，遇到恐惧对象时所有相关检定受 1 惩罚骰。

**改动**：

`dice-engine.ts` 新增：
```ts
export function checkPhobiaPenalty(
  skillName: string,
  context: string | undefined,
  phobias: string[],
  manias: string[],
): number // 返回额外惩罚骰数量（0 或 1）
```

匹配逻辑：检查 `context`（检定上下文描述，如"面对深海"）是否包含任何已知恐惧症/躁狂的关键词。

`useDiceStore.ts` — `roll()` 和 `rollStaged()` 调用时自动查询 `sheet.phobias`，匹配则注入 1 惩罚骰。

LLM 侧：`sanity-prompt-engine.ts` 注入提示，要求 LLM 在选项 `<check>` 标签中附加 `context="..."` 描述触发场景。

---

## D. 魔法机制化

### D1. 施法 POW 对抗

**规则书 p148-151**：施放法术通常需要 POW 对抗检定（施法者 POW vs 目标 POW）。成功则法术生效，失败则法术无效但仍消耗部分 MP。

**改动**：

新建 `src/sillytavern/magic-engine.ts`：

```ts
export interface SpellCastResult {
  success: boolean;
  casterRoll: number;
  targetRoll: number;
  mpSpent: number;
  sanLost: number;
  hpSacrificed: number; // 牛命转化
  effect: string;
}

export function resolveSpellCast(
  casterPow: number,
  targetPow: number,
  spell: CocSpell,
  casterMp: number,
  casterHp: number,
  allowHpSacrifice: boolean,
  rng?: () => number,
): SpellCastResult
```

对抗检定方式（COC7e 抵抗表简化为对抗骰）：
- 施法者投 d100 vs 自身 POW
- 目标投 d100 vs 自身 POW
- 比较成功等级：施法者等级 > 目标等级 → 法术生效
- 平级时施法者失败（防御方优势）

MP 消耗：
- 成功：扣全额 MP + SAN
- 失败：扣 1 MP（最低消耗）+ 全额 SAN
- MP 不足时可选牛命：每 1 HP = 1 MP（UI 弹确认框）

接入点：`CocSpell` 接口（`coc-spells.ts`）已有 `mpCost/sanCost`，增加 `requiresPowContest: boolean`。

UI：复用 `useDiceStore.openCheck()` 的对抗模式弹出施法检定面板。

### D2. MP 恢复

**规则书 p148**：魔法值每 24 小时恢复到满值（= floor(POW/5)）。

**改动**：

`time-engine.ts` — `executeRest()` 增加 MP 恢复逻辑：
```ts
// MP 按休息时长比例恢复（8h 休息 = 恢复 1/3 MP，24h = 满 MP）
const maxMp = Math.floor(pow / 5);
const mpRecovery = Math.min(
  maxMp - currentMp,
  Math.floor(maxMp * (restHours / 24))
);
```

`RestHint.tsx` — 休息结果提示新增 MP 恢复信息。

跨日自动恢复（非休息）：`post-settle-evaluators.ts` 检查时间推进跨日时（`shouldResetDailySan` 同逻辑），自动回满 MP（调用 `applyCorrectiveOps` 写 `/调查员/MP`）。休息时的 MP 恢复只在**未跨日**时生效，避免双重恢复。

### D3. 生物属性卡

**规则书 ch14 p240-313**：神话生物有完整的属性卡（STR/CON/SIZ/POW/DEX/HP/Armor/DB/Attacks/Special/SanLoss）。

**改动**：

新建 `src/sillytavern/creature-data.ts`：

```ts
export interface CreatureTemplate {
  name: string;
  aliases: string[]; // 中英文别名用于匹配
  characteristics: {
    str: number; con: number; siz: number;
    pow: number; dex: number; int: number;
  };
  hp: number;
  armor: number;
  mov: number;
  db: string; // 伤害加值骰式
  build: number;
  attacks: {
    name: string;
    skill: number; // 命中概率
    damage: string; // 骰式
    attacksPerRound: number;
  }[];
  special?: string[]; // 特殊能力描述
  sanLoss: { success: string; fail: string }; // 目击SAN损失
}

export const CREATURE_TEMPLATES: CreatureTemplate[] = [/* 20+ 常见生物 */];
export function matchCreature(name: string): CreatureTemplate | null;
```

收录生物（按游戏中出现频率排序）：
1. 深潜者 (Deep One)
2. 修格斯 (Shoggoth)
3. 食尸鬼 (Ghoul)
4. 米·戈 (Mi-Go)
5. 暗黑幼体 (Dark Young)
6. 廷达罗斯猎犬 (Hound of Tindalos)
7. 夜魇 (Nightgaunt)
8. 星之精 (Star Vampire)
9. 蛇人 (Serpent People)
10. 飞水螅 (Flying Polyp)
11. 猎杀恐怖 (Hunting Horror)
12. 炎之精 (Fire Vampire)
13. 狂信徒 (Generic Cultist)
14. 僵尸 (Zombie)
15. 骷髅 (Skeleton)
16. 蜘蛛精 (Leng Spider)
17. 无面怪 (Dimensional Shambler)
18. 拜亚基 (Byakhee)
19. 沙尼宫人 (Shan)
20. 伊斯之伟大种族 (Great Race of Yith)

**集成**：`combat-detector.ts` — `detectAndBuildEncounter()` 中，LLM 返回敌人名称后，先查 `matchCreature(name)`：
- 命中：使用模板属性构建 `Combatant`（准确、跨遭遇一致）
- 未命中：回落到 LLM 生成的 statblock（现有行为）

**SAN 触发**：`sanity-prompt-engine.ts` 注入提示，引导 LLM 在首次目击生物时使用模板的 `sanLoss` 值。

---

## E. 追逐系统

### 架构

仿战斗面板的成熟模式：纯函数引擎 → 控制器 → 状态存储 → 检测器 → UI 面板。

```
叙事出现追逐 → chase-detector 关键词预筛 + LLM 建场
  → useChaseStore.start(Chase) → 右页渲染 ChasePanel
  ↺ 轮循环(玩家选动作/NPC AI → 引擎结算 → 追加日志)
  → 追逐结束(抓到/逃脱/中止) → status='resolving'
  → 追逐日志交主管线 pipeline.submit() 生成右页叙事
  → 落新页 + clearChase()
```

### 数据模型 — `src/types/index.ts` 追加

```ts
export interface ChaseLocation {
  name: string;
  description?: string;
  hazard?: {
    skill: string;    // 需要的检定技能名
    difficulty: 'normal' | 'hard' | 'extreme';
    failConsequence: 'fall' | 'trapped' | 'damage'; // 失败后果
    damage?: string;  // failConsequence='damage' 时的骰式
  };
  barrier?: {
    skill: string;
    difficulty: 'normal' | 'hard' | 'extreme';
    breakThrough: boolean; // 能否强行突破
  };
}

export interface ChaseParticipant {
  id: string;
  name: string;
  role: 'pursuer' | 'quarry'; // 追赶者/逃跑者
  controlledBy: 'player' | 'ai';
  mov: number;
  con: number;
  dex: number;
  position: number;      // 当前位置索引（locations 数组下标）
  sprintCount: number;   // 已冲刺次数
  conChecksUsed: number; // 已用耐力检定次数
  flags: {
    fallen: boolean;     // 摔倒
    trapped: boolean;    // 被障碍困住
    exhausted: boolean;  // 耐力耗尽
    escaped: boolean;
    caught: boolean;
  };
  skills: Record<string, number>; // 用于障碍/冒险检定
}

export interface Chase {
  active: boolean;
  round: number;
  locations: ChaseLocation[];
  participants: ChaseParticipant[];
  turnOrder: string[];
  currentIdx: number;
  log: CombatLogEntry[]; // 复用战斗日志格式
  diceRecords: DiceRecord[];
  status: 'active' | 'resolving' | 'ended';
  endReason?: 'caught' | 'escaped' | 'exhausted' | 'aborted';
  initialGap: number; // 初始距离（地点数）
  anchorPageId?: string;
  opener?: string;
}
```

### 引擎 — `src/sillytavern/chase-engine.ts`

纯函数，rng 可注入，可单测。核心函数：

```ts
// 移动：MOV 差决定每轮移动距离
export function calcMovement(participant: ChaseParticipant, sprinting: boolean): number;

// 冲刺：+1 移动但消耗 CON，每5轮冲刺需 CON 检定
export function performSprint(chase: Chase, participantId: string, rng?): Chase;

// 障碍检定：遇到 barrier/hazard 时
export function resolveHazard(chase: Chase, participantId: string, rng?): Chase;

// 捷径：技能检定成功减少距离
export function attemptShortcut(chase: Chase, participantId: string, skillName: string, rng?): Chase;

// 设障：在身后地点制造障碍增加距离
export function createBarricade(chase: Chase, participantId: string, rng?): Chase;

// 追逐中攻击（仅限距离=0 的同地点参与者）
export function chaseAttack(chase: Chase, attackerId: string, targetId: string, rng?): Chase;

// CON 耐力检定：每 5 轮检定一次，失败 MOV-1
export function checkEndurance(chase: Chase, participantId: string, rng?): Chase;

// 追逐结束判定
export function checkChaseEnd(chase: Chase): { ended: boolean; reason?: Chase['endReason'] };

// 距离计算
export function getGap(chase: Chase): number; // 追赶者与逃跑者的位置差
```

**COC7e 追逐核心规则**（p112-127）：
- 每轮每人移动 1 个地点（MOV 8 基准）
- MOV 差 > 0 的一方每差 1 点额外移动 1 地点
- 冲刺 = CON 检定成功额外 +1，但每 5 轮累计冲刺需额外 CON 检定，失败 MOV 永久 -1
- 追赶者位置追上逃跑者 = 抓到
- 距离超过 locations 长度 = 逃脱
- 双方 MOV 相等时，维持原距离直到有人冲刺/捷径/设障打破僵局

### 控制器 — `src/sillytavern/chase-controller.ts`

轮循环管理，类似 `combat-controller.ts`：

```ts
export function advanceChaseTurn(chase: Chase, rng?): Chase;
export function playerAction(chase: Chase, action: ChaseAction): Chase;
export function runAiChaseTurn(chase: Chase, participantId: string, rng?): Chase;
```

`ChaseAction` 类型：`'move' | 'sprint' | 'shortcut' | 'barricade' | 'attack' | 'hide'`

AI 决策简化：
- 逃跑者优先冲刺（CON > 40 时），否则正常移动；有捷径技能 > 50 时尝试捷径
- 追赶者行为同理（追逐场景 AI 比战斗简单得多）

### 存储 — `src/stores/useChaseStore.ts`

```ts
interface ChaseStore {
  chase: Chase | null;
  setChase: (c: Chase | null) => void;
  clearChase: () => void;
  seenLogLen: number;
  markSeen: (n: number) => void;
}
```

持久化：复用 `useCombatStore` 的 sessionLifecycle 模式（clear/save/load/delete 四处接入）。
DB migration：db version +1，加 `chase` 表。

### 检测器 — `src/sillytavern/chase-detector.ts`

```ts
const CHASE_CUES = ['追', '逃跑', '跑', '赶', '奔跑', '逃离', '追赶', '追逐', '撤退', '狂奔'];

export function shouldDetectChase(narrative: string): boolean;
export function detectAndBuildChase(
  narrative: string,
  sheet: CharacterSheet,
  statData: Record<string, unknown>,
  ...
): Promise<Chase | null>;
```

LLM 子调用建场 prompt 要求：
- 生成 5-10 个地点（线性链）
- 每个地点可能的障碍/冒险
- 追赶者/逃跑者列表（含 MOV/CON/DEX/关键技能）
- 初始距离（1-3 个地点）

### UI — `src/components/Chase/ChasePanel.tsx`

布局仿 CombatPanel（右页替代面板）：

```
┌─────────────────────────────┐
│  追逐 · 第 N 轮  │ 距离 M 地点  │
├─────────────────────────────┤
│ [地点链可视化：标记各参与者位置]   │
│  ■追 ─ ─ □ ─ ● ─ ─ ▲逃     │
├─────────────────────────────┤
│  追逐日志（滚动）               │
├─────────────────────────────┤
│  MOV 8 │ CON 65 │ 冲刺 2/5    │
├─────────────────────────────┤
│ [移动][冲刺][捷径][设障][攻击]   │
└─────────────────────────────┘
```

- 地点链：横向滚动条，当前位置高亮，追赶者/逃跑者标记
- 按钮状态：距离 > 0 时攻击禁用；冲刺在 exhausted 后禁用
- 检定动画复用 CombatPanel 的 `CombatDiceRoll` 组件

### 集成

`useChatPipeline` — 同战斗的 fire-and-forget 模式：主回合后检测叙事是否含追逐线索 → 建场 → 进入 ChasePanel。

脱追后：追逐日志交 `pipeline.submit(追逐日志摘要)` 生成右页叙事。

互斥：追逐和战斗不能同时活跃（进追逐时 assert 无战斗，反之亦然）。

---

## 测试策略

所有纯函数引擎（chase-engine、magic-engine、新增的 combat-engine 函数、sanity-engine 函数）必须有单元测试（rng 注入 + 边界值覆盖）。

| 子项目 | 测试重点 |
|--------|---------|
| A | `calcOccSkillPoints` 所有公式类型 + BEST 解析 |
| B | 逐轮失血到死亡、CON 检定昏迷、瞄准奖励骰、掩护射击失败、医学治疗 |
| C | 心理分析成功/失败、里程碑 SAN 恢复、潜伏期触发新发作、恐惧症惩罚骰匹配 |
| D | POW 对抗施法、MP 不足牛命转化、MP 恢复、生物匹配命中/未命中 |
| E | 移动距离计算、冲刺+CON检定、障碍通过/失败、追逐结束条件、AI 决策 |

UI 测试由用户手动完成。

---

## 不做清单

以下规则经评估对本项目不适用或优先级过低，本次不实现：

- 追逐中载具规则（载具 MOV、碰撞、载具伤害）——场景极少
- 完整 100 条恐惧症/躁狂表——保持现有 30 条种子 + LLM 扩展
- 连射/全自动射击——武器表已有 attacksPerRound 支持，规则细节（弹着散布）不做
- 可选命中部位表——非核心规则
- 团体检定——单人游戏不适用
- 信用评级消费层级——LLM 叙事处理即可
- 完整法术表（100+）——保持 12 条 + 扩展接口
- 幕间成长完整流程——保持现有 development phase
