/**
 * C2 — milestoneSanEvaluator: post-settle 相位读 useAnchorStore 的骨架节点,
 * 对比 useBookStore 页面摘要判定「本回合是否有新节点被剧情覆盖」;
 * 若有, 掷 1D6 恢复 SAN(cap 到 sanMax) 并 emit corrective op。
 *
 * COC7e p180:完成重大调查目标时, 守秘人奖励 +1D6 SAN。
 *
 * 幂等策略: 模块级 REWARDED_NODE_IDS 缓存, 同一节点 id 只奖励一次。
 * 切会话/新游戏 → clearAllGameState 调 _resetMilestoneSanCacheForTest() 清空。
 *
 * 模块加载即注册——useChatPipeline 顶部 side-effect import 触发。
 */

import type { EvaluatorContext, Evaluator } from './post-settle-evaluators';
import { registerEvaluator } from './post-settle-evaluators';
import { detectNewlyReachedNodes, rollMilestoneSanRecovery } from './milestone-san-engine';
import { useAnchorStore } from '../stores/useAnchorStore';
import { useBookStore } from '../stores/useBookStore';
import { useNarrationStore } from '../stores/useNarrationStore';

/**
 * 已奖励过里程碑 SAN 恢复的节点 id 缓存(会话内幂等)。
 * 切会话 / 新游戏 → sessionLifecycle 调 _resetMilestoneSanCacheForTest() 清空。
 */
const REWARDED_NODE_IDS = new Set<string>();

/** 测试/会话隔离钩子: 清空已奖励缓存。 */
export function _resetMilestoneSanCacheForTest(): void {
  REWARDED_NODE_IDS.clear();
}

export const milestoneSanEvaluator: Evaluator = (ctx: EvaluatorContext): void => {
  const { nodes } = useAnchorStore.getState().anchors;
  if (nodes.length === 0) return;

  // 取最近 N 页的 summary 用于判定节点覆盖(同 useChatPipeline 取法)
  const summaries = useBookStore.getState().pages
    .slice(-12)
    .map((p) => p.summary)
    .filter((s): s is string => !!s && s.trim().length > 0);

  const newNodeIds = detectNewlyReachedNodes(nodes, summaries, REWARDED_NODE_IDS);
  if (newNodeIds.length === 0) return;

  const currentSan = ctx.sheet.secondary.san.current;
  const sanMax = ctx.sheet.secondary.san.max;

  for (const nodeId of newNodeIds) {
    const result = rollMilestoneSanRecovery(nodeId, currentSan, sanMax);
    // 标记已奖励(不论 recovered 是否为 0 — SAN 已满也只奖一次)
    REWARDED_NODE_IDS.add(nodeId);

    if (result.recovered > 0) {
      ctx.applyCorrectiveOps([
        { op: 'delta', path: '/调查员/理智值/当前', value: result.recovered },
      ]);
      // 旁白通知: 落入本回合 BookPage.narration
      const node = nodes.find((n) => n.id === nodeId);
      const title = node?.title ?? nodeId;
      useNarrationStore.getState().append(
        `完成重大调查目标「${title}」，恢复 ${result.recovered} 点理智（掷骰 1D6=${result.roll}）。`,
      );
    }
  }
};

// 模块加载即注册
registerEvaluator('milestone-san', milestoneSanEvaluator);
