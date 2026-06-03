import { describe, expect, it } from 'vitest';
import type { Combatant, Encounter } from '../types';
import { checkEndReason, playerAttack, playerFlee, advanceTurn, runAiTurn } from './combat-controller';
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
