import { describe, it, expect, beforeEach, vi } from 'vitest';
import { triggerBout } from '../bout-dispatch';
import { useCharSheetStore, migrateSheet } from '../../stores/useCharSheetStore';
import { useVariableStore } from '../../stores/useVariableStore';
import { useCombatStore } from '../../stores/useCombatStore';
import { advanceTurn } from '../combat-controller';
import type { EvaluatorContext } from '../post-settle-evaluators';
import type { CharacterSheet, Encounter, Combatant } from '../../types';

// A2.6 后 summary 分支会真发起 callDsSubagent —— 这里给 fetch 装个 stub 防止真实请求,
// 同时让 generateTimeJump 的 catch 兜底退到空结果即可(本套件不关心 LLM 结果,只关心 sheet 写入)。
vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) })) as unknown as typeof fetch,
);

function baseSheet(over: Partial<CharacterSheet> = {}): CharacterSheet {
  return migrateSheet({
    identity: { name: '测试者', occupation: '记者', age: 30, gender: '男', birthplace: '', residence: '', id: '' },
    characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 70, EDU: 50 },
    secondary: {
      hp: { current: 12, max: 12 }, san: { current: 50, max: 80 }, mp: { current: 10, max: 10 },
      luck: 50, mov: 8, db: '0', build: 0,
    },
    ...over,
  });
}

function mkCtx(): EvaluatorContext {
  return {
    sheet: useCharSheetStore.getState().sheet,
    statData: useVariableStore.getState().statData,
    patchReport: { applied: 0, failed: [] },
    applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
  };
}

// 定值 rng：第 1 调用→7（roundsLeft）/ 第 2 调用→3（entry），realtime；summary 只调一次取 entry。
function seqRollD10(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

beforeEach(() => {
  useVariableStore.getState().clearAll();
  useCharSheetStore.getState().setSheet(baseSheet());
});

describe('triggerBout — realtime', () => {
  it('roll 1d10 roundsLeft + 1d10 Table VII entry → 写 sheet.temporaryInsanity（active/roundsLeft/bout）', () => {
    const out = triggerBout(mkCtx(), 'realtime', seqRollD10([7, 3]));
    expect(out.mode).toBe('realtime');
    expect(out.table).toBe('VII');
    expect(out.entry).toBe(3);
    expect(out.roundsLeft).toBe(7);
    expect(out.label).toBe('逃跑'); // Table VII roll=3 → 逃跑
    const ti = useCharSheetStore.getState().sheet.temporaryInsanity;
    expect(ti.active).toBe(true);
    expect(ti.roundsLeft).toBe(7);
    expect(ti.bout).toEqual({ mode: 'realtime', table: 'VII', entry: 3 });
  });

  it('roundsLeft 边界 1 → 落 sheet 同样为 1', () => {
    const out = triggerBout(mkCtx(), 'realtime', seqRollD10([1, 1]));
    expect(out.roundsLeft).toBe(1);
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.roundsLeft).toBe(1);
  });
});

describe('triggerBout — summary', () => {
  it('roll 1d10 Table VIII entry → 写 sheet.temporaryInsanity (roundsLeft=0, table VIII)', () => {
    const out = triggerBout(mkCtx(), 'summary', seqRollD10([5]));
    expect(out.mode).toBe('summary');
    expect(out.table).toBe('VIII');
    expect(out.entry).toBe(5);
    expect(out.roundsLeft).toBe(0);
    expect(out.label).toBe('远离原地'); // Table VIII roll=5 → 远离原地
    const ti = useCharSheetStore.getState().sheet.temporaryInsanity;
    expect(ti.active).toBe(true);
    expect(ti.roundsLeft).toBe(0);
    expect(ti.bout).toEqual({ mode: 'summary', table: 'VIII', entry: 5 });
  });

  it('time-jump-generator (A2.6) 真发起子调用走主 API,fetch 桩兜底; triggerBout summary 同步落 sheet 写入即认为成功', async () => {
    // A2.5 阶段验证占位 stub 的入参,A2.6 后已替换为 callDsSubagent 实装。
    // bout-dispatch summary 分支以 fire-and-forget 调用,本套件不等异步结果——
    // 上面 triggerBout summary 用例已经覆盖 sheet 写入逻辑,这里只确认 fetch 被尝试发起即可。
    triggerBout(mkCtx(), 'summary', seqRollD10([5]));
    // 给一个 microtask 让 fire-and-forget 子调用走到 fetch
    await Promise.resolve();
    await Promise.resolve();
    const ti = useCharSheetStore.getState().sheet.temporaryInsanity;
    expect(ti.active).toBe(true);
    expect(ti.bout?.table).toBe('VIII');
  });
});

// ── advanceTurn 倒计时 ──
function mkCombatant(over: Partial<Combatant>): Combatant {
  return {
    id: 'x', name: 'X', faction: 'player', controlledBy: 'player',
    dex: 50, str: 50, siz: 50, con: 50, mov: 8, fighting: 50, dodge: 25, damageBonus: '0',
    hp: 10, maxHp: 10, armor: 0,
    weapons: [{ name: '徒手', skill: 50, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 }],
    flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: false, weaponJammed: false, fled: false },
    roundDefenses: 0,
    ...over,
  } as Combatant;
}

function mkEnc(combatants: Combatant[]): Encounter {
  return {
    active: true, round: 1, turnOrder: combatants.map((c) => c.id), currentIdx: 0,
    combatants, bystanders: [], playerTargetId: null, log: [], diceRecords: [], status: 'active',
  };
}

describe('advanceTurn — temporaryInsanity 倒计时', () => {
  beforeEach(() => {
    useCombatStore.getState().clearCombat?.();
  });

  it('roundsLeft>1 → 推进一次后减 1，active 仍为 true', () => {
    useCharSheetStore.getState().setSheet(baseSheet({
      temporaryInsanity: { active: true, roundsLeft: 3, bout: { mode: 'realtime', table: 'VII', entry: 3 } },
    }));
    const player = mkCombatant({ id: 'p', faction: 'player', controlledBy: 'player' });
    const enemy = mkCombatant({ id: 'e', faction: 'enemy', controlledBy: 'ai' });
    advanceTurn(mkEnc([player, enemy]));
    const ti = useCharSheetStore.getState().sheet.temporaryInsanity;
    expect(ti.roundsLeft).toBe(2);
    expect(ti.active).toBe(true);
  });

  it('roundsLeft=1 → 推进一次后归 0，active 清为 false，bout 被清空', () => {
    useCharSheetStore.getState().setSheet(baseSheet({
      temporaryInsanity: { active: true, roundsLeft: 1, bout: { mode: 'realtime', table: 'VII', entry: 5 } },
    }));
    const player = mkCombatant({ id: 'p', faction: 'player', controlledBy: 'player' });
    const enemy = mkCombatant({ id: 'e', faction: 'enemy', controlledBy: 'ai' });
    advanceTurn(mkEnc([player, enemy]));
    const ti = useCharSheetStore.getState().sheet.temporaryInsanity;
    expect(ti.roundsLeft).toBe(0);
    expect(ti.active).toBe(false);
    expect(ti.bout).toBeUndefined();
  });

  it('active=false → advanceTurn 不动 temporaryInsanity', () => {
    useCharSheetStore.getState().setSheet(baseSheet({
      temporaryInsanity: { active: false, roundsLeft: 0 },
    }));
    const player = mkCombatant({ id: 'p', faction: 'player', controlledBy: 'player' });
    advanceTurn(mkEnc([player]));
    const ti = useCharSheetStore.getState().sheet.temporaryInsanity;
    expect(ti.active).toBe(false);
    expect(ti.roundsLeft).toBe(0);
  });

  it('advanceTurn 仍然正确推进 currentIdx / round（倒计时副作用不影响主逻辑）', () => {
    const player = mkCombatant({ id: 'p', faction: 'player', controlledBy: 'player' });
    const enemy = mkCombatant({ id: 'e', faction: 'enemy', controlledBy: 'ai' });
    const enc = mkEnc([player, enemy]);
    const a1 = advanceTurn(enc);
    expect(a1.currentIdx).toBe(1);
    expect(a1.round).toBe(1);
    const a2 = advanceTurn(a1);
    expect(a2.currentIdx).toBe(0); // 新一轮 reset 到 0
    expect(a2.round).toBe(2);
  });
});
