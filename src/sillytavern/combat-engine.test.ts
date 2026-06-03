import { describe, expect, it } from 'vitest';
import type { Combatant, CombatWeapon, Encounter } from '../types';
import {
  d100WithDice, successLevel, type Rng,
  buildAndDamageBonus,
  rollDamageFormula, rollDamage,
  resolveOpposed, resolveRanged,
  applyDamage,
  outnumberBonusDice, nextTurnOrder, decideAiAction, consumeAmmo, canReload,
  isImpaleLevel, canFire,
} from './combat-engine';

/** 固定序列 rng：每次返回数组里下一个值（0..1）。引擎消费顺序：先个位，再各十位。 */
function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

function mkCombatant(over: Partial<Combatant> = {}): Combatant {
  return {
    id: 'c1', name: '甲', faction: 'enemy', controlledBy: 'ai',
    dex: 50, str: 50, siz: 50, con: 50, mov: 8, fighting: 50, dodge: 30,
    hp: 12, maxHp: 12, armor: 0, weapons: [], roundDefenses: 0,
    flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: false, weaponJammed: false },
    ...over,
  };
}

describe('successLevel', () => {
  it('判级阈值正确', () => {
    expect(successLevel(1, 60)).toBe('critical');
    expect(successLevel(12, 60)).toBe('extreme');
    expect(successLevel(30, 60)).toBe('hard');
    expect(successLevel(60, 60)).toBe('success');
    expect(successLevel(61, 60)).toBe('fail');
    expect(successLevel(100, 60)).toBe('fumble');
    expect(successLevel(96, 40)).toBe('fumble');  // 技能<50：96-100 大失败
    expect(successLevel(96, 60)).toBe('fail');     // 技能≥50：96 仅失败
  });
});

describe('d100WithDice（消费序：先个位后十位）', () => {
  it('无奖惩：个位+十位*10', () => {
    const r = d100WithDice(0, 0, seqRng([0.5, 0.2])); // ones=5, tens=20
    expect(r.finalRoll).toBe(25);
    expect(r.tens).toEqual([20]);
  });
  it('1 奖励骰：多掷一十位取较小', () => {
    const r = d100WithDice(1, 0, seqRng([0.5, 0.1, 0.7])); // ones=5; tens 10,70 → min 10
    expect(r.finalRoll).toBe(15);
    expect(r.tens.slice().sort((a, b) => a - b)).toEqual([10, 70]);
  });
  it('1 惩罚骰：多掷一十位取较大', () => {
    const r = d100WithDice(0, 1, seqRng([0.5, 0.1, 0.7])); // ones=5; tens 10,70 → max 70
    expect(r.finalRoll).toBe(75);
  });
  it('奖惩相消、净惩罚上限 2', () => {
    const r = d100WithDice(1, 3, seqRng([0.5, 0.9, 0.1, 0.4])); // net2惩罚→3十位; ones=5; max(90,10,40)=90
    expect(r.tens.length).toBe(3);
    expect(r.finalRoll).toBe(95);
  });
  it('个位/十位皆 0 视为 100', () => {
    const r = d100WithDice(0, 0, seqRng([0.0, 0.0]));
    expect(r.finalRoll).toBe(100);
  });
  it('含「00」十位的整读方向（修 bug：取舍在 00→100 之后）', () => {
    // ones=0, 十位 90 与 00：读数 90 与 100
    expect(d100WithDice(1, 0, seqRng([0.0, 0.9, 0.0])).finalRoll).toBe(90);  // 奖励取最好(小)=90
    expect(d100WithDice(0, 1, seqRng([0.0, 0.9, 0.0])).finalRoll).toBe(100); // 惩罚取最差(大)=100
  });
});

describe('buildAndDamageBonus（COC7e STR+SIZ 表）', () => {
  it('分档正确', () => {
    expect(buildAndDamageBonus(40, 20)).toEqual({ build: -2, db: '-2' });
    expect(buildAndDamageBonus(40, 40)).toEqual({ build: -1, db: '-1' });
    expect(buildAndDamageBonus(50, 50)).toEqual({ build: 0, db: '0' });
    expect(buildAndDamageBonus(70, 70)).toEqual({ build: 1, db: '1D4' });
    expect(buildAndDamageBonus(90, 90)).toEqual({ build: 2, db: '1D6' });
    expect(buildAndDamageBonus(120, 120)).toEqual({ build: 3, db: '2D6' });
    expect(buildAndDamageBonus(160, 160)).toEqual({ build: 4, db: '3D6' });
  });
});

describe('rollDamageFormula', () => {
  it('解析 1D10+1D4+2 求和（die=floor(r*n)+1）', () => {
    // 1D10: r=0.55→6 ; 1D4: r=0.5→3 ; +2 ⇒ 11
    const r = rollDamageFormula('1D10+1D4+2', seqRng([0.55, 0.5]));
    expect(r.total).toBe(11);
  });
  it('负项 "-1"', () => {
    const r = rollDamageFormula('1D3+-1', seqRng([0.9])); // 1D3: r=0.9→3 ; -1 ⇒ 2
    expect(r.total).toBe(2);
  });
  it('减号分隔项 "1D8-2"（修：不再吞掉减项）', () => {
    const r = rollDamageFormula('1D8-2', seqRng([0.5])); // 1D8: r=0.5→5 ; -2 ⇒ 3
    expect(r.total).toBe(3);
  });
});

describe('isImpaleLevel', () => {
  it('极难/大成功为贯穿级，其余否', () => {
    expect(isImpaleLevel('critical')).toBe(true);
    expect(isImpaleLevel('extreme')).toBe(true);
    expect(isImpaleLevel('hard')).toBe(false);
    expect(isImpaleLevel('success')).toBe(false);
    expect(isImpaleLevel('fail')).toBe(false);
    expect(isImpaleLevel('fumble')).toBe(false);
  });
});

describe('rollDamage（贯穿）', () => {
  const knife: CombatWeapon = { name: '刀', skill: 50, damage: '1D4', impaling: true, ranged: false, attacksPerRound: 1 };
  it('普通命中：武器骰 + DB', () => {
    const r = rollDamage(knife, '1D4', false, seqRng([0.3, 0.3])); // 1D4=2 + DB1D4=2 ⇒ 4
    expect(r.total).toBe(4);
  });
  it('贯穿：武器骰+DB 取满 + 追加一份武器骰', () => {
    const r = rollDamage(knife, '1D4', true, seqRng([0.3])); // 4(满)+4(满)+追加1D4(r=0.3→2) ⇒ 10
    expect(r.total).toBe(10);
  });
});

describe('resolveOpposed（近战对抗，每方掷 个位+十位）', () => {
  it('攻方等级高 → 攻方命中', () => {
    // 攻 final=10(对60→extreme) ; 守 final=70(对50→fail)
    const r = resolveOpposed(60, 70, 50, 65, 'dodge', seqRng([0.0, 0.1, 0.0, 0.7]));
    expect(r.winner).toBe('attacker');
  });
  it('平手且守方闪避 → 守方胜', () => {
    const r = resolveOpposed(60, 60, 60, 60, 'dodge', seqRng([0.0, 0.5, 0.0, 0.5])); // 都=50→success
    expect(r.winner).toBe('defender');
  });
  it('平手且守方反击 → 攻方胜', () => {
    const r = resolveOpposed(60, 60, 60, 60, 'fightback', seqRng([0.0, 0.5, 0.0, 0.5]));
    expect(r.winner).toBe('attacker');
  });
  it('一方大失败、一方失败(都未成功) → 无人受伤(修 bug)', () => {
    // 攻 final=100(skill40→fumble) ; 守 final=70(value50→fail) → 双方都<success
    const r = resolveOpposed(40, 50, 50, 60, 'dodge', seqRng([0.0, 0.0, 0.0, 0.7]));
    expect(r.winner).toBe('none');
  });
});

describe('resolveRanged（射击大失败→卡壳）', () => {
  it('命中', () => {
    const r = resolveRanged(70, 'normal', seqRng([0.0, 0.1])); // final=10≤70 success
    expect(r.hit).toBe(true);
    expect(r.jam).toBe(false);
  });
  it('大失败 → 卡壳', () => {
    const r = resolveRanged(40, 'normal', seqRng([0.6, 0.9])); // final=96，skill<50→fumble
    expect(r.hit).toBe(false);
    expect(r.jam).toBe(true);
  });
});

describe('applyDamage', () => {
  it('护甲减免', () => {
    expect(applyDamage(mkCombatant({ armor: 3 }), 5).combatant.hp).toBe(10);
  });
  it('轻伤(<半HP)不触发重伤', () => {
    const r = applyDamage(mkCombatant(), 5);
    expect(r.combatant.flags.majorWound).toBe(false);
    expect(r.majorWound).toBe(false);
  });
  it('重伤(≥半HP) 触发重伤+倒地', () => {
    const r = applyDamage(mkCombatant(), 6);
    expect(r.combatant.flags.majorWound).toBe(true);
    expect(r.combatant.flags.prone).toBe(true);
  });
  it('单次>maxHP 直接死亡', () => {
    const r = applyDamage(mkCombatant(), 13);
    expect(r.combatant.flags.dead).toBe(true);
    expect(r.combatant.hp).toBe(0);
  });
  it('HP归零+曾重伤→濒死昏迷；仅轻伤→昏迷不濒死', () => {
    const wounded = mkCombatant({ hp: 2, flags: { ...mkCombatant().flags, majorWound: true } });
    const r = applyDamage(wounded, 2);
    expect(r.combatant.flags.dying).toBe(true);
    expect(r.combatant.flags.unconscious).toBe(true);
    const light = applyDamage(mkCombatant({ hp: 2 }), 2).combatant;
    expect(light.flags.dying).toBe(false);
    expect(light.flags.unconscious).toBe(true);
  });
});

describe('寡不敌众 / 行动顺序 / AI / 弹药', () => {
  it('outnumberBonusDice = 防御过则恒 1 个(不累加)', () => {
    expect(outnumberBonusDice(mkCombatant({ roundDefenses: 0 }))).toBe(0);
    expect(outnumberBonusDice(mkCombatant({ roundDefenses: 1 }))).toBe(1);
    expect(outnumberBonusDice(mkCombatant({ roundDefenses: 3 }))).toBe(1);
  });
  it('nextTurnOrder 按 DEX 降序', () => {
    const order = nextTurnOrder([
      mkCombatant({ id: 'a', dex: 40 }), mkCombatant({ id: 'b', dex: 70 }), mkCombatant({ id: 'c', dex: 55 }),
    ]);
    expect(order).toEqual(['b', 'c', 'a']);
  });
  it('decideAiAction：roll≤flee→逃，否则攻击敌对存活目标', () => {
    const enc = { combatants: [
      mkCombatant({ id: 'e', faction: 'enemy', tendency: { attack: 60, flee: 30 } }),
      mkCombatant({ id: 'p', faction: 'player', controlledBy: 'player' }),
    ] } as Encounter;
    expect(decideAiAction(enc.combatants[0], enc, seqRng([0.10])).type).toBe('flee');  // roll 11 ≤ 30
    const atk = decideAiAction(enc.combatants[0], enc, seqRng([0.50]));                 // roll 51 > 30
    expect(atk.type).toBe('attack');
    expect(atk.type === 'attack' && atk.targetId).toBe('p');
  });
  it('consumeAmmo 扣 1；canReload 未满且有备弹', () => {
    const w: CombatWeapon = { name: '枪', skill: 50, damage: '1D10', impaling: true, ranged: true, attacksPerRound: 1, loadedAmmo: 1, magazine: 6 };
    expect(consumeAmmo(w).loadedAmmo).toBe(0);
    expect(canReload({ ...w, loadedAmmo: 2 }, 5)).toBe(true);
    expect(canReload({ ...w, loadedAmmo: 2 }, 0)).toBe(false);
    expect(canReload({ ...w, loadedAmmo: 6 }, 5)).toBe(false);
  });
  it('canFire：枪械须有弹，近战恒可', () => {
    const gun: CombatWeapon = { name: '枪', skill: 50, damage: '1D10', impaling: true, ranged: true, attacksPerRound: 1, loadedAmmo: 0, magazine: 6 };
    expect(canFire(gun)).toBe(false);
    expect(canFire({ ...gun, loadedAmmo: 2 })).toBe(true);
    expect(canFire({ name: '刀', skill: 50, damage: '1D4', impaling: true, ranged: false, attacksPerRound: 1 })).toBe(true);
  });
});
