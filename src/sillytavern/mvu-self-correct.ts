// ===== MVU 失败回灌自纠：纯编排逻辑（依赖注入，零 store/网络耦合，便于单测） =====
// 把校验失败的变量更新回灌给 AI 让其修正。RPM 死线由调用方在 `send` 里落实
// （send 必须显式走 'mvu' 桶并传 controller.signal）；本模块只负责"预算上限 +
// 三重停止 + fail-open"的循环纪律，不直接发请求、不碰 store。

import { extractJsonPatchBlocks, type MvuOpError } from './mvu-jsonpatch';
import type { AssembledMessage } from './prompt-assembler';

/** 重试预算硬上限（即便设置传入更大值也夹到此）。 */
export const MVU_SELF_CORRECT_MAX_BUDGET = 3;

/**
 * 构造"变量更新自纠"消息：基础提示 + 一条列出失败 op 的纠正指令，
 * 要求 AI 只重输出修正后的 <UpdateVariable><JSONPatch>（不重复已成功项、不输出叙事）。
 */
export function buildCorrectiveMvuMessages(
  baseMessages: AssembledMessage[],
  failed: MvuOpError[],
): AssembledMessage[] {
  const list = failed
    .map((f, i) => `${i + 1}. op=${f.op} path=${f.path} 值=${JSON.stringify(f.value)} → ${f.reason}`)
    .join('\n');
  const correctiveMsg: AssembledMessage = {
    role: 'user',
    content:
      '【系统纠正 · 变量更新】你上一条回复里的部分变量更新(JSONPatch)未通过校验、已被丢弃：\n' +
      list +
      '\n\n请只重新输出一个 <UpdateVariable><JSONPatch>[...]</JSONPatch></UpdateVariable> 块，' +
      '其中仅包含上述失败项的修正 op（用合法的类型/范围/枚举值，参考每条「→」后的期望说明），' +
      '不要重复已成功的更新，也不要输出任何叙事、解释或其它文字。',
  };
  return [...baseMessages, correctiveMsg];
}

export interface SelfCorrectDeps {
  /** 发起一次纠正请求并返回回复原文。调用方须让此函数走 'mvu' RPM 桶并传中止信号。 */
  send: (messages: AssembledMessage[]) => Promise<string>;
  /** 把修正 ops 叠加到当前状态、返回残余失败清单（通常是 useVariableStore.applyCorrectiveOps）。 */
  applyOps: (ops: unknown[]) => MvuOpError[];
  /** 可选日志钩子。 */
  log?: (level: 'info' | 'warn', msg: string) => void;
  /** 可选中止查询：返回 true 时循环立即停止、不再发起新请求。 */
  isAborted?: () => boolean;
}

/**
 * 失败回灌自纠循环。返回最终残余失败清单（已 fail-open——能改的都改了，剩余跳过）。
 *
 * 死线保障（与 RPM 联动）：
 *  - 最多发起 budget 次 send（budget 夹在 0..MVU_SELF_CORRECT_MAX_BUDGET）；
 *  - send 由调用方绑定到 'mvu' 桶 → 达上限排队限流，绝不超发；
 *  - 三重停止：预算用尽 / 全部修好 / 失败数不再下降（防 AI 原地打转）；
 *  - 任一停止都 fail-open（保留已应用修正，返回残余，绝不抛错卡住回合）；
 *  - isAborted() 为真时立即返回，不发起新请求。
 */
export async function runMvuSelfCorrect(
  baseMessages: AssembledMessage[],
  initialFailed: MvuOpError[],
  budget: number,
  deps: SelfCorrectDeps,
): Promise<MvuOpError[]> {
  const cap = Math.max(0, Math.min(MVU_SELF_CORRECT_MAX_BUDGET, Math.floor(budget || 0)));
  let failed = initialFailed;
  let attempt = 0;
  while (attempt < cap && failed.length > 0) {
    if (deps.isAborted?.()) return failed;
    attempt++;
    const prevCount = failed.length;
    deps.log?.('info', `[MVU自纠] 第 ${attempt}/${cap} 次：请求 AI 修正 ${failed.length} 项非法变量更新…`);
    let reply: string;
    try {
      reply = await deps.send(buildCorrectiveMvuMessages(baseMessages, failed));
    } catch (e) {
      if (deps.isAborted?.()) return failed;
      deps.log?.('warn', `[MVU自纠] 请求失败，放弃自纠: ${e instanceof Error ? e.message : String(e)}`);
      return failed;
    }
    const fixOps = extractJsonPatchBlocks(reply);
    if (fixOps.length === 0) {
      deps.log?.('warn', `[MVU自纠] AI 未返回有效 JSONPatch，停止。`);
      return failed;
    }
    failed = deps.applyOps(fixOps);
    if (failed.length === 0) {
      deps.log?.('info', `[MVU自纠] 全部修正成功。`);
      return failed;
    }
    if (failed.length >= prevCount) {
      deps.log?.('warn', `[MVU自纠] 失败数未下降(${prevCount}→${failed.length})，停止以防原地打转。`);
      return failed;
    }
  }
  if (failed.length > 0) {
    deps.log?.('warn', `[MVU自纠] 预算用尽，仍有 ${failed.length} 项未修正（已 fail-open 跳过）。`);
  }
  return failed;
}
