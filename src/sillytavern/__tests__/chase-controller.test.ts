import { describe, it, expect } from 'vitest';
import { advanceChaseTurn, playerChaseAction, runAiChaseTurn } from '../chase-controller';
import type { Chase, ChaseParticipant, ChaseLocation } from '../../types';
import type { Rng } from '../combat-engine';

// ── 测试辅助（与 chase-engine.test.ts 同模式）─────────

/**
 * 构造可预测 d100 结果的 RNG 序列。
 * d100WithDice(0,0,rng) 按顺序消费 2 次 rng：
 *   1) ones = Math.floor(rng() * 10)    → 0..9
 *   2) tens = Math.floor(rng() * 10)*10 → 0,10,..,90
 * finalRoll = tens + ones，若 tens=0 且 ones=0 则 100。
 *
 * 序列用尽后返回 0.5（一个安全的中间值），
 * 使得 AI barricade 的 rng() > 0.5 判定为 false，避免 rng exhausted 错误。
 */
function rngForD100(...rolls: number[]): Rng {
  const values: number[] = [];
  for (const roll of rolls) {
    if (roll === 100) {
      values.push(0, 0);
    } else {
      const ones = roll % 10;
      const tens = Math.floor(roll / 10);
      values.push(ones / 10, tens / 10);
    }
  }
  let idx = 0;
  return () => {
    if (idx >= values.length) return 0.5;
    return values[idx++];
  };
}

function makeParticipant(over: Partial<ChaseParticipant> = {}): ChaseParticipant {
  return {
    id: 'p1',
    name: '调查员',
    role: 'quarry',
    controlledBy: 'player',
    mov: 8,
    con: 50,
    dex: 50,
    position: 3,
    sprintCount: 0,
    conChecksUsed: 0,
    flags: {
      fallen: false,
      trapped: false,
      exhausted: false,
      escaped: false,
      caught: false,
    },
    skills: { 跳跃: 60, 攀爬: 40, STR: 50 },
    ...over,
  };
}

function makeLocation(over: Partial<ChaseLocation> = {}): ChaseLocation {
  return { name: '小巷', ...over };
}

function makeChase(over: Partial<Chase> = {}): Chase {
  const locations = over.locations ?? Array.from({ length: 10 }, (_, i) => makeLocation({ name: `位置${i}` }));
  return {
    active: true,
    round: 1,
    locations,
    participants: over.participants ?? [
      makeParticipant({ id: 'pursuer1', name: '深潜者', role: 'pursuer', controlledBy: 'ai', position: 1, mov: 9, dex: 60 }),
      makeParticipant({ id: 'player1', name: '调查员', role: 'quarry', controlledBy: 'player', position: 4, mov: 8, dex: 50 }),
    ],
    turnOrder: over.turnOrder ?? ['pursuer1', 'player1'],
    currentIdx: over.currentIdx ?? 0,
    log: [],
    diceRecords: [],
    status: 'active',
    initialGap: 3,
    ...over,
  };
}

// ── advanceChaseTurn ────────────────────────────────

describe('advanceChaseTurn', () => {
  it('advances to next participant', () => {
    const chase = makeChase({ currentIdx: 0, turnOrder: ['a', 'b', 'c'] });
    const result = advanceChaseTurn(chase);
    expect(result.currentIdx).toBe(1);
    expect(result.round).toBe(1); // same round
  });

  it('wraps to new round and rebuilds turnOrder', () => {
    // currentIdx=1 is last in a 2-element turnOrder → new round
    const chase = makeChase({
      currentIdx: 1,
      turnOrder: ['pursuer1', 'player1'],
      round: 1,
    });
    const result = advanceChaseTurn(chase);
    expect(result.round).toBe(2);
    expect(result.currentIdx).toBe(0);
    // turnOrder rebuilt sorted by DEX desc: pursuer1 (dex 60) before player1 (dex 50)
    expect(result.turnOrder[0]).toBe('pursuer1');
    expect(result.turnOrder[1]).toBe('player1');
  });

  it('excludes caught/escaped/exhausted from new round turnOrder', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'a', dex: 70, controlledBy: 'ai', role: 'pursuer', position: 1 }),
        makeParticipant({ id: 'b', dex: 60, controlledBy: 'player', flags: { fallen: false, trapped: false, exhausted: false, escaped: false, caught: true } }),
        makeParticipant({ id: 'c', dex: 50, controlledBy: 'ai', role: 'pursuer', position: 2, flags: { fallen: false, trapped: false, exhausted: true, escaped: false, caught: false } }),
        makeParticipant({ id: 'd', dex: 40, controlledBy: 'ai', role: 'quarry', position: 5 }),
      ],
      turnOrder: ['a', 'b', 'c', 'd'],
      currentIdx: 3, // last → new round
      round: 2,
    });
    const result = advanceChaseTurn(chase);
    expect(result.round).toBe(3);
    // Only 'a' (active pursuer) and 'd' (active quarry) remain
    expect(result.turnOrder).toEqual(['a', 'd']);
    expect(result.turnOrder).not.toContain('b');
    expect(result.turnOrder).not.toContain('c');
  });

  it('increments round number', () => {
    const chase = makeChase({
      currentIdx: 1,
      turnOrder: ['pursuer1', 'player1'],
      round: 5,
    });
    const result = advanceChaseTurn(chase);
    expect(result.round).toBe(6);
  });
});

// ── playerChaseAction ───────────────────────────────

describe('playerChaseAction', () => {
  it('move action moves player forward', () => {
    // Player at position 4, MOV 8 → moves 1
    // After player moves, AI (pursuer1) takes turn, then back to player
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'pursuer1', name: '深潜者', role: 'pursuer', controlledBy: 'ai', position: 1, mov: 8, dex: 60, con: 30 }),
        makeParticipant({ id: 'player1', name: '调查员', role: 'quarry', controlledBy: 'player', position: 4, mov: 8, dex: 50 }),
      ],
      turnOrder: ['player1', 'pursuer1'],
      currentIdx: 0,
    });
    // Use rng that produces d100=30 for AI's move (no sprint since con=30<=40)
    // AI needs 2 rng calls for d100 (move is not sprint, no CON check needed)
    // Actually moveParticipant with sprint=false doesn't consume rng at all
    const result = playerChaseAction(chase, 'move', undefined, rngForD100());
    const player = result.participants.find(p => p.id === 'player1')!;
    expect(player.position).toBe(5); // 4 + 1
  });

  it('sprint action sprints player', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'pursuer1', name: '深潜者', role: 'pursuer', controlledBy: 'ai', position: 1, mov: 8, dex: 60, con: 30 }),
        makeParticipant({ id: 'player1', name: '调查员', role: 'quarry', controlledBy: 'player', position: 3, mov: 8, dex: 50 }),
      ],
      turnOrder: ['player1', 'pursuer1'],
      currentIdx: 0,
    });
    const result = playerChaseAction(chase, 'sprint', undefined, rngForD100());
    const player = result.participants.find(p => p.id === 'player1')!;
    expect(player.position).toBe(5); // 3 + 2 (sprint)
    expect(player.sprintCount).toBe(1);
  });

  it('shortcut action attempts skill check', () => {
    // Roll 30 on 跳跃=60 → success → +1 position
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'pursuer1', name: '深潜者', role: 'pursuer', controlledBy: 'ai', position: 1, mov: 8, dex: 60, con: 30 }),
        makeParticipant({ id: 'player1', name: '调查员', role: 'quarry', controlledBy: 'player', position: 3, mov: 8, dex: 50, skills: { 跳跃: 60 } }),
      ],
      turnOrder: ['player1', 'pursuer1'],
      currentIdx: 0,
    });
    const result = playerChaseAction(chase, 'shortcut', '跳跃', rngForD100(30));
    const player = result.participants.find(p => p.id === 'player1')!;
    expect(player.position).toBe(4); // 3 + 1 (shortcut success)
    expect(result.diceRecords.length).toBeGreaterThanOrEqual(1);
  });

  it('ends chase when gap reaches 0', () => {
    // Pursuer at 4, quarry (player) at 4 → gap=0 after move (pursuer catches up)
    // Actually: pursuer overtakes quarry → caught
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'pursuer1', name: '深潜者', role: 'pursuer', controlledBy: 'ai', position: 4, mov: 9, dex: 60, con: 30 }),
        makeParticipant({ id: 'player1', name: '调查员', role: 'quarry', controlledBy: 'player', position: 4, mov: 8, dex: 50 }),
      ],
      turnOrder: ['player1', 'pursuer1'],
      currentIdx: 0,
    });
    // Player moves from 4→5, pursuer moves from 4→6 (mov 9 = 2 positions) → gap 0 = caught
    const result = playerChaseAction(chase, 'move', undefined, rngForD100());
    expect(result.status).toBe('resolving');
    expect(result.endReason).toBe('caught');
  });

  it('advances AI turns after player action', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'pursuer1', name: '深潜者', role: 'pursuer', controlledBy: 'ai', position: 1, mov: 8, dex: 60, con: 30 }),
        makeParticipant({ id: 'player1', name: '调查员', role: 'quarry', controlledBy: 'player', position: 5, mov: 8, dex: 50 }),
      ],
      turnOrder: ['player1', 'pursuer1'],
      currentIdx: 0,
    });
    const result = playerChaseAction(chase, 'move', undefined, rngForD100());
    // AI (pursuer1) acts twice: once in round 1 (after player), once in round 2
    // (AI has higher DEX so goes first in round 2, then loop returns at player's turn)
    const pursuer = result.participants.find(p => p.id === 'pursuer1')!;
    expect(pursuer.position).toBe(3); // 1 + 1 (round 1) + 1 (round 2) = 3
    expect(result.round).toBe(2);
  });

  it('barricade action creates barricade behind player', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'pursuer1', name: '深潜者', role: 'pursuer', controlledBy: 'ai', position: 0, mov: 8, dex: 60, con: 30 }),
        makeParticipant({ id: 'player1', name: '调查员', role: 'quarry', controlledBy: 'player', position: 5, mov: 8, dex: 50 }),
      ],
      turnOrder: ['player1', 'pursuer1'],
      currentIdx: 0,
    });
    const result = playerChaseAction(chase, 'barricade', undefined, rngForD100());
    // Barricade placed at position 4 (player position 5 - 1)
    expect(result.locations[4].barrier).toBeDefined();
    expect(result.locations[4].barrier!.skill).toBe('STR');
  });
});

// ── runAiChaseTurn ──────────────────────────────────

describe('runAiChaseTurn', () => {
  it('AI sprints when CON > 40 and sprintCount < 4', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'ai1', name: 'NPC', role: 'pursuer', controlledBy: 'ai', position: 2, mov: 8, con: 60, sprintCount: 0 }),
        makeParticipant({ id: 'q', role: 'quarry', position: 7 }),
      ],
    });
    const result = runAiChaseTurn(chase, 'ai1', rngForD100());
    const ai = result.participants.find(p => p.id === 'ai1')!;
    expect(ai.position).toBe(4); // 2 + 2 (sprint: base 1 + sprint 1)
    expect(ai.sprintCount).toBe(1);
  });

  it('AI moves normally when CON <= 40', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'ai1', name: 'NPC', role: 'pursuer', controlledBy: 'ai', position: 2, mov: 8, con: 30, sprintCount: 0 }),
        makeParticipant({ id: 'q', role: 'quarry', position: 7 }),
      ],
    });
    const result = runAiChaseTurn(chase, 'ai1', rngForD100());
    const ai = result.participants.find(p => p.id === 'ai1')!;
    expect(ai.position).toBe(3); // 2 + 1 (normal move, no sprint)
    expect(ai.sprintCount).toBe(0);
  });

  it('AI moves normally when sprintCount >= 4', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'ai1', name: 'NPC', role: 'pursuer', controlledBy: 'ai', position: 2, mov: 8, con: 60, sprintCount: 4 }),
        makeParticipant({ id: 'q', role: 'quarry', position: 7 }),
      ],
    });
    // sprintCount=4 ≥ 4, so AI won't sprint even with CON > 40
    // Normal move: no d100 consumed, but to be safe use a forgiving rng
    const result = runAiChaseTurn(chase, 'ai1', rngForD100());
    const ai = result.participants.find(p => p.id === 'ai1')!;
    expect(ai.position).toBe(3); // normal move: 2 + 1
    expect(ai.sprintCount).toBe(4); // unchanged
  });

  it('quarry may create barricade', () => {
    // rng() > 0.5 → barricade created
    // Use an rng that returns high value for the barricade check
    let callCount = 0;
    const rng: Rng = () => {
      callCount++;
      return 0.9; // > 0.5 → barricade will be created
    };
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'ai1', name: 'NPC猎物', role: 'quarry', controlledBy: 'ai', position: 3, mov: 8, con: 30 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = runAiChaseTurn(chase, 'ai1', rng);
    // Position 3 → moved to 4, barricade at position 3 (4-1)
    // But note: position is read from original participant (p.position=3), not updated.
    // The barricade check uses original p.position > 0, which is true.
    // createBarricade places barrier at participant.position - 1 in the updated chase.
    // The participant moved to 4, so barricade at 4-1=3.
    expect(result.locations[3].barrier).toBeDefined();
  });

  it('quarry does not create barricade when rng <= 0.5', () => {
    let callCount = 0;
    const rng: Rng = () => {
      callCount++;
      return 0.3; // <= 0.5 → no barricade
    };
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'ai1', name: 'NPC猎物', role: 'quarry', controlledBy: 'ai', position: 3, mov: 8, con: 30 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = runAiChaseTurn(chase, 'ai1', rng);
    // No barricade should be created
    expect(result.locations[3].barrier).toBeUndefined();
  });

  it('skips caught participants', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({
          id: 'ai1', name: 'NPC', role: 'pursuer', controlledBy: 'ai', position: 2,
          flags: { fallen: false, trapped: false, exhausted: false, escaped: false, caught: true },
        }),
        makeParticipant({ id: 'q', role: 'quarry', position: 7 }),
      ],
    });
    const result = runAiChaseTurn(chase, 'ai1');
    const ai = result.participants.find(p => p.id === 'ai1')!;
    expect(ai.position).toBe(2); // unchanged
  });

  it('skips escaped participants', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({
          id: 'ai1', name: 'NPC', role: 'quarry', controlledBy: 'ai', position: 9,
          flags: { fallen: false, trapped: false, exhausted: false, escaped: true, caught: false },
        }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 2 }),
      ],
    });
    const result = runAiChaseTurn(chase, 'ai1');
    const ai = result.participants.find(p => p.id === 'ai1')!;
    expect(ai.position).toBe(9); // unchanged
  });

  it('skips exhausted participants', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({
          id: 'ai1', name: 'NPC', role: 'pursuer', controlledBy: 'ai', position: 2,
          flags: { fallen: false, trapped: false, exhausted: true, escaped: false, caught: false },
        }),
        makeParticipant({ id: 'q', role: 'quarry', position: 7 }),
      ],
    });
    const result = runAiChaseTurn(chase, 'ai1');
    const ai = result.participants.find(p => p.id === 'ai1')!;
    expect(ai.position).toBe(2); // unchanged
  });
});

// ── immutability ────────────────────────────────────

describe('immutability', () => {
  it('advanceChaseTurn does not mutate original', () => {
    const chase = makeChase({ currentIdx: 0, round: 1 });
    const originalIdx = chase.currentIdx;
    const originalRound = chase.round;
    advanceChaseTurn(chase);
    expect(chase.currentIdx).toBe(originalIdx);
    expect(chase.round).toBe(originalRound);
  });

  it('playerChaseAction does not mutate original', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'pursuer1', role: 'pursuer', controlledBy: 'ai', position: 1, mov: 8, dex: 60, con: 30 }),
        makeParticipant({ id: 'player1', role: 'quarry', controlledBy: 'player', position: 4, mov: 8, dex: 50 }),
      ],
      turnOrder: ['player1', 'pursuer1'],
      currentIdx: 0,
    });
    const origPos = chase.participants.find(p => p.id === 'player1')!.position;
    playerChaseAction(chase, 'move', undefined, rngForD100());
    expect(chase.participants.find(p => p.id === 'player1')!.position).toBe(origPos);
  });

  it('runAiChaseTurn does not mutate original', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'ai1', role: 'pursuer', controlledBy: 'ai', position: 2, mov: 8, con: 30 }),
        makeParticipant({ id: 'q', role: 'quarry', position: 7 }),
      ],
    });
    const origPos = chase.participants.find(p => p.id === 'ai1')!.position;
    runAiChaseTurn(chase, 'ai1', rngForD100());
    expect(chase.participants.find(p => p.id === 'ai1')!.position).toBe(origPos);
  });
});
