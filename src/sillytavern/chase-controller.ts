/**
 * chase-controller.ts — 追逐回合管理控制器
 *
 * 包装 chase-engine 纯函数，加入回合推进、玩家动作分发、AI 决策逻辑。
 * 与 combat-controller.ts 同模式：playerAction → checkEnd → advanceUntilPlayerOrEnd。
 */
import type { Chase } from '../types';
import {
  checkChaseEnd, moveParticipant,
  attemptShortcut, createBarricade,
} from './chase-engine';
import type { Rng } from './combat-engine';

export type ChaseAction = 'move' | 'sprint' | 'shortcut' | 'barricade' | 'attack' | 'hide';

// ── 回合推进 ─────────────────────────────────────────

/**
 * 推进到下一位参与者的回合；若当前轮已走完，开始新一轮：
 * 重建 turnOrder（排除 caught/escaped/exhausted），按 DEX 降序排列，round +1。
 */
export function advanceChaseTurn(chase: Chase): Chase {
  const next = chase.currentIdx + 1;
  if (next >= chase.turnOrder.length) {
    const activeIds = chase.participants
      .filter(p => !p.flags.caught && !p.flags.escaped && !p.flags.exhausted)
      .sort((a, b) => b.dex - a.dex)
      .map(p => p.id);
    return { ...chase, turnOrder: activeIds, currentIdx: 0, round: chase.round + 1 };
  }
  return { ...chase, currentIdx: next };
}

// ── 玩家动作 ─────────────────────────────────────────

/**
 * 玩家执行一个追逐动作，结算后自动推进 AI 回合直到再次轮到玩家或追逐结束。
 */
export function playerChaseAction(
  chase: Chase,
  action: ChaseAction,
  skillName?: string,
  rng: Rng = Math.random,
): Chase {
  const player = chase.participants.find(p => p.controlledBy === 'player');
  if (!player) return chase;

  let c = chase;
  switch (action) {
    case 'move':
      c = moveParticipant(c, player.id, false, rng);
      break;
    case 'sprint':
      c = moveParticipant(c, player.id, true, rng);
      break;
    case 'shortcut':
      if (skillName) c = attemptShortcut(c, player.id, skillName, rng);
      break;
    case 'barricade':
      c = createBarricade(c, player.id);
      break;
    case 'attack':
    case 'hide':
      // Future expansion
      break;
  }

  // Check end condition
  const end = checkChaseEnd(c);
  if (end.ended) return { ...c, status: 'resolving', endReason: end.reason };

  // Advance through AI turns until it's the player's turn again (or chase ends)
  return advanceUntilPlayerOrEnd(c, rng);
}

// ── AI 回合 ──────────────────────────────────────────

/**
 * 单个 NPC 的 AI 回合决策：
 *  - CON > 40 且冲刺次数 < 4 → 冲刺，否则普通移动
 *  - 猎物（quarry）且已前进过位置 → 50% 概率制造路障
 */
export function runAiChaseTurn(chase: Chase, participantId: string, rng: Rng = Math.random): Chase {
  const p = chase.participants.find(pp => pp.id === participantId);
  if (!p || p.flags.caught || p.flags.escaped || p.flags.exhausted) return chase;

  // Simple AI: prefer sprint if CON > 40 and not already sprinted 4+ times, else move
  const shouldSprint = p.con > 40 && p.sprintCount < 4;
  let c = moveParticipant(chase, participantId, shouldSprint, rng);

  // Quarry: try to create barricade if past first location
  if (p.role === 'quarry' && p.position > 0 && rng() > 0.5) {
    c = createBarricade(c, participantId);
  }

  return c;
}

// ── 内部推进循环 ─────────────────────────────────────

/**
 * 从当前位置推进，依次跑完所有 AI 回合，直到轮到玩家或追逐结束。
 */
function advanceUntilPlayerOrEnd(chase: Chase, rng: Rng = Math.random): Chase {
  let c = advanceChaseTurn(chase);
  const MAX_ITER = 50;
  for (let i = 0; i < MAX_ITER; i++) {
    const end = checkChaseEnd(c);
    if (end.ended) return { ...c, status: 'resolving', endReason: end.reason };

    const currentId = c.turnOrder[c.currentIdx];
    const current = c.participants.find(p => p.id === currentId);
    if (!current) { c = advanceChaseTurn(c); continue; }

    if (current.controlledBy === 'player') return c; // Player's turn

    // AI turn
    c = runAiChaseTurn(c, currentId, rng);
    const endAfterAi = checkChaseEnd(c);
    if (endAfterAi.ended) return { ...c, status: 'resolving', endReason: endAfterAi.reason };
    c = advanceChaseTurn(c);
  }
  return c;
}
