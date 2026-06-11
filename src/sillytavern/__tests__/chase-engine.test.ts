import { describe, it, expect } from 'vitest';
import {
  calcMovement,
  getGap,
  checkChaseEnd,
  moveParticipant,
  attemptShortcut,
  createBarricade,
  resolveHazard,
} from '../chase-engine';
import type { Chase, ChaseParticipant, ChaseLocation } from '../../types';
import type { Rng } from '../combat-engine';

// ── 测试辅助 ──────────────────────────────────────────

/**
 * 构造可预测 d100 结果的 RNG 序列。
 * d100WithDice(0,0,rng) 按顺序消费 2 次 rng：
 *   1) ones = Math.floor(rng() * 10)    → 0..9
 *   2) tens = Math.floor(rng() * 10)*10 → 0,10,..,90
 * finalRoll = tens + ones，若 tens=0 且 ones=0 则 100。
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
    if (idx >= values.length) throw new Error(`rng exhausted at index ${idx}`);
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
  return {
    name: '小巷',
    ...over,
  };
}

function makeChase(over: Partial<Chase> = {}): Chase {
  const locations = over.locations ?? Array.from({ length: 10 }, (_, i) => makeLocation({ name: `位置${i}` }));
  return {
    active: true,
    round: 1,
    locations,
    participants: over.participants ?? [
      makeParticipant({ id: 'pursuer1', name: '深潜者', role: 'pursuer', position: 1, mov: 9 }),
      makeParticipant({ id: 'quarry1', name: '调查员', role: 'quarry', position: 4, mov: 8 }),
    ],
    turnOrder: over.turnOrder ?? ['pursuer1', 'quarry1'],
    currentIdx: 0,
    log: [],
    diceRecords: [],
    status: 'active',
    initialGap: 3,
    ...over,
  };
}

// ── calcMovement ─────────────────────────────────────

describe('calcMovement', () => {
  it('returns 1 for MOV 8 (base)', () => {
    expect(calcMovement(makeParticipant({ mov: 8 }), false)).toBe(1);
  });

  it('sprint adds 1', () => {
    expect(calcMovement(makeParticipant({ mov: 8 }), true)).toBe(2);
  });

  it('MOV 10 gets +2 extra positions', () => {
    expect(calcMovement(makeParticipant({ mov: 10 }), false)).toBe(3);
  });

  it('MOV 6 still gets minimum 1', () => {
    expect(calcMovement(makeParticipant({ mov: 6 }), false)).toBe(1);
  });

  it('MOV 7 still gets minimum 1 (below base)', () => {
    expect(calcMovement(makeParticipant({ mov: 7 }), false)).toBe(1);
  });

  it('MOV 12 sprint gives 6', () => {
    // base=1, extra=12-8=4 → 5 + sprint=6
    expect(calcMovement(makeParticipant({ mov: 12 }), true)).toBe(6);
  });
});

// ── getGap ───────────────────────────────────────────

describe('getGap', () => {
  it('returns distance between pursuer and quarry', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'p', role: 'pursuer', position: 2 }),
        makeParticipant({ id: 'q', role: 'quarry', position: 5 }),
      ],
    });
    expect(getGap(chase)).toBe(3);
  });

  it('returns 0 when caught (same position)', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'p', role: 'pursuer', position: 4 }),
        makeParticipant({ id: 'q', role: 'quarry', position: 4 }),
      ],
    });
    expect(getGap(chase)).toBe(0);
  });

  it('returns 0 when pursuer ahead of quarry', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'p', role: 'pursuer', position: 6 }),
        makeParticipant({ id: 'q', role: 'quarry', position: 4 }),
      ],
    });
    expect(getGap(chase)).toBe(0);
  });

  it('ignores escaped participants', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'p', role: 'pursuer', position: 2 }),
        makeParticipant({ id: 'q1', role: 'quarry', position: 8, flags: { fallen: false, trapped: false, exhausted: false, escaped: true, caught: false } }),
        makeParticipant({ id: 'q2', role: 'quarry', position: 5 }),
      ],
    });
    expect(getGap(chase)).toBe(3); // q2 at 5, p at 2
  });

  it('returns 0 when no active pursuers', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'p', role: 'pursuer', position: 2, flags: { fallen: false, trapped: false, exhausted: false, escaped: true, caught: false } }),
        makeParticipant({ id: 'q', role: 'quarry', position: 5 }),
      ],
    });
    expect(getGap(chase)).toBe(0);
  });

  it('uses max pursuer and min quarry for multi-participant', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'p1', role: 'pursuer', position: 1 }),
        makeParticipant({ id: 'p2', role: 'pursuer', position: 3 }),
        makeParticipant({ id: 'q1', role: 'quarry', position: 5 }),
        makeParticipant({ id: 'q2', role: 'quarry', position: 7 }),
      ],
    });
    // pMax=3, qMin=5 → gap=2
    expect(getGap(chase)).toBe(2);
  });
});

// ── checkChaseEnd ────────────────────────────────────

describe('checkChaseEnd', () => {
  it('caught when gap is 0', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'p', role: 'pursuer', position: 5 }),
        makeParticipant({ id: 'q', role: 'quarry', position: 5 }),
      ],
    });
    const result = checkChaseEnd(chase);
    expect(result.ended).toBe(true);
    expect(result.reason).toBe('caught');
  });

  it('escaped when quarry reaches last location', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'p', role: 'pursuer', position: 2 }),
        makeParticipant({ id: 'q', role: 'quarry', position: 9 }), // 10 locations → max index = 9
      ],
    });
    const result = checkChaseEnd(chase);
    expect(result.ended).toBe(true);
    expect(result.reason).toBe('escaped');
  });

  it('exhausted when all pursuers exhausted', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({
          id: 'p1', role: 'pursuer', position: 1,
          flags: { fallen: false, trapped: false, exhausted: true, escaped: false, caught: false },
        }),
        makeParticipant({
          id: 'p2', role: 'pursuer', position: 2,
          flags: { fallen: false, trapped: false, exhausted: true, escaped: false, caught: false },
        }),
        makeParticipant({ id: 'q', role: 'quarry', position: 7 }),
      ],
    });
    const result = checkChaseEnd(chase);
    expect(result.ended).toBe(true);
    expect(result.reason).toBe('exhausted');
  });

  it('not ended during normal chase', () => {
    const chase = makeChase(); // default: pursuer at 1, quarry at 4
    const result = checkChaseEnd(chase);
    expect(result.ended).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it('not exhausted if only some pursuers exhausted', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({
          id: 'p1', role: 'pursuer', position: 1,
          flags: { fallen: false, trapped: false, exhausted: true, escaped: false, caught: false },
        }),
        makeParticipant({ id: 'p2', role: 'pursuer', position: 2 }),
        makeParticipant({ id: 'q', role: 'quarry', position: 7 }),
      ],
    });
    const result = checkChaseEnd(chase);
    expect(result.ended).toBe(false);
  });
});

// ── moveParticipant ──────────────────────────────────

describe('moveParticipant', () => {
  it('moves forward by movement value (no sprint)', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 3, mov: 8 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = moveParticipant(chase, 'q1', false);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.position).toBe(4); // base movement 1
    expect(q.sprintCount).toBe(0);
  });

  it('sprint increments sprintCount', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 3, mov: 8, sprintCount: 0 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = moveParticipant(chase, 'q1', true);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.position).toBe(5); // base 1 + sprint 1 = 2
    expect(q.sprintCount).toBe(1);
  });

  it('CON check every 5 sprints — fail reduces MOV', () => {
    // sprintCount=4, so next sprint (5th) triggers CON check
    // CON=50, roll=80 → fail
    const rng = rngForD100(80);
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 2, mov: 9, con: 50, sprintCount: 4 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = moveParticipant(chase, 'q1', true, rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.sprintCount).toBe(5);
    expect(q.mov).toBe(8); // was 9, reduced by 1
    expect(q.flags.exhausted).toBe(false);
    expect(q.conChecksUsed).toBe(1);
    expect(result.diceRecords.length).toBe(1);
  });

  it('CON check pass does not reduce MOV', () => {
    // sprintCount=4, CON=50, roll=30 → success
    const rng = rngForD100(30);
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 2, mov: 9, con: 50, sprintCount: 4 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = moveParticipant(chase, 'q1', true, rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.mov).toBe(9); // unchanged
    expect(q.flags.exhausted).toBe(false);
  });

  it('exhausted when MOV drops below 1 after CON fail', () => {
    // MOV=1, sprintCount=4, CON=50, roll=80 → fail → MOV would be 0 → exhausted
    const rng = rngForD100(80);
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 2, mov: 1, con: 50, sprintCount: 4 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = moveParticipant(chase, 'q1', true, rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.flags.exhausted).toBe(true);
    expect(q.mov).toBe(1); // clamped at 1
  });

  it('position clamped to max location index', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 8, mov: 10 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    // movement = 1 + (10-8) = 3, position 8+3=11 → clamped to 9 (10 locations)
    const result = moveParticipant(chase, 'q1', false);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.position).toBe(9);
  });

  it('no CON check on non-5th sprint', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 2, mov: 8, sprintCount: 2 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    // sprintCount becomes 3, not a multiple of 5 → no CON check → no rng consumption
    const result = moveParticipant(chase, 'q1', true);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.sprintCount).toBe(3);
    expect(result.diceRecords.length).toBe(0);
  });

  it('generates log entry', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', name: '田中', role: 'quarry', position: 3, mov: 8 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = moveParticipant(chase, 'q1', false);
    expect(result.log.length).toBeGreaterThanOrEqual(1);
    expect(result.log[0].text).toContain('田中');
    expect(result.log[0].text).toContain('1');
  });

  it('does not mutate the original chase', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 3, mov: 8 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const originalPos = chase.participants.find((p) => p.id === 'q1')!.position;
    moveParticipant(chase, 'q1', true);
    expect(chase.participants.find((p) => p.id === 'q1')!.position).toBe(originalPos);
  });
});

// ── attemptShortcut ──────────────────────────────────

describe('attemptShortcut', () => {
  it('success gives +1 extra position', () => {
    // 跳跃=60, roll=30 → success
    const rng = rngForD100(30);
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 3, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = attemptShortcut(chase, 'q1', '跳跃', rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.position).toBe(4); // 3 + 1
    expect(result.diceRecords.length).toBe(1);
    expect(result.diceRecords[0].type).toBe('success');
  });

  it('failure gives no extra movement', () => {
    // 跳跃=60, roll=80 → fail
    const rng = rngForD100(80);
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 3, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = attemptShortcut(chase, 'q1', '跳跃', rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.position).toBe(3); // unchanged
    expect(result.diceRecords.length).toBe(1);
    expect(result.diceRecords[0].type).toBe('failure');
  });

  it('missing skill treated as 0 → always fails', () => {
    // 没有"驾驶"技能 → 0, roll=5 → still fail (5 > 0)
    const rng = rngForD100(5);
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 3, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = attemptShortcut(chase, 'q1', '驾驶', rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.position).toBe(3);
  });

  it('success clamped to max position', () => {
    const rng = rngForD100(30);
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 9, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = attemptShortcut(chase, 'q1', '跳跃', rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.position).toBe(9); // clamped at 9 (10 locations)
  });

  it('generates log entry on success', () => {
    const rng = rngForD100(30);
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', name: '田中', role: 'quarry', position: 3, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = attemptShortcut(chase, 'q1', '跳跃', rng);
    expect(result.log.some((l) => l.text.includes('田中') && l.text.includes('抄近路'))).toBe(true);
  });
});

// ── createBarricade ──────────────────────────────────

describe('createBarricade', () => {
  it('adds barrier to location behind participant', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 5 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = createBarricade(chase, 'q1', 'STR', 'hard');
    // Barrier added to position 4 (position - 1)
    expect(result.locations[4].barrier).toBeDefined();
    expect(result.locations[4].barrier!.skill).toBe('STR');
    expect(result.locations[4].barrier!.difficulty).toBe('hard');
    expect(result.locations[4].barrier!.breakThrough).toBe(true);
  });

  it('generates log entry', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', name: '田中', role: 'quarry', position: 5 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = createBarricade(chase, 'q1');
    expect(result.log.some((l) => l.text.includes('田中') && l.text.includes('路障'))).toBe(true);
  });

  it('does not mutate original locations', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 5 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    createBarricade(chase, 'q1');
    expect(chase.locations[4].barrier).toBeUndefined();
  });

  it('defaults to STR and normal difficulty', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 5 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = createBarricade(chase, 'q1');
    expect(result.locations[4].barrier!.skill).toBe('STR');
    expect(result.locations[4].barrier!.difficulty).toBe('normal');
  });
});

// ── resolveHazard ────────────────────────────────────

describe('resolveHazard', () => {
  it('pass hazard — no consequence applied', () => {
    // 跳跃=60, normal diff → target=60, roll=30 → success
    const rng = rngForD100(30);
    const chase = makeChase({
      locations: [
        ...Array.from({ length: 3 }, (_, i) => makeLocation({ name: `位置${i}` })),
        makeLocation({
          name: '坍塌走廊',
          hazard: { skill: '跳跃', difficulty: 'normal', failConsequence: 'fall' },
        }),
        ...Array.from({ length: 6 }, (_, i) => makeLocation({ name: `位置${i + 4}` })),
      ],
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 3, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = resolveHazard(chase, 'q1', rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.flags.fallen).toBe(false);
    expect(result.diceRecords.length).toBe(1);
    expect(result.diceRecords[0].type).toBe('success');
  });

  it('fail hazard — fall consequence', () => {
    // 跳跃=60, normal diff → target=60, roll=80 → fail
    const rng = rngForD100(80);
    const chase = makeChase({
      locations: [
        ...Array.from({ length: 3 }, (_, i) => makeLocation({ name: `位置${i}` })),
        makeLocation({
          name: '坍塌走廊',
          hazard: { skill: '跳跃', difficulty: 'normal', failConsequence: 'fall' },
        }),
        ...Array.from({ length: 6 }, (_, i) => makeLocation({ name: `位置${i + 4}` })),
      ],
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 3, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = resolveHazard(chase, 'q1', rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.flags.fallen).toBe(true);
  });

  it('fail hazard — trapped consequence', () => {
    const rng = rngForD100(80);
    const chase = makeChase({
      locations: [
        makeLocation({
          name: '铁丝网',
          hazard: { skill: '跳跃', difficulty: 'normal', failConsequence: 'trapped' },
        }),
        ...Array.from({ length: 9 }, (_, i) => makeLocation({ name: `位置${i + 1}` })),
      ],
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 0, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = resolveHazard(chase, 'q1', rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.flags.trapped).toBe(true);
  });

  it('fail hazard — damage consequence logs damage', () => {
    const rng = rngForD100(80);
    const chase = makeChase({
      locations: [
        makeLocation({
          name: '碎玻璃',
          hazard: { skill: '跳跃', difficulty: 'normal', failConsequence: 'damage', damage: '1D6' },
        }),
        ...Array.from({ length: 9 }, (_, i) => makeLocation({ name: `位置${i + 1}` })),
      ],
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 0, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = resolveHazard(chase, 'q1', rng);
    expect(result.log.some((l) => l.text.includes('伤害') && l.text.includes('1D6'))).toBe(true);
  });

  it('hard difficulty uses half skill value', () => {
    // 跳跃=60, hard diff → target=30, roll=35 → fail (35 > 30)
    const rng = rngForD100(35);
    const chase = makeChase({
      locations: [
        makeLocation({
          name: '高墙',
          hazard: { skill: '跳跃', difficulty: 'hard', failConsequence: 'fall' },
        }),
        ...Array.from({ length: 9 }, (_, i) => makeLocation({ name: `位置${i + 1}` })),
      ],
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 0, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = resolveHazard(chase, 'q1', rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.flags.fallen).toBe(true);
  });

  it('extreme difficulty uses one-fifth skill value', () => {
    // 跳跃=60, extreme diff → target=12, roll=15 → fail (15 > 12)
    const rng = rngForD100(15);
    const chase = makeChase({
      locations: [
        makeLocation({
          name: '断桥',
          hazard: { skill: '跳跃', difficulty: 'extreme', failConsequence: 'fall' },
        }),
        ...Array.from({ length: 9 }, (_, i) => makeLocation({ name: `位置${i + 1}` })),
      ],
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 0, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = resolveHazard(chase, 'q1', rng);
    const q = result.participants.find((p) => p.id === 'q1')!;
    expect(q.flags.fallen).toBe(true);
  });

  it('no hazard or barrier — returns chase unchanged', () => {
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 3 }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const result = resolveHazard(chase, 'q1');
    expect(result.log.length).toBe(0);
    expect(result.diceRecords.length).toBe(0);
  });

  it('barrier fail — logs blocked message', () => {
    const rng = rngForD100(80);
    const chase = makeChase({
      locations: [
        makeLocation({
          name: '翻倒的货车',
          barrier: { skill: 'STR', difficulty: 'normal', breakThrough: true },
        }),
        ...Array.from({ length: 9 }, (_, i) => makeLocation({ name: `位置${i + 1}` })),
      ],
      participants: [
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0, skills: { STR: 50 } }),
        makeParticipant({ id: 'q1', role: 'quarry', position: 5 }),
      ],
    });
    const result = resolveHazard(chase, 'p1', rng);
    expect(result.log.some((l) => l.text.includes('路障'))).toBe(true);
  });

  it('barrier pass — no flags set', () => {
    const rng = rngForD100(30);
    const chase = makeChase({
      locations: [
        makeLocation({
          name: '翻倒的货车',
          barrier: { skill: 'STR', difficulty: 'normal', breakThrough: true },
        }),
        ...Array.from({ length: 9 }, (_, i) => makeLocation({ name: `位置${i + 1}` })),
      ],
      participants: [
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0, skills: { STR: 50 } }),
        makeParticipant({ id: 'q1', role: 'quarry', position: 5 }),
      ],
    });
    const result = resolveHazard(chase, 'p1', rng);
    const p = result.participants.find((pp) => pp.id === 'p1')!;
    expect(p.flags.fallen).toBe(false);
    expect(p.flags.trapped).toBe(false);
  });
});

// ── immutability ─────────────────────────────────────

describe('immutability', () => {
  it('attemptShortcut does not mutate original', () => {
    const rng = rngForD100(30);
    const chase = makeChase({
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 3, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    const origPos = chase.participants[0].position;
    attemptShortcut(chase, 'q1', '跳跃', rng);
    expect(chase.participants[0].position).toBe(origPos);
    expect(chase.log.length).toBe(0);
    expect(chase.diceRecords.length).toBe(0);
  });

  it('resolveHazard does not mutate original', () => {
    const rng = rngForD100(80);
    const chase = makeChase({
      locations: [
        makeLocation({
          name: '坑洞',
          hazard: { skill: '跳跃', difficulty: 'normal', failConsequence: 'fall' },
        }),
        ...Array.from({ length: 9 }, (_, i) => makeLocation({ name: `位置${i + 1}` })),
      ],
      participants: [
        makeParticipant({ id: 'q1', role: 'quarry', position: 0, skills: { 跳跃: 60 } }),
        makeParticipant({ id: 'p1', role: 'pursuer', position: 0 }),
      ],
    });
    resolveHazard(chase, 'q1', rng);
    expect(chase.participants[0].flags.fallen).toBe(false);
  });
});
