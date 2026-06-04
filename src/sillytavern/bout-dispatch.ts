/**
 * A2.5 — Bout dispatch：sanityEvaluator INT 检定失败后，按 boutMode 触发一次发作。
 *
 * 两种模式：
 *  - realtime（同伴在场）：roll 1d10 持续回合 + 1d10 → Table VII (BOUT_BEHAVIOR_TABLE) 命中条目；
 *    emit op 写 `调查员.临时疯狂 = {active:true, roundsLeft, bout:{mode,table:'VII',entry}}`。
 *    战斗中由 advanceTurn 倒计时回合，roundsLeft 到 0 自动清 active。
 *  - summary（独行/同伴皆疯）：roll 1d10 → Table VIII (BOUT_SUMMARY_TABLE) 命中条目；
 *    调 timeJumpGenerator（A2.6 LLM stub）生成跳跃叙事；
 *    emit op 写 `调查员.临时疯狂 = {active:true, roundsLeft:0, bout:{mode,table:'VIII',entry}}`。
 *    sceneInfoUpdate 由 A2.6 完整接驳到 useBookStore；A2.5 暂留挂在返回值上层消费。
 *
 * 不使用主管线 MVU 通道——evaluator 已在 G3 相位外，直接走 ctx.applyCorrectiveOps（同评估器写永久疯狂的路径），
 * 避免 LLM 看见这次 emit 当作"本回合 LLM 输出"做二次纠错。
 */

import type { EvaluatorContext } from './post-settle-evaluators';
import { BOUT_BEHAVIOR_TABLE, BOUT_SUMMARY_TABLE } from './coc7e-tables';
import { generateTimeJump } from './time-jump-generator';

/**
 * Rng 注入：测试用 seqRng 替换。默认返回 1..10 均匀分布——COC7e 表 VII/VIII 与回合数皆走 1d10。
 * 注：dice-engine 的 randD10 返回 0..9（与 d100 组合用），此处的 1..10 不与之复用。
 */
export type RollD10 = () => number;
const defaultRollD10: RollD10 = () => Math.floor(Math.random() * 10) + 1;

export interface TriggerBoutResult {
  mode: 'realtime' | 'summary';
  table: 'VII' | 'VIII';
  entry: number;
  roundsLeft: number;
  label: string;
  description: string;
}

/**
 * 触发一次临时疯狂发作。emit corrective ops 写 调查员.临时疯狂 子树；返回结构化结果供测试/日志读取。
 *
 * @param ctx 评估器上下文。复用 applyCorrectiveOps（走独立 corrective 通道，不被 MVU 快照回滚）。
 * @param mode 'realtime' 同伴在场实时回合；'summary' 独行总结叙事。
 * @param rollD10 D10 投骰函数（默认 randD10）。测试注入定值。
 */
export function triggerBout(
  ctx: EvaluatorContext,
  mode: 'realtime' | 'summary',
  rollD10: RollD10 = defaultRollD10,
): TriggerBoutResult {
  if (mode === 'realtime') {
    const roundsLeft = rollD10();           // 1..10 回合
    const entry = rollD10();                // Table VII 条目命中
    const row = BOUT_BEHAVIOR_TABLE[entry - 1];
    // applyCharsheetRedirect 按子路径分支(active/roundsLeft/bout)分别处理 调查员.临时疯狂.*,
    // 没有 root 节点的整树 replace 分支；按 3 条 ops 落 sheet 即可。
    ctx.applyCorrectiveOps([
      { op: 'replace', path: '/调查员/临时疯狂/active', value: true },
      { op: 'replace', path: '/调查员/临时疯狂/roundsLeft', value: roundsLeft },
      { op: 'replace', path: '/调查员/临时疯狂/bout', value: { mode: 'realtime', table: 'VII', entry } },
    ]);
    return { mode, table: 'VII', entry, roundsLeft, label: row?.label ?? '', description: row?.description ?? '' };
  }

  // summary：投 Table VIII，发起 LLM 时间跳跃（A2.6 stub）。
  const entry = rollD10();
  const row = BOUT_SUMMARY_TABLE[entry - 1];
  ctx.applyCorrectiveOps([
    { op: 'replace', path: '/调查员/临时疯狂/active', value: true },
    { op: 'replace', path: '/调查员/临时疯狂/roundsLeft', value: 0 },
    { op: 'replace', path: '/调查员/临时疯狂/bout', value: { mode: 'summary', table: 'VIII', entry } },
  ]);
  // A2.5 占位：触发时间跳跃 LLM 调用（A2.6 接驳真正实现 + sceneInfoUpdate 写回 useBookStore）。
  // fire-and-forget：本相位评估器同步收口，叙事结果由 A2.6 异步写回当前页 leftContent。
  void generateTimeJump({
    tableEntry: entry,
    tableLabel: row?.label ?? '',
    tableDescription: row?.description ?? '',
  });
  return { mode, table: 'VIII', entry, roundsLeft: 0, label: row?.label ?? '', description: row?.description ?? '' };
}
