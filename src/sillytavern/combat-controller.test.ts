import { describe, expect, it } from 'vitest';
import type { Combatant, Encounter } from '../types';
import { checkEndReason, playerAttack, playerFlee, advanceTurn, runAiTurn, performAttack, performManeuver, resolvePlayerDefense, type OpeningPreset } from './combat-controller';
import type { Rng } from './combat-engine';

function seqRng(values: number[]): Rng { let i = 0; return () => values[i++ % values.length]; }

function mkC(over: Partial<Combatant>): Combatant {
  return {
    id: 'x', name: 'X', faction: 'enemy', controlledBy: 'ai',
    dex: 50, str: 50, siz: 50, con: 50, mov: 8, fighting: 50, dodge: 25, damageBonus: '0',
    hp: 10, maxHp: 10, armor: 0,
    weapons: [{ name: '徒手', skill: 50, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 }],
    flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: false, weaponJammed: false, fled: false, stabilized: false },
    roundDefenses: 0,
    ...over,
  } as Combatant;
}

function mkEnc(combatants: Combatant[], targetId: string | null): Encounter {
  return {
    active: true, round: 1, turnOrder: combatants.map((c) => c.id), currentIdx: 0,
    combatants, bystanders: [], playerTargetId: targetId, log: [], diceRecords: [], status: 'active',
  };
}

describe('checkEndReason', () => {
  it('全部敌人倒下→victory', () => {
    const enc = mkEnc([
      mkC({ id: 'p', faction: 'player', controlledBy: 'player' }),
      mkC({ id: 'e', faction: 'enemy', flags: { ...mkC({}).flags, dead: true } }),
    ], 'e');
    expect(checkEndReason(enc)).toBe('victory');
  });
  it('玩家倒下→defeat', () => {
    const enc = mkEnc([
      mkC({ id: 'p', faction: 'player', controlledBy: 'player', flags: { ...mkC({}).flags, unconscious: true } }),
      mkC({ id: 'e', faction: 'enemy' }),
    ], 'e');
    expect(checkEndReason(enc)).toBe('defeat');
  });
});

describe('playerAttack', () => {
  it('玩家近战命中击杀唯一敌人 → resolving/victory', () => {
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', fighting: 90, weapons: [{ name: '消防斧', skill: 90, damage: '2D6', impaling: true, ranged: false, attacksPerRound: 1 }] });
    const enemy = mkC({ id: 'e', faction: 'enemy', hp: 3, maxHp: 3, dodge: 20 });
    const enc = mkEnc([player, enemy], 'e');
    // 攻10(成功) 守70(失败) 伤2D6=6+6=12 > maxHp3 → 死
    const out = playerAttack(enc, 0, seqRng([0.0, 0.1, 0.0, 0.7, 0.9, 0.9]));
    expect(out.status).toBe('resolving');
    expect(out.endReason).toBe('victory');
  });
  // 回归:多目标战斗中,锁定目标已死时自动切到下一个活敌——否则 performAttack 静默 return,
  // playerAttack 仍走 advanceUntilPlayerOrEnd 把回合让给 AI,玩家看到"我点攻击,对方在投骰"。
  it('锁定目标已死 → 自动切到下一个活敌并实际攻击', () => {
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', fighting: 90, weapons: [{ name: '徒手', skill: 90, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 }] });
    const deadE = mkC({ id: 'e1', faction: 'enemy', hp: 0, maxHp: 6, flags: { ...mkC({}).flags, dead: true } });
    const liveE = mkC({ id: 'e2', faction: 'enemy', hp: 10, maxHp: 10, dodge: 20 });
    const enc = mkEnc([player, deadE, liveE], 'e1'); // 锁的 e1 已死
    const out = playerAttack(enc, 0, seqRng([0.0, 0.1, 0.0, 0.7, 0.9, 0.9]));
    expect(out.playerTargetId).toBe('e2'); // 自动切到活敌
    const e2 = out.combatants.find((c) => c.id === 'e2')!;
    expect(e2.hp).toBeLessThan(10);        // 攻击实际命中,造成了伤害
  });
});

describe('playerFlee', () => {
  it('速度检定成功 → resolving/flee', () => {
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', con: 60 });
    const enc = mkEnc([player, mkC({ id: 'e', faction: 'enemy' })], 'e');
    const out = playerFlee(enc, seqRng([0.0, 0.1])); // d100=10 ≤60 成功
    expect(out.status).toBe('resolving');
    expect(out.endReason).toBe('flee');
  });
});

describe('runAiTurn 逃跑（MOV/速度结算）', () => {
  it('MOV 不占优 → 速度检定成功则 fled(非 dead)', () => {
    const enemy = mkC({ id: 'e', faction: 'enemy', mov: 5, con: 50, tendency: { attack: 10, flee: 90 } });
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', mov: 10 });
    const enc = mkEnc([enemy, player], 'p');
    // decideAiAction roll=1≤fleeChance(90)→逃；MOV 5≤10→CON 速度检定 d100=10≤50 成功→fled
    const out = runAiTurn(enc, 'e', seqRng([0.0, 0.0, 0.1]));
    const e2 = out.combatants.find((c) => c.id === 'e')!;
    expect(e2.flags.fled).toBe(true);
    expect(e2.flags.dead).toBe(false);
  });
  it('MOV 占优 → 直接脱离(不掷检定)', () => {
    const enemy = mkC({ id: 'e', faction: 'enemy', mov: 12, tendency: { attack: 0, flee: 100 } });
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', mov: 7 });
    const out = runAiTurn(mkEnc([enemy, player], 'p'), 'e', seqRng([0.0]));
    expect(out.combatants.find((c) => c.id === 'e')!.flags.fled).toBe(true);
  });
});

describe('AI 近战攻击玩家时挂起 pendingDefense,玩家选 dodge/fightback 后才结算', () => {
  it('AI 近战攻击玩家 → 挂起 pendingDefense,不立即结算', () => {
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', dodge: 50, fighting: 60, hp: 10, maxHp: 10 });
    const enemy = mkC({ id: 'e', faction: 'enemy', tendency: { attack: 100, flee: 0 } });
    const enc = mkEnc([player, enemy], 'e');
    const out = runAiTurn(enc, 'e', seqRng([0.5])); // 1<=0,不逃,选攻击
    expect(out.pendingDefense).toBeTruthy();
    expect(out.pendingDefense?.attackerId).toBe('e');
    expect(out.pendingDefense?.kind).toBe('attack');
    expect(out.combatants.find((c) => c.id === 'p')!.hp).toBe(10); // 玩家 HP 未变,等玩家选
  });
  it('AI 远程攻击玩家 → 不挂起,直接结算(规则书 p93:被射击不能反击/闪避)', () => {
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', dodge: 99, hp: 20, maxHp: 20 });
    const gunner = mkC({
      id: 'e', faction: 'enemy', tendency: { attack: 100, flee: 0 },
      weapons: [{ name: '手枪', skill: 90, damage: '1D6', impaling: true, ranged: true, attacksPerRound: 1, loadedAmmo: 6, magazine: 6 }],
    });
    const enc = mkEnc([player, gunner], 'e');
    const out = runAiTurn(enc, 'e', seqRng([0.5, 0.01, 0.9, 0.9])); // 不逃,攻击命中=1,伤害=6
    expect(out.pendingDefense).toBeFalsy(); // 远程不挂起
  });
  it('玩家选 fightback → 用 player.fighting 对抗,赢了反伤 AI', () => {
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', fighting: 90, damageBonus: '0', hp: 10, maxHp: 10, weapons: [{ name: '徒手', skill: 90, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 }] });
    const enemy = mkC({ id: 'e', faction: 'enemy', fighting: 30, hp: 8, maxHp: 8 });
    // currentIdx=1=enemy,模拟 AI 刚在自己回合攻击玩家挂起;应答后 advance 到 player 即停
    const enc: Encounter = { ...mkEnc([player, enemy], 'e'), currentIdx: 1, pendingDefense: { attackerId: 'e', kind: 'attack', weaponIdx: 0 } };
    // 玩家 d100=10≤90 成功,AI d100=70/30 失败 → 玩家反击得手,AI 挨刀
    const out = resolvePlayerDefense(enc, 'fightback', seqRng([0.0, 0.7, 0.0, 0.1, 0.9, 0.9]));
    expect(out.pendingDefense).toBeFalsy(); // pendingDefense 已清空,推到 player 回合
    expect(out.combatants.find((c) => c.id === 'e')!.hp).toBeLessThan(8); // AI 挨刀
    expect(out.combatants.find((c) => c.id === 'p')!.hp).toBe(10);        // 玩家不挨刀
  });
  it('玩家选 dodge 失败 → AI 命中,玩家挨刀,没有反伤', () => {
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', dodge: 20, fighting: 40, hp: 10, maxHp: 10 });
    const enemy = mkC({ id: 'e', faction: 'enemy', fighting: 80, damageBonus: '0', weapons: [{ name: '匕首', skill: 80, damage: '1D4', impaling: true, ranged: false, attacksPerRound: 1 }] });
    const enc: Encounter = { ...mkEnc([player, enemy], 'e'), currentIdx: 1, pendingDefense: { attackerId: 'e', kind: 'attack', weaponIdx: 0 } };
    // AI d100=10/80 成功, 玩家闪避 d100=70/20 失败 → AI 命中。本次结算完会推到下一轮,enemy.fighting>player → 可能再挂起,不强求
    const out = resolvePlayerDefense(enc, 'dodge', seqRng([0.0, 0.1, 0.0, 0.7, 0.5, 0.5, 0.5, 0.5]));
    expect(out.combatants.find((c) => c.id === 'p')!.hp).toBeLessThan(10); // 关键:玩家挨刀
    expect(out.combatants.find((c) => c.id === 'e')!.hp).toBe(10);          // dodge 不反伤
  });
});

describe('倒地(prone)者须先起身，当回合不可脱离战斗（COC7e 俯卧规则）', () => {
  const prone = (over: Partial<Combatant>) =>
    mkC({ ...over, flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: true, weaponJammed: false, fled: false, stabilized: false } });

  it('倒地 AI 选逃 → 本回合只起身(prone清)，不脱离(fled仍false、仍在战斗)', () => {
    // MOV 占优本会「直接脱离」，但倒地必须先起身 → 不脱离
    const enemy = prone({ id: 'e', faction: 'enemy', mov: 12, tendency: { attack: 0, flee: 100 } });
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', mov: 7 });
    const out = runAiTurn(mkEnc([enemy, player], 'p'), 'e', seqRng([0.0]));
    const e2 = out.combatants.find((c) => c.id === 'e')!;
    expect(e2.flags.fled).toBe(false);   // 没逃成
    expect(e2.flags.prone).toBe(false);  // 已起身
    expect(out.status).not.toBe('resolving');
  });

  it('倒地 AI 选攻 → 先起身(prone清)随即攻击', () => {
    const enemy = prone({ id: 'e', faction: 'enemy', fighting: 90, tendency: { attack: 100, flee: 0 } });
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', dodge: 10, hp: 12, maxHp: 12 });
    // roll: decideAiAction(攻) → performAttack(攻击/闪避/伤害)
    const out = runAiTurn(mkEnc([enemy, player], 'e'), 'e', seqRng([0.9, 0.0, 0.1, 0.9, 0.5, 0.5]));
    expect(out.combatants.find((c) => c.id === 'e')!.flags.prone).toBe(false); // 起身了
  });

  it('倒地玩家点逃跑 → 先起身(prone清)，本回合不脱离(非 resolving/flee)', () => {
    const player = prone({ id: 'p', faction: 'player', controlledBy: 'player', con: 99 }); // CON 极高也不该当回合逃成
    const enc = mkEnc([player, mkC({ id: 'e', faction: 'enemy', tendency: { attack: 100, flee: 0 } })], 'e');
    const out = playerFlee(enc, seqRng([0.0, 0.1, 0.9, 0.9, 0.5, 0.5]));
    const p2 = out.combatants.find((c) => c.id === 'p')!;
    expect(p2.flags.prone).toBe(false);  // 已起身
    expect(out.endReason).not.toBe('flee'); // 本回合未脱离
  });
});

describe('advanceTurn', () => {
  it('轮内推进 currentIdx；越界则新一轮+清防御计数', () => {
    const enc = mkEnc([mkC({ id: 'a', faction: 'player', controlledBy: 'player', dex: 70 }), mkC({ id: 'b', dex: 40, roundDefenses: 2 })], 'b');
    expect(advanceTurn(enc).currentIdx).toBe(1);
    const wrapped = advanceTurn({ ...enc, currentIdx: 1 });
    expect(wrapped.round).toBe(2);
    expect(wrapped.currentIdx).toBe(0);
    expect(wrapped.combatants.every((c) => c.roundDefenses === 0)).toBe(true);
  });
});

describe('performManeuver（COC7e 6.3 战技）', () => {
  it('目标体格大攻方≥3 → 战技无效，不施加效果', () => {
    const attacker = mkC({ id: 'p', faction: 'player', controlledBy: 'player', str: 50, siz: 50 }); // build 0
    const target = mkC({ id: 'e', faction: 'enemy', str: 150, siz: 150 });                          // 300 → build 4
    const out = performManeuver(mkEnc([attacker, target], 'e'), 'p', 'e', 'grapple', seqRng([0.5]));
    const e2 = out.combatants.find((c) => c.id === 'e')!;
    expect(e2.flags.prone).toBe(false);
    expect(out.log.some((l) => l.text.includes('无效'))).toBe(true);
  });

  it('擒抱攻方胜 → 目标 prone，不致伤', () => {
    const attacker = mkC({ id: 'p', faction: 'player', controlledBy: 'player', str: 50, siz: 50, fighting: 80 });
    const target = mkC({ id: 'e', faction: 'enemy', str: 50, siz: 50, fighting: 5, dodge: 30, hp: 12, maxHp: 12 });
    // 攻 d100=10(极难成功) 守 d100=95(失败) → 攻方胜
    const out = performManeuver(mkEnc([attacker, target], 'e'), 'p', 'e', 'grapple', seqRng([0.0, 0.1, 0.5, 0.9]));
    const e2 = out.combatants.find((c) => c.id === 'e')!;
    expect(e2.flags.prone).toBe(true);
    expect(e2.hp).toBe(12);
  });

  it('缴械攻方胜 → 目标 weaponJammed', () => {
    const attacker = mkC({ id: 'p', faction: 'player', controlledBy: 'player', str: 50, siz: 50, fighting: 80 });
    const target = mkC({ id: 'e', faction: 'enemy', str: 50, siz: 50, fighting: 5, dodge: 30, weapons: [{ name: '匕首', skill: 30, damage: '1D4', impaling: true, ranged: false, attacksPerRound: 1 }] });
    const out = performManeuver(mkEnc([attacker, target], 'e'), 'p', 'e', 'disarm', seqRng([0.0, 0.1, 0.5, 0.9]));
    expect(out.combatants.find((c) => c.id === 'e')!.flags.weaponJammed).toBe(true);
  });

  it('缴械目标仅徒手 → 无从缴械，战技无效', () => {
    const attacker = mkC({ id: 'p', faction: 'player', controlledBy: 'player', str: 50, siz: 50, fighting: 80 });
    const target = mkC({ id: 'e', faction: 'enemy', str: 50, siz: 50, weapons: [{ name: '徒手', skill: 50, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 }] });
    const out = performManeuver(mkEnc([attacker, target], 'e'), 'p', 'e', 'disarm', seqRng([0.0, 0.1, 0.5, 0.9]));
    expect(out.combatants.find((c) => c.id === 'e')!.flags.weaponJammed).toBe(false);
    expect(out.log.some((l) => l.text.includes('无从缴械'))).toBe(true);
  });

  it('守方反击胜 → 攻方受伤', () => {
    const attacker = mkC({ id: 'p', faction: 'player', controlledBy: 'player', str: 50, siz: 50, fighting: 30, hp: 10, maxHp: 10 });
    const target = mkC({ id: 'e', faction: 'enemy', str: 50, siz: 50, fighting: 80, dodge: 5 }); // fighting≥dodge→反击
    // 攻 d100=90(失败) 守 d100=10(极难成功) → 守方反击胜
    const out = performManeuver(mkEnc([attacker, target], 'e'), 'p', 'e', 'grapple', seqRng([0.0, 0.9, 0.0, 0.1]));
    expect(out.combatants.find((c) => c.id === 'p')!.hp).toBeLessThan(10);
    expect(out.combatants.find((c) => c.id === 'e')!.flags.prone).toBe(false);
  });
});

describe('playerManeuver', () => {
  it('玩家击晕命中 → 目标当即 prone（起身发生在其自己的回合，见俯卧规则）', () => {
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', dex: 90, str: 50, siz: 50, fighting: 90 });
    const enemy = mkC({ id: 'e', faction: 'enemy', str: 50, siz: 50, fighting: 5, dodge: 20, hp: 12, maxHp: 12, tendency: { attack: 0, flee: 0 } });
    // 用 performManeuver 直接看战技结算结果(不推进 AI 回合——倒地者只在轮到自己时才起身)
    const out = performManeuver(mkEnc([player, enemy], 'e'), 'p', 'e', 'knockout', seqRng([0.0, 0.1, 0.5, 0.9, 0.5, 0.5]));
    expect(out.combatants.find((c) => c.id === 'e')!.flags.prone).toBe(true);
  });
});

describe('近战日志拆行 + 倒地劣势', () => {
  it('每次近战结算 → 第一行为骰子判断(双方d100，单独成行)，第二行为结果', () => {
    const attacker = mkC({ id: 'p', faction: 'player', controlledBy: 'player', fighting: 70 });
    const target = mkC({ id: 'e', faction: 'enemy', fighting: 30, dodge: 40 });
    const out = performAttack(mkEnc([attacker, target], 'e'), 'p', 'e', 0, seqRng([0.0, 0.1, 0.5, 0.9, 0.5, 0.5]));
    expect(out.log.length).toBeGreaterThanOrEqual(2);
    expect(out.log[0].text).toContain('d100=');
    expect(out.log[0].text).toContain('｜');       // 判断行含双方掷骰
    expect(out.log[1].text).not.toContain('d100='); // 结果行不再混入掷骰
  });

  it('目标倒地(prone) → 判断行标注「倒地·劣势」', () => {
    const attacker = mkC({ id: 'p', faction: 'player', controlledBy: 'player', fighting: 70 });
    const target = mkC({ id: 'e', faction: 'enemy', fighting: 5, dodge: 40, flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: true, weaponJammed: false, fled: false, stabilized: false } });
    const out = performAttack(mkEnc([attacker, target], 'e'), 'p', 'e', 0, seqRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]));
    expect(out.log.some((l) => l.text.includes('倒地·劣势'))).toBe(true);
  });

  it('日志行携带 rolls 供骰子/文字交替：判断行=2颗d100检定骰，命中结果行=伤害骰', () => {
    const attacker = mkC({ id: 'p', faction: 'player', controlledBy: 'player', fighting: 90, weapons: [{ name: '消防斧', skill: 90, damage: '2D6', impaling: true, ranged: false, attacksPerRound: 1 }] });
    const target = mkC({ id: 'e', faction: 'enemy', fighting: 5, dodge: 10, hp: 30, maxHp: 30 });
    const out = performAttack(mkEnc([attacker, target], 'e'), 'p', 'e', 0, seqRng([0.0, 0.1, 0.9, 0.9, 0.5, 0.5, 0.5, 0.5]));
    const judg = out.log.find((l) => l.rolls?.some((rv) => !rv.damage));
    expect(judg?.rolls?.[0].dice.length).toBe(2); // 攻击骰 + 守骰
    const res = out.log.find((l) => l.rolls?.some((rv) => rv.damage));
    expect((res?.rolls?.find((rv) => rv.damage)?.dice.length ?? 0)).toBeGreaterThan(0);
  });

  it('presetOpposed 复用选项那次对抗掷骰作开场(不重掷)，命中致伤', () => {
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', fighting: 99, weapons: [{ name: '徒手', skill: 99, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 }] });
    const enemy = mkC({ id: 'e', faction: 'enemy', hp: 20, maxHp: 20 });
    const preset: OpeningPreset = {
      op: { winner: 'attacker', attackerRoll: { tens: [1], ones: 0, finalRoll: 10 }, attackerLevel: 'extreme', defenderRoll: { tens: [5], ones: 8, finalRoll: 58 }, defenderLevel: 'fail' },
      defenderValue: 30, defense: 'dodge',
    };
    const out = performAttack(mkEnc([player, enemy], 'e'), 'p', 'e', 0, seqRng([0.5, 0.5, 0.5, 0.5]), preset);
    expect(out.log[0].text).toContain('d100=10/99'); // 玩家用选项的 10 / 格斗99
    expect(out.log[0].text).toContain('d100=58/30'); // 对手用选项的 58 / 对手目标值30
    expect(out.combatants.find((c) => c.id === 'e')!.hp).toBeLessThan(20);
  });
});

describe('attacksPerRound > 1 (semi-auto handguns fire multiple shots)', () => {
  it('attacksPerRound=2 fires twice, consuming 2 ammo and producing 2 log entries', () => {
    const player = mkC({
      id: 'p', faction: 'player', controlledBy: 'player',
      weapons: [{ name: '.45自动', skill: 80, damage: '1D10+2', impaling: true, ranged: true, attacksPerRound: 2, loadedAmmo: 6, magazine: 7 }],
    });
    const enemy = mkC({ id: 'e', faction: 'enemy', hp: 30, maxHp: 30 });
    const enc = mkEnc([player, enemy], 'e');
    // Both shots hit: shot1 d100=10(success) dmg=10+2, shot2 d100=10(success) dmg=10+2
    const out = performAttack(enc, 'p', 'e', 0, seqRng([0.0, 0.1, 0.9, 0.1, 0.0, 0.1, 0.9, 0.1]));
    // Two shot labels [1/2] and [2/2]
    expect(out.log.filter((l) => l.text.includes('[1/2]')).length).toBe(1);
    expect(out.log.filter((l) => l.text.includes('[2/2]')).length).toBe(1);
    // 2 ammo consumed
    const w = out.combatants.find((c) => c.id === 'p')!.weapons[0];
    expect(w.loadedAmmo).toBe(4); // 6 - 2
  });

  it('second shot stops if target dies from first shot', () => {
    const player = mkC({
      id: 'p', faction: 'player', controlledBy: 'player',
      weapons: [{ name: '.45自动', skill: 80, damage: '1D10+2', impaling: true, ranged: true, attacksPerRound: 2, loadedAmmo: 6, magazine: 7 }],
    });
    const enemy = mkC({ id: 'e', faction: 'enemy', hp: 1, maxHp: 10 });
    const enc = mkEnc([player, enemy], 'e');
    // shot1 hits: d100=10 success, dmg roll large enough to kill
    const out = performAttack(enc, 'p', 'e', 0, seqRng([0.0, 0.1, 0.9, 0.9]));
    // Only 1 shot fired (target dead after first)
    expect(out.log.filter((l) => l.text.includes('[2/2]')).length).toBe(0);
    expect(out.combatants.find((c) => c.id === 'p')!.weapons[0].loadedAmmo).toBe(5);
  });

  it('second shot stops if weapon jams on first shot', () => {
    const player = mkC({
      id: 'p', faction: 'player', controlledBy: 'player',
      weapons: [{ name: '.45自动', skill: 80, damage: '1D10+2', impaling: true, ranged: true, attacksPerRound: 2, loadedAmmo: 6, magazine: 7 }],
    });
    const enemy = mkC({ id: 'e', faction: 'enemy', hp: 30, maxHp: 30 });
    const enc = mkEnc([player, enemy], 'e');
    // d100WithDice(0,0,rng): ones=floor(rng*10), tens=floor(rng*10)*10; 0+0=100→fumble→jam
    const out = performAttack(enc, 'p', 'e', 0, seqRng([0.0, 0.0, 0.5, 0.5]));
    expect(out.log.filter((l) => l.text.includes('卡壳')).length).toBe(1);
    expect(out.log.filter((l) => l.text.includes('[2/2]')).length).toBe(0);
  });

  it('attacksPerRound=1 weapon does not show shot labels', () => {
    const player = mkC({
      id: 'p', faction: 'player', controlledBy: 'player',
      weapons: [{ name: '左轮', skill: 80, damage: '1D10', impaling: true, ranged: true, attacksPerRound: 1, loadedAmmo: 6, magazine: 6 }],
    });
    const enemy = mkC({ id: 'e', faction: 'enemy', hp: 30, maxHp: 30 });
    const enc = mkEnc([player, enemy], 'e');
    const out = performAttack(enc, 'p', 'e', 0, seqRng([0.0, 0.1, 0.9, 0.1]));
    expect(out.log.some((l) => l.text.includes('[1/'))).toBe(false);
  });
});

describe('major wound CON check in performAttack', () => {
  it('melee major wound: CON check fail → target unconscious + log', () => {
    // Attacker deals major wound (>= ceil(maxHp/2)=5 on maxHp=10) via melee.
    // Use non-impaling weapon to avoid extreme/crit impale damage.
    const attacker = mkC({
      id: 'p', faction: 'player', controlledBy: 'player', fighting: 90, damageBonus: '0',
      weapons: [{ name: '棍棒', skill: 90, damage: '1D6', impaling: false, ranged: false, attacksPerRound: 1 }],
    });
    const target = mkC({ id: 'e', faction: 'enemy', hp: 10, maxHp: 10, con: 30, fighting: 5, dodge: 10 });
    const enc = mkEnc([attacker, target], 'e');
    // resolveOpposed (no bonus/penalty): att d100(ones=0,tens=10)→10 extreme≤90; def d100(ones=5,tens=90)→95 fail>10
    // rollDamage: impale=false (success not extreme for impale... wait, extreme IS impale level)
    // Actually isImpaleLevel('extreme')=true. But weapon.impaling=false → rollDamage with impale=true and
    // weapon.crushing undefined → falls to "贯穿" path but weapon.impaling=false → extra not rolled.
    // wMax=maxDiceOfFormula('1D6')→total=6. dMax='0'→0. No extra (impaling=false). Total=6. 6>=5 → major wound, 6<10 → not dead.
    // CON check: d100(ones=9,tens=90)→99 fail>30
    const out = performAttack(enc, 'p', 'e', 0, seqRng([0.0, 0.1, 0.5, 0.9, 0.9, 0.9]));
    const e = out.combatants.find((c) => c.id === 'e')!;
    expect(e.flags.majorWound).toBe(true);
    expect(e.flags.unconscious).toBe(true);
    expect(out.log.some((l) => l.text.includes('未通过 CON 检定'))).toBe(true);
    expect(out.diceRecords.some((r) => r.purpose === '重伤CON检定')).toBe(true);
  });

  it('melee major wound: CON check pass → target stays conscious + log', () => {
    const attacker = mkC({
      id: 'p', faction: 'player', controlledBy: 'player', fighting: 90, damageBonus: '0',
      weapons: [{ name: '棍棒', skill: 90, damage: '1D6', impaling: false, ranged: false, attacksPerRound: 1 }],
    });
    const target = mkC({ id: 'e', faction: 'enemy', hp: 10, maxHp: 10, con: 80, fighting: 5, dodge: 10 });
    const enc = mkEnc([attacker, target], 'e');
    // Same attack path as above: dealt=6 major wound.
    // CON check: d100(ones=0,tens=10)→10 success≤80
    const out = performAttack(enc, 'p', 'e', 0, seqRng([0.0, 0.1, 0.5, 0.9, 0.0, 0.1]));
    const e = out.combatants.find((c) => c.id === 'e')!;
    expect(e.flags.majorWound).toBe(true);
    expect(e.flags.unconscious).toBe(false);
    expect(out.log.some((l) => l.text.includes('通过 CON 检定'))).toBe(true);
  });

  it('ranged major wound triggers CON check', () => {
    const attacker = mkC({
      id: 'p', faction: 'player', controlledBy: 'player',
      weapons: [{ name: '手枪', skill: 90, damage: '1D6', impaling: true, ranged: true, attacksPerRound: 1, loadedAmmo: 6, magazine: 6 }],
    });
    const target = mkC({ id: 'e', faction: 'enemy', hp: 10, maxHp: 10, con: 20 });
    const enc = mkEnc([attacker, target], 'e');
    // resolveRanged: d100(ones=0,tens=30)→30 success≤90 (not extreme, so no impale)
    // Damage: rollDamage(weapon,'0',false,rng): 1D6 → rng=0.8→die=floor(0.8*6)+1=5+1=5 (not 6). Wait: floor(0.8*6)=floor(4.8)=4, +1=5.
    // dealt=5 >= ceil(10/2)=5 → major wound. 5<10 → not dead.
    // CON check: d100(ones=0,tens=90)→90 fail>20
    const out = performAttack(enc, 'p', 'e', 0, seqRng([0.0, 0.3, 0.8, 0.0, 0.9]));
    const e = out.combatants.find((c) => c.id === 'e')!;
    expect(e.flags.majorWound).toBe(true);
    expect(e.flags.unconscious).toBe(true);
    expect(out.log.some((l) => l.text.includes('未通过 CON 检定'))).toBe(true);
  });

  it('no CON check when damage is minor (below major wound threshold)', () => {
    const attacker = mkC({
      id: 'p', faction: 'player', controlledBy: 'player', fighting: 90, damageBonus: '0',
      weapons: [{ name: '小刀', skill: 90, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 }],
    });
    const target = mkC({ id: 'e', faction: 'enemy', hp: 10, maxHp: 10, con: 50, fighting: 5, dodge: 10 });
    const enc = mkEnc([attacker, target], 'e');
    // resolveOpposed: att d100(ones=0,tens=10)→10 extreme≤90; def d100(ones=5,tens=90)→95 fail>10
    // rollDamage: impale=true(extreme), weapon impaling=false → wMax=maxDiceOfFormula('1D3')→3. Total=3. 3<5→no major wound.
    const out = performAttack(enc, 'p', 'e', 0, seqRng([0.0, 0.1, 0.5, 0.9]));
    expect(out.log.some((l) => l.text.includes('CON 检定'))).toBe(false);
    expect(out.diceRecords.some((r) => r.purpose === '重伤CON检定')).toBe(false);
  });
});
