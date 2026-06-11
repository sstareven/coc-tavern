/**
 * A2 重设 — boutEvaluator(原 sanityEvaluator)：post-settle 相位读 patchReport.charSheetDeltas.sanDelta,
 * 调 evaluateSanLoss(A2.2 纯函数)判断本次事件是否触发:
 *  - 永久疯狂 (SAN ≤ 0)   → emit `/调查员/永久疯狂 = true`
 *  - 不定性疯狂 (当日累计 ≥ maxSan/5) → emit `/调查员/不定性疯狂/active = true`
 *  - 临时疯狂发作 (|delta| ≥ 5) → 按 boutMode 触发 triggerBout(realtime/summary)
 *
 * C3 潜伏疯狂（COC7e p132）：
 *   bout 结束后进入 1D10 小时潜伏期——latentInsanity{active,expiresAtEpoch} 已在 triggerBout 时写入。
 *   在此窗口内（且 bout 已结束即 temporaryInsanity.active=false），任何 SAN loss ≥ 1
 *   直接触发新发作，跳过 |delta|≥5 阈值判定。
 *   如果窗口已过期（epoch > expiresAtEpoch），自动清除 latentInsanity。
 *
 * 与旧 sanityEvaluator 的关键差异:
 *   旧版在 |delta|≥5 时弹 DicePanel 跑 INT 检定,INT 失败再 triggerBout。
 *   新版【删除】这条 INT-check 自动弹窗分支——INT 检定现在由 SanityCheckPanel 在 SAN loss
 *   落地后【作为第二阶段】触发(给玩家"忽视/接受"的选择面),不再绕道 DicePanel。
 *   boutEvaluator 只剩后置判定: SAN delta 真实落账后直接进入 Bout 路径(realtime/summary)。
 *
 * 模块加载即把自己挂进 post-settle-evaluators 注册表(useChatPipeline 顶部 side-effect import 触发)。
 * 重复触发幂等: fingerprint = patchReport.charSheetDeltas.episodeId(processResponse 生成的 pageIdx:Date.now())。
 *
 * 设计点:
 *  - 优先级: 永久 > 不定 > Bout。永久疯狂触发即终局,不再启动临时疯狂发作。
 *  - hasCompanionsPresent / allCompanionsInsane: M1 默认 (true, false); 战斗在场检测属 M2,先简化。
 *  - 触发 Bout 的阈值仍是 |delta| ≥ 5(R6 中"单次损失 ≥ 5 触发临时疯狂候选"的承袭)。
 *  - C3 潜伏疯狂：在 bout 不 active 且 latentInsanity 窗口内时，任何 |delta| ≥ 1 即触发。
 */

import type { EvaluatorContext, Evaluator } from './post-settle-evaluators';
import { registerEvaluator } from './post-settle-evaluators';
import { evaluateSanLoss } from './sanity-engine';
import { triggerBout } from './bout-dispatch';
import { getTreePath } from './mvu-var-access';

/**
 * Fingerprint dedupe 缓存: 以 episodeId 为键。同一事件(同 pageIdx:时间戳)再次跑 evaluator
 * 不重复触发 Bout / 重复写永久疯狂——若 useChatPipeline 因某种原因二次跑 settleVariables 也安全。
 * 用 Set 而非 Map,因为目前只关心"是否处理过"。
 */
const PROCESSED_EPISODES = new Set<string>();

/** 测试钩子: 清空指纹缓存。仅 *.test.ts 用。 */
export function _resetBoutEvaluatorCacheForTest(): void {
  PROCESSED_EPISODES.clear();
}

export const boutEvaluator: Evaluator = (ctx: EvaluatorContext): void => {
  const cs = ctx.patchReport.charSheetDeltas;
  // 没有 SAN 旁路或 sanDelta>=0(恢复 / 0 变化): 本回合无 SAN 损失事件,直接放行。
  if (!cs || typeof cs.sanDelta !== 'number' || cs.sanDelta >= 0) return;

  // 指纹去重: 相同 episodeId 已处理过则跳过——防 settleVariables 二次入口或 evaluator 链多次运行重复触发。
  const fingerprint = cs.episodeId ?? `nofp:${cs.sanDelta}:${ctx.sheet.secondary.san.current}`;
  if (PROCESSED_EPISODES.has(fingerprint)) return;
  PROCESSED_EPISODES.add(fingerprint);

  const evalResult = evaluateSanLoss({
    oldSan: ctx.sheet.secondary.san.current - cs.sanDelta, // 当前 SAN 已是扣损后; 旧 SAN = 新 - delta(delta 为负)
    delta: cs.sanDelta,
    sanMax: ctx.sheet.secondary.san.max,
    dailyAccumulated: ctx.sheet.dailySanLoss,
    hasCompanionsPresent: true,   // M1 默认: 同伴在场(避免单调走 summary 路径)。M2 战斗在场检测会替换。
    allCompanionsInsane: false,
  });

  // 优先级: 永久 > 不定 > Bout。终局/严重态触发即不再触发临时疯狂发作。
  if (evalResult.permanentTriggered) {
    ctx.applyCorrectiveOps([{ op: 'replace', path: '/调查员/永久疯狂', value: true }]);
    return;
  }
  if (evalResult.indefiniteTriggered) {
    ctx.applyCorrectiveOps([{ op: 'replace', path: '/调查员/不定性疯狂/active', value: true }]);
    return;
  }

  // C3 潜伏疯狂：检测过期 & 窗口内 SAN loss ≥ 1 直接触发新发作。
  const latent = ctx.sheet.latentInsanity;
  const epochNow = Number(getTreePath(ctx.statData, '世界.时间.epoch')) || 0;
  let latentEffective = false;  // 当前 latent 是否仍在有效窗口内

  if (latent?.active && epochNow > 0) {
    if (epochNow >= latent.expiresAtEpoch) {
      // 已过期——清除标志，继续走正常阈值判定。
      ctx.applyCorrectiveOps([{ op: 'replace', path: '/调查员/潜伏疯狂', value: null }]);
    } else {
      latentEffective = true;
    }
  }

  // C3 潜伏疯狂：bout 不 active 且在 latent 窗口内，任何 SAN loss ≥ 1 直接触发新发作。
  // bout active 期间不走此路径——bout 已经占据控制权，latent 在 bout 结束后才生效。
  const boutActive = ctx.sheet.temporaryInsanity.active;
  if (latentEffective && !boutActive && Math.abs(cs.sanDelta) >= 1) {
    triggerBout(ctx, evalResult.boutMode);
    return;
  }

  // A2 重设: |delta|≥5 直接触发 Bout, 不再绕道 DicePanel 跑 INT。
  // 旧路径(sanityEvaluator 弹 DicePanel 跑 INT 通过→放过 / 失败→Bout)已删除——
  // INT "忽视"判定移到 SanityCheckPanel 内的第二阶段, 由玩家明示决策。
  if (evalResult.intRollNeeded) {
    triggerBout(ctx, evalResult.boutMode);
  }
};

// 模块加载即注册——useChatPipeline 顶部一行 side-effect import 触发此处。
registerEvaluator('bout', boutEvaluator);
