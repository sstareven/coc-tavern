/**
 * A2.6 — timeJumpGenerator (stub, A2.5 占位用)
 *
 * 总结型疯狂发作（独行/无清醒同伴）会跳过实时回合，直接以一段「时间跳跃叙事」结算：调查员醒来后
 * 失去若干小时记忆、可能丢物品/受伤/获得恐惧症等。Table VIII 给出大类效果，但具体细节需要 LLM
 * 写出合规叙事 + 同步推进 sceneInfo（日期/时间/地点）+ 可选追加 corrective ops（HP-X 等）。
 *
 * A2.5 阶段：仅提供占位实现，让 bout-dispatch.ts 能 import 而不报 unresolved；
 * A2.6 实装：把 LLM 调用、prompt 拼装、sceneInfo 解析填入此函数。
 */

import type { SceneInfo } from '../types';

export interface TimeJumpInput {
  /** Table VIII 命中点数 1..10。 */
  tableEntry: number;
  /** Table VIII 该项 label/description（A2.6 LLM prompt 注入用）。 */
  tableLabel: string;
  tableDescription: string;
  /** 当前 sceneInfo，作为时间跳跃起点。 */
  currentScene?: SceneInfo;
}

export interface TimeJumpResult {
  /** 给玩家展示的叙事段落。 */
  narration: string;
  /** SceneInfo 增量（仅写非 undefined 字段；上层会浅合并）。 */
  sceneInfoUpdate: Partial<SceneInfo>;
  /** 追加要走 applyCorrectiveOps 的 ops（HP-X、丢物等）。A2.6 LLM 输出解析后填入。 */
  additionalEffects: unknown[];
}

/**
 * A2.5 占位实现：返回最小可用结果——让 triggerBout('summary') 链路跑通而不依赖 LLM。
 * A2.6 会替换此函数体为：调用主 API 走 SUMMARY_TIMEJUMP prompt，解析 sceneInfo 与 ops。
 */
export async function generateTimeJump(input: TimeJumpInput): Promise<TimeJumpResult> {
  return {
    narration: `[时间跳跃·占位] 调查员陷入恍惚（${input.tableLabel}：${input.tableDescription}），醒来时已不知过去了多久……`,
    sceneInfoUpdate: {},
    additionalEffects: [],
  };
}
