/**
 * chase-engine.ts — COC7e Chapter 7 追逐规则引擎
 *
 * 纯函数、不可变返回、可注入 RNG。与 combat-engine.ts 同模式。
 */
import type { Chase, ChaseParticipant, ChaseLocation, CombatLogEntry, DiceRecord } from '../types';
import { d100WithDice, successLevel, type Rng } from './combat-engine';

// ── 常量 ──────────────────────────────────────────────

/** COC7e 基准 MOV——移动力等于此值时每轮前进 1 个位置。 */
const BASE_MOV = 8;

/** 难度→实际目标：normal=原值 / hard=半值 / extreme=五分之一。 */
const DIFFICULTY_TARGET: Record<string, (skill: number) => number> = {
  normal: (s) => s,
  hard:   (s) => Math.floor(s / 2),
  extreme:(s) => Math.floor(s / 5),
};

/** 每隔多少次冲刺须做 CON 检定。 */
const SPRINT_CON_INTERVAL = 5;

// ── 内部辅助 ─────────────────────────────────────────

/** 追加一条日志并返回新 Chase（不可变）。 */
function logEntry(chase: Chase, text: string, kind: CombatLogEntry['kind'] = 'narrative'): Chase {
  return { ...chase, log: [...chase.log, { text, kind }] };
}

/** 按 id 查找并替换参与者（不可变）。 */
function replaceParticipant(chase: Chase, updated: ChaseParticipant): Chase {
  return {
    ...chase,
    participants: chase.participants.map((p) => (p.id === updated.id ? updated : p)),
  };
}

/** 追加一条骰子记录。 */
function addDiceRecord(chase: Chase, rec: DiceRecord): Chase {
  return { ...chase, diceRecords: [...chase.diceRecords, rec] };
}

/** 查找参与者，不存在则抛。 */
function findParticipant(chase: Chase, id: string): ChaseParticipant {
  const p = chase.participants.find((x) => x.id === id);
  if (!p) throw new Error(`chase participant not found: ${id}`);
  return p;
}

/** 将位置限制在 [0, locations.length - 1]。 */
function clampPosition(pos: number, chase: Chase): number {
  return Math.max(0, Math.min(pos, chase.locations.length - 1));
}

// ── 导出函数 ─────────────────────────────────────────

/**
 * 计算参与者本轮可前进的位置数。
 * MOV 8 = 1 位置；每比基准多 1 MOV → 多 1 位置；冲刺再 +1。
 * MOV 低于基准时最小仍为 1（规则书：至少前进 1 位置）。
 */
export function calcMovement(p: ChaseParticipant, sprinting: boolean): number {
  const base = 1 + Math.max(0, p.mov - BASE_MOV);
  return sprinting ? base + 1 : base;
}

/**
 * 当前追逐间距：最前方追捕者与最后方猎物之间的位置差。
 * 间距 ≤ 0 视为被抓住。若一方无存活者返回 0。
 */
export function getGap(chase: Chase): number {
  const pursuers = chase.participants.filter(
    (p) => p.role === 'pursuer' && !p.flags.caught && !p.flags.escaped,
  );
  const quarries = chase.participants.filter(
    (p) => p.role === 'quarry' && !p.flags.caught && !p.flags.escaped,
  );
  if (!pursuers.length || !quarries.length) return 0;
  const pMax = Math.max(...pursuers.map((p) => p.position));
  const qMin = Math.min(...quarries.map((p) => p.position));
  return Math.max(0, qMin - pMax);
}

/**
 * 判定追逐是否结束及原因：
 *  - caught: 间距 ≤ 0
 *  - escaped: 猎物到达最后位置
 *  - exhausted: 全部追捕者筋疲力尽
 */
export function checkChaseEnd(chase: Chase): { ended: boolean; reason?: Chase['endReason'] } {
  if (getGap(chase) <= 0) return { ended: true, reason: 'caught' };
  const maxPos = chase.locations.length - 1;
  if (chase.participants.some((p) => p.role === 'quarry' && p.position >= maxPos && !p.flags.caught)) {
    return { ended: true, reason: 'escaped' };
  }
  const pursuers = chase.participants.filter((p) => p.role === 'pursuer');
  if (pursuers.length > 0 && pursuers.every((p) => p.flags.exhausted)) {
    return { ended: true, reason: 'exhausted' };
  }
  return { ended: false };
}

/**
 * 将参与者向前移动。冲刺时 sprintCount 累加；
 * 每满 SPRINT_CON_INTERVAL 次冲刺须做 CON 检定，失败则 MOV-1 且可能力竭。
 */
export function moveParticipant(
  chase: Chase,
  participantId: string,
  sprinting: boolean,
  rng: Rng = Math.random,
): Chase {
  let p = findParticipant(chase, participantId);
  const movement = calcMovement(p, sprinting);
  const newPos = clampPosition(p.position + movement, chase);
  p = { ...p, position: newPos };

  let c = replaceParticipant(chase, p);
  c = logEntry(c, `${p.name} 前进 ${movement} 格至位置 ${newPos}${sprinting ? '（冲刺）' : ''}`);

  // 冲刺逻辑
  if (sprinting) {
    p = { ...p, sprintCount: p.sprintCount + 1 };

    // 每 SPRINT_CON_INTERVAL 次冲刺须做 CON 检定
    if (p.sprintCount % SPRINT_CON_INTERVAL === 0) {
      const roll = d100WithDice(0, 0, rng);
      const level = successLevel(roll.finalRoll, p.con);
      const passed = level !== 'fail' && level !== 'fumble';

      c = replaceParticipant(c, p);
      c = addDiceRecord(c, {
        skill: 'CON',
        roll: String(roll.finalRoll),
        target: String(p.con),
        type: passed ? 'success' : 'failure',
        time: Date.now(),
        purpose: '冲刺体质检定',
      });

      if (!passed) {
        const newMov = p.mov - 1;
        const exhausted = newMov < 1;
        p = {
          ...p,
          mov: Math.max(1, newMov),
          conChecksUsed: p.conChecksUsed + 1,
          flags: { ...p.flags, exhausted },
        };
        c = replaceParticipant(c, p);
        c = logEntry(
          c,
          exhausted
            ? `${p.name} 体力不支，力竭倒地！`
            : `${p.name} 未通过 CON 检定，MOV 降至 ${p.mov}`,
          'roll',
        );
      } else {
        p = { ...p, conChecksUsed: p.conChecksUsed + 1 };
        c = replaceParticipant(c, p);
        c = logEntry(c, `${p.name} 通过了冲刺 CON 检定`, 'roll');
      }
    } else {
      c = replaceParticipant(c, p);
    }
  }

  return c;
}

/**
 * 尝试抄近路——以指定技能做 normal 难度检定；
 * 成功额外前进 1 格，失败无额外移动。
 */
export function attemptShortcut(
  chase: Chase,
  participantId: string,
  skillName: string,
  rng: Rng = Math.random,
): Chase {
  const p = findParticipant(chase, participantId);
  const skillValue = p.skills[skillName] ?? 0;
  const roll = d100WithDice(0, 0, rng);
  const level = successLevel(roll.finalRoll, skillValue);
  const passed = level !== 'fail' && level !== 'fumble';

  let c = addDiceRecord(chase, {
    skill: skillName,
    roll: String(roll.finalRoll),
    target: String(skillValue),
    type: passed ? 'success' : 'failure',
    time: Date.now(),
    purpose: '抄近路',
  });

  if (passed) {
    const newPos = clampPosition(p.position + 1, c);
    const updated = { ...p, position: newPos };
    c = replaceParticipant(c, updated);
    c = logEntry(c, `${p.name} 成功抄近路（${skillName} ${roll.finalRoll}/${skillValue}），前进至位置 ${newPos}`, 'roll');
  } else {
    c = logEntry(c, `${p.name} 抄近路失败（${skillName} ${roll.finalRoll}/${skillValue}）`, 'roll');
  }

  return c;
}

/**
 * 在身后制造路障——在参与者当前位置添加 barrier；
 * 追捕者经过该位置须通过技能检定。
 */
export function createBarricade(
  chase: Chase,
  participantId: string,
  skillName: string = 'STR',
  difficulty: 'normal' | 'hard' | 'extreme' = 'normal',
): Chase {
  const p = findParticipant(chase, participantId);
  const locIdx = Math.max(0, p.position - 1); // 刚经过的位置
  const loc = chase.locations[locIdx];
  if (!loc) return chase;

  const updatedLoc: ChaseLocation = {
    ...loc,
    barrier: {
      skill: skillName,
      difficulty,
      breakThrough: true,
    },
  };

  const newLocations = chase.locations.map((l, i) => (i === locIdx ? updatedLoc : l));
  let c: Chase = { ...chase, locations: newLocations };
  c = logEntry(c, `${p.name} 在「${loc.name}」处制造了路障`);
  return c;
}

/**
 * 结算当前位置的危险（hazard）或路障（barrier）。
 * 按位置上设定的技能与难度掷检定；
 * 失败则施加对应后果（fall/trapped/damage）。
 */
export function resolveHazard(
  chase: Chase,
  participantId: string,
  rng: Rng = Math.random,
): Chase {
  const p = findParticipant(chase, participantId);
  const loc = chase.locations[p.position];
  if (!loc) return chase;

  const obstacle = loc.hazard ?? loc.barrier;
  if (!obstacle) return chase;

  const skillValue = p.skills[obstacle.skill] ?? 0;
  const target = DIFFICULTY_TARGET[obstacle.difficulty]?.(skillValue) ?? skillValue;
  const roll = d100WithDice(0, 0, rng);
  const level = successLevel(roll.finalRoll, target);
  const passed = level !== 'fail' && level !== 'fumble';

  const isBarrier = !!loc.barrier && !loc.hazard;
  const label = isBarrier ? '路障' : '危险';

  let c = addDiceRecord(chase, {
    skill: obstacle.skill,
    roll: String(roll.finalRoll),
    target: String(target),
    type: passed ? 'success' : 'failure',
    time: Date.now(),
    purpose: `${label}检定`,
  });

  if (passed) {
    c = logEntry(c, `${p.name} 成功通过「${loc.name}」的${label}（${obstacle.skill} ${roll.finalRoll}/${target}）`, 'roll');
    return c;
  }

  // 失败——施加后果
  if (loc.hazard) {
    const consequence = loc.hazard.failConsequence;
    let updated: ChaseParticipant;
    switch (consequence) {
      case 'fall':
        updated = { ...p, flags: { ...p.flags, fallen: true } };
        c = replaceParticipant(c, updated);
        c = logEntry(c, `${p.name} 在「${loc.name}」摔倒了！`, 'roll');
        break;
      case 'trapped':
        updated = { ...p, flags: { ...p.flags, trapped: true } };
        c = replaceParticipant(c, updated);
        c = logEntry(c, `${p.name} 在「${loc.name}」被困住了！`, 'roll');
        break;
      case 'damage':
        // 伤害由调用方处理（需要完整角色卡），此处仅记录
        c = logEntry(c, `${p.name} 在「${loc.name}」受到伤害！（${loc.hazard.damage ?? '1D3'}）`, 'roll');
        break;
    }
  } else {
    // 路障失败：被拦住，不能前进（位置不变，日志记录）
    c = logEntry(c, `${p.name} 未能突破「${loc.name}」的路障（${obstacle.skill} ${roll.finalRoll}/${target}）`, 'roll');
  }

  return c;
}
