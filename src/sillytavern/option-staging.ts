/**
 * A1.8 — RightPage 选项检定 staging
 *
 * 当玩家点击选项触发的检定（parseCheckAction 命中），动画结束后**不立即落账**；
 * 由上层（GameView）挂起一个 OptionResolutionOverlay，让玩家选 推骰 / 花费幸运 / 直接落账。
 *
 * 本文件是纯函数层（0 React/DOM 依赖），覆盖 4 件事：
 *   1) shouldStage — 哪些检定类别走 staging（poly/hidden/opposed/sanCheck 直接落账，不进 staging）
 *   2) applyLuckSpend — 复用 dice-engine.applyLuckToRoll + determineResult，算出花幸运后的最终结果
 *   3) applyPushReroll — 推骰二次掷（标记 pushed=true + pushedFrom）
 *   4) rebuildInputText — 把正文顶部的 [XX] 结果行替换成新结果（推骰/扣点后送 LLM 的文本）
 *
 * 与 useDiceStore 内 staging 的关系：
 *   - useDiceStore 的 staging 路径(rollStaged/commitWithLuck/commitAsPush/commitNow)是给手动 DicePanel 用的；
 *   - 本套是 RightPage 选项掷骰的薄替代品 —— 在 fillInputBar 即时完成掷骰，但 stashRecord 延后到玩家 commit。
 *   - dice-engine 是单源真理：determineResult / applyLuckToRoll 都从那里 import。
 */

import type { DiceRecord, DiceResultType } from '../types';
import { applyLuckToRoll, determineResult } from './dice-engine';

/** RightPage 选项检定的种类，对应 fillInputBar 的 4 个分支。 */
export type StagingKind = 'check' | 'opposed' | 'poly' | 'hidden';

/** 触发 staging 的上下文（来自 fillInputBar / ChoiceButton 触发处）。 */
export interface StagingTrigger {
  kind: StagingKind;
  /** 技能名（"图书馆使用" / "侦查" / ...）。 */
  skill: string;
  /** 检定目标值（普通=skill值，困难=skill/2，极难=skill/5）。 */
  target: number;
  /** 原始 d100 出目（奖励/惩罚骰已选骰后）；对抗时是玩家方出目。 */
  originalRoll: number;
  /** 原始结果级别（一次掷骰判定）。 */
  originalResult: DiceResultType;
  /** 是 SAN 检定（不可推骰/不可幸运）。 */
  sanCheck: boolean;
  /** 进入正文的提交文本（含 [XX] 结果行 + 原选项文本）；commit 后写到 textarea。 */
  inputText: string;
  /** [XX] 结果行原文（推骰/扣点时要替换的那行，含末尾 \n）。 */
  resultLine: string;
  /** 选项原文（resultLine 之后那段）；用于重建 inputText。 */
  baseText: string;
  /** 该次掷骰记录的页码（pageIndex+1）。 */
  page: number;
  /** 暂存的 DiceRecord（commit 时再 stashRecord）；只在 'check' / 'opposed' 类用。 */
  record: DiceRecord;
}

/** OptionResolutionOverlay 三选一的输出。 */
export interface StagingOutcome {
  /** 玩家最终选择的提交文本（已替换好 [XX] 结果行）。 */
  inputText: string;
  /** 落账时入 history 的 DiceRecord（已带 luckSpent / pushed / pushedFrom）。 */
  record: DiceRecord;
  /** 是否消耗了幸运（>0 时由 store 通路扣点）。 */
  luckSpent: number;
  /** 是否走了推骰。 */
  pushed: boolean;
}

/**
 * staging 资格：只有 check + 普通检定（非 SAN/非对抗/非暗骰/非多面骰）才进 staging 浮层。
 * poly(理智/伤害骰)、hidden(暗骰)、opposed(对抗)、sanCheck 都直接落账 —— 它们要么没有推骰/幸运语义，
 * 要么走独立通路（暗骰要保密结果），强行套 staging 反而误导玩家。
 */
export function shouldStage(ctx: {
  kind: StagingKind;
  sanCheck: boolean;
  opposed: boolean;
}): boolean {
  if (ctx.kind !== 'check') return false;
  if (ctx.sanCheck) return false;
  if (ctx.opposed) return false;
  return true;
}

/** 五档中文标签——单源在 RightPage 也用同一份；这里独立一份避免循环依赖。 */
const RESULT_LABELS: Record<DiceResultType, string> = {
  'crit-success': '大成功！',
  'extreme-success': '极难成功',
  'hard-success': '困难成功',
  success: '成功',
  failure: '失败',
  'crit-failure': '大失败！',
};

/**
 * 花费幸运：直接复用 dice-engine.applyLuckToRoll —— 它已经处理 01/96-100 不可救援、SAN/伤害/幸运自检拒绝。
 *
 * @returns finalRoll/resultType/label = 扣点后的结果；line = 新的 [XX] 结果行（含 \n）。
 *          若 appliedSpend=0（拒绝路径），返回的 finalRoll=originalRoll, label 不变。
 */
export function applyLuckSpend(
  originalRoll: number,
  spend: number,
  target: number,
  sanCheck: boolean,
  skill: string,
): {
  finalRoll: number;
  resultType: DiceResultType;
  label: string;
  line: string;
  appliedSpend: number;
} {
  const r = applyLuckToRoll(originalRoll, target, spend, sanCheck, false, false);
  const resultType = determineResult(r.finalRoll, target, sanCheck);
  const label = RESULT_LABELS[resultType] || resultType;
  const rollStr = String(r.finalRoll).padStart(2, '0');
  const line = `[${skill} d100=${rollStr}/${target} ${label} (幸运扣${r.appliedSpend}点)]\n`;
  return { finalRoll: r.finalRoll, resultType, label, line, appliedSpend: r.appliedSpend };
}

/** 推骰：二次 d100 掷骰，新结果取代旧结果；标记 pushed=true 由调用方处理。 */
export function applyPushReroll(
  target: number,
  sanCheck: boolean,
  skill: string,
  reason: string,
  rng: () => number = Math.random,
): {
  newRoll: number;
  newResult: DiceResultType;
  label: string;
  line: string;
  reason: string;
} {
  const t = Math.floor(rng() * 10);
  const o = Math.floor(rng() * 10);
  const newRoll = (t === 0 && o === 0) ? 100 : t * 10 + o;
  const newResult = determineResult(newRoll, target, sanCheck);
  const label = RESULT_LABELS[newResult] || newResult;
  const rollStr = String(newRoll).padStart(2, '0');
  const line = `[${skill} d100=${rollStr}/${target} ${label} (孤注一掷)]\n`;
  return { newRoll, newResult, label, line, reason };
}

/**
 * 重建提交给 LLM 的文本：把正文顶部的旧 [XX] 结果行替换为新行。
 * 不依赖正则，直接做字符串替换；旧行必须能在 originalBaseText 头部匹配上，否则原样返回（防御）。
 */
export function rebuildInputText(
  originalInputText: string,
  oldResultLine: string,
  newResultLine: string,
): string {
  if (!originalInputText.startsWith(oldResultLine)) {
    // 防御：旧行已被加工/正文头被改写，回退为「新行 + 原文」拼接（不丢内容）。
    return newResultLine + originalInputText;
  }
  return newResultLine + originalInputText.slice(oldResultLine.length);
}

/**
 * 把推骰结果搓成落账用的 DiceRecord（叠加 pushed/pushedFrom + 复用 trigger.skill/target/page）。
 * pushedFrom 永远引用 trigger.record 的 original roll/type（即玩家面前看到的那次"失败"）。
 */
export function buildPushedRecord(
  trigger: StagingTrigger,
  push: { newRoll: number; newResult: DiceResultType; reason: string },
): DiceRecord {
  return {
    ...trigger.record,
    roll: String(push.newRoll).padStart(2, '0'),
    type: push.newResult,
    time: Date.now(),
    pushed: true,
    pushReason: push.reason,
    pushedFrom: { roll: trigger.originalRoll, type: trigger.originalResult },
  };
}

/**
 * 把扣幸运的结果搓成落账用的 DiceRecord（叠加 luckSpent + growthTickEligible=false）。
 * R7 约定：用 luck 改写后的成功不算成长打钩 —— 与 useDiceStore.commitWithLuck 同款。
 */
export function buildLuckSpentRecord(
  trigger: StagingTrigger,
  luck: { finalRoll: number; resultType: DiceResultType; appliedSpend: number },
): DiceRecord {
  return {
    ...trigger.record,
    roll: String(luck.finalRoll).padStart(2, '0'),
    type: luck.resultType,
    time: Date.now(),
    luckSpent: luck.appliedSpend,
    growthTickEligible: false,
  };
}
