import { describe, expect, it } from 'vitest';
import type { Combatant, Encounter } from '../types';
import { checkEndReason, playerAttack, playerFlee, advanceTurn, runAiTurn, performAttack, performManeuver, playerManeuver } from './combat-controller';
import type { Rng } from './combat-engine';

function seqRng(values: number[]): Rng { let i = 0; return () => values[i++ % values.length]; }

function mkC(over: Partial<Combatant>): Combatant {
  return {
    id: 'x', name: 'X', faction: 'enemy', controlledBy: 'ai',
    dex: 50, str: 50, siz: 50, con: 50, mov: 8, fighting: 50, dodge: 25, damageBonus: '0',
    hp: 10, maxHp: 10, armor: 0,
    weapons: [{ name: '徒手', skill: 50, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 }],
    flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: false, weaponJammed: false, fled: false },
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
  it('玩家击晕命中 → 目标 prone（回合推进后该效果仍在）', () => {
    const player = mkC({ id: 'p', faction: 'player', controlledBy: 'player', dex: 90, str: 50, siz: 50, fighting: 90 });
    const enemy = mkC({ id: 'e', faction: 'enemy', str: 50, siz: 50, fighting: 5, dodge: 20, hp: 12, maxHp: 12, tendency: { attack: 0, flee: 0 } });
    const out = playerManeuver(mkEnc([player, enemy], 'e'), 'knockout', seqRng([0.0, 0.1, 0.5, 0.9, 0.5, 0.5]));
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
    const target = mkC({ id: 'e', faction: 'enemy', fighting: 5, dodge: 40, flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: true, weaponJammed: false, fled: false } });
    const out = performAttack(mkEnc([attacker, target], 'e'), 'p', 'e', 0, seqRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]));
    expect(out.log.some((l) => l.text.includes('倒地·劣势'))).toBe(true);
  });
});
