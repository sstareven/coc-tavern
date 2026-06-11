import type { Encounter, Combatant, CombatEndReason, CombatLogEntry, CombatRollViz, DiceRecord, DiceResultType, ManeuverKind } from '../types';
import {
  type Rng, type SuccessLevel, type OpposedResult,
  successLevel, resolveOpposed, resolveRanged, rollDamage, applyDamage,
  isImpaleLevel, outnumberBonusDice, nextTurnOrder, decideAiAction,
  consumeAmmo, canReload, canFire, d100WithDice, buildAndDamageBonus,
  rollDamageFormula,
} from './combat-engine';
import { useCharSheetStore } from '../stores/useCharSheetStore';
import { useSettingsStore } from '../stores/useSettingsStore';

const defaultRng: Rng = Math.random;

/** 开场对抗预设：复用「选项里那次对抗掷骰」作为进面板的第一次判定（跳过引擎重掷）。 */
export interface OpeningPreset {
  op: OpposedResult;
  defenderValue: number;
  defense: 'dodge' | 'fightback';
}

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

/**
 * 校准玩家锁定目标:若当前 playerTargetId 指向已倒下/脱离的敌人,自动切到下一个活敌。
 * 不修则 performAttack 看 target 已死就静默 return,playerAttack 仍走 advanceUntilPlayerOrEnd,
 * 把回合直接推到 AI——玩家屏幕上就是「我点攻击,对方在投骰」。
 */
function reaimPlayerTarget(enc: Encounter): Encounter {
  const cur = enc.playerTargetId ? byId(enc, enc.playerTargetId) : null;
  if (cur && alive(cur)) return enc;
  const next = enc.combatants.find((c) => c.faction === 'enemy' && alive(c));
  return { ...enc, playerTargetId: next?.id ?? null };
}

function log(enc: Encounter, text: string, kind: CombatLogEntry['kind'] = 'roll', rolls?: CombatRollViz[]): Encounter {
  return { ...enc, log: [...enc.log, { kind, text, ...(rolls && rolls.length ? { rolls } : {}) }] };
}
function rec(enc: Encounter, r: Omit<DiceRecord, 'time'>): Encounter {
  return { ...enc, diceRecords: [...enc.diceRecords, { ...r, time: 0, context: 'combat' }] };
}

const LEVEL_CN: Record<SuccessLevel, string> = {
  critical: '大成功', extreme: '极难成功', hard: '困难成功', success: '成功', fail: '失败', fumble: '大失败',
};

/** 倒地(被压制)：COC7e 战技劣势效果——攻方对其 +1 奖励骰，守方防御吃 +1 惩罚骰。 */
function proneMods(target: Combatant): { atkBonus: number; defPenalty: number; note: string } {
  return target.flags.prone ? { atkBonus: 1, defPenalty: 1, note: '(倒地·劣势)' } : { atkBonus: 0, defPenalty: 0, note: '' };
}

/**
 * 起身：清除倒地(prone)标记。
 * COC7e「俯卧」可选规则——倒地角色轮到自己时须先起身再行动；起身消耗本回合移动，
 * 故倒地者【当回合无法脱离战斗】(脱离=追逐，需移动)，但起身后仍可做不需移动的近战攻击。
 * 非倒地则原样返回。
 */
function standUp(enc: Encounter, id: string): Encounter {
  const c = byId(enc, id);
  if (!c?.flags.prone) return enc;
  return patchCombatant(enc, id, { flags: { ...c.flags, prone: false } });
}

/** 检定滚骰演示：攻击骰 + 守方闪避/反击骰（同投，按成功等级配色）。actor=行动者 id。 */
function checkViz(actor: string, atkLabel: string, atkRoll: number, atkLevel: SuccessLevel, atkTarget: number, defLabel: string, defRoll: number, defLevel: SuccessLevel, defTarget: number): CombatRollViz {
  return { title: '检定', actor, dice: [
    { value: atkRoll, faces: 100, type: LEVEL_TO_DICE_TYPE[atkLevel], caption: `${atkLabel} ≤${atkTarget}` },
    { value: defRoll, faces: 100, type: LEVEL_TO_DICE_TYPE[defLevel], caption: `${defLabel} ≤${defTarget}` },
  ] };
}
/** 单骰检定演示（火器射击，无对抗守骰）。actor=行动者 id。 */
function singleViz(actor: string, label: string, roll: number, level: SuccessLevel, target: number): CombatRollViz {
  return { title: '射击', actor, dice: [{ value: roll, faces: 100, type: LEVEL_TO_DICE_TYPE[level], caption: `${label} ≤${target}` }] };
}
/** 伤害滚骰演示（多骰同投）；hp=该伤害造成的掉血过渡(血条延后到骰子滚定才下降)。 */
function dmgViz(total: number, dice: { value: number; faces: number }[], hp?: { id: string; from: number; to: number; max: number }): CombatRollViz {
  return { title: '伤害', damage: true, total, dice: dice.map((d) => ({ value: d.value, faces: d.faces })), ...(hp ? { hp } : {}) };
}
/** 拼伤害式 base(+|-)db，避免 db 自带正负号时出现双号（如 '1D3'+'+1D6' → '1D3+1D6'）。 */
function joinDmg(base: string, db: string): string {
  if (!db || db === '0') return base;
  return /^[+-]/.test(db) ? `${base}${db}` : `${base}+${db}`;
}

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

/** 推进到下一个行动者；轮内全员走完→新一轮（重排 turnOrder、清 roundDefenses）。
 *  A2.5：每次推进顺手把玩家的 temporaryInsanity.roundsLeft 倒计时一回合；归 0 时清 active 标志。
 *  直接 setSheet（不走 MVU corrective 通道）——这是引擎驱动的派生状态推进，非 LLM 输出，避免被
 *  MVU 快照系统视作"本回合写入"产生伪失败。 */
export function advanceTurn(enc: Encounter): Encounter {
  const next = enc.currentIdx + 1;
  if (next >= enc.turnOrder.length) {    // 新一轮：重排（排除死亡/昏迷）、清防御计数
    // A2.5：临时疯狂回合倒计时 — 仅在一个完整回合结束时递减（非每个行动者），与 COC 7e 规则对齐。
    const sheet = useCharSheetStore.getState().sheet;
    const ti = sheet.temporaryInsanity;
    if (ti.active && ti.roundsLeft > 0) {
      const nextRoundsLeft = ti.roundsLeft - 1;
      const stillActive = nextRoundsLeft > 0;
      useCharSheetStore.getState().setSheet({
        ...sheet,
        temporaryInsanity: {
          ...ti,
          active: stillActive,
          roundsLeft: nextRoundsLeft,
          ...(stillActive ? {} : { bout: undefined }),
        },
      });
    }
    const cleared = enc.combatants.map((c) => ({ ...c, roundDefenses: 0 }));
    const order = nextTurnOrder(cleared);
    return { ...enc, combatants: cleared, turnOrder: order, currentIdx: 0, round: enc.round + 1 };
  }
  return { ...enc, currentIdx: next };
}

/** 一次攻击结算（attacker 用 weaponIdx 攻击 targetId）。处理近战对抗/射击/伤害/贯穿/卡壳/弹药/寡不敌众。
 *  forcedDefense:由玩家在 UI 选择(dodge/fightback)时传入,覆盖默认决策(AI 倾向规则);仅近战路径使用,远程攻击不受影响。
 */
export function performAttack(enc0: Encounter, attackerId: string, targetId: string, weaponIdx: number, rng: Rng = defaultRng, preset?: OpeningPreset, forcedDefense?: 'dodge' | 'fightback'): Encounter {
  let enc = enc0;
  const attacker = byId(enc, attackerId);
  const target = byId(enc, targetId);
  if (!attacker || !target || !alive(attacker) || !alive(target)) return enc;
  const weapon = attacker.weapons[weaponIdx] ?? attacker.weapons[0];
  if (!weapon) return enc;
  const dmgFormula = (db: string) => joinDmg(weapon.damage, db);

  if (weapon.ranged) {
    if (!canFire(weapon) || attacker.flags.weaponJammed) {
      return log(enc, `${attacker.name} 的 ${weapon.name} 无法击发`, 'narrative');
    }
    const r = resolveRanged(weapon.skill, 'normal', rng);
    enc = patchCombatant(enc, attackerId, { weapons: attacker.weapons.map((w, i) => (i === weaponIdx ? consumeAmmo(w) : w)) });
    enc = rec(enc, { skill: `${attacker.name}·${weapon.name}`, roll: String(r.roll.finalRoll), target: String(weapon.skill), type: LEVEL_TO_DICE_TYPE[r.level], purpose: '攻击命中-火器' });
    const aViz = singleViz(attackerId, weapon.name, r.roll.finalRoll, r.level, weapon.skill);
    const hitLine = `${attacker.name} 用${weapon.name}射击 d100=${r.roll.finalRoll}/${weapon.skill}（${LEVEL_CN[r.level]}）`;
    if (r.jam) {
      enc = patchCombatant(enc, attackerId, { flags: { ...attacker.flags, weaponJammed: true } });
      return log(enc, `${hitLine} — ${weapon.name}卡壳！`, 'roll', [aViz]);
    }
    if (!r.hit) return log(enc, `${hitLine} → 未命中 ${target.name}`, 'roll', [aViz]);
    const impale = isImpaleLevel(r.level);
    const dmgRoll = rollDamage(weapon, '0', impale, rng); // 火器不加 DB(COC7e)
    const hpBefore = target.hp;
    const dr = applyDamage(target, dmgRoll.total);
    enc = patchCombatant(enc, targetId, { hp: dr.combatant.hp, flags: dr.combatant.flags });
    return log(enc, `${hitLine}${impale ? '·贯穿' : ''} → 命中，伤害 ${weapon.damage}=${dmgRoll.total}，${target.name} HP ${hpBefore}→${dr.combatant.hp}/${target.maxHp}`, 'roll', [aViz, dmgViz(dmgRoll.total, dmgRoll.dice, { id: targetId, from: hpBefore, to: dr.combatant.hp, max: target.maxHp })]);
  }

  // 近战对抗：preset > forcedDefense(玩家UI选择) > 默认决策(AI 倾向)。
  const wantFlee = (target.tendency?.flee ?? 0) > (target.tendency?.attack ?? 0);
  const defense: 'dodge' | 'fightback' = preset ? preset.defense
    : forcedDefense ? forcedDefense
    : ((target.controlledBy === 'ai' && !wantFlee && target.fighting >= target.dodge) ? 'fightback' : 'dodge');
  const defenderValue = preset ? preset.defenderValue : (defense === 'fightback' ? target.fighting : target.dodge);
  const pm = proneMods(target); // 倒地(被压制)：攻方+1奖励骰、守方防御+1惩罚骰
  const bonus = outnumberBonusDice(target) + pm.atkBonus; // 守方本轮已防御→攻方得奖励骰
  const op = preset ? preset.op : resolveOpposed(weapon.skill, target.fighting, defenderValue, 0, defense, rng, bonus, 0, 0, pm.defPenalty);
  enc = patchCombatant(enc, targetId, { roundDefenses: target.roundDefenses + 1 });
  enc = rec(enc, { skill: `${attacker.name}·${weapon.name}`, roll: String(op.attackerRoll.finalRoll), target: String(weapon.skill), type: LEVEL_TO_DICE_TYPE[op.attackerLevel], purpose: '攻击命中-近战' });
  const defLabel = defense === 'dodge' ? '闪避' : '反击';
  enc = rec(enc, { skill: `${target.name}·${defLabel}`, roll: String(op.defenderRoll.finalRoll), target: String(defenderValue), type: LEVEL_TO_DICE_TYPE[op.defenderLevel], purpose: defense === 'dodge' ? '闪避' : '格斗反击' });
  const atkLine = `${attacker.name} 用${weapon.name} d100=${op.attackerRoll.finalRoll}/${weapon.skill}（${LEVEL_CN[op.attackerLevel]}）`;
  const defLine = `${target.name} ${defLabel}${pm.note} d100=${op.defenderRoll.finalRoll}/${defenderValue}（${LEVEL_CN[op.defenderLevel]}）`;
  enc = log(enc, `${atkLine} ｜ ${defLine}`, 'roll', [checkViz(attackerId, weapon.name, op.attackerRoll.finalRoll, op.attackerLevel, weapon.skill, defLabel, op.defenderRoll.finalRoll, op.defenderLevel, defenderValue)]); // 第一行：检定判断(攻击+守骰)

  if (op.winner === 'attacker') {
    const impale = isImpaleLevel(op.attackerLevel); // 主动攻击极难/大成功→贯穿
    const db = attacker.damageBonus ?? '0';
    const dmgRoll = rollDamage(weapon, db, impale, rng);
    const hpBefore = target.hp;
    const dr = applyDamage(target, dmgRoll.total);
    enc = patchCombatant(enc, targetId, { hp: dr.combatant.hp, flags: dr.combatant.flags, roundDefenses: target.roundDefenses + 1 });
    return log(enc, `命中：${attacker.name} ${LEVEL_CN[op.attackerLevel]} 压过 ${target.name}${defLabel} ${LEVEL_CN[op.defenderLevel]}${impale ? '·贯穿' : ''} → 伤害 ${dmgFormula(db)}=${dmgRoll.total}，${target.name} HP ${hpBefore}→${dr.combatant.hp}/${target.maxHp}`, 'roll', [dmgViz(dmgRoll.total, dmgRoll.dice, { id: targetId, from: hpBefore, to: dr.combatant.hp, max: target.maxHp })]);
  }
  if (op.winner === 'defender' && defense === 'fightback') {
    const cw = target.weapons[0] ?? weapon;
    const cdb = target.damageBonus ?? '0';
    const dmgRoll = rollDamage(cw, cdb, false, rng); // 反击不贯穿
    const hpBefore = attacker.hp;
    const dr = applyDamage(attacker, dmgRoll.total);
    enc = patchCombatant(enc, attackerId, { hp: dr.combatant.hp, flags: dr.combatant.flags });
    return log(enc, `${target.name} 反击得手（${LEVEL_CN[op.defenderLevel]} 压过 ${LEVEL_CN[op.attackerLevel]}）→ ${attacker.name} 受 ${cw.damage}=${dmgRoll.total} 伤，HP ${hpBefore}→${dr.combatant.hp}/${attacker.maxHp}`, 'roll', [dmgViz(dmgRoll.total, dmgRoll.dice, { id: attackerId, from: hpBefore, to: dr.combatant.hp, max: attacker.maxHp })]);
  }
  if (op.winner === 'defender') return log(enc, `${attacker.name} 被 ${target.name}${defLabel}化解（${LEVEL_CN[op.defenderLevel]} ≥ ${LEVEL_CN[op.attackerLevel]}）`);
  return log(enc, `${attacker.name} 与 ${target.name} 均未得手`);
}

/** 单个 AI 行动者的回合：按倾向决策攻击/逃跑/急救(ally)。 */
export function runAiTurn(enc0: Encounter, aiId: string, rng: Rng = defaultRng): Encounter {
  let enc = enc0;
  const ai = byId(enc, aiId);
  if (!ai || !alive(ai) || ai.controlledBy !== 'ai') return enc;
  // ally 用 settings.npcAutoTendency;enemy 用默认 'mixed'(对 enemy 无 ally 急救分支,等同 attack)
  const mode = ai.faction === 'ally' ? useSettingsStore.getState().npcAutoTendency : 'mixed';
  const action = decideAiAction(ai, enc, rng, mode);
  // 倒地者轮到自己先起身(COC7e 俯卧规则)。起身消耗本回合移动：
  // 选逃则本回合只能起身、无法脱离(下回合才能真正逃)；选攻则起身后照常近战(不需移动)。
  if (ai.flags.prone) {
    enc = standUp(enc, aiId);
    if (action.type === 'flee') {
      return log(enc, `${ai.name} 倒在地上，先挣扎着起身，未能在本回合脱离战斗`, 'narrative');
    }
    enc = log(enc, `${ai.name} 从地上起身，随即发难`, 'narrative');
  }
  // ally 急救分支(COC7e p61:急救成功 1d3 HP,大成功 1d3+1,且稳定 dying)
  if (action.type === 'firstAid') {
    const targetC = byId(enc, action.targetId);
    if (!targetC || !alive(targetC)) {
      return log(enc, `${ai.name} 想去急救但目标已不可救`, 'narrative');
    }
    const firstAidSkill = ai.firstAid ?? 30;
    const r = d100WithDice(0, 0, rng);
    const lvl = successLevel(r.finalRoll, firstAidSkill);
    enc = rec(enc, {
      skill: `${ai.name}·急救`,
      roll: String(r.finalRoll),
      target: String(firstAidSkill),
      type: diceTypeFor(r.finalRoll, firstAidSkill),
      purpose: '急救检定',
    });
    if (lvl === 'fail' || lvl === 'fumble') {
      return log(enc, `${ai.name} 试图为 ${targetC.name} 急救 — 失败`, 'narrative');
    }
    // 成功:1d3 HP;大成功(critical/extreme)再 +1。clamp 到 maxHp。稳定 dying。
    const heal = rollDamageFormula('1d3', rng).total + ((lvl === 'critical' || lvl === 'extreme') ? 1 : 0);
    const newHp = Math.min(targetC.maxHp, targetC.hp + heal);
    enc = patchCombatant(enc, targetC.id, {
      hp: newHp,
      flags: { ...targetC.flags, dying: false },
    });
    return log(enc, `${ai.name} 为 ${targetC.name} 急救 — +${heal} HP`, 'narrative');
  }
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
  // AI 近战攻击玩家时挂起,等玩家在 UI 选择「闪避/反击」(远程攻击直接结算,规则书 p93:被射击不能反击/闪避)。
  const targetC = byId(enc, action.targetId);
  const weapon0 = ai.weapons[0];
  if (targetC?.controlledBy === 'player' && weapon0 && !weapon0.ranged) {
    return { ...enc, pendingDefense: { attackerId: aiId, kind: 'attack', weaponIdx: 0 } };
  }
  return performAttack(enc, aiId, action.targetId, 0, rng);
}

/** 从当前位置推进，依次跑完所有 AI 回合，直到轮到玩家或战斗结束。返回 {enc, ended}。 */
export function advanceUntilPlayerOrEnd(enc0: Encounter, rng: Rng = defaultRng): Encounter {
  let enc = enc0;
  let guard = 0;
  while (guard++ < 200) {
    if (enc.pendingDefense) return enc; // AI 攻击玩家挂起,UI 显示防御按钮组,等玩家 resolvePlayerDefense
    if (checkEndReason(enc)) { return { ...enc, status: 'resolving', endReason: checkEndReason(enc)! }; }
    enc = advanceTurn(enc);
    const cur = byId(enc, enc.turnOrder[enc.currentIdx]);
    if (!cur || !alive(cur)) continue;          // 跳过已倒下者
    if (cur.controlledBy === 'player') return reaimPlayerTarget(enc); // 轮到玩家,顺手把死目标切到下一个活敌
    enc = runAiTurn(enc, cur.id, rng);             // AI 行动
  }
  return enc;
}

/**
 * 玩家在 UI 选择防御方式后调用:消费 pendingDefense,把玩家的 defense 选择交给 performAttack/performManeuver
 * 结算这一次 AI 攻击,然后继续推进 AI 回合(advanceUntilPlayerOrEnd)。
 * choice='dodge'|'fightback':近战攻击的二选一;'maneuver-counter':战技攻击专用第三项(规则书 p89)。
 */
export function resolvePlayerDefense(
  enc0: Encounter,
  choice: 'dodge' | 'fightback' | 'maneuver-counter',
  rng: Rng = defaultRng,
): Encounter {
  const pd = enc0.pendingDefense;
  if (!pd) return enc0;
  const player = enc0.combatants.find((c) => c.faction === 'player');
  if (!player) return { ...enc0, pendingDefense: null };
  let enc: Encounter = { ...enc0, pendingDefense: null };
  if (pd.kind === 'attack') {
    // 近战只能 dodge/fightback;maneuver-counter 误选时按 fightback 处理(规则书:战技反击属于战技攻击专属)
    const def: 'dodge' | 'fightback' = choice === 'fightback' || choice === 'maneuver-counter' ? 'fightback' : 'dodge';
    enc = performAttack(enc, pd.attackerId, player.id, pd.weaponIdx ?? 0, rng, undefined, def);
  } else if (pd.kind === 'maneuver' && pd.maneuverKind) {
    enc = performManeuver(enc, pd.attackerId, player.id, pd.maneuverKind, rng, choice);
  }
  const end = checkEndReason(enc);
  if (end) return { ...enc, status: 'resolving', endReason: end };
  return advanceUntilPlayerOrEnd(enc, rng);
}

// ── 玩家动作（每个动作后跑完 AI 回合，返回新 Encounter）──

export function playerAttack(enc0: Encounter, weaponIdx: number, rng: Rng = defaultRng, preset?: OpeningPreset): Encounter {
  const enc1 = reaimPlayerTarget(enc0); // 目标已死/脱离则自动切下一个活敌,避免 performAttack 静默 return 把回合让给 AI
  const player = enc1.combatants.find((c) => c.faction === 'player');
  if (!player || !enc1.playerTargetId) return enc1;
  const enc = performAttack(standUp(enc1, player.id), player.id, enc1.playerTargetId, weaponIdx, rng, preset); // 倒地先起身再近战(COC7e 俯卧规则)
  const end = checkEndReason(enc);
  if (end) return { ...enc, status: 'resolving', endReason: end };
  return advanceUntilPlayerOrEnd(enc, rng);
}

const MANEUVER_CN: Record<ManeuverKind, string> = { disarm: '缴械', grapple: '擒抱', shove: '推倒', knockout: '击晕' };
const buildOf = (c: Combatant): number => buildAndDamageBonus(c.str, c.siz).build;

/**
 * 一次战技结算（COC7e 6.3）：①体格比较（目标比攻方大≥3→无效，否则差额转攻方惩罚骰，上限2）
 * ②格斗 vs 闪避/反击 对抗 ③攻方胜施加 prone/weaponJammed 代理效果（不致伤），守方反击胜→攻方受伤。
 * forcedDefense:玩家在 UI 三选一(dodge/fightback/maneuver-counter)时传入。
 *  - dodge:闪避(用 dodge 对抗,赢则化解)
 *  - fightback:格斗反击(用 fighting 对抗,赢则对攻方致伤)
 *  - maneuver-counter:战技反击(对抗同 fightback,但赢了【施加同战技效果给攻方】而非致伤,规则书 p89)
 */
export function performManeuver(enc0: Encounter, attackerId: string, targetId: string, kind: ManeuverKind, rng: Rng = defaultRng, forcedDefense?: 'dodge' | 'fightback' | 'maneuver-counter'): Encounter {
  let enc = enc0;
  const attacker = byId(enc, attackerId);
  const target = byId(enc, targetId);
  if (!attacker || !target || !alive(attacker) || !alive(target)) return enc;
  const cn = MANEUVER_CN[kind];

  // ① 体格比较：diff = 目标 build − 攻方 build
  const diff = buildOf(target) - buildOf(attacker);
  if (diff >= 3) return log(enc, `${attacker.name} 试图${cn} ${target.name}，但目标体格过于庞大，战技无效`);
  // 缴械需目标确实持有武器（仅徒手/空手则无从缴械）
  if (kind === 'disarm' && !target.weapons.some((w) => w.name !== '徒手')) {
    return log(enc, `${attacker.name} 试图缴械 ${target.name}，但对方手无寸铁，无从缴械`);
  }
  const penaltyDice = Math.max(0, Math.min(2, diff)); // 目标更大→攻方惩罚骰

  // ② 对抗：forcedDefense > AI 默认决策(反击或闪避,取决于格斗/闪避值)
  const wantFlee = (target.tendency?.flee ?? 0) > (target.tendency?.attack ?? 0);
  const defense: 'dodge' | 'fightback' | 'maneuver-counter' = forcedDefense
    ?? ((target.controlledBy === 'ai' && !wantFlee && target.fighting >= target.dodge) ? 'fightback' : 'dodge');
  // 战技反击的对抗机制与 fightback 同(用 target.fighting),仅胜负效果不同
  const opDefense: 'dodge' | 'fightback' = defense === 'dodge' ? 'dodge' : 'fightback';
  const defenderValue = opDefense === 'fightback' ? target.fighting : target.dodge;
  const pm = proneMods(target); // 倒地：攻方+1奖励骰、守方防御+1惩罚骰
  const bonus = outnumberBonusDice(target) + pm.atkBonus;
  const op = resolveOpposed(attacker.fighting, target.fighting, defenderValue, 0, opDefense, rng, bonus, penaltyDice, 0, pm.defPenalty);
  enc = patchCombatant(enc, targetId, { roundDefenses: target.roundDefenses + 1 });
  enc = rec(enc, { skill: `${attacker.name}·${cn}`, roll: String(op.attackerRoll.finalRoll), target: String(attacker.fighting), type: LEVEL_TO_DICE_TYPE[op.attackerLevel], purpose: `战技-${cn}` });
  const defLabel = defense === 'dodge' ? '闪避' : defense === 'fightback' ? '反击' : '战技反击';
  enc = rec(enc, { skill: `${target.name}·${defLabel}`, roll: String(op.defenderRoll.finalRoll), target: String(defenderValue), type: LEVEL_TO_DICE_TYPE[op.defenderLevel], purpose: defense === 'dodge' ? '闪避' : defense === 'fightback' ? '格斗反击' : '战技反击' });
  const atkLine = `${attacker.name} ${cn} d100=${op.attackerRoll.finalRoll}/${attacker.fighting}（${LEVEL_CN[op.attackerLevel]}）`;
  const defLine = `${target.name} ${defLabel}${pm.note} d100=${op.defenderRoll.finalRoll}/${defenderValue}（${LEVEL_CN[op.defenderLevel]}）`;
  enc = log(enc, `${atkLine} ｜ ${defLine}`, 'roll', [checkViz(attackerId, cn, op.attackerRoll.finalRoll, op.attackerLevel, attacker.fighting, defLabel, op.defenderRoll.finalRoll, op.defenderLevel, defenderValue)]); // 第一行：检定判断

  // ③ 效果
  if (op.winner === 'attacker') {
    const flags = { ...target.flags };
    let effect: string;
    if (kind === 'disarm') { flags.weaponJammed = true; effect = '武器被打落，暂不可用'; }
    else if (kind === 'knockout') { flags.prone = true; effect = '被击晕，瘫倒在地'; }
    else { flags.prone = true; effect = kind === 'grapple' ? '被擒抱压制在地' : '被推倒在地'; }
    enc = patchCombatant(enc, targetId, { flags, roundDefenses: target.roundDefenses + 1 });
    return log(enc, `${attacker.name} ${cn}得手（${LEVEL_CN[op.attackerLevel]} 压过 ${LEVEL_CN[op.defenderLevel]}）→ ${target.name} ${effect}`);
  }
  if (op.winner === 'defender' && defense === 'fightback') {
    const cw = target.weapons[0] ?? { name: '徒手', skill: target.fighting, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 };
    const cdb = target.damageBonus ?? '0';
    const dmgRoll = rollDamage(cw, cdb, false, rng); // 反击不贯穿
    const hpBefore = attacker.hp;
    const dr = applyDamage(attacker, dmgRoll.total);
    enc = patchCombatant(enc, attackerId, { hp: dr.combatant.hp, flags: dr.combatant.flags });
    return log(enc, `${target.name} 反击得手（${LEVEL_CN[op.defenderLevel]} 压过 ${LEVEL_CN[op.attackerLevel]}）→ ${attacker.name} 受 ${cw.damage}=${dmgRoll.total} 伤，HP ${hpBefore}→${dr.combatant.hp}/${attacker.maxHp}`, 'roll', [dmgViz(dmgRoll.total, dmgRoll.dice, { id: attackerId, from: hpBefore, to: dr.combatant.hp, max: attacker.maxHp })]);
  }
  if (op.winner === 'defender' && defense === 'maneuver-counter') {
    // 战技反击得手:不致伤,施加同战技效果给攻方(规则书 p89)
    const aflags = { ...attacker.flags };
    let effect: string;
    if (kind === 'disarm') { aflags.weaponJammed = true; effect = '武器被打落，暂不可用'; }
    else if (kind === 'knockout') { aflags.prone = true; effect = '被击晕，瘫倒在地'; }
    else { aflags.prone = true; effect = kind === 'grapple' ? '被擒抱压制在地' : '被推倒在地'; }
    enc = patchCombatant(enc, attackerId, { flags: aflags });
    return log(enc, `${target.name} 用${cn}反击得手（${LEVEL_CN[op.defenderLevel]} 压过 ${LEVEL_CN[op.attackerLevel]}）→ ${attacker.name} ${effect}`);
  }
  if (op.winner === 'defender') return log(enc, `${attacker.name} 的${cn}被 ${target.name} 化解（${LEVEL_CN[op.defenderLevel]} ≥ ${LEVEL_CN[op.attackerLevel]}）`);
  return log(enc, `${attacker.name} 与 ${target.name} 均未得手`);
}

/** 玩家发起战技：对锁定目标 performManeuver，结算脱战，否则推进 AI 回合。 */
export function playerManeuver(enc0: Encounter, kind: ManeuverKind, rng: Rng = defaultRng): Encounter {
  const enc1 = reaimPlayerTarget(enc0); // 同 playerAttack:防目标已死时 performManeuver 静默 return 让回合让给 AI
  const player = enc1.combatants.find((c) => c.faction === 'player');
  if (!player || !enc1.playerTargetId) return enc1;
  const enc = performManeuver(standUp(enc1, player.id), player.id, enc1.playerTargetId, kind, rng); // 倒地先起身再发战技(COC7e 俯卧规则)
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
  // 倒地须先起身(COC7e 俯卧规则)，起身消耗本回合移动 → 当回合无法脱离战斗；起身后留在场，下回合可再逃。
  if (player.flags.prone) {
    const enc = log(standUp(enc0, player.id), `${player.name} 倒在地上，先起身，未能在本回合脱离战斗`, 'narrative');
    return advanceUntilPlayerOrEnd(enc, rng);
  }
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
