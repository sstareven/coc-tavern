/**
 * milestone-san-engine.ts — 里程碑 SAN 恢复纯函数 (COC7e p180)
 *
 * 规则:调查员完成一个重大调查目标时,守秘人奖励 +1D6 SAN。
 * 本模块零 import 副作用、零 store 依赖,供 milestone-san-evaluator 与测试共用。
 */

import type { AnchorNode } from '../types';

/* ------------------------------------------------------------------ */
/*  detectNewlyReachedNodes — 从 summaries 推断已到达节点,减去已奖励集    */
/* ------------------------------------------------------------------ */

/**
 * 判断哪些 anchor 节点已被事件时间线涵盖（title 出现在 summaries 里）
 * 但尚未获得过 SAN 奖励。
 *
 * @param nodes        本局剧情蓝图的有序骨架节点
 * @param summaries    最近若干页 page.summary 列表(旧→新)
 * @param rewardedIds  已奖励过 SAN 的节点 id 集合
 * @returns 本次新到达且未奖励的节点 id 列表(按 nodes 顺序)
 */
export function detectNewlyReachedNodes(
  nodes: AnchorNode[],
  summaries: string[],
  rewardedIds: ReadonlySet<string>,
): string[] {
  if (nodes.length === 0 || summaries.length === 0) return [];
  const joined = summaries.join('\n');
  const result: string[] = [];
  for (const n of nodes) {
    if (joined.includes(n.title) && !rewardedIds.has(n.id)) {
      result.push(n.id);
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  rollMilestoneSanRecovery — 掷 1D6 并 cap 到 sanMax               */
/* ------------------------------------------------------------------ */

export interface MilestoneSanResult {
  /** 实际恢复量(已 cap 到 sanMax - currentSan) */
  recovered: number;
  /** 骰子面值 1-6 */
  roll: number;
  /** 触发此恢复的节点 id */
  nodeId: string;
}

/**
 * 为单个里程碑完成掷 1D6 SAN 恢复。
 *
 * @param nodeId     触发恢复的节点 id
 * @param currentSan 当前 SAN 值
 * @param sanMax     SAN 上限
 * @param rng        随机数生成器 [0,1)，默认 Math.random
 */
export function rollMilestoneSanRecovery(
  nodeId: string,
  currentSan: number,
  sanMax: number,
  rng: () => number = Math.random,
): MilestoneSanResult {
  if (currentSan >= sanMax) return { recovered: 0, roll: 0, nodeId };
  const roll = Math.floor(rng() * 6) + 1; // 1D6
  const recovered = Math.min(roll, sanMax - currentSan);
  return { recovered, roll, nodeId };
}
