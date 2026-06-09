/**
 * Post-settle evaluator registry (A0.3 / spec §6 G3)
 *
 * 为什么需要这一相位:
 *   主管线在 `useChatPipeline.processResponse` 里依次跑
 *     (1) processResponse → applyMvuPatch 写入 statData + sheet
 *     (2) optional MVU self-correct round (failed ops 回灌)
 *   两步都在【MVU 快照应用】上下文里. 如果 evaluator(SAN-loss→临疯/技能成功→ticked)
 *   把它们的 op 塞进同一个 redirect 回调, 快照体系会把这些 op 视作"本回合 LLM 写入",
 *   错误归并/回滚. 设计上 evaluator 应该在 MVU 周期【外】emit ops, 走一次额外的
 *   applyCorrectiveOps. 本模块就是那个外相位.
 *
 * 调用契约:
 *   - evaluator MUST NOT 从 applyMvuOpsToTree / redirect 回调内部触发.
 *   - evaluator 可以 调用 ctx.applyCorrectiveOps() 直接写入(第二轮 corrective);
 *     也可以选择 return void 仅做副作用观测(本桶暂不需要 ops 返回值合并).
 *   - evaluator 抛错被吞掉, 不影响其他 evaluator(隔离 — 防 A2 evaluator 崩塌阻断 A3).
 */

import type { CharacterSheet } from '../types';
import type { MvuOpError, MvuPatchReport } from './mvu-jsonpatch';

export interface EvaluatorContext {
  sheet: CharacterSheet;
  statData: Record<string, unknown>;
  patchReport: MvuPatchReport;
  /** 二次 corrective: evaluator 把 ops 推入即触发 applyCorrectiveOps. */
  applyCorrectiveOps: (ops: unknown[]) => MvuOpError[];
}

export type Evaluator = (ctx: EvaluatorContext) => void;

const evaluators = new Map<string, Evaluator>();

/** 注册（或覆盖）一个 evaluator. */
export function registerEvaluator(name: string, fn: Evaluator): void {
  evaluators.set(name, fn);
}

/** 测试钩子: 清空所有 evaluator. 仅 `*.test.ts` 用. */
export function clearEvaluatorsForTest(): void {
  evaluators.clear();
}

/** 主管线入口. 按注册顺序顺序调用; 单个 evaluator 抛错被吞但记 console.warn. */
export function runPostSettleEvaluators(ctx: EvaluatorContext): void {
  for (const [name, fn] of evaluators) {
    try {
      fn(ctx);
    } catch (err) {
      console.warn(`[post-settle-evaluators] ${name} 抛错被吞:`, err);
    }
  }
}
