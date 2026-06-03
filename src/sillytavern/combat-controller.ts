import type { Encounter, Combatant, CombatEndReason, CombatLogEntry, DiceRecord, DiceResultType } from '../types';
import {
  type Rng, type SuccessLevel,
  successLevel, resolveOpposed, resolveRanged, rollDamage, applyDamage,
  isImpaleLevel, outnumberBonusDice, nextTurnOrder, decideAiAction,
  consumeAmmo, canReload, canFire, d100WithDice,
} from './combat-engine';

const defaultRng: Rng = Math.random;

/** 成功等级 → 检定记录用的 DiceResultType（使战斗检定能进主「检定记录」面板且配色正确）。 */
const LEVEL_TO_DICE_TYPE: Record<SuccessLevel, DiceResultType> = {
  critical: 'crit-success', extreme: 'extreme-success', hard: 'hard-success',
  success: 'success', fail: 'failure', fumble: 'crit-failure',
};
/** d100=roll 对 skill 的检定记录 type（用于非对抗的临时检定如速度/排障）。 */
function diceTypeFor(roll: number, skill: number): DiceResultType {
  return LEVEL_TO_DICE_TYPE[successLevel(roll, skill)];
}

// ── 不可变更新辅助 ──
function patchCombatant(enc: Encounter, id: string, patch: Partial<Combatant>): Encounter {
  return { ...enc, combatants: enc.combatants.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}
function byId(enc: Encounter, id: string | null): Combatant | undefined {
  return enc.combatants.find((c) => c.id === id);
}
function alive(c: Combatant): boolean { return !c.flags.dead && !c.flags.unconscious && !c.flags.fled; }
function hostileTo(a: Combatant, b: Combatant): boolean { return (a.faction === 'enemy') !== (b.faction === 'enemy'); }

function log(enc: Encounter, text: string, kind: CombatLogEntry['kind'] = 'roll'): Encounter {
  return { ...enc, log: [...enc.log, { kind, text }] };
}
function rec(enc: Encounter, r: Omit<DiceRecord, 'time'>): Encounter {
  return { ...enc, diceRecords: [...enc.diceRecords, { ...r, time: 0, context: 'combat' }] };
}

const LEVEL_CN: Record<SuccessLevel, string> = {
  critical: '大成功', extreme: '极难成功', hard: '困难成功', success: '成功', fail: '失败', fumble: '大失败',
};

/** 判定脱战原因；null=继续。 */
export function checkEndReason(enc: Encounter): CombatEndReason | null {
  const enemies = enc.combatants.filter((c) => c.faction === 'enemy');
  const player = enc.combatants.find((c) => c.faction === 'player');
  const friendlies = enc.combatants.filter((c) => c.faction !== 'enemy');
  if (player && (player.flags.dead || player.flags.dying || player.flags.unconscious)) return 'defeat';
  if (enemies.length > 0 && enemies.every((e) => !alive(e))) {
    // 全部敌人离场：全被击毙→victory；含逃走/撤退者→enemy_retreat。
    return enemies.every((e) => e.flags.dead) ? 'victory' : 'enemy_retreat';
  }
  if (friendlies.every((f) => !alive(f))) return 'defeat';
  return null;
}

/** 推进到下一个行动者；轮内全员走完→新一轮（重排 turnOrder、清 roundDefenses）。 */
export function advanceTurn(enc: Encounter): Encounter {
  const next = enc.currentIdx + 1;
  if (next >= enc.turnOrder.length) {    // 新一轮：重排（排除死亡/昏迷）、清防御计数
    const cleared = enc.combatants.map((c) => ({ ...c, roundDefenses: 0 }));
    const order = nextTurnOrder(cleared);
    return { ...enc, combatants: cleared, turnOrder: order, currentIdx: 0, round: enc.round + 1 };
  }
  return { ...enc, currentIdx: next };
}

/** 一次攻击结算（attacker 用 weaponIdx 攻击 targetId）。处理近战对抗/射击/伤害/贯穿/卡壳/弹药/寡不敌众。 */
export function performAttack(enc0: Encounter, attackerId: string, targetId: string, weaponIdx: number, rng: Rng = defaultRng): Encounter {
  let enc = enc0;
  const attacker = byId(enc, attackerId);
  const target = byId(enc, targetId);
  if (!attacker || !target || !alive(attacker) || !alive(target)) return enc;
  const weapon = attacker.weapons[weaponIdx] ?? attacker.weapons[0];
  if (!weapon) return enc;
  const dmgFormula = (db: string) => (db && db !== '0' ? `${weapon.damage}+${db}` : weapon.damage);

  if (weapon.ranged) {
    if (!canFire(weapon) || attacker.flags.weaponJammed) {
      return log(enc, `${attacker.name} 的 ${weapon.name} 无法击发`, 'narrative');
    }
    const r = resolveRanged(weapon.skill, 'normal', rng);
    enc = patchCombatant(enc, attackerId, { weapons: attacker.weapons.map((w, i) => (i === weaponIdx ? consumeAmmo(w) : w)) });
    enc = rec(enc, { skill: `${attacker.name}·${weapon.name}`, roll: String(r.roll.finalRoll), target: String(weapon.skill), type: LEVEL_TO_DICE_TYPE[r.level], purpose: '攻击命中-火器' });
    const hitLine = `${attacker.name} 用${weapon.name}射击 d100=${r.roll.finalRoll}/${weapon.skill}（${LEVEL_CN[r.level]}）`;
    if (r.jam) {
      enc = patchCombatant(enc, attackerId, { flags: { ...attacker.flags, weaponJammed: true } });
      return log(enc, `${hitLine} — ${weapon.name}卡壳！`);
    }
    if (!r.hit) return log(enc, `${hitLine} → 未命中 ${target.name}`);
    const impale = isImpaleLevel(r.level);
    const dmg = rollDamage(weapon, '0', impale, rng).total; // 火器不加 DB(COC7e)
    const hpBefore = target.hp;
    const dr = applyDamage(target, dmg);
    enc = patchCombatant(enc, targetId, { hp: dr.combatant.hp, flags: dr.combatant.flags });
    return log(enc, `${hitLine}${impale ? '·贯穿' : ''} → 命中，伤害 ${weapon.damage}=${dmg}，${target.name} HP ${hpBefore}→${dr.combatant.hp}/${target.maxHp}`);
  }

  // 近战对抗：守方默认反击(格斗≥闪避)否则闪避；倾向逃则闪避
  const wantFlee = (target.tendency?.flee ?? 0) > (target.tendency?.attack ?? 0);
  const defense: 'dodge' | 'fightback' = (target.controlledBy === 'ai' && !wantFlee && target.fighting >= target.dodge) ? 'fightback' : 'dodge';
  const defenderValue = defense === 'fightback' ? target.fighting : target.dodge;
  const bonus = outnumberBonusDice(target); // 守方本轮已防御→攻方得奖励骰
  const op = resolveOpposed(weapon.skill, target.fighting, defenderValue, 0, defense, rng, bonus, 0);
  enc = patchCombatant(enc, targetId, { roundDefenses: target.roundDefenses + 1 });
  enc = rec(enc, { skill: `${attacker.name}·${weapon.name}`, roll: String(op.attackerRoll.finalRoll), target: String(weapon.skill), type: LEVEL_TO_DICE_TYPE[op.attackerLevel], purpose: '攻击命中-近战' });
  enc = rec(enc, { skill: `${target.name}·${defense === 'dodge' ? '闪避' : '反击'}`, roll: String(op.defenderRoll.finalRoll), target: String(defenderValue), type: LEVEL_TO_DICE_TYPE[op.defenderLevel], purpose: defense === 'dodge' ? '闪避' : '格斗反击' });
  const atkLine = `${attacker.name} 用${weapon.name} d100=${op.attackerRoll.finalRoll}/${weapon.skill}（${LEVEL_CN[op.attackerLevel]}）`;
  const defLine = `${target.name} ${defense === 'dodge' ? '闪避' : '反击'} d100=${op.defenderRoll.finalRoll}/${defenderValue}（${LEVEL_CN[op.defenderLevel]}）`;

  if (op.winner === 'attacker') {
    const impale = isImpaleLevel(op.attackerLevel); // 主动攻击极难/大成功→贯穿
    const db = attacker.damageBonus ?? '0';
    const dmg = rollDamage(weapon, db, impale, rng).total;
    const hpBefore = target.hp;
    const dr = applyDamage(target, dmg);
    enc = patchCombatant(enc, targetId, { hp: dr.combatant.hp, flags: dr.combatant.flags, roundDefenses: target.roundDefenses + 1 });
    return log(enc, `${atkLine}${impale ? '·贯穿' : ''} 胜过 ${defLine} → 伤害 ${dmgFormula(db)}=${dmg}，${target.name} HP ${hpBefore}→${dr.combatant.hp}/${target.maxHp}`);
  }
  if (op.winner === 'defender' && defense === 'fightback') {
    const cw = target.weapons[0] ?? weapon;
    const dmg = rollDamage(cw, target.damageBonus ?? '0', false, rng).total; // 反击不贯穿
    const hpBefore = attacker.hp;
    const dr = applyDamage(attacker, dmg);
    enc = patchCombatant(enc, attackerId, { hp: dr.combatant.hp, flags: dr.combatant.flags });
    return log(enc, `${defLine} 反击得手，压过 ${atkLine} → ${attacker.name} 受 ${cw.damage}=${dmg} 伤，HP ${hpBefore}→${dr.combatant.hp}/${attacker.maxHp}`);
  }
  if (op.winner === 'defender') return log(enc, `${atkLine} 被 ${defLine} 躲开`);
  return log(enc, `${atkLine} 与 ${defLine} 均未得手`);
}

/** 单个 AI 行动者的回合：按倾向决策攻击/逃跑。 */
export function runAiTurn(enc0: Encounter, aiId: string, rng: Rng = defaultRng): Encounter {
  let enc = enc0;
  const ai = byId(enc, aiId);
  if (!ai || !alive(ai) || ai.controlledBy !== 'ai') return enc;
  const action = decideAiAction(ai, enc, rng);
  if (action.type === 'flee') {
    // 逃跑需 MOV/速度结算：比所有敌对存活者都快 → 直接脱离；否则掷 CON 速度检定，成功才逃脱、失败被拦下(留在场继续)。
    const opponents = enc.combatants.filter((c) => hostileTo(ai, c) && alive(c));
    const maxOppMov = opponents.reduce((m, c) => Math.max(m, c.mov), 0);
    let escaped = ai.mov > maxOppMov;
    if (!escaped) {
      const r = d100WithDice(0, 0, rng);
      const lvl = successLevel(r.finalRoll, ai.con);
      escaped = lvl !== 'fail' && lvl !== 'fumble';
      enc = rec(enc, { skill: `${ai.name}·速度检定`, roll: String(r.finalRoll), target: String(ai.con), type: diceTypeFor(r.finalRoll, ai.con), purpose: '速度检定' });
    }
    if (escaped) {
      enc = patchCombatant(enc, aiId, { flags: { ...ai.flags, fled: true } });
      return log(enc, `${ai.name} 成功脱离了战斗`, 'narrative');
    }
    return log(enc, `${ai.name} 想要逃跑，却被拦了下来`, 'narrative');
  }
  return performAttack(enc, aiId, action.targetId, 0, rng);
}

/** 从当前位置推进，依次跑完所有 AI 回合，直到轮到玩家或战斗结束。返回 {enc, ended}。 */
export function advanceUntilPlayerOrEnd(enc0: Encounter, rng: Rng = defaultRng): Encounter {
  let enc = enc0;
  let guard = 0;
  while (guard++ < 200) {
    if (checkEndReason(enc)) { return { ...enc, status: 'resolving', endReason: checkEndReason(enc)! }; }
    enc = advanceTurn(enc);
    const cur = byId(enc, enc.turnOrder[enc.currentIdx]);
    if (!cur || !alive(cur)) continue;          // 跳过已倒下者
    if (cur.controlledBy === 'player') return enc; // 轮到玩家，停
    enc = runAiTurn(enc, cur.id, rng);             // AI 行动
  }
  return enc;
}

// ── 玩家动作（每个动作后跑完 AI 回合，返回新 Encounter）──

export function playerAttack(enc0: Encounter, weaponIdx: number, rng: Rng = defaultRng): Encounter {
  const player = enc0.combatants.find((c) => c.faction === 'player');
  if (!player || !enc0.playerTargetId) return enc0;
  const enc = performAttack(enc0, player.id, enc0.playerTargetId, weaponIdx, rng);
  const end = checkEndReason(enc);
  if (end) return { ...enc, status: 'resolving', endReason: end };
  return advanceUntilPlayerOrEnd(enc, rng);
}

/** 换弹：玩家武器从库存(reserveAvailable)补满；返回 {enc, consumed} consumed=实际消耗备弹数(玩家据此扣库存)。 */
export function playerReload(enc0: Encounter, weaponIdx: number, reserveAvailable: number, rng: Rng = defaultRng): { encounter: Encounter; consumed: number } {
  const player = enc0.combatants.find((c) => c.faction === 'player');
  const weapon = player?.weapons[weaponIdx];
  if (!player || !weapon || !canReload(weapon, reserveAvailable)) return { encounter: enc0, consumed: 0 };
  const need = (weapon.magazine ?? 0) - (weapon.loadedAmmo ?? 0);
  const consumed = Math.min(need, reserveAvailable);
  let enc = patchCombatant(enc0, player.id, {
    weapons: player.weapons.map((w, i) => (i === weaponIdx ? { ...w, loadedAmmo: (w.loadedAmmo ?? 0) + consumed } : w)),
  });
  enc = log(enc, `${player.name} 装填了 ${consumed} 发`, 'narrative');
  const end = checkEndReason(enc);
  if (end) return { encounter: { ...enc, status: 'resolving', endReason: end }, consumed };
  return { encounter: advanceUntilPlayerOrEnd(enc, rng), consumed };
}

/** 排除卡壳：机械维修/射击检定成功则清除卡壳。 */
export function playerClearJam(enc0: Encounter, weaponIdx: number, rng: Rng = defaultRng): Encounter {
  const player = enc0.combatants.find((c) => c.faction === 'player');
  if (!player) return enc0;
  const weapon = player.weapons[weaponIdx];
  const r = d100WithDice(0, 0, rng);
  const ok = successLevel(r.finalRoll, weapon?.skill ?? 30) !== 'fail' && successLevel(r.finalRoll, weapon?.skill ?? 30) !== 'fumble';
  let enc = rec(enc0, { skill: `${player.name}·排除故障`, roll: String(r.finalRoll), target: String(weapon?.skill ?? 30), type: diceTypeFor(r.finalRoll, weapon?.skill ?? 30), purpose: '排除故障' });
  if (ok) enc = patchCombatant(enc, player.id, { flags: { ...player.flags, weaponJammed: false } });
  enc = log(enc, ok ? `${player.name} 排除了卡壳` : `${player.name} 未能排除卡壳`, 'narrative');
  const end = checkEndReason(enc);
  if (end) return { ...enc, status: 'resolving', endReason: end };
  return advanceUntilPlayerOrEnd(enc, rng);
}

/** 呼救：对某友善旁观者掷 d100 ≤ joinChance 则加入为 ally，否则逃离(移出 bystanders)。 */
export function playerCallForHelp(enc0: Encounter, bystanderId: string, rng: Rng = defaultRng): Encounter {
  const by = enc0.bystanders.find((b) => b.id === bystanderId && b.friendly);
  if (!by) return enc0;
  const roll = Math.floor(rng() * 100) + 1;
  let enc = { ...enc0, bystanders: enc0.bystanders.filter((b) => b.id !== bystanderId) };
  enc = rec(enc, { skill: `呼救·${by.name}`, roll: String(roll), target: String(by.joinChance), type: roll <= by.joinChance ? 'success' : 'failure', purpose: '呼救' });
  if (roll <= by.joinChance && by.combatant) {
    const ally: Combatant = { ...by.combatant, faction: 'ally', controlledBy: 'ai' };
    const combatants = [...enc.combatants, ally];
    enc = { ...enc, combatants, turnOrder: nextTurnOrder(combatants) };
    enc = log(enc, `${by.name} 响应呼救，加入战斗！`, 'narrative');
  } else {
    enc = log(enc, `${by.name} 没有出手，转身逃离`, 'narrative');
  }
  const end = checkEndReason(enc);
  if (end) return { ...enc, status: 'resolving', endReason: end };
  return advanceUntilPlayerOrEnd(enc, rng);
}

/** 逃跑：一次速度检定(CON)，成功→脱战(flee)，失败→仍被困继续(AI 行动)。 */
export function playerFlee(enc0: Encounter, rng: Rng = defaultRng): Encounter {
  const player = enc0.combatants.find((c) => c.faction === 'player');
  if (!player) return enc0;
  const r = d100WithDice(0, 0, rng);
  const ok = successLevel(r.finalRoll, player.con) !== 'fail' && successLevel(r.finalRoll, player.con) !== 'fumble';
  let enc = rec(enc0, { skill: `${player.name}·速度检定`, roll: String(r.finalRoll), target: String(player.con), type: diceTypeFor(r.finalRoll, player.con), purpose: '速度检定' });
  if (ok) {
    enc = log(enc, `${player.name} 成功脱离了战斗`, 'narrative');
    return { ...enc, status: 'resolving', endReason: 'flee' };
  }
  enc = log(enc, `${player.name} 逃跑失败，仍被缠住`, 'narrative');
  return advanceUntilPlayerOrEnd(enc, rng);
}
