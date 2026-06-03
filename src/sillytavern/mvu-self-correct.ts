// ===== MVU 失败回灌自纠：纯编排逻辑（依赖注入，零 store/网络耦合，便于单测） =====
// 把校验失败的变量更新回灌给 AI 让其修正。RPM 死线由调用方在 `send` 里落实
// （send 必须显式走 'mvu' 桶并传 controller.signal）；本模块只负责"预算上限 +
// 三重停止 + fail-open"的循环纪律，不直接发请求、不碰 store。

import { extractJsonPatchBlocks, type MvuOpError } from './mvu-jsonpatch';
import type { AssembledMessage } from './prompt-assembler';
import type { TokenUsage } from './stream-parser';

/** 重试预算硬上限（即便设置传入更大值也夹到此）。 */
export const MVU_SELF_CORRECT_MAX_BUDGET = 3;

/** 自纠精简上下文：本回合叙事 + 当前状态快照。用于替代「重发整份主 prompt」，仅给模型修正所需的最小依据。 */
export interface CorrectiveContext {
  /** 本回合主生成的叙事正文（让模型判断各失败变量该往哪个方向修正）。 */
  narrative?: string;
  /** 当前 statData 快照 YAML（世界/剧情/战斗现值，作为合法范围与基线）。 */
  statSnapshotYaml?: string;
}

/**
 * 构造"变量更新自纠"消息：【精简自包含】——只给本回合叙事 + 状态快照 + 一条列出失败 op 的纠正指令，
 * 要求 AI 只重输出修正后的 <UpdateVariable><JSONPatch>（不重复已成功项、不输出叙事）。
 * 刻意【不】重发主生成的整份 prompt（世界书/角色卡/历史/FORMAT_INSTRUCTION）——那是最大的上下文冗余。
 */
export function buildCorrectiveMvuMessages(
  failed: MvuOpError[],
  ctx?: CorrectiveContext,
): AssembledMessage[] {
  const list = failed
    .map((f, i) => `${i + 1}. op=${f.op} path=${f.path} 值=${JSON.stringify(f.value)} → ${f.reason}`)
    .join('\n');
  const messages: AssembledMessage[] = [];
  const ctxParts: string[] = [];
  if (ctx?.narrative?.trim()) {
    ctxParts.push('【本回合叙事（供你判断各变量该往哪个方向修正）】\n' + ctx.narrative.trim());
  }
  if (ctx?.statSnapshotYaml?.trim()) {
    ctxParts.push('【当前状态快照（世界/剧情/战斗现值，作为合法范围与基线）】\n' + ctx.statSnapshotYaml.trim());
  }
  if (ctxParts.length > 0) {
    messages.push({ role: 'system', content: ctxParts.join('\n\n') });
  }
  messages.push({
    role: 'user',
    content:
      '【系统纠正 · 变量更新】你上一条回复里的部分变量更新(JSONPatch)未通过校验、已被丢弃：\n' +
      list +
      '\n\n请只重新输出一个 <UpdateVariable><JSONPatch>[...]</JSONPatch></UpdateVariable> 块，' +
      '其中仅包含上述失败项的修正 op（用合法的类型/范围/枚举值，参考每条「→」后的期望说明），' +
      '不要重复已成功的更新，也不要输出任何叙事、解释或其它文字。',
  });
  return messages;
}

export interface SelfCorrectDeps {
  /**
   * 发起一次纠正请求并返回回复原文与（可选）token 用量。
   * 调用方须让此函数走 'mvu' RPM 桶并传中止信号。
   */
  send: (messages: AssembledMessage[]) => Promise<{ content: string; usage?: TokenUsage }>;
  /** 把修正 ops 叠加到当前状态、返回残余失败清单（通常是 useVariableStore.applyCorrectiveOps）。 */
  applyOps: (ops: unknown[]) => MvuOpError[];
  /** 可选日志钩子。 */
  log?: (level: 'info' | 'warn', msg: string) => void;
  /** 可选中止查询：返回 true 时循环立即停止、不再发起新请求。 */
  isAborted?: () => boolean;
}

/** 自纠循环结果：残余失败清单 + 本次自纠累计的 token 用量（计入页面 genStats）。 */
export interface SelfCorrectResult {
  remaining: MvuOpError[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * 失败回灌自纠循环。返回残余失败清单（已 fail-open）与累计 token 用量。
 *
 * 死线保障（与 RPM 联动）：
 *  - 最多发起 budget 次 send（budget 夹在 0..MVU_SELF_CORRECT_MAX_BUDGET）；
 *  - send 由调用方绑定到 'mvu' 桶 → 达上限排队限流，绝不超发；
 *  - 三重停止：预算用尽 / 全部修好 / 失败数不再下降（防 AI 原地打转）；
 *  - 任一停止都 fail-open（保留已应用修正，返回残余，绝不抛错卡住回合）；
 *  - isAborted() 为真时立即返回，不发起新请求。
 */
export async function runMvuSelfCorrect(
  initialFailed: MvuOpError[],
  budget: number,
  deps: SelfCorrectDeps,
  ctx?: CorrectiveContext,
): Promise<SelfCorrectResult> {
  const cap = Math.max(0, Math.min(MVU_SELF_CORRECT_MAX_BUDGET, Math.floor(budget || 0)));
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let failed = initialFailed;
  let attempt = 0;
  while (attempt < cap && failed.length > 0) {
    if (deps.isAborted?.()) return { remaining: failed, usage };
    attempt++;
    const prevCount = failed.length;
    deps.log?.('info', `[MVU自纠] 第 ${attempt}/${cap} 次：请求 AI 修正 ${failed.length} 项非法变量更新…`);
    let reply: { content: string; usage?: TokenUsage };
    try {
      reply = await deps.send(buildCorrectiveMvuMessages(failed, ctx));
    } catch (e) {
      if (deps.isAborted?.()) return { remaining: failed, usage };
      deps.log?.('warn', `[MVU自纠] 请求失败，放弃自纠: ${e instanceof Error ? e.message : String(e)}`);
      return { remaining: failed, usage };
    }
    // 累计用量（即便本轮 patch 无效也已消耗 token，须计入 genStats）。
    if (reply.usage) {
      usage.prompt_tokens += reply.usage.prompt_tokens ?? 0;
      usage.completion_tokens += reply.usage.completion_tokens ?? 0;
      usage.total_tokens += reply.usage.total_tokens ?? 0;
    }
    const fixOps = extractJsonPatchBlocks(reply.content);
    if (fixOps.length === 0) {
      deps.log?.('warn', `[MVU自纠] AI 未返回有效 JSONPatch，停止。`);
      return { remaining: failed, usage };
    }
    failed = deps.applyOps(fixOps);
    if (failed.length === 0) {
      deps.log?.('info', `[MVU自纠] 全部修正成功。`);
      return { remaining: failed, usage };
    }
    if (failed.length >= prevCount) {
      deps.log?.('warn', `[MVU自纠] 失败数未下降(${prevCount}→${failed.length})，停止以防原地打转。`);
      return { remaining: failed, usage };
    }
  }
  if (failed.length > 0) {
    deps.log?.('warn', `[MVU自纠] 预算用尽，仍有 ${failed.length} 项未修正（已 fail-open 跳过）。`);
  }
  return { remaining: failed, usage };
}
