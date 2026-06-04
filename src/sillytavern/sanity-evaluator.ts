/**
 * A2.4 — sanityEvaluator：post-settle 相位读 patchReport.charSheetDeltas.sanDelta，
 * 调 evaluateSanLoss（A2.2 纯函数）判断本次事件是否触发：
 *  - 永久疯狂 (SAN ≤ 0)  → emit `/调查员/永久疯狂 = true`
 *  - 不定性疯狂（当日累计 ≥ maxSan/5） → emit `/调查员/不定性疯狂/active = true`
 *  - INT 检定（|delta| ≥ 5） → 打开 DicePanel 程序性检定；失败回调 triggerBout(realtime|summary)
 *
 * 模块加载即把自己挂进 post-settle-evaluators 注册表（useChatPipeline 顶部 side-effect import 触发）。
 * 重复触发幂等：fingerprint = patchReport.charSheetDeltas.episodeId（processResponse 生成的 pageIdx:Date.now()）。
 *
 * 设计点：
 *  - 优先级永久 > 不定 > INT（永久疯狂触发直接终局，不再开 INT 弹窗）。
 *  - hasCompanionsPresent / allCompanionsInsane：M1 默认 (true, false)；战斗在场检测属 M2，先简化。
 *  - INT 失败 → 把 boutMode（summary/realtime）传给 A2.5 triggerBout；INT 通过则放过本次事件。
 */

import type { EvaluatorContext, Evaluator } from './post-settle-evaluators';
import { registerEvaluator } from './post-settle-evaluators';
import { evaluateSanLoss } from './sanity-engine';
import { useDiceStore } from '../stores/useDiceStore';
import { triggerBout } from './bout-dispatch';

/**
 * Fingerprint dedupe 缓存：以 episodeId 为键。同一事件（同 pageIdx:时间戳）再次跑 evaluator
 * 不重复弹 INT 检定 / 重复写永久疯狂——若 useChatPipeline 因某种原因二次跑 settleVariables 也安全。
 * 用 Set 而非 Map，因为目前只关心"是否处理过"。
 */
const PROCESSED_EPISODES = new Set<string>();

/** 测试钩子：清空指纹缓存。仅 *.test.ts 用。 */
export function _resetSanityEvaluatorCacheForTest(): void {
  PROCESSED_EPISODES.clear();
}

export const sanityEvaluator: Evaluator = (ctx: EvaluatorContext): void => {
  const cs = ctx.patchReport.charSheetDeltas;
  // 没有 SAN 旁路或 sanDelta>=0（恢复 / 0 变化）：本回合无 SAN 损失事件，直接放行。
  if (!cs || typeof cs.sanDelta !== 'number' || cs.sanDelta >= 0) return;

  // 指纹去重：相同 episodeId 已处理过则跳过——防 settleVariables 二次入口或 evaluator 链多次运行重复弹窗。
  const fingerprint = cs.episodeId ?? `nofp:${cs.sanDelta}:${ctx.sheet.secondary.san.current}`;
  if (PROCESSED_EPISODES.has(fingerprint)) return;
  PROCESSED_EPISODES.add(fingerprint);

  const evalResult = evaluateSanLoss({
    oldSan: ctx.sheet.secondary.san.current - cs.sanDelta, // 当前 SAN 已是扣损后；旧 SAN = 新 - delta（delta 为负）
    delta: cs.sanDelta,
    sanMax: ctx.sheet.secondary.san.max,
    dailyAccumulated: ctx.sheet.dailySanLoss,
    hasCompanionsPresent: true,   // M1 默认：同伴在场（避免单调走 summary 路径）。M2 战斗在场检测会替换。
    allCompanionsInsane: false,
  });

  // 优先级：永久 > 不定 > INT。终局/严重态触发即不再开 INT 弹窗。
  if (evalResult.permanentTriggered) {
    ctx.applyCorrectiveOps([{ op: 'replace', path: '/调查员/永久疯狂', value: true }]);
    return;
  }
  if (evalResult.indefiniteTriggered) {
    ctx.applyCorrectiveOps([{ op: 'replace', path: '/调查员/不定性疯狂/active', value: true }]);
    return;
  }
  if (evalResult.intRollNeeded) {
    const intTarget = ctx.sheet.characteristics.INT ?? 0;
    if (intTarget <= 0) return; // 无 INT（默认 0 也算无效）则跳过——避免对无属性卡崩 dice store。
    // 打开 DicePanel 做 INT 检定；通过则放过本次事件，失败/大失败 → 触发临时疯狂发作。
    useDiceStore.getState().openCheck({
      skill: 'INT',
      target: intTarget,
      onResolve: (level) => {
        const passed = level !== 'failure' && level !== 'crit-failure';
        if (!passed) {
          triggerBout(ctx, evalResult.boutMode);
        }
      },
    });
  }
};

// 模块加载即注册——useChatPipeline 顶部一行 side-effect import 触发此处。
registerEvaluator('sanity', sanityEvaluator);
