import { create } from 'zustand';
import type { DiceRecord, DiceResultType, DiceMode } from '../types';
import { randD10, d100, determineResult, checkPhobiaPenalty } from '../sillytavern/dice-engine';
import { useBookStore } from './useBookStore';
import { useCharSheetStore } from './useCharSheetStore';
import { useVariableStore } from './useVariableStore';

interface OpenCheckOptions {
  skill: string;
  target: number;
  bonus?: boolean;
  penalty?: boolean;
  sanCheck?: boolean;
  context?: DiceRecord['context'];
  onResolve: (level: DiceResultType, roll: number) => void;
}

/**
 * A1.3 staging — 暂存一次掷骰的「原始上下文」，待玩家确认/扣幸运/推骰再落账。
 * 与 history 互斥：rollStaged 不入 history，commitNow/commitWithLuck/commitAsPush 才入。
 */
interface LastRollContext {
  skill: string;
  target: number;
  page: number;
  originalRoll: number;
  originalResult: DiceResultType;
  sanCheck: boolean;
  mode: DiceMode;
  tens: number;
  ones: number;
  finalTens: number;
  bonusTens: number;
  oppTens: number;
  oppOnes: number;
}

interface DiceStore {
  isOpen: boolean; mode: DiceMode; target: number; bonusDice: number; sanCheck: boolean;
  tens: number; ones: number; finalTens: number; bonusTens: number; oppTens: number; oppOnes: number;
  originalRoll: number; finalRoll: number; resultType: DiceResultType | null; history: DiceRecord[];
  pending: DiceRecord[];
  // —— A1.7 programmatic check 状态 ——
  isProgrammatic: boolean;
  programmaticSkill?: string;
  programmaticContext?: DiceRecord['context'];
  onProgrammaticResolve?: (level: DiceResultType, roll: number) => void;
  // —— A1.3 staging 状态 ——
  isStaged: boolean;
  lastRollContext: LastRollContext | null;
  open: () => void; close: () => void;
  setMode: (m: DiceMode) => void; setTarget: (t: number) => void;
  toggleBonus: () => void; togglePenalty: () => void; toggleSan: () => void;
  roll: () => void; addRecord: (r: DiceRecord) => void;
  // 剧情选项的检定先暂存，待剧情真正推进后由 commitPending 落入 history，
  // 避免「点了选项但没提交/提交失败」时留下永不成真的记录。手动骰子面板(roll)不走这条。
  stashRecord: (r: DiceRecord) => void;
  /**
   * 把暂存的 pending 检定记录刷进 history。
   * @param explicitPage 显式指定页号——append 模式下调用方传 baseIdx+2（新页号），
   *   因为此刻 useBookStore.pageIndex 仍是旧页 N-1（autoFlipForward 还没跑）。
   *   省略则走 fallback：useBookStore.pageIndex + 1（仅 replace/手测场景安全）。
   */
  commitPending: (explicitPage?: number) => void;
  clearPending: () => void;
  /** 用一组记录替换历史（newest-first，取前 20）——供读档/删页从页面 diceResults 重建。 */
  setHistory: (records: DiceRecord[]) => void;
  /** 清空检定历史与暂存——切换/读取会话时调用，杜绝跨档残留。 */
  clearAll: () => void;
  /** A1.7 — 由 UI/系统发起的目标检定。打开面板，玩家点掷骰后回调结果并自动关闭。 */
  openCheck: (opts: OpenCheckOptions) => void;
  /** A1.3 — 滚一次骰但不入 history；写 lastRollContext + isStaged，等待 commit* 收口。 */
  rollStaged: (skill?: string) => void;
  /** A1.3 — 扣 luck 改写 finalRoll/resultType 后落账；走 applyCorrectiveOps 扣 /调查员/幸运。 */
  commitWithLuck: (spend: number) => void;
  /** A1.3 — 推骰二次掷，pushed=true + pushReason + pushedFrom 携带原 roll/type。 */
  commitAsPush: (reason: string) => void;
  /** A1.3 — 直接落账暂存结果（不动 luck、不推骰）。 */
  commitNow: () => void;
}

/**
 * A1.3 staging — 用 luck 扣点后重算 finalRoll/resultType。
 * 与 dice-engine.applyLuckToRoll 的差异：
 *   - dice-engine 版返回 LuckApplyResult（含 appliedSpend/reason 用于 SAN/伤害/01-100 拒绝路径）；
 *   - 此处仅做「减点后重算」原语，由 commitWithLuck 上层做 spend 钳位和 applyCorrectiveOps。
 */
function recomputeRollWithLuck(
  ctx: { originalRoll: number; target: number; sanCheck: boolean },
  spend: number,
): { finalRoll: number; resultType: DiceResultType } {
  const finalRoll = Math.max(1, ctx.originalRoll - Math.max(0, spend));
  return { finalRoll, resultType: determineResult(finalRoll, ctx.target, ctx.sanCheck) };
}

/** A1.3 — 推骰 commit 资格：失败 + 非 SAN + 非对抗 + 未推过。A1.5 起对外暴露给 DicePanel UI。 */
export function canStartPush(ctx: {
  resultType: DiceResultType | null;
  sanCheck: boolean;
  mode: DiceMode;
  alreadyPushed: boolean;
}): boolean {
  return ctx.resultType === 'failure' && !ctx.sanCheck && ctx.mode !== 'opposed' && !ctx.alreadyPushed;
}

/**
 * A3.3 — 该记录是否触发「成长打钩」（写 /调查员/技能/XXX/ticked）：
 *  - 必须是成功档（success/hard-success/extreme-success/crit-success）
 *  - growthTickEligible 不能被显式置 false（R7：luck-spent 改写失败为成功的不计成长）
 *  - 不是 SAN 检定（SAN 不走技能成长通路）
 *  - skill 必须是真实技能名（非裸标签「检定/奖励骰/惩罚骰」）
 *  - 排除 信用评级 + 克苏鲁神话（COC7e R5：发展阶段豁免）
 */
const SUCCESS_TIERS: ReadonlySet<DiceResultType> = new Set([
  'success', 'hard-success', 'extreme-success', 'crit-success',
] as const);
const NON_TICKABLE_LABELS: ReadonlySet<string> = new Set(['检定', '奖励骰', '惩罚骰', 'SAN', '理智检定']);
const NON_TICKABLE_SKILLS: ReadonlySet<string> = new Set(['信用评级', '克苏鲁神话']);

export function shouldTickSkill(rec: DiceRecord): boolean {
  if (!SUCCESS_TIERS.has(rec.type)) return false;
  if (rec.growthTickEligible === false) return false;
  // SAN 检定的 skill 通常被 UI 设为 '理智检定' 或 'SAN'；走标签集合排除即可。
  if (NON_TICKABLE_LABELS.has(rec.skill)) return false;
  if (NON_TICKABLE_SKILLS.has(rec.skill)) return false;
  return true;
}

/** A3.3 — 把 record 转成 ticked JSON Patch op，供 commit 路径 fire-and-forget 写入。 */
function emitTickOp(rec: DiceRecord): void {
  if (!shouldTickSkill(rec)) return;
  // 经 canonicalSkillKey 在 redirect 内归一；这里直接传 rec.skill。
  // 未知技能名（!sheet.skills[name]）由 redirect 静默返回 null（不入 statData，不报错）。
  useVariableStore.getState().applyCorrectiveOps([
    { op: 'replace', path: `/调查员/技能/${rec.skill}/ticked`, value: true },
  ]);
}

/**
 * 从面板状态滚一次骰，得到 tens/ones/finalTens/bonusTens/originalRoll/finalRoll/resultType/对抗骰。
 * 由 roll()/rollStaged()/commitAsPush() 共用，集中处理奖励/惩罚骰与对抗骰的选骰逻辑。
 */
function rollDiceSnapshot(state: { mode: DiceMode; bonusDice: number; target: number; sanCheck: boolean }) {
  const tens = randD10();
  const ones = randD10();
  let bonusTens = 0;
  if (state.bonusDice !== 0) bonusTens = randD10();
  let finalTens = tens;
  if (state.bonusDice > 0) finalTens = Math.min(tens, bonusTens);
  else if (state.bonusDice < 0) finalTens = Math.max(tens, bonusTens);
  const originalRoll = d100(tens, ones);
  const finalRoll = d100(finalTens, ones);
  const resultType = determineResult(finalRoll, state.target, state.sanCheck);
  const oppTens = state.mode === 'opposed' ? randD10() : 0;
  const oppOnes = state.mode === 'opposed' ? randD10() : 0;
  return { tens, ones, bonusTens, finalTens, originalRoll, finalRoll, resultType, oppTens, oppOnes };
}

export const useDiceStore = create<DiceStore>((set, get) => ({
  isOpen: false, mode: 'check', target: 65, bonusDice: 0, sanCheck: false,
  tens: 0, ones: 0, finalTens: 0, bonusTens: 0, oppTens: 0, oppOnes: 0,
  originalRoll: 0, finalRoll: 0, resultType: null, history: [], pending: [],
  isProgrammatic: false,
  programmaticSkill: undefined, programmaticContext: undefined, onProgrammaticResolve: undefined,
  isStaged: false, lastRollContext: null,
  open: () => set({ isOpen: true }),
  close: () => set({
    isOpen: false,
    isProgrammatic: false,
    programmaticSkill: undefined,
    programmaticContext: undefined,
    onProgrammaticResolve: undefined,
  }),
  setMode: (m) => set({ mode: m }),
  setTarget: (t) => set({ target: t }),
  toggleBonus: () => set((s) => ({ bonusDice: s.bonusDice > 0 ? 0 : 1 })),
  togglePenalty: () => set((s) => ({ bonusDice: s.bonusDice < 0 ? 0 : -1 })),
  toggleSan: () => set((s) => ({ sanCheck: !s.sanCheck })),
  roll: () => {
    const s = get();
    // C5: 恐惧症/躁狂惩罚骰 — programmatic check 有 context 时自动叠加
    let effectiveBonusDice = s.bonusDice;
    if (s.isProgrammatic && s.programmaticContext) {
      const sheet = useCharSheetStore.getState().sheet;
      const penalty = checkPhobiaPenalty(
        s.programmaticSkill ?? '',
        s.programmaticContext,
        sheet.phobias,
        sheet.manias,
      );
      if (penalty > 0) effectiveBonusDice = Math.min(effectiveBonusDice - penalty, -1);
    }
    const snap = rollDiceSnapshot({ ...s, bonusDice: effectiveBonusDice });
    set({
      tens: snap.tens, ones: snap.ones, finalTens: snap.finalTens, bonusTens: snap.bonusTens,
      oppTens: snap.oppTens, oppOnes: snap.oppOnes,
      originalRoll: snap.originalRoll, finalRoll: snap.finalRoll, resultType: snap.resultType,
    });

    const skillLabel = s.isProgrammatic && s.programmaticSkill
      ? s.programmaticSkill
      : s.bonusDice > 0 ? '奖励骰' : s.bonusDice < 0 ? '惩罚骰' : '检定';
    const rec: DiceRecord = {
      skill: skillLabel,
      roll: String(snap.finalRoll).padStart(2, '0'),
      target: String(s.target),
      type: snap.resultType,
      time: Date.now(),
      page: useBookStore.getState().pageIndex + 1,
    };
    if (s.isProgrammatic && s.programmaticContext) rec.context = s.programmaticContext;
    get().addRecord(rec);

    if (s.isProgrammatic && s.onProgrammaticResolve) {
      const cb = s.onProgrammaticResolve;
      // 关闭并清空 programmatic 状态，再回调；回调里若再次 openCheck 不会被本次 close 抹掉。
      set({
        isOpen: false,
        isProgrammatic: false,
        programmaticSkill: undefined,
        programmaticContext: undefined,
        onProgrammaticResolve: undefined,
      });
      cb(snap.resultType, snap.finalRoll);
    }
  },
  addRecord: (r) => set((s) => ({ history: [r, ...s.history].slice(0, 20) })),
  stashRecord: (r) => set((s) => ({ pending: [...s.pending, r] })),
  commitPending: (explicitPage) => set((s) => {
    if (s.pending.length === 0) return s;
    // 修 Bug #3 / Fix #9: 检定记录页码对齐新页号
    // ----------------------------------
    // stashRecord 时 record.page 来自 fillInputBar 取的 pageIndex+1 = 触发选项时的【旧页号 N】,
    // 但 commitPending 由 useChatPipeline 在新页 appendPage 之后调用,此刻这条检定的结果实际
    // 应当归属【新页 N+1】(玩家看到第 N+1 页时检定记录显示 N 会显得错位)。
    //
    // append 模式下 appendPage 不动 pageIndex（autoFlipForward 才动），所以读 store 仍是
    // 旧 N-1 → fallback(pageIndex+1)=N 仍错位一页。调用方需把 baseIdx+2（与同回合 diceFromInput
    // 用的 checkPage 同源）作为 explicitPage 显式传入，确保 stash 暂存 + 主输入解析两条通路
    // 落到同一页号。replace 模式 / 手测场景 explicitPage 省略，走 fallback。
    const fallback = useBookStore.getState().pageIndex + 1;
    const currentPage = typeof explicitPage === 'number' ? explicitPage : fallback;
    const pendingFixed = s.pending.map((r) => ({ ...r, page: currentPage }));
    return {
      history: [...pendingFixed.reverse(), ...s.history].slice(0, 20),
      pending: [],
    };
  }),
  clearPending: () => set({ pending: [] }),
  setHistory: (records) => set({
    history: records.slice(0, 20),
    pending: [],
    isStaged: false,
    lastRollContext: null,
  }),
  clearAll: () => set({
    isOpen: false,
    history: [],
    pending: [],
    isStaged: false,
    lastRollContext: null,
    isProgrammatic: false,
    programmaticSkill: undefined,
    programmaticContext: undefined,
    onProgrammaticResolve: undefined,
  }),
  openCheck: (opts) => {
    const bonusDice = opts.bonus ? 1 : opts.penalty ? -1 : 0;
    set({
      isOpen: true,
      mode: 'check',
      target: opts.target,
      bonusDice,
      sanCheck: !!opts.sanCheck,
      isProgrammatic: true,
      programmaticSkill: opts.skill,
      programmaticContext: opts.context,
      onProgrammaticResolve: opts.onResolve,
    });
  },

  rollStaged: (skill) => {
    const s = get();
    // C5: 恐惧症/躁狂惩罚骰 — programmatic check 有 context 时自动叠加
    let effectiveBonusDice = s.bonusDice;
    if (s.isProgrammatic && s.programmaticContext) {
      const sheet = useCharSheetStore.getState().sheet;
      const penalty = checkPhobiaPenalty(
        skill ?? s.programmaticSkill ?? '',
        s.programmaticContext,
        sheet.phobias,
        sheet.manias,
      );
      if (penalty > 0) effectiveBonusDice = Math.min(effectiveBonusDice - penalty, -1);
    }
    const snap = rollDiceSnapshot({ ...s, bonusDice: effectiveBonusDice });
    set({
      tens: snap.tens, ones: snap.ones, finalTens: snap.finalTens, bonusTens: snap.bonusTens,
      oppTens: snap.oppTens, oppOnes: snap.oppOnes,
      originalRoll: snap.originalRoll, finalRoll: snap.finalRoll, resultType: snap.resultType,
      isStaged: true,
      lastRollContext: {
        skill: skill ?? (s.bonusDice > 0 ? '奖励骰' : s.bonusDice < 0 ? '惩罚骰' : '检定'),
        target: s.target,
        page: useBookStore.getState().pageIndex + 1,
        originalRoll: snap.originalRoll,
        originalResult: snap.resultType,
        sanCheck: s.sanCheck,
        mode: s.mode,
        tens: snap.tens, ones: snap.ones, finalTens: snap.finalTens, bonusTens: snap.bonusTens,
        oppTens: snap.oppTens, oppOnes: snap.oppOnes,
      },
    });
  },

  commitWithLuck: (spend) => {
    const ctx = get().lastRollContext;
    if (!ctx) return;
    const luck = useCharSheetStore.getState().sheet.secondary.luck;
    const safeSpend = Math.max(0, Math.min(spend, luck));
    const { finalRoll, resultType } = recomputeRollWithLuck(
      { originalRoll: ctx.originalRoll, target: ctx.target, sanCheck: ctx.sanCheck },
      safeSpend,
    );
    if (safeSpend > 0) {
      // 走 G2 自纠通路扣点；redirect(applyCharsheetRedirect) 处理 '调查员.幸运' op='delta' 分支，
      // 由 useVariableStore.applyCorrectiveOps → applyMvuPatch → redirect → sheet.secondary.luck 落地。
      useVariableStore.getState().applyCorrectiveOps([
        { op: 'delta', path: '/调查员/幸运', value: -safeSpend },
      ]);
    }
    set({ finalRoll, resultType });
    const rec: DiceRecord = {
      skill: ctx.skill,
      roll: String(finalRoll).padStart(2, '0'),
      target: String(ctx.target),
      type: resultType,
      time: Date.now(),
      page: ctx.page,
      luckSpent: safeSpend,
      // R7：用 luck 改写后的成功不算成长打钩。
      growthTickEligible: false,
    };
    get().addRecord(rec);
    // R7: growthTickEligible=false → shouldTickSkill 短路，不写 ticked。
    emitTickOp(rec);
    set({ isStaged: false, lastRollContext: null });
  },

  commitAsPush: (reason) => {
    const ctx = get().lastRollContext;
    if (!ctx) return;
    if (!canStartPush({
      resultType: ctx.originalResult,
      sanCheck: ctx.sanCheck,
      mode: ctx.mode,
      alreadyPushed: false,
    })) return;
    const snap = rollDiceSnapshot({
      mode: ctx.mode,
      bonusDice: get().bonusDice,
      target: ctx.target,
      sanCheck: ctx.sanCheck,
    });
    set({
      tens: snap.tens, ones: snap.ones, finalTens: snap.finalTens, bonusTens: snap.bonusTens,
      oppTens: snap.oppTens, oppOnes: snap.oppOnes,
      originalRoll: snap.originalRoll, finalRoll: snap.finalRoll, resultType: snap.resultType,
    });
    const rec: DiceRecord = {
      skill: ctx.skill,
      roll: String(snap.finalRoll).padStart(2, '0'),
      target: String(ctx.target),
      type: snap.resultType,
      time: Date.now(),
      page: ctx.page,
      pushed: true,
      pushReason: reason,
      pushedFrom: { roll: ctx.originalRoll, type: ctx.originalResult },
    };
    get().addRecord(rec);
    // R6：推骰的成功仍可触发成长打钩。
    emitTickOp(rec);
    set({ isStaged: false, lastRollContext: null });
  },

  commitNow: () => {
    const ctx = get().lastRollContext;
    if (!ctx) return;
    const s = get();
    const rec: DiceRecord = {
      skill: ctx.skill,
      roll: String(s.finalRoll).padStart(2, '0'),
      target: String(ctx.target),
      type: s.resultType ?? ctx.originalResult,
      time: Date.now(),
      page: ctx.page,
    };
    get().addRecord(rec);
    emitTickOp(rec);
    set({ isStaged: false, lastRollContext: null });
  },
}));
