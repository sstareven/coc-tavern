# 战斗系统 Phase 1：规则引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 COC7e 即时战斗的**纯函数规则引擎**（骰子判级/奖惩骰/对抗/射击/伤害/护甲/贯穿/轻重伤濒死/体格DB表/寡不敌众/弹药/卡壳/AI 决策）+ 战斗类型，全部可无 UI 单测、rng 可注入可复现。

**Architecture:** 引擎为一组纯函数（`src/sillytavern/combat-engine.ts`），不触任何 store/DOM；随机数经 `rng: () => number` 注入（默认 `Math.random`），测试传固定序列以复现。类型集中在 `src/types/index.ts`。这是战斗子系统的最底层，后续 store/检测/UI/管线各自成计划，依赖本引擎。

**Tech Stack:** TypeScript + Vitest。无 React、无网络、无持久化。

设计依据：`docs/superpowers/specs/2026-06-04-combat-panel-design.md`（§4 数据模型 / §5 引擎）。

> 范围：本计划只做引擎 + 类型。`useCombatStore`/`combat-detector`/`CombatPanel`/管线集成/持久化是后续 Phase 2-5 的独立计划。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/types/index.ts` | 战斗类型（Combatant/CombatWeapon/Encounter/…）+ DiceRecord 扩 + BookPage.combatLog | 改（追加） |
| `src/sillytavern/combat-engine.ts` | COC7e 纯函数引擎 | 新建（逐 Task 追加导出） |
| `src/sillytavern/combat-engine.test.ts` | 引擎单测 | 新建（逐 Task 追加用例） |

---

## Task 1: 战斗类型

**Files:**
- Modify: `src/types/index.ts`（在文件末尾、或 `KeyPillar`/`PlotAnchors` 等领域类型附近追加）

- [ ] **Step 1: 追加类型**

在 `src/types/index.ts` 追加（`DiceRecord` 已存在于本文件，找到它在其 interface 内补两字段）：

```ts
// ===== Combat System =====
export type CombatFaction = 'player' | 'ally' | 'enemy';

export interface CombatWeapon {
  name: string;
  skill: number;
  damage: string;          // 伤害骰式，如 "1D10"、"1D8+1D4"、"1D3"
  impaling: boolean;
  ranged: boolean;
  baseRange?: number;
  attacksPerRound: number;
  loadedAmmo?: number;     // 枪械当前已装弹
  magazine?: number;       // 弹匣容量
  ammoItemName?: string;   // 玩家备弹对应的随身物品名
  reserveAmmo?: number;    // NPC 备弹(NPC 不走库存)
}

export interface CombatantFlags {
  majorWound: boolean; dying: boolean; unconscious: boolean; dead: boolean; prone: boolean; weaponJammed: boolean;
}

export interface Combatant {
  id: string;
  name: string;
  faction: CombatFaction;
  controlledBy: 'player' | 'ai';
  dex: number;
  str: number;             // 用于体格/DB 计算
  siz: number;
  con: number;             // 重伤/濒死 CON 检定
  mov: number;
  fighting: number;
  dodge: number;
  firearm?: number;
  hp: number; maxHp: number;
  armor: number;
  weapons: CombatWeapon[];
  flags: CombatantFlags;
  tendency?: { attack: number; flee: number };
  roundDefenses: number;
}

export type CombatEndReason = 'victory' | 'defeat' | 'disengage' | 'flee' | 'enemy_retreat' | 'surrender';
export interface CombatLogEntry { kind: 'narrative' | 'roll'; text: string; }

export interface CombatBystander {
  id: string; name: string; friendly: boolean; joinChance: number; combatant?: Combatant;
}

export interface Encounter {
  active: boolean;
  round: number;
  turnOrder: string[];
  currentIdx: number;
  combatants: Combatant[];
  bystanders: CombatBystander[];
  playerTargetId: string | null;
  log: CombatLogEntry[];
  diceRecords: DiceRecord[];
  status: 'active' | 'resolving' | 'ended';
  endReason?: CombatEndReason;
}

export interface CombatLog { entries: CombatLogEntry[]; endReason: CombatEndReason; }
```

在已存在的 `DiceRecord` 接口内追加两个可选字段：

```ts
  context?: 'combat';
  purpose?: string;   // 攻击命中/伤害骰/闪避/反击/体质对抗/速度检定…
```

在已存在的 `BookPage` 接口内追加：

```ts
  combatLog?: CombatLog;
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误（仅新增类型 + 可选字段）。

- [ ] **Step 3: 提交**

```bash
git add src/types/index.ts
git commit -m "feat(战斗): 战斗系统类型(Combatant/Encounter/CombatWeapon…)+DiceRecord扩+BookPage.combatLog"
```

---

## Task 2: 骰子原语 + 成功等级

**Files:**
- Create: `src/sillytavern/combat-engine.ts`
- Test: `src/sillytavern/combat-engine.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/sillytavern/combat-engine.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { d100WithDice, successLevel, type Rng } from './combat-engine';

/** 固定序列 rng：每次返回数组里下一个值（0..1）。 */
function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('successLevel', () => {
  it('判级阈值正确', () => {
    expect(successLevel(1, 60)).toBe('critical');   // 01 大成功
    expect(successLevel(12, 60)).toBe('extreme');   // ≤ 60/5=12 极难
    expect(successLevel(30, 60)).toBe('hard');      // ≤ 60/2=30 困难
    expect(successLevel(60, 60)).toBe('success');   // ≤ 60 普通
    expect(successLevel(61, 60)).toBe('fail');      // 失败
    expect(successLevel(100, 60)).toBe('fumble');   // 100 大失败
    expect(successLevel(96, 40)).toBe('fumble');    // 技能<50 时 96-100 大失败
    expect(successLevel(96, 60)).toBe('fail');      // 技能≥50 时 96 仅失败
  });
});

describe('d100WithDice 奖励/惩罚骰', () => {
  it('无奖惩：十位*10+个位', () => {
    // tens 骰=2(→0.25*10→2), ones=0.55→5 ⇒ 25
    const r = d100WithDice(0, 0, seqRng([0.25, 0.55]));
    expect(r.finalRoll).toBe(25);
    expect(r.tens).toEqual([20]);
  });
  it('1 个奖励骰：多掷一个十位取较小', () => {
    // 个位先掷=0.55→5；十位两颗：0.75→70, 0.15→10 ⇒ 取小 10 ⇒ 15
    const r = d100WithDice(1, 0, seqRng([0.55, 0.75, 0.15]));
    expect(r.finalRoll).toBe(15);
    expect(r.tens.sort((a, b) => a - b)).toEqual([10, 70]);
  });
  it('1 个惩罚骰：多掷一个十位取较大', () => {
    const r = d100WithDice(0, 1, seqRng([0.55, 0.15, 0.75]));
    expect(r.finalRoll).toBe(75);
  });
  it('奖惩相消、净惩罚上限 2', () => {
    // 3 惩罚 - 1 奖励 = 净 2 惩罚（上限 2），掷 1 个位 + 3 个十位取最大
    const r = d100WithDice(1, 3, seqRng([0.05, 0.15, 0.95, 0.45]));
    expect(r.tens.length).toBe(3); // 1 + 净2
    expect(r.finalRoll).toBe(95);  // 取最大十位 90 + 个位 5
  });
  it('个位/十位 00 视为 100（全 0 时）', () => {
    const r = d100WithDice(0, 0, seqRng([0.0, 0.0])); // 十位0→0, 个位0→0 ⇒ 100
    expect(r.finalRoll).toBe(100);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/sillytavern/combat-engine.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

创建 `src/sillytavern/combat-engine.ts`：

```ts
import type { Combatant, CombatWeapon, Encounter } from '../types';

/** 注入式随机源：返回 [0,1)。测试传固定序列以复现。 */
export type Rng = () => number;
const defaultRng: Rng = Math.random;

/** 掷一个 n 面骰（1..n）。 */
function die(n: number, rng: Rng): number {
  return Math.floor(rng() * n) + 1;
}

export type SuccessLevel = 'critical' | 'extreme' | 'hard' | 'success' | 'fail' | 'fumble';

/** d100=roll 对 skill 的成功等级。技能<50 时 96-100 为大失败，否则仅 100 为大失败。 */
export function successLevel(roll: number, skill: number): SuccessLevel {
  if (roll === 1) return 'critical';
  const fumbleFloor = skill < 50 ? 96 : 100;
  if (roll >= fumbleFloor) return 'fumble';
  if (roll <= Math.floor(skill / 5)) return 'extreme';
  if (roll <= Math.floor(skill / 2)) return 'hard';
  if (roll <= skill) return 'success';
  return 'fail';
}

export interface D100Result { tens: number[]; ones: number; finalRoll: number; }

/**
 * 掷 d100，含奖励/惩罚骰（COC7e）：奖惩相消后净额 N；
 * 净奖励→多掷 N 个十位取最小，净惩罚→多掷 N 个十位取最大（净惩罚上限 2）。
 * 十位骰面 0..9（*10），个位骰面 0..9；十位与个位皆 0 视为 100。
 */
export function d100WithDice(bonusDice: number, penaltyDice: number, rng: Rng = defaultRng): D100Result {
  let net = penaltyDice - bonusDice;            // >0 惩罚, <0 奖励
  const penalty = net > 0;
  net = Math.min(Math.abs(net), penalty ? 2 : Infinity); // 净惩罚上限 2；奖励不设上限(罕用)
  const tensCount = 1 + net;
  const ones = Math.floor(rng() * 10);          // 0..9
  const tens: number[] = [];
  for (let i = 0; i < tensCount; i++) tens.push(Math.floor(rng() * 10) * 10); // 0,10,..,90
  const chosenTens = penalty ? Math.max(...tens) : Math.min(...tens);
  let finalRoll = chosenTens + ones;
  if (finalRoll === 0) finalRoll = 100;
  return { tens, ones, finalRoll };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/sillytavern/combat-engine.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sillytavern/combat-engine.ts src/sillytavern/combat-engine.test.ts
git commit -m "feat(战斗): 骰子原语 d100WithDice(奖惩骰多十位取舍,净惩罚上限2) + successLevel 判级"
```

---

## Task 3: 体格与伤害加值表（STR+SIZ）

**Files:**
- Modify: `src/sillytavern/combat-engine.ts`
- Test: `src/sillytavern/combat-engine.test.ts`

- [ ] **Step 1: 写失败测试**

在 `combat-engine.test.ts` 追加：

```ts
import { buildAndDamageBonus } from './combat-engine';

describe('buildAndDamageBonus（COC7e STR+SIZ 表）', () => {
  it('分档正确', () => {
    expect(buildAndDamageBonus(40, 20)).toEqual({ build: -2, db: '-2' });   // 60
    expect(buildAndDamageBonus(40, 40)).toEqual({ build: -1, db: '-1' });   // 80
    expect(buildAndDamageBonus(50, 50)).toEqual({ build: 0, db: '0' });     // 100
    expect(buildAndDamageBonus(70, 70)).toEqual({ build: 1, db: '1D4' });   // 140
    expect(buildAndDamageBonus(90, 90)).toEqual({ build: 2, db: '1D6' });   // 180
    expect(buildAndDamageBonus(120, 120)).toEqual({ build: 3, db: '2D6' }); // 240
    expect(buildAndDamageBonus(160, 160)).toEqual({ build: 4, db: '3D6' }); // 320
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/sillytavern/combat-engine.test.ts`
Expected: FAIL（`buildAndDamageBonus` 未定义）。

- [ ] **Step 3: 实现（追加到 combat-engine.ts）**

```ts
/** COC7e 体格(Build)与伤害加值(DB) 按 STR+SIZ 分档。返回 db 为骰式字符串("0"/"-1"/"1D4"…)。 */
export function buildAndDamageBonus(str: number, siz: number): { build: number; db: string } {
  const t = str + siz;
  if (t <= 64) return { build: -2, db: '-2' };
  if (t <= 84) return { build: -1, db: '-1' };
  if (t <= 124) return { build: 0, db: '0' };
  if (t <= 164) return { build: 1, db: '1D4' };
  if (t <= 204) return { build: 2, db: '1D6' };
  if (t <= 284) return { build: 3, db: '2D6' };
  if (t <= 364) return { build: 4, db: '3D6' };
  if (t <= 444) return { build: 5, db: '4D6' };
  // 每多 80 点 +1 build、+1D6
  const extra = Math.floor((t - 445) / 80) + 1;
  return { build: 5 + extra, db: `${4 + extra}D6` };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/sillytavern/combat-engine.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sillytavern/combat-engine.ts src/sillytavern/combat-engine.test.ts
git commit -m "feat(战斗): 硬编码 COC7e STR+SIZ→Build/DB 映射表"
```

---

## Task 4: 伤害骰式解析与结算（含贯穿）

**Files:**
- Modify: `src/sillytavern/combat-engine.ts`
- Test: `src/sillytavern/combat-engine.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { rollDamageFormula, rollDamage } from './combat-engine';

describe('rollDamageFormula', () => {
  it('解析 1D10+1D4+2 并求和', () => {
    // 1D10:0.55→6 ; 1D4:0.5→3 ; +2 ⇒ 11
    const r = rollDamageFormula('1D10+1D4+2', seqRng([0.55, 0.5]));
    expect(r.total).toBe(11);
  });
  it('负 DB "-1" 当作 -1', () => {
    const r = rollDamageFormula('1D3+-1', seqRng([0.9])); // 1D3:0.9→3, -1 ⇒ 2
    expect(r.total).toBe(2);
  });
});

describe('rollDamage（贯穿）', () => {
  const knife: CombatWeapon = { name:'刀', skill:50, damage:'1D4', impaling:true, ranged:false, attacksPerRound:1 };
  it('普通命中：正常骰 + DB', () => {
    const r = rollDamage(knife, '1D4', false, seqRng([0.5, 0.5])); // 1D4=2 + DB1D4=2 ⇒ 4
    expect(r.total).toBe(4);
  });
  it('贯穿：武器骰+DB 取满 + 追加一份武器骰', () => {
    // 贯穿: 武器满4 + DB满4 + 追加 1D4(0.5→2) ⇒ 10
    const r = rollDamage(knife, '1D4', true, seqRng([0.5]));
    expect(r.total).toBe(10);
  });
});
```

（测试文件顶部补 `import type { CombatWeapon } from '../types';`）

- [ ] **Step 2: 运行确认失败** → `npx vitest run src/sillytavern/combat-engine.test.ts` → FAIL。

- [ ] **Step 3: 实现（追加）**

```ts
/** 解析并掷骰式如 "1D10+1D4+2" / "1D3+-1" / "0"。返回 total 与明细。 */
export function rollDamageFormula(formula: string, rng: Rng = defaultRng): { total: number; parts: number[] } {
  const parts: number[] = [];
  for (const rawTerm of formula.replace(/\s+/g, '').split('+')) {
    const term = rawTerm.replace('--', '-'); // 容错
    const m = /^(-?\d+)[dD](\d+)$/.exec(term);
    if (m) {
      const count = parseInt(m[1], 10);
      const faces = parseInt(m[2], 10);
      let sum = 0;
      const n = Math.abs(count);
      for (let i = 0; i < n; i++) sum += die(faces, rng);
      parts.push(count < 0 ? -sum : sum);
    } else {
      const flat = parseInt(term, 10);
      if (!Number.isNaN(flat)) parts.push(flat);
    }
  }
  return { total: parts.reduce((a, b) => a + b, 0), parts };
}

/** 武器伤害（含 DB）。impale=true 时贯穿：武器骰+DB 取满，贯穿武器再追加一份武器伤害骰。 */
export function rollDamage(weapon: CombatWeapon, db: string, impale: boolean, rng: Rng = defaultRng): { total: number } {
  if (!impale) {
    const w = rollDamageFormula(weapon.damage, rng).total;
    const d = db && db !== '0' ? rollDamageFormula(db, rng).total : 0;
    return { total: w + d };
  }
  // 贯穿：武器骰与 DB 取最大值
  const wMax = maxOfFormula(weapon.damage);
  const dMax = db && db !== '0' ? maxOfFormula(db) : 0;
  let total = wMax + dMax;
  if (weapon.impaling) total += rollDamageFormula(weapon.damage, rng).total; // 追加一份武器骰
  return { total };
}

/** 骰式的理论最大值（贯穿取满用）。 */
function maxOfFormula(formula: string): number {
  let max = 0;
  for (const rawTerm of formula.replace(/\s+/g, '').split('+')) {
    const m = /^(-?\d+)[dD](\d+)$/.exec(rawTerm.replace('--', '-'));
    if (m) max += parseInt(m[1], 10) * parseInt(m[2], 10);
    else { const f = parseInt(rawTerm, 10); if (!Number.isNaN(f)) max += f; }
  }
  return max;
}
```

- [ ] **Step 4: 运行确认通过** → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sillytavern/combat-engine.ts src/sillytavern/combat-engine.test.ts
git commit -m "feat(战斗): 伤害骰式解析 rollDamageFormula + rollDamage(贯穿取满+追加骰)"
```

---

## Task 5: 近战对抗 / 射击 / 卡壳

**Files:**
- Modify: `src/sillytavern/combat-engine.ts`
- Test: `src/sillytavern/combat-engine.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { LEVEL_RANK, resolveOpposed, resolveRanged } from './combat-engine';

describe('resolveOpposed（近战对抗）', () => {
  it('攻方等级高 → 攻方命中', () => {
    // 攻 d100=10(对skill60→extreme) ; 守 d100=70(对dodge50→fail) ⇒ 攻胜
    const r = resolveOpposed(60, 70, 50, 65, 'dodge', seqRng([0.1, 0.0, 0.7, 0.0]));
    expect(r.winner).toBe('attacker');
  });
  it('平手且守方闪避 → 守方胜(躲开)', () => {
    // 同等级：攻 success, 守 success → defense=dodge → 守胜
    const r = resolveOpposed(60, 60, 60, 60, 'dodge', seqRng([0.5, 0.0, 0.5, 0.0])); // 都=50→success
    expect(r.winner).toBe('defender');
  });
  it('平手且守方反击 → 攻方胜', () => {
    const r = resolveOpposed(60, 60, 60, 60, 'fightback', seqRng([0.5, 0.0, 0.5, 0.0]));
    expect(r.winner).toBe('attacker');
  });
});

describe('resolveRanged（射击大失败→卡壳）', () => {
  it('命中', () => {
    const r = resolveRanged(70, 'normal', seqRng([0.1, 0.0])); // 10≤70 success
    expect(r.hit).toBe(true);
    expect(r.jam).toBe(false);
  });
  it('大失败 → 卡壳', () => {
    const r = resolveRanged(40, 'normal', seqRng([1.0, 0.99])); // ~100 fumble (skill<50→96+也算,这里=100)
    expect(r.hit).toBe(false);
    expect(r.jam).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 实现（追加）**

```ts
/** 成功等级排序（越大越好），用于对抗比较。 */
export const LEVEL_RANK: Record<SuccessLevel, number> = {
  fumble: 0, fail: 1, success: 2, hard: 3, extreme: 4, critical: 5,
};

export interface OpposedResult {
  winner: 'attacker' | 'defender' | 'none';
  attackerRoll: D100Result; attackerLevel: SuccessLevel;
  defenderRoll: D100Result; defenderLevel: SuccessLevel;
}

/**
 * 近战对抗：攻方格斗 vs 守方(闪避或反击)。
 * defense='dodge'：平手守方胜；defense='fightback'：平手攻方胜。
 * 双方都 fail → winner='none'（无人受伤）。
 */
export function resolveOpposed(
  attackerSkill: number, defenderSkill: number,
  defenderValue: number, // 闪避值或反击格斗值
  _attackerValueUnused: number,
  defense: 'dodge' | 'fightback',
  rng: Rng = defaultRng,
  attBonus = 0, attPenalty = 0,
): OpposedResult {
  const aRoll = d100WithDice(attBonus, attPenalty, rng);
  const aLevel = successLevel(aRoll.finalRoll, attackerSkill);
  const dRoll = d100WithDice(0, 0, rng);
  const dLevel = successLevel(dRoll.finalRoll, defenderValue);
  let winner: OpposedResult['winner'];
  const aR = LEVEL_RANK[aLevel], dR = LEVEL_RANK[dLevel];
  if (aLevel === 'fail' && dLevel === 'fail') winner = 'none';
  else if (aR > dR) winner = 'attacker';
  else if (dR > aR) winner = 'defender';
  else winner = defense === 'dodge' ? 'defender' : 'attacker'; // 平手
  void defenderSkill; void _attackerValueUnused;
  return { winner, attackerRoll: aRoll, attackerLevel: aLevel, defenderRoll: dRoll, defenderLevel: dLevel };
}

export type DistanceTier = 'normal' | 'far' | 'extreme';

/** 射击（非对抗）。距离档加难度（far=困难/extreme=极难，用惩罚骰近似）。大失败→卡壳。 */
export function resolveRanged(firearmSkill: number, tier: DistanceTier, rng: Rng = defaultRng, bonus = 0, penalty = 0) {
  const tierPenalty = tier === 'far' ? 1 : tier === 'extreme' ? 2 : 0;
  const roll = d100WithDice(bonus, penalty + tierPenalty, rng);
  const level = successLevel(roll.finalRoll, firearmSkill);
  const hit = LEVEL_RANK[level] >= LEVEL_RANK['success'];
  const jam = level === 'fumble';
  return { hit, jam, roll, level };
}
```

- [ ] **Step 4: 运行确认通过** → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sillytavern/combat-engine.ts src/sillytavern/combat-engine.test.ts
git commit -m "feat(战斗): 近战对抗 resolveOpposed(平手判定) + 射击 resolveRanged(距离难度+大失败卡壳)"
```

---

## Task 6: 伤害结算（轻伤/重伤/濒死/HP 归零）

**Files:**
- Modify: `src/sillytavern/combat-engine.ts`
- Test: `src/sillytavern/combat-engine.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { applyDamage } from './combat-engine';

function mkCombatant(over: Partial<import('../types').Combatant> = {}): import('../types').Combatant {
  return {
    id: 'c1', name: '甲', faction: 'enemy', controlledBy: 'ai',
    dex: 50, str: 50, siz: 50, con: 50, mov: 8, fighting: 50, dodge: 30,
    hp: 12, maxHp: 12, armor: 0, weapons: [], roundDefenses: 0,
    flags: { majorWound:false, dying:false, unconscious:false, dead:false, prone:false, weaponJammed:false },
    ...over,
  };
}

describe('applyDamage', () => {
  it('护甲减免', () => {
    const c = applyDamage(mkCombatant({ armor: 3 }), 5).combatant;
    expect(c.hp).toBe(10); // 12 - (5-3)
  });
  it('轻伤(<半HP)不触发重伤', () => {
    const r = applyDamage(mkCombatant(), 5); // 5 < 6
    expect(r.combatant.flags.majorWound).toBe(false);
    expect(r.majorWound).toBe(false);
  });
  it('重伤(≥半HP) 触发重伤+倒地', () => {
    const r = applyDamage(mkCombatant(), 6); // ≥6
    expect(r.combatant.flags.majorWound).toBe(true);
    expect(r.combatant.flags.prone).toBe(true);
  });
  it('单次>maxHP 直接死亡', () => {
    const r = applyDamage(mkCombatant(), 13);
    expect(r.combatant.flags.dead).toBe(true);
    expect(r.combatant.hp).toBe(0);
  });
  it('HP 归零+曾重伤 → 濒死昏迷；仅轻伤 → 昏迷不濒死', () => {
    const wounded = mkCombatant({ hp: 2, flags: { ...mkCombatant().flags, majorWound: true } });
    const r = applyDamage(wounded, 2); // 归零
    expect(r.combatant.flags.dying).toBe(true);
    expect(r.combatant.flags.unconscious).toBe(true);
    const light = applyDamage(mkCombatant({ hp: 2 }), 2).combatant; // 归零但无重伤
    expect(light.flags.dying).toBe(false);
    expect(light.flags.unconscious).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 实现（追加）**

```ts
export interface DamageResult { combatant: Combatant; dealt: number; majorWound: boolean; }

/** 施加伤害（已含护甲减免）。判轻/重伤、>maxHP 即死、HP 归零分轻伤/重伤态。返回新 combatant（不可变）。 */
export function applyDamage(target: Combatant, rawDamage: number): DamageResult {
  const dealt = Math.max(0, rawDamage - target.armor);
  const flags = { ...target.flags };
  const hp = Math.max(0, target.hp - dealt);
  let majorWound = false;
  if (dealt > target.maxHp) {
    flags.dead = true;
    return { combatant: { ...target, hp: 0, flags }, dealt, majorWound: false };
  }
  if (dealt >= Math.ceil(target.maxHp / 2)) {
    majorWound = true;
    flags.majorWound = true;
    flags.prone = true; // 重伤倒地（避免昏迷的 CON 检定由 store/调用方掷，结果回写 unconscious）
  }
  if (hp === 0) {
    flags.unconscious = true;
    if (flags.majorWound) flags.dying = true; // 曾受重伤 → 濒死
  }
  return { combatant: { ...target, hp, flags }, dealt, majorWound };
}
```

- [ ] **Step 4: 运行确认通过** → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sillytavern/combat-engine.ts src/sillytavern/combat-engine.test.ts
git commit -m "feat(战斗): applyDamage 护甲/轻伤/重伤倒地/即死/HP归零濒死"
```

---

## Task 7: 寡不敌众 / 行动顺序 / 弹药 / AI 决策

**Files:**
- Modify: `src/sillytavern/combat-engine.ts`
- Test: `src/sillytavern/combat-engine.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { outnumberBonusDice, nextTurnOrder, decideAiAction, consumeAmmo, canReload } from './combat-engine';

describe('outnumberBonusDice', () => {
  it('本轮已防御 N 次 → N 个奖励骰（近战攻击者）', () => {
    expect(outnumberBonusDice(mkCombatant({ roundDefenses: 0 }))).toBe(0);
    expect(outnumberBonusDice(mkCombatant({ roundDefenses: 2 }))).toBe(2);
  });
});

describe('nextTurnOrder（DEX 降序）', () => {
  it('按 DEX 由高到低', () => {
    const order = nextTurnOrder([mkCombatant({ id:'a', dex:40 }), mkCombatant({ id:'b', dex:70 }), mkCombatant({ id:'c', dex:55 })]);
    expect(order).toEqual(['b', 'c', 'a']);
  });
});

describe('decideAiAction', () => {
  it('roll ≤ flee 阈值 → 逃跑', () => {
    const enc = { combatants: [
      mkCombatant({ id:'e', faction:'enemy', tendency:{ attack:60, flee:30 } }),
      mkCombatant({ id:'p', faction:'player', controlledBy:'player' }),
    ] } as Encounter;
    expect(decideAiAction(enc.combatants[0], enc, seqRng([0.10])).type).toBe('flee'); // 11 ≤ 30
    expect(decideAiAction(enc.combatants[0], enc, seqRng([0.50])).type).toBe('attack'); // 51 > 30
  });
  it('攻击时选敌对阵营存活目标', () => {
    const enc = { combatants: [
      mkCombatant({ id:'e', faction:'enemy', tendency:{ attack:90, flee:10 } }),
      mkCombatant({ id:'p', faction:'player', controlledBy:'player' }),
    ] } as Encounter;
    const a = decideAiAction(enc.combatants[0], enc, seqRng([0.50]));
    expect(a.type).toBe('attack');
    expect(a.targetId).toBe('p');
  });
});

describe('弹药', () => {
  it('consumeAmmo 扣 1，归零', () => {
    const w: CombatWeapon = { name:'枪', skill:50, damage:'1D10', impaling:true, ranged:true, attacksPerRound:1, loadedAmmo:1, magazine:6 };
    expect(consumeAmmo(w).loadedAmmo).toBe(0);
  });
  it('canReload：未满且有备弹', () => {
    const w: CombatWeapon = { name:'枪', skill:50, damage:'1D10', impaling:true, ranged:true, attacksPerRound:1, loadedAmmo:2, magazine:6 };
    expect(canReload(w, 5)).toBe(true);
    expect(canReload(w, 0)).toBe(false);
    expect(canReload({ ...w, loadedAmmo: 6 }, 5)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 实现（追加）**

```ts
/** 寡不敌众：本轮已防御次数即后续近战攻击者获得的奖励骰数。 */
export function outnumberBonusDice(defender: Combatant): number {
  return Math.max(0, defender.roundDefenses);
}

/** 行动顺序：DEX 降序（同 DEX 时格斗高者先，再按 id 稳定）。 */
export function nextTurnOrder(combatants: Combatant[]): string[] {
  return [...combatants]
    .filter((c) => !c.flags.dead && !c.flags.unconscious)
    .sort((a, b) => (b.dex - a.dex) || (b.fighting - a.fighting) || (a.id < b.id ? -1 : 1))
    .map((c) => c.id);
}

export type AiAction =
  | { type: 'attack'; targetId: string }
  | { type: 'flee' };

/** AI 回合决策：d100 ≤ flee 阈值→逃；否则攻击敌对阵营存活目标(HP 最低优先)。 */
export function decideAiAction(self: Combatant, enc: Encounter, rng: Rng = defaultRng): AiAction {
  const roll = Math.floor(rng() * 100) + 1; // 1..100
  const flee = self.tendency?.flee ?? 0;
  const hostile = self.faction === 'enemy' ? ['player', 'ally'] : ['enemy'];
  const targets = enc.combatants.filter((c) => hostile.includes(c.faction) && !c.flags.dead && !c.flags.unconscious);
  if (roll <= flee || targets.length === 0) return { type: 'flee' };
  const target = targets.reduce((lo, c) => (c.hp < lo.hp ? c : lo), targets[0]);
  return { type: 'attack', targetId: target.id };
}

/** 射击后扣 1 发。 */
export function consumeAmmo(weapon: CombatWeapon): CombatWeapon {
  return { ...weapon, loadedAmmo: Math.max(0, (weapon.loadedAmmo ?? 0) - 1) };
}

/** 能否换弹：枪械、未满、且有备弹(玩家=库存数 available，NPC=reserveAmmo)。 */
export function canReload(weapon: CombatWeapon, available: number): boolean {
  if (!weapon.ranged || weapon.magazine == null) return false;
  if ((weapon.loadedAmmo ?? 0) >= weapon.magazine) return false;
  return available > 0;
}
```

- [ ] **Step 4: 运行确认通过** → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sillytavern/combat-engine.ts src/sillytavern/combat-engine.test.ts
git commit -m "feat(战斗): 寡不敌众奖励骰/DEX行动顺序/AI倾向决策/弹药消耗与换弹判定"
```

---

## Task 8: 终检

- [ ] **Step 1: 全量验证**

Run: `npx tsc --noEmit && npx vitest run src/sillytavern/combat-engine.test.ts && npx eslint src/sillytavern/combat-engine.ts`
Expected: tsc 干净；引擎测试全过；新文件无 eslint error。

- [ ] **Step 2: 推送**

```bash
git push origin beta
```

---

## Self-Review（覆盖核对）

- **Spec §4 数据模型** → Task 1 ✅（Combatant 加 str/siz/con 供引擎算 DB/CON 检定）
- **Spec §5 引擎：判级/奖惩骰** → Task 2 ✅
- **Spec §5 DB/Build 硬编码表** → Task 3 ✅
- **Spec §5 伤害/贯穿** → Task 4 ✅
- **Spec §5 近战对抗/射击/卡壳(大失败)** → Task 5 ✅
- **Spec §5 applyDamage 轻/重伤/濒死/HP归零** → Task 6 ✅
- **Spec §5 寡不敌众/行动顺序/AI决策/弹药换弹** → Task 7 ✅
- **类型一致性**：`d100WithDice/successLevel/SuccessLevel/LEVEL_RANK/resolveOpposed/resolveRanged/applyDamage/outnumberBonusDice/nextTurnOrder/decideAiAction/consumeAmmo/canReload/buildAndDamageBonus/rollDamage/rollDamageFormula` 全文一致；`Rng` 注入贯穿。
- **超出本计划（后续 Phase）**：useCombatStore / combat-detector / CombatPanel / Storybook+useChatPipeline 集成 / 持久化 / starting-items 配弹 / DiceHistory —— 各自独立计划。
- **YAGNI/Phase2**：完整追逐/战技/全自动/每武器故障值/毒素/部位命中 不在引擎内。
