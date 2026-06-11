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
 * C3 潜伏疯狂（COC7e p132）：
 *   bout 触发时同步写入 latentInsanity{active:true, expiresAtEpoch=currentEpoch+1D10*60}。
 *   bout active 期间 boutEvaluator 不会走 latent 路径（因为 SAN loss 已直接进 bout 判定）；
 *   bout 结束（roundsLeft→0，active=false）后 latentInsanity 仍在，1D10 小时窗口内
 *   任何 SAN loss ≥ 1 → boutEvaluator 直接触发新发作（跳过 |delta|≥5 阈值）。
 *
 * 不使用主管线 MVU 通道——evaluator 已在 G3 相位外，直接走 ctx.applyCorrectiveOps（同评估器写永久疯狂的路径），
 * 避免 LLM 看见这次 emit 当作"本回合 LLM 输出"做二次纠错。
 */

import type { EvaluatorContext } from './post-settle-evaluators';
import { BOUT_BEHAVIOR_TABLE, BOUT_SUMMARY_TABLE, type CocTableEntry } from './coc7e-tables';
import { rollPhobia, rollMania } from './coc-rules';
import { getTreePath } from './mvu-var-access';

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
  /** C3：本次 bout 写入的潜伏疯狂时长（游戏小时）。0 = 未写入（epoch 不可用时降级）。 */
  latentHours: number;
}


function applyPhobiaManiaOps(ctx: EvaluatorContext, row: CocTableEntry | undefined, result: TriggerBoutResult, rng: () => number): void {
  if (!row) return;
  if (row.description.includes('恐惧症')) {
    const rolled = rollPhobia(rng);
    ctx.applyCorrectiveOps([{ op: 'insert', path: '/调查员/恐惧症', value: rolled.label }]);
    result.acquiredPhobia = rolled.label;
  } else if (row.description.includes('狂躁症')) {
    const rolled = rollMania(rng);
    ctx.applyCorrectiveOps([{ op: 'insert', path: '/调查员/狂躁症', value: rolled.label }]);
    result.acquiredMania = rolled.label;
  }
}

/**
 * C3：写入潜伏疯狂（latent insanity）corrective ops。
 * bout 触发时立即写入；bout active 期间 boutEvaluator 不走 latent 路径，
 * bout 结束后在 expiresAtEpoch 窗口内任意 SAN loss ≥ 1 → 新发作。
 *
 * @returns latentHours（1..10），若 epoch 不可用则降级返回 0（不写 ops）。
 */
function emitLatentInsanityOps(ctx: EvaluatorContext, rollD10: RollD10): number {
  const currentEpoch = Number(getTreePath(ctx.statData, '世界.时间.epoch')) || 0;
  // epoch 为 0 通常意味着时间系统尚未初始化（空 statData / 测试环境），
  // 降级不写——避免 expiresAtEpoch 落在一个无意义的绝对值上。
  // 当 epoch > 0 时（正常游戏中），才写入。
  if (currentEpoch <= 0) return 0;
  const latentHours = rollD10();
  ctx.applyCorrectiveOps([
    { op: 'replace', path: '/调查员/潜伏疯狂', value: { active: true, expiresAtEpoch: currentEpoch + latentHours * 60 } },
  ]);
  return latentHours;
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
    const latentHours = emitLatentInsanityOps(ctx, rollD10);
    const result: TriggerBoutResult = { mode, table: 'VII', entry, roundsLeft, label: row?.label ?? '', description: row?.description ?? '', latentHours };
    applyPhobiaManiaOps(ctx, row, result, rng01);
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
  const latentHours = emitLatentInsanityOps(ctx, rollD10);
  const result: TriggerBoutResult = { mode, table: 'VIII', entry, roundsLeft: 0, label: row?.label ?? '', description: row?.description ?? '', latentHours };
  applyPhobiaManiaOps(ctx, row, result, rng01);
  return result;
}
