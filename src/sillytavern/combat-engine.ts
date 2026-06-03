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
  // 把每个十位骰与同一个个位骰整读成 d100 值(00+0=100)后再取优/取劣——
  // 取舍必须在「00+0→100」替换之后，否则 ones=0 且候选含「00」时方向会反转。
  const candidates = tens.map((t) => { const v = t + ones; return v === 0 ? 100 : v; });
  const finalRoll = penalty ? Math.max(...candidates) : Math.min(...candidates);
  return { tens, ones, finalRoll };
}

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

/** 解析并掷骰式如 "1D10+1D4+2" / "1D8-2" / "1D3+-1" / "0"。返回 total 与明细。 */
export function rollDamageFormula(formula: string, rng: Rng = defaultRng): { total: number; parts: number[] } {
  const parts: number[] = [];
  const tokens = formula.replace(/\s+/g, '').match(/[+-]?[^+-]+/g) ?? [];
  for (const token of tokens) {
    const m = /^([+-]?\d*)[dD](\d+)$/.exec(token);
    if (m) {
      const count = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10);
      const faces = parseInt(m[2], 10);
      let sum = 0;
      const n = Math.abs(count);
      for (let i = 0; i < n; i++) sum += die(faces, rng);
      parts.push(count < 0 ? -sum : sum);
    } else {
      const flat = parseInt(token, 10);
      if (!Number.isNaN(flat)) parts.push(flat);
    }
  }
  return { total: parts.reduce((a, b) => a + b, 0), parts };
}

/** 骰式的理论最大值（贯穿取满用），支持 +/- 项。 */
function maxOfFormula(formula: string): number {
  let max = 0;
  const tokens = formula.replace(/\s+/g, '').match(/[+-]?[^+-]+/g) ?? [];
  for (const token of tokens) {
    const m = /^([+-]?\d*)[dD](\d+)$/.exec(token);
    if (m) {
      const count = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10);
      max += count * parseInt(m[2], 10);
    } else { const f = parseInt(token, 10); if (!Number.isNaN(f)) max += f; }
  }
  return max;
}

/** 武器伤害（含 DB）。impale=true 时贯穿：武器骰+DB 取满，贯穿武器再追加一份武器伤害骰。 */
export function rollDamage(weapon: CombatWeapon, db: string, impale: boolean, rng: Rng = defaultRng): { total: number } {
  if (!impale) {
    const w = rollDamageFormula(weapon.damage, rng).total;
    const d = db && db !== '0' ? rollDamageFormula(db, rng).total : 0;
    return { total: w + d };
  }
  const wMax = maxOfFormula(weapon.damage);
  const dMax = db && db !== '0' ? maxOfFormula(db) : 0;
  let total = wMax + dMax;
  if (weapon.impaling) total += rollDamageFormula(weapon.damage, rng).total; // 追加一份武器骰
  return { total };
}

/** 成功等级排序（越大越好），用于对抗比较。 */
export const LEVEL_RANK: Record<SuccessLevel, number> = {
  fumble: 0, fail: 1, success: 2, hard: 3, extreme: 4, critical: 5,
};

/** 是否达到贯穿/极限伤害的成功等级（极难或大成功）。注意：反击不触发贯穿，由调用方据 defense 排除。 */
export function isImpaleLevel(level: SuccessLevel): boolean {
  return level === 'extreme' || level === 'critical';
}

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
  attackerSkill: number,
  defenderSkill: number,
  defenderValue: number,
  _attackerValueUnused: number,
  defense: 'dodge' | 'fightback',
  rng: Rng = defaultRng,
  attBonus = 0,
  attPenalty = 0,
): OpposedResult {
  const aRoll = d100WithDice(attBonus, attPenalty, rng);
  const aLevel = successLevel(aRoll.finalRoll, attackerSkill);
  const dRoll = d100WithDice(0, 0, rng);
  const dLevel = successLevel(dRoll.finalRoll, defenderValue);
  let winner: OpposedResult['winner'];
  const aR = LEVEL_RANK[aLevel], dR = LEVEL_RANK[dLevel];
  const SUCC = LEVEL_RANK['success'];
  if (aR < SUCC && dR < SUCC) winner = 'none';   // 双方都未达成功(fail/fumble)→无人受伤
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

/** 寡不敌众：本轮已防御过(≥1次)→后续近战攻击者获得【恒为 1 个】奖励骰（COC7e 不随次数累加）。 */
export function outnumberBonusDice(defender: Combatant): number {
  return defender.roundDefenses > 0 ? 1 : 0;
}

/** 行动顺序：DEX 降序（同 DEX 时格斗高者先，再按 id 稳定）。 */
export function nextTurnOrder(combatants: Combatant[]): string[] {
  return [...combatants]
    .filter((c) => !c.flags.dead && !c.flags.unconscious && !c.flags.fled)
    .sort((a, b) => (b.dex - a.dex) || (b.fighting - a.fighting) || (a.id < b.id ? -1 : 1))
    .map((c) => c.id);
}

export type AiAction =
  | { type: 'attack'; targetId: string }
  | { type: 'flee' };

/** AI 回合决策：攻击/逃跑两倾向(1-100)按相对权重定逃跑概率 fleeChance=flee/(attack+flee)；
 *  d100 ≤ fleeChance→逃；否则攻击敌对阵营存活目标(HP 最低优先)。无敌可打→撤。 */
export function decideAiAction(self: Combatant, enc: Encounter, rng: Rng = defaultRng): AiAction {
  const hostile = self.faction === 'enemy' ? ['player', 'ally'] : ['enemy'];
  const targets = enc.combatants.filter((c) => hostile.includes(c.faction) && !c.flags.dead && !c.flags.unconscious && !c.flags.fled);
  if (targets.length === 0) return { type: 'flee' };
  const attack = self.tendency?.attack ?? 0;
  const flee = self.tendency?.flee ?? 0;
  const fleeChance = attack + flee > 0 ? Math.round((flee / (attack + flee)) * 100) : 0;
  const roll = Math.floor(rng() * 100) + 1; // 1..100
  if (roll <= fleeChance) return { type: 'flee' };
  const target = targets.reduce((lo, c) => (c.hp < lo.hp ? c : lo), targets[0]);
  return { type: 'attack', targetId: target.id };
}

/** 射击后扣 1 发。 */
export function consumeAmmo(weapon: CombatWeapon): CombatWeapon {
  return { ...weapon, loadedAmmo: Math.max(0, (weapon.loadedAmmo ?? 0) - 1) };
}

/** 当前武器能否射击：近战恒可；枪械须有已装弹（卡壳由调用方查 combatant.flags.weaponJammed）。 */
export function canFire(weapon: CombatWeapon): boolean {
  return !weapon.ranged || (weapon.loadedAmmo ?? 0) > 0;
}

/** 能否换弹：枪械、未满、且有备弹(玩家=库存数 available，NPC=reserveAmmo)。 */
export function canReload(weapon: CombatWeapon, available: number): boolean {
  if (!weapon.ranged || weapon.magazine == null) return false;
  if ((weapon.loadedAmmo ?? 0) >= weapon.magazine) return false;
  return available > 0;
}
