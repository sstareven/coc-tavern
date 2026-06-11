/**
 * A2.5 — Bout dispatch：sanityEvaluator INT 检定失败后，按 boutMode 触发一次发作。
 *
 * 两种模式：
 *  - realtime（同伴在场）：roll 1d10 持续回合 + 1d10 → Table VII (BOUT_BEHAVIOR_TABLE) 命中条目；
 *    emit op 写 `调查员.临时疯狂 = {active:true, roundsLeft, bout:{mode,table:'VII',entry}}`。
 *    战斗中由 advanceTurn 倒计时回合，roundsLeft 到 0 自动清 active。
 *  - summary（独行/同伴皆疯）：roll 1d10 → Table VIII (BOUT_SUMMARY_TABLE) 命中条目；
 *    调 timeJumpGenerator（A2.6 LLM 真实实现）异步生成跳跃叙事；
 *    emit op 写 `调查员.临时疯狂 = {active:true, roundsLeft:0, bout:{mode,table:'VIII',entry}}`。
 *    sceneInfoUpdate 由后续 ticket 接驳到 useBookStore；本函数 fire-and-forget 不等结果。
 *
 * 不使用主管线 MVU 通道——evaluator 已在 G3 相位外，直接走 ctx.applyCorrectiveOps（同评估器写永久疯狂的路径），
 * 避免 LLM 看见这次 emit 当作"本回合 LLM 输出"做二次纠错。
 */

import type { EvaluatorContext } from './post-settle-evaluators';
import { BOUT_BEHAVIOR_TABLE, BOUT_SUMMARY_TABLE } from './coc7e-tables';
import { rollPhobia, rollMania } from './coc-rules';

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
  acquiredPhobia?: string;
  acquiredMania?: string;
}

const PHOBIA_ENTRY = 6;
const MANIA_ENTRY = 7;

function applyPhobiaManiaOps(ctx: EvaluatorContext, entry: number, result: TriggerBoutResult, rng: () => number = Math.random): void {
  if (entry === PHOBIA_ENTRY) {
    const rolled = rollPhobia(rng);
    ctx.applyCorrectiveOps([{ op: 'insert', path: '/调查员/恐惧症', value: rolled.label }]);
    result.acquiredPhobia = rolled.label;
  } else if (entry === MANIA_ENTRY) {
    const rolled = rollMania(rng);
    ctx.applyCorrectiveOps([{ op: 'insert', path: '/调查员/狂躁症', value: rolled.label }]);
    result.acquiredMania = rolled.label;
  }
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
  rng01: () => number = Math.random,
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
    const result: TriggerBoutResult = { mode, table: 'VII', entry, roundsLeft, label: row?.label ?? '', description: row?.description ?? '' };
    applyPhobiaManiaOps(ctx, entry, result, rng01);
    return result;
  }

  // summary：投 Table VIII。A2.6 LLM 时间跳跃由后续 ticket 接驳；本桶暂不发起子调用,
   // 避免空 sceneSnapshot+void 丢返回值导致每次撞 summary 都白烧 ~20k token max_tokens。
   // 接驳时:EvaluatorContext 需透传 currentSceneSnapshot,然后 .then 把 narration/sceneInfoUpdate
   // 经 applyCorrectiveOps 落到当前页 leftContent + SceneInfo。
  const entry = rollD10();
  const row = BOUT_SUMMARY_TABLE[entry - 1];
  ctx.applyCorrectiveOps([
    { op: 'replace', path: '/调查员/临时疯狂/active', value: true },
    { op: 'replace', path: '/调查员/临时疯狂/roundsLeft', value: 0 },
    { op: 'replace', path: '/调查员/临时疯狂/bout', value: { mode: 'summary', table: 'VIII', entry } },
  ]);
  const result: TriggerBoutResult = { mode, table: 'VIII', entry, roundsLeft: 0, label: row?.label ?? '', description: row?.description ?? '' };
  applyPhobiaManiaOps(ctx, entry, result, rng01);
  return result;
}
