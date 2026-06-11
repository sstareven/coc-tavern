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
      const n = Math.abs(count);
      if (n > 100 || faces > 1000 || faces <= 0) continue;
      let sum = 0;
      for (let i = 0; i < n; i++) sum += die(faces, rng);
      parts.push(count < 0 ? -sum : sum);
    } else {
      const flat = parseInt(token, 10);
      if (!Number.isNaN(flat)) parts.push(flat);
    }
  }
  return { total: parts.reduce((a, b) => a + b, 0), parts };
}

export interface RolledDie { value: number; faces: number; }

/** 逐颗骰子掷骰式（如 "1D6+1D6"、"1D8+1"）：每颗骰子单列(供动画)，平值修正并入 total、不计入 dice。 */
export function rollDamageDice(formula: string, rng: Rng = defaultRng): { total: number; dice: RolledDie[] } {
  const dice: RolledDie[] = [];
  let total = 0;
  const tokens = formula.replace(/\s+/g, '').match(/[+-]?[^+-]+/g) ?? [];
  for (const token of tokens) {
    const m = /^([+-]?\d*)[dD](\d+)$/.exec(token);
    if (m) {
      const count = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10);
      const faces = parseInt(m[2], 10);
      const n = Math.abs(count), sign = count < 0 ? -1 : 1;
      if (n > 100 || faces > 1000 || faces <= 0) continue;
      for (let i = 0; i < n; i++) { const v = die(faces, rng); dice.push({ value: v, faces }); total += sign * v; }
    } else {
      const flat = parseInt(token, 10);
      if (!Number.isNaN(flat)) total += flat;
    }
  }
  return { total, dice };
}

/** 骰式取满（贯穿用）：每颗骰子取最大面，平值修正并入 total。 */
function maxDiceOfFormula(formula: string): { total: number; dice: RolledDie[] } {
  const dice: RolledDie[] = [];
  let total = 0;
  const tokens = formula.replace(/\s+/g, '').match(/[+-]?[^+-]+/g) ?? [];
  for (const token of tokens) {
    const m = /^([+-]?\d*)[dD](\d+)$/.exec(token);
    if (m) {
      const count = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10);
      const faces = parseInt(m[2], 10);
      const n = Math.abs(count), sign = count < 0 ? -1 : 1;
      for (let i = 0; i < n; i++) { dice.push({ value: faces, faces }); total += sign * faces; }
    } else { const f = parseInt(token, 10); if (!Number.isNaN(f)) total += f; }
  }
  return { total, dice };
}

/** 武器伤害（含 DB）。impale=true 时极限/大成功：贯穿武器→武器骰+DB 取满+追加一份武器伤害骰；钝击武器→武器骰+DB 取满（无追加骰）；普通武器→正常掷骰。返回逐颗骰子供动画。 */
export function rollDamage(weapon: CombatWeapon, db: string, impale: boolean, rng: Rng = defaultRng): { total: number; dice: RolledDie[] } {
  if (!impale) {
    const w = rollDamageDice(weapon.damage, rng);
    const d = db && db !== '0' ? rollDamageDice(db, rng) : { total: 0, dice: [] as RolledDie[] };
    return { total: w.total + d.total, dice: [...w.dice, ...d.dice] };
  }
  if (weapon.crushing) {
    // 钝击极限/大成功：武器骰+DB 取满（无追加骰）
    const wMax = maxDiceOfFormula(weapon.damage);
    const dMax = db && db !== '0' ? maxDiceOfFormula(db) : { total: 0, dice: [] as RolledDie[] };
    return { total: wMax.total + dMax.total, dice: [...wMax.dice, ...dMax.dice] };
  }
  // 贯穿极限/大成功：武器骰+DB 取满 + 追加一份武器骰
  const wMax = maxDiceOfFormula(weapon.damage);
  const dMax = db && db !== '0' ? maxDiceOfFormula(db) : { total: 0, dice: [] as RolledDie[] };
  let total = wMax.total + dMax.total;
  const dice = [...wMax.dice, ...dMax.dice];
  if (weapon.impaling) { const extra = rollDamageDice(weapon.damage, rng); total += extra.total; dice.push(...extra.dice); } // 追加一份武器骰
  return { total, dice };
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
  defBonus = 0,
  defPenalty = 0,
): OpposedResult {
  const aRoll = d100WithDice(attBonus, attPenalty, rng);
  const aLevel = successLevel(aRoll.finalRoll, attackerSkill);
  const dRoll = d100WithDice(defBonus, defPenalty, rng);
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

export type DistanceTier = 'close' | 'normal' | 'far' | 'extreme';

/** 射击（非对抗）。距离档加难度（close=贴身+1奖励骰/far=困难+1惩罚骰/extreme=极难+2惩罚骰）。大失败→卡壳。 */
export function resolveRanged(firearmSkill: number, tier: DistanceTier, rng: Rng = defaultRng, bonus = 0, penalty = 0) {
  const tierBonus = tier === 'close' ? 1 : 0;
  // COC7e uses difficulty levels for range, not penalty dice:
  // far = Hard (skill/2), extreme = Extreme (skill/5)
  const effectiveSkill = tier === 'far' ? Math.floor(firearmSkill / 2)
    : tier === 'extreme' ? Math.floor(firearmSkill / 5)
    : firearmSkill;
  const roll = d100WithDice(bonus + tierBonus, penalty, rng);
  const level = successLevel(roll.finalRoll, effectiveSkill);
  const hit = LEVEL_RANK[level] >= LEVEL_RANK['success'];
  const jam = level === 'fumble';
  return { hit, jam, roll, level };
}

export interface DamageResult { combatant: Combatant; dealt: number; majorWound: boolean; conCheckRequired: boolean; }

/** 施加伤害（已含护甲减免）。判轻/重伤、>maxHP 即死、HP 归零分轻伤/重伤态。返回新 combatant（不可变）。 */
export function applyDamage(target: Combatant, rawDamage: number): DamageResult {
  const dealt = Math.max(0, rawDamage - target.armor);
  const flags = { ...target.flags };
  const hp = Math.max(0, target.hp - dealt);
  let majorWound = false;
  if (dealt >= target.maxHp) {
    flags.dead = true;
    return { combatant: { ...target, hp: 0, flags }, dealt, majorWound: false, conCheckRequired: false };
  }
  if (dealt >= Math.floor(target.maxHp / 2)) {
    majorWound = true;
    flags.majorWound = true;
    flags.prone = true; // 重伤倒地（避免昏迷的 CON 检定由 controller 掷，结果回写 unconscious）
  }
  if (hp === 0) {
    flags.unconscious = true;
    if (flags.majorWound) flags.dying = true; // 曾受重伤 → 濒死
  }
  // CON 检定条件：重伤且未死（COC7e p101：重伤须通过 CON 检定否则昏迷）
  const conCheckRequired = majorWound && !flags.dead;
  return { combatant: { ...target, hp, flags }, dealt, majorWound, conCheckRequired };
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
  | { type: 'firstAid'; targetId: string }
  | { type: 'flee' };

/** AI 决策模式:
 *  - 'attack' 纯攻击,不考虑急救队友
 *  - 'support' ally 优先急救濒死队友;无人需救才打
 *  - 'mixed'(默认) 若有 HP/Max < 0.4 队友且自己急救 >= 30 → 50% 急救;其余攻击
 *  设置 enemy 时 mode 无效(敌人永远攻击)。
 */
export type AiMode = 'attack' | 'support' | 'mixed';

/** AI 回合决策:
 *  - ally 在 mode='support'/'mixed' 时按 COC7e 急救规则优先救濒死队友;
 *    急救对象筛选 HP/Max < 0.4(或 dying flag),自己急救 >= 30%。
 *  - 否则按攻击/逃跑两倾向(1-100)按相对权重定逃跑概率 fleeChance=flee/(attack+flee);
 *    d100 ≤ fleeChance→逃;否则攻击敌对阵营存活目标(HP 最低优先)。无敌可打→撤。 */
export function decideAiAction(self: Combatant, enc: Encounter, rng: Rng = defaultRng, mode: AiMode = 'mixed'): AiAction {
  // ally 急救判定:仅 ally 走该分支;mode='attack' 跳过
  if (self.faction === 'ally' && mode !== 'attack') {
    const firstAidSkill = self.firstAid ?? 30;
    if (firstAidSkill >= 30) {
      // 找需要急救的队友: 同 faction(ally/player) + 存活 + HP/Max < 0.4 或 dying
      const allies = enc.combatants.filter((c) =>
        (c.faction === 'ally' || c.faction === 'player') &&
        c.id !== self.id &&
        !c.flags.dead && !c.flags.unconscious && !c.flags.fled &&
        (c.flags.dying || (c.maxHp > 0 && c.hp / c.maxHp < 0.4)),
      );
      if (allies.length > 0) {
        // 优先血最少
        const target = allies.reduce((lo, c) => (c.hp < lo.hp ? c : lo), allies[0]);
        if (mode === 'support') return { type: 'firstAid', targetId: target.id };
        // mixed: 50% 概率急救,50% 攻击(若 dying 则 80%)
        const healChance = target.flags.dying ? 0.8 : 0.5;
        if (rng() < healChance) return { type: 'firstAid', targetId: target.id };
      }
    }
  }
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
