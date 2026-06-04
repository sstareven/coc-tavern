import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { useDiceStore } from '../../stores/useDiceStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useBookStore } from '../../stores/useBookStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { useChoiceLockStore } from '../../stores/useChoiceLockStore';
import { useNpcStore } from '../../stores/useNpcStore';
import { enterCombat } from '../../sillytavern/combat-entry';
import { rollDiceExpr, determineResult } from '../../sillytavern/dice-engine';
import { isHiddenRollSkill, stashHiddenRoll } from '../../sillytavern/hidden-roll';
import { itemNarrated } from '../../sillytavern/llm-response-parser';
import { pushLog } from '../../stores/useLogStore';
import { renderContentWithCodeBlocks } from '../Shared/CodeBlockRenderer';
import { beautifyText } from '../Shared/TextBeautifier';
import { useScrollGlow, ScrollParticles } from './ScrollParticles';
import { resolvePlayerValue, normalizeSkillName, isKnownCheckTarget } from './resolvePlayerValue';
import { shouldStage, type StagingTrigger } from '../../sillytavern/option-staging';
import type { ChoiceItem, DiceRecord, DiceResultType, RewriteBlock, InventoryChange } from '../../types';

interface Props {
  header: string;
  content: string;
  choices: ChoiceItem[];
  pageNum?: string;
  isFlipping?: boolean;
  rewrite?: RewriteBlock;
  inventoryChanges?: InventoryChange[];
}

type BonusType = 'none' | 'bonus' | 'penalty';

interface CheckInfo {
  skillName: string;
  target: number;
  difficulty: string;
  bonus: BonusType;
  opposed: boolean;
  opponentTarget: number;
}

export function parseCheckAction(text: string): CheckInfo | null {
  // 技能名校验所需的角色卡：把「魔法值消耗」这类非技能词挡在检定之外（详见 isKnownCheckTarget）。
  const sheet = useCharSheetStore.getState().sheet;
  // Format: 对抗检定 "进行力量对抗(对手目标值:45)" or legacy "进行力量对抗(玩家目标值:60, 对手目标值:45)"
  const mo = text.match(/进行(.+?)对抗\s*\((?:玩家目标值\s*[:：]\s*\d+[,，]\s*)?对手目标值\s*[:：]\s*(\d+)\)/);
  if (mo) {
    const skillName = normalizeSkillName(mo[1]);
    if (!isKnownCheckTarget(skillName, sheet)) return null;
    const pv = getPlayerSkillValue(skillName);
    const playerTarget = pv?.current ?? 50;
    return { skillName, target: playerTarget, opponentTarget: parseInt(mo[2]), difficulty: '普通', bonus: 'none', opposed: true };
  }
  // Format 1: "进行XX检定(目标值:NN, 奖励骰/惩罚骰)" — legacy with explicit target
  const m1 = text.match(/进行(.+?)检定\s*\(目标值\s*[:：]\s*(\d+)([^)]*)\)/);
  if (m1) {
    const skillName = normalizeSkillName(m1[1]);
    if (!isKnownCheckTarget(skillName, sheet)) return null;
    const rest = m1[3] || '';
    let bonus: BonusType = 'none';
    if (/奖励骰/.test(rest)) bonus = 'bonus';
    else if (/惩罚骰/.test(rest)) bonus = 'penalty';
    return { skillName, target: parseInt(m1[2]), difficulty: '普通', bonus, opposed: false, opponentTarget: 0 };
  }
  // Format 2: "进行XX检定(普通/困难/极难, 奖励骰/惩罚骰)" — difficulty-based, target from char sheet
  const m2 = text.match(/进行(.+?)检定\s*\((普通|困难|极难)([^)]*)\)/);
  if (m2) {
    const skillName = normalizeSkillName(m2[1]);
    if (!isKnownCheckTarget(skillName, sheet)) return null;
    const rest = m2[3] || '';
    let bonus: BonusType = 'none';
    if (/奖励骰/.test(rest)) bonus = 'bonus';
    else if (/惩罚骰/.test(rest)) bonus = 'penalty';
    return { skillName, target: 0, difficulty: m2[2], bonus, opposed: false, opponentTarget: 0 };
  }
  // Format 3: "[检定:XX 难度]"
  const m3 = text.match(/\[检定\s*[:：]\s*(.+?)\s+(普通|困难|极难)\s*\]/);
  if (m3) {
    const skillName = normalizeSkillName(m3[1]);
    if (!isKnownCheckTarget(skillName, sheet)) return null;
    return { skillName, target: 0, difficulty: m3[2], bonus: 'none', opposed: false, opponentTarget: 0 };
  }
  // Format 4 (BUG4 catch-all): 兜底兼容 cleanChoiceField 没归一化掉的漂移格式。
  // 同时支持「进行<难度>XX检定」、「进行XX的<难度>检定」、「进行XX检定」（无括号），
  // 仍排除 "对抗" 防误伤格斗对抗。
  const m4 = text.match(/进行(?:(普通|困难|极难))?([^()（）对]+?)(?:的(普通|困难|极难))?检定(?![(（])/);
  if (m4) {
    const skillName = normalizeSkillName(m4[2]);
    if (!isKnownCheckTarget(skillName, sheet)) return null;
    const difficulty = m4[1] || m4[3] || '普通';
    return { skillName, target: 0, difficulty, bonus: 'none', opposed: false, opponentTarget: 0 };
  }
  return null;
}

interface PolyAction {
  kind: 'sanity' | 'damage';
  expr: string;          // 伤害骰表达式
  sanSuccess?: string;   // 理智检定成功损失表达式
  sanFail?: string;      // 理智检定失败损失表达式
}

/** 解析理智检定 / 伤害骰这类多面骰动作。 */
function parsePolyAction(text: string): PolyAction | null {
  // 理智检定: 进行理智检定(0/1D6) — 成功损失/失败损失
  const ms = text.match(/进行理智检定\s*\(\s*([0-9dD+\-]+)\s*\/\s*([0-9dD+\-]+)\s*\)/);
  if (ms) return { kind: 'sanity', expr: '', sanSuccess: ms[1].trim(), sanFail: ms[2].trim() };
  // 伤害骰: 进行伤害骰(1D3) 或 进行伤害(1D6+2)
  const md = text.match(/进行伤害(?:骰)?\s*\(\s*([0-9dD+\-]+)\s*\)/);
  if (md) return { kind: 'damage', expr: md[1].trim() };
  return null;
}

/** 当前理智值：角色卡(useCharSheetStore)是 调查员.理智值 的唯一源真理(MVU 重定向
 *  到角色卡,故不读扁平变量),回退 50。 */
function getSanValue(): number {
  const sheet = useCharSheetStore.getState().sheet;
  return sheet?.secondary?.san?.current || 50;
}

interface RollResult {
  raw: number;
  resultType: string;
  label: string;
  bonusTens: number;
  tensUsed: number;
  tensAlt: number;
  ones: number;
}

function rollWithBonus(target: number, bonus: BonusType): RollResult {
  const d10 = () => Math.floor(Math.random() * 10);
  const t1 = d10(), t2 = d10(), o = d10();
  let t: number;
  let bonusTens = t2;
  if (bonus === 'bonus') {
    t = Math.min(t1, t2);
    bonusTens = Math.max(t1, t2);
  } else if (bonus === 'penalty') {
    t = Math.max(t1, t2);
    bonusTens = Math.min(t1, t2);
  } else {
    t = t1;
    bonusTens = t1;
  }
  const raw = (t === 0 && o === 0) ? 100 : t * 10 + o;
  // 五档判定单源真理：dice-engine determineResult（sanCheck=false）。
  // 内联旧版的 target<50&&raw>=96 失误特例等价于 determineResult 的 step7，结果一致。
  const resultType = determineResult(raw, target, false);
  const labels: Record<string, string> = {
    'crit-success': '大成功！', 'extreme-success': '极难成功', 'hard-success': '困难成功',
    'success': '成功', 'failure': '失败', 'crit-failure': '大失败！',
  };
  return { raw, resultType, label: labels[resultType] || resultType, bonusTens, tensUsed: t, tensAlt: bonus !== 'none' ? (t === t1 ? t2 : t1) : t, ones: o };
}

const RESULT_RANK: Record<string, number> = {
  'crit-success': 5, 'extreme-success': 4, 'hard-success': 3, 'success': 2, 'failure': 1, 'crit-failure': 0,
};

/** 战斗类对抗技能（格斗/斗殴/擒抱/缴械等）——这类对抗选项应直接进战斗面板而非掷骰提交。 */
const COMBAT_OPPOSED_RE = /格斗|斗殴|擒|缴械|搏斗|近战|拳|踢|扑|武器|肉搏/;
function isCombatOpposed(skillName: string): boolean { return COMBAT_OPPOSED_RE.test(skillName); }

function rollOpposed(playerTarget: number, opponentTarget: number) {
  const d10 = () => Math.floor(Math.random() * 10);
  const pt = d10(), po = d10(), ot = d10(), oo = d10();
  const pRaw = (pt === 0 && po === 0) ? 100 : pt * 10 + po;
  const oRaw = (ot === 0 && oo === 0) ? 100 : ot * 10 + oo;

  // 五档判定单源真理：dice-engine determineResult（对抗双方均为技能检定，sanCheck=false）。
  const pResult = determineResult(pRaw, playerTarget, false);
  const oResult = determineResult(oRaw, opponentTarget, false);
  const pRank = RESULT_RANK[pResult] ?? 1;
  const oRank = RESULT_RANK[oResult] ?? 1;
  let outcome: 'win' | 'lose' | 'draw' = 'draw';
  if (pRank > oRank) outcome = 'win';
  else if (pRank < oRank) outcome = 'lose';
  else if (playerTarget > opponentTarget) outcome = 'win';
  else if (playerTarget < opponentTarget) outcome = 'lose';
  else outcome = 'win';

  const labels: Record<string, string> = {
    'crit-success': '大成功', 'extreme-success': '极难成功', 'hard-success': '困难成功',
    'success': '成功', 'failure': '失败', 'crit-failure': '大失败',
  };
  return { pRaw, oRaw, pResult, oResult, pLabel: labels[pResult] || pResult, oLabel: labels[oResult] || oResult, outcome };
}

function getPlayerSkillValue(skillName: string): { base: number; current: number } | null {
  const sheet = useCharSheetStore.getState().sheet;
  return resolvePlayerValue(skillName, sheet);
}

function resolveTargetFromSheet(skillName: string, difficulty: string): number {
  const pv = getPlayerSkillValue(skillName);
  const base = pv?.current ?? 50;
  if (difficulty === '极难') return Math.floor(base / 5);
  if (difficulty === '困难') return Math.floor(base / 2);
  return base;
}

function fillInputBar(text: string, checkText: string = text) {
  // 仅允许在最新一页（最后一页）触发选项，防止在历史页面生成新页造成推进错乱
  const bs = useBookStore.getState();
  if (bs.pageIndex !== bs.pages.length - 1) return;

  // 新选项会覆盖输入框内容，上一次暂存的检定作废 —— 只有最终被提交、剧情真正推进的那次才入 history。
  useDiceStore.getState().clearPending();

  const input = document.querySelector<HTMLTextAreaElement>('footer textarea');
  if (!input) return;
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value',
  )?.set;

  const parsed = parseCheckAction(checkText);

  const page = useBookStore.getState().pageIndex + 1;

  // ── 理智检定 / 伤害骰（多面骰）──
  const poly = parsePolyAction(checkText);
  if (poly) {
    if (poly.kind === 'sanity') {
      const sanTarget = getSanValue();
      const t1 = Math.floor(Math.random() * 10), o = Math.floor(Math.random() * 10);
      const d100roll = (t1 === 0 && o === 0) ? 100 : t1 * 10 + o;
      const resultType = determineResult(d100roll, sanTarget, true);
      const isSuccess = resultType.includes('success');
      const lossExpr = (isSuccess ? poly.sanSuccess : poly.sanFail) || '0';
      const loss = Math.max(0, rollDiceExpr(lossExpr)?.total ?? 0);
      const outLabel = isSuccess ? '成功' : '失败';
      const resultLine = `[理智检定 d100=${String(d100roll).padStart(2, '0')}/${sanTarget} ${outLabel} 损失${loss}点理智]\n`;
      useDiceStore.getState().stashRecord({
        skill: `理智检定 损失${loss}`, roll: String(d100roll).padStart(2, '0'),
        target: String(sanTarget), type: resultType as DiceResultType, time: Date.now(), page,
      });
      document.dispatchEvent(new CustomEvent('dice-roll-animate', {
        detail: {
          kind: 'poly', polyTheme: 'sanity', polyLabel: '理智损失',
          polyExpr: lossExpr, polyTotal: loss, polySub: `${outLabel} · d100=${d100roll}/${sanTarget}`,
          inputText: resultLine + text,
        },
      }));
    } else {
      const dmg = Math.max(0, rollDiceExpr(poly.expr)?.total ?? 0);
      const resultLine = `[伤害 ${poly.expr}=${dmg} 造成${dmg}点伤害]\n`;
      useDiceStore.getState().stashRecord({
        skill: `伤害 ${poly.expr}`, roll: String(dmg), target: '—',
        type: 'failure' as DiceResultType, time: Date.now(), page, kind: 'poly',
      });
      document.dispatchEvent(new CustomEvent('dice-roll-animate', {
        detail: {
          kind: 'poly', polyTheme: 'damage', polyLabel: '造成伤害',
          polyExpr: poly.expr, polyTotal: dmg, polySub: '',
          inputText: resultLine + text,
        },
      }));
    }
    return;
  }

  // ── 暗骰（心理学等）：掷骰但对玩家隐藏结果，真实结果提交时再交给 LLM ──
  if (parsed && !parsed.opposed && isHiddenRollSkill(parsed.skillName)) {
    const resolvedTarget = parsed.target > 0 ? parsed.target : resolveTargetFromSheet(parsed.skillName, parsed.difficulty);
    const result = rollWithBonus(resolvedTarget, parsed.bonus);
    const rollStr = String(result.raw).padStart(2, '0');
    const diffLabel = parsed.difficulty !== '普通' ? ` ${parsed.difficulty}` : '';
    const bonusLabel = parsed.bonus === 'bonus' ? ' 奖励骰' : parsed.bonus === 'penalty' ? ' 惩罚骰' : '';
    const realResult = `[${parsed.skillName}${diffLabel} d100=${rollStr}/${resolvedTarget}${bonusLabel} ${result.label}]`;
    const token = `[${parsed.skillName} 暗骰]`;
    stashHiddenRoll(token, realResult);
    // 不记入检定记录面板（玩家不可见）；动画为无数字的「暗骰」
    document.dispatchEvent(new CustomEvent('dice-roll-animate', {
      detail: {
        kind: 'poly', hidden: true, polyTheme: 'sanity',
        polyLabel: `${parsed.skillName}检定`, polyExpr: '暗骰', polyTotal: 0, polySub: '',
        inputText: `${token}\n${text}`,
      },
    }));
    return;
  }

  if (parsed && parsed.opposed) {
    const r = rollOpposed(parsed.target, parsed.opponentTarget);
    const outcomeLabel = r.outcome === 'win' ? '胜利' : r.outcome === 'lose' ? '失败' : '平局';
    const resultLine = `[${parsed.skillName}对抗 玩家d100=${r.pRaw}/${parsed.target}(${r.pLabel}) vs 对手d100=${r.oRaw}/${parsed.opponentTarget}(${r.oLabel}) → ${outcomeLabel}]\n`;

    const diceRec = {
      skill: `${parsed.skillName}(对抗)`,
      roll: String(r.pRaw),
      target: String(parsed.target),
      type: r.pResult as DiceResultType,
      time: Date.now(),
      page,
    };
    // 对抗检定不进 staging（shouldStage 排除 opposed）→ 立即 stashRecord，保持旧行为
    useDiceStore.getState().stashRecord(diceRec);

    document.dispatchEvent(new CustomEvent('dice-roll-animate', {
      detail: {
        skillName: parsed.skillName, target: parsed.target,
        roll: r.pRaw, resultType: r.pResult,
        inputText: resultLine + text,
        bonus: 'none', bonusTens: 0,
        opposed: true, opponentRoll: r.oRaw, opponentTarget: parsed.opponentTarget, opponentResultType: r.oResult, opposedOutcome: r.outcome,
      },
    }));
    return;
  }

  if (parsed && parsed.target > 0) {
    const result = rollWithBonus(parsed.target, parsed.bonus);
    const rollStr = String(result.raw).padStart(2, '0');
    const bonusLabel = parsed.bonus === 'bonus' ? ' 奖励骰' : parsed.bonus === 'penalty' ? ' 惩罚骰' : '';
    const resultLine = `[${parsed.skillName} d100=${rollStr}/${parsed.target}${bonusLabel} ${result.label}]\n`;

    const diceRec2: DiceRecord = {
      skill: parsed.bonus === 'bonus' ? `${parsed.skillName}(奖励骰)` : parsed.bonus === 'penalty' ? `${parsed.skillName}(惩罚骰)` : parsed.skillName,
      roll: String(result.raw),
      target: String(parsed.target),
      type: result.resultType as DiceResultType,
      time: Date.now(),
      page,
    };
    // A1.8 — 普通 check 走 staging：动画结束后由 OptionResolutionOverlay 接管 stashRecord + textarea 写入。
    // SAN/opposed 已被前面分支拦掉，这里 staging 条件天然成立（kind=check）；GameView 端再用 shouldStage 复核一次。
    const stagingTrigger: StagingTrigger = {
      kind: 'check',
      skill: parsed.skillName,
      target: parsed.target,
      originalRoll: result.raw,
      originalResult: result.resultType as DiceResultType,
      sanCheck: false,
      inputText: resultLine + text,
      resultLine,
      baseText: text,
      page,
      record: diceRec2,
    };

    document.dispatchEvent(new CustomEvent('dice-roll-animate', {
      detail: {
        skillName: parsed.skillName, target: parsed.target,
        roll: result.raw, resultType: result.resultType,
        inputText: resultLine + text,
        bonus: parsed.bonus, bonusTens: result.bonusTens,
        tensUsed: result.tensUsed, tensAlt: result.tensAlt, ones: result.ones,
        stagingTrigger,
      },
    }));
  } else if (parsed && parsed.target === 0) {
    const resolvedTarget = resolveTargetFromSheet(parsed.skillName, parsed.difficulty);
    const result = rollWithBonus(resolvedTarget, parsed.bonus);
    const rollStr = String(result.raw).padStart(2, '0');
    const diffLabel = parsed.difficulty !== '普通' ? ` ${parsed.difficulty}` : '';
    const bonusLabel = parsed.bonus === 'bonus' ? ' 奖励骰' : parsed.bonus === 'penalty' ? ' 惩罚骰' : '';
    const resultLine = `[${parsed.skillName}${diffLabel} d100=${rollStr}/${resolvedTarget}${bonusLabel} ${result.label}]\n`;

    const diceRec3: DiceRecord = {
      skill: `${parsed.skillName}${diffLabel}${bonusLabel}`,
      roll: String(result.raw),
      target: String(resolvedTarget),
      type: result.resultType as DiceResultType,
      time: Date.now(),
      page,
    };
    // A1.8 — 同上：difficulty-based 普通 check 也走 staging。
    const stagingTrigger: StagingTrigger = {
      kind: 'check',
      skill: parsed.skillName,
      target: resolvedTarget,
      originalRoll: result.raw,
      originalResult: result.resultType as DiceResultType,
      sanCheck: false,
      inputText: resultLine + text,
      resultLine,
      baseText: text,
      page,
      record: diceRec3,
    };

    document.dispatchEvent(new CustomEvent('dice-roll-animate', {
      detail: {
        skillName: parsed.skillName, target: resolvedTarget,
        roll: result.raw, resultType: result.resultType,
        inputText: resultLine + text,
        bonus: parsed.bonus, bonusTens: result.bonusTens,
        stagingTrigger,
      },
    }));
  } else {
    nativeInputValueSetter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    if (useSettingsStore.getState().autoSubmitChoice) {
      setTimeout(() => document.dispatchEvent(new Event('auto-submit-input')), 100);
    }
  }
}

/** 单次绑定 `npc-action` 监听：名册互动的 check 动作经此走与点选项完全相同的【掷骰→提交】管线。
 *  fillInputBar 自带「仅最新页」守卫，模块级单例避免翻页多实例重复提交。 */
let npcActionBound = false;
function bindNpcActionListener() {
  if (npcActionBound || typeof document === 'undefined') return;
  npcActionBound = true;
  document.addEventListener('npc-action', (e) => {
    const d = (e as CustomEvent).detail as { text?: string; checkText?: string } | undefined;
    if (d?.text) fillInputBar(d.text, d.checkText ?? d.text);
  });
}

/** 翻页一下并打开背包浮层。 */
function openBackpack() {
  const inv = useInventoryStore.getState();
  if (inv.isOpen) return;
  useBookStore.getState().decorativeFlip('backward', 800, () => {
    useInventoryStore.getState().toggle();
  });
}

export function RightPage({ header, content, choices, pageNum, isFlipping, rewrite, inventoryChanges }: Props) {
  const thRender = useTavernHelperStore((s) => s.render);
  const pt = useTavernHelperStore((s) => s.promptTemplate);
  const { edge, intensity, fading, onScroll } = useScrollGlow();
  useEffect(() => { bindNpcActionListener(); }, []);
  const fadeStyle = {
    opacity: isFlipping ? 0 : 1,
    transition: isFlipping ? 'opacity 0.35s ease-in' : 'opacity 0.6s ease-out 0.6s',
  };
  const renderedContent = renderContentWithCodeBlocks(content, {
    enabled: thRender.renderEnabled,
    collapse: thRender.codeCollapse,
    noHighlight: thRender.disableCodeHighlight,
    codeBlocks: pt.enabled ? pt.codeBlocksEnabled : true,
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 28px 20px 24px', minHeight: 0, background: 'linear-gradient(225deg, var(--parchment) 0%, var(--parchment-deep) 100%)', borderTopRightRadius: 4, borderBottomRightRadius: 4, boxShadow: 'inset 1px 0 2px rgba(0,0,0,0.04)', color: 'var(--ink)', fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.75, position: 'relative' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 4, marginBottom: 16, borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.25)', paddingBottom: 10, flexShrink: 0, ...fadeStyle }}>{header}</h3>
      <InventoryChangesBar inventoryChanges={inventoryChanges ?? []} fadeStyle={fadeStyle} />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {edge !== 'none' && <ScrollParticles edge={edge} fading={fading} intensity={intensity} />}
        <div className="rp-scroll" onScroll={onScroll} style={{ height: '100%', overflowY: 'auto', paddingRight: 4, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)', ...fadeStyle }}>
          {renderedContent.length === 1 && typeof renderedContent[0] === 'string' ? (
            <p style={{ textIndent: '2em', marginBottom: 18, color: 'var(--ink)' }}>{beautifyText(renderedContent[0])}</p>
          ) : (
            renderedContent.map((node, i) => typeof node === 'string'
              ? <p key={i} style={{ textIndent: '2em', marginBottom: 8, color: 'var(--ink)' }}>{beautifyText(node)}</p>
              : <span key={i}>{node}</span>)
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {choices.map((ch) => <ChoiceButton key={ch.num} choice={ch} />)}
          </div>
          {rewrite && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed rgba(var(--ink-faded-rgb),0.3)' }}>
              {rewrite.text && (
                <motion.p
                  key={rewrite.text}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                  style={{ textIndent: '2em', marginBottom: 12, color: 'var(--ink)', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}
                >
                  {beautifyText(rewrite.text)}
                </motion.p>
              )}
              <AnimatePresence mode="wait">
                <motion.div
                  key={rewrite.sourceInput + '|' + rewrite.text}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {rewrite.choices.map((ch, i) => (
                    <motion.div
                      key={ch.num}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.32, delay: i * 0.06, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <ChoiceButton choice={ch} />
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
      {pageNum && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', letterSpacing: 3, paddingTop: 10, borderTop: '1px solid rgba(var(--ink-faded-rgb),0.15)', flexShrink: 0, ...fadeStyle }}>{pageNum}</div>
      )}
    </div>
  );
}

const ITEM_CAT_LABELS: Record<string, string> = {
  weapon: '武器', tool: '工具', consumable: '消耗品', clue: '线索', key_item: '关键物品', misc: '杂物',
};

const BONUS_COLORS = {
  bonus: { color: 'var(--bonus-text)', bg: 'rgba(46,125,50,0.1)', border: '1px solid rgba(46,125,50,0.35)' },
  penalty: { color: 'var(--penalty-text)', bg: 'rgba(183,28,28,0.08)', border: '1px solid rgba(183,28,28,0.3)' },
  none: { color: 'var(--neutral-text)', bg: 'rgba(var(--ink-faded-rgb),0.08)', border: '1px solid rgba(var(--ink-faded-rgb),0.3)' },
  opposed: { color: 'var(--opposed-text)', bg: 'rgba(92,46,139,0.1)', border: '1px solid rgba(92,46,139,0.35)' },
};

function cleanChoiceText(text: string): string {
  return text
    .replace(/\[检定\s*[:：][^\]]*\]\s*/g, '')
    .replace(/\[对抗\s*[:：][^\]]*\]\s*/g, '')
    // 显示层兜底：剥除残留 var 标签（含畸形写法）与裸露的难度文字
    .replace(/<\s*var[A-Za-z]*\b[^<>]*?\/?>/gi, '')
    .replace(/[(（]\s*(?:普通|困难|极难)难度\s*[)）]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * 选中选项时提交给 LLM 的内容：把玩家可见的叙事文字(text)与机制动作(action)合并，
 * 让 LLM 拿到完整意图与上下文，而不只是 action。若 action 已含该叙事则不重复。
 */
function buildChoiceInput(ch: ChoiceItem): string {
  const t = cleanChoiceText(ch.text || '').trim();
  const a = (ch.action || '').trim();
  if (!t) return a;
  if (!a) return t;
  if (a.includes(t)) return a;
  return `${t}。${a}`;
}

/**
 * 行动补写拾取提交：当玩家点选带 itemGain 的补写选项时，
 * 第二道防无中生有校验——物品名必须在当前页场景叙述(左+右正文)中出现，
 * 通过则直接入库并记到该页 acquiredItems（供后续正文去重），否则拒绝并告警。
 */
function commitRewriteItemGain(ch: ChoiceItem): void {
  const gain = ch.itemGain;
  if (!gain?.name) return;
  const bs = useBookStore.getState();
  const idx = bs.pageIndex;
  const page = bs.pages[idx];
  const scene = (page?.leftContent ?? '') + '\n' + (page?.rightContent ?? '');
  if (!itemNarrated(gain.name, scene)) {
    pushLog('warn', `[补写拾取] 物品「${gain.name}」未在当前场景叙述中出现，已拒绝拾取（防无中生有）`, 'system');
    return;
  }
  useInventoryStore.getState().applyChanges([
    { action: 'add', name: gain.name, ...(gain.category ? { category: gain.category } : {}) },
  ]);
  bs.setPageAcquiredItems(idx, [gain.name]);
  pushLog('info', `[补写拾取] 已获得「${gain.name}」`, 'system');
}

export function InventoryChangesBar({ inventoryChanges, fadeStyle, variant = 'light', interactive = true }: {
  inventoryChanges: InventoryChange[];
  fadeStyle?: React.CSSProperties;
  variant?: 'light' | 'dark';
  interactive?: boolean;
}) {
  if (!inventoryChanges || inventoryChanges.length === 0) return null;
  const dark = variant === 'dark';

  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-ui)', color: dark ? '#d8c8a8' : 'var(--ink-faded)', letterSpacing: 2 }}>物品变化</span>
        {interactive && <span style={{ fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--gold)', letterSpacing: 1 }}>打开背包 ›</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {inventoryChanges.map((c, i) => {
          const cat = c.category ? ITEM_CAT_LABELS[c.category] : '';
          const isGain = c.action === 'add'
            || (c.action === 'update' && (c.quantity ?? 0) > 0);
          const isLoss = c.action === 'remove'
            || (c.action === 'update' && (c.quantity ?? 0) < 0);
          const tone = isGain ? BONUS_COLORS.bonus : isLoss ? BONUS_COLORS.penalty : BONUS_COLORS.none;
          let prefix = '';
          if (c.action === 'add') prefix = '＋';
          else if (c.action === 'remove') prefix = '－';
          let qtyLabel = '';
          if (c.action === 'update' && typeof c.quantity === 'number') {
            const q = c.quantity;
            prefix = q > 0 ? '＋' : '－';
            qtyLabel = ` ×${Math.abs(q)}`;
          } else if (typeof c.quantity === 'number' && c.quantity > 1) {
            qtyLabel = ` ×${c.quantity}`;
          }
          return (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 3,
              fontSize: 11, fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
              color: dark ? '#ece0c8' : tone.color,
              background: dark ? 'rgba(196,168,85,0.12)' : tone.bg,
              border: dark ? '1px solid rgba(196,168,85,0.25)' : tone.border,
            }}>
              <span>{prefix}{c.name}{qtyLabel}</span>
              {cat && <span style={{ fontSize: 9, opacity: 0.55, letterSpacing: 0.5 }}>{cat}</span>}
            </span>
          );
        })}
      </div>
    </>
  );

  const baseStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left',
    marginBottom: 16, padding: '8px 10px',
    border: '1px solid rgba(var(--ink-faded-rgb),0.2)', borderRadius: 4,
    background: 'rgba(196,168,85,0.06)',
    flexShrink: 0,
    ...fadeStyle,
  };

  // 手机端等场景用非交互版（仅展示，不可点——防误触跳转背包）
  if (!interactive) {
    return <div style={baseStyle}>{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={openBackpack}
      title="点击打开背包"
      style={{ ...baseStyle, cursor: 'pointer' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.14)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; e.currentTarget.style.borderColor = 'rgba(var(--ink-faded-rgb),0.2)'; }}
    >
      {inner}
    </button>
  );
}

export function ChoiceButton({ choice: ch, variant = 'light' }: { choice: ChoiceItem; variant?: 'light' | 'dark' }) {
  const [hovered, setHovered] = useState(false);
  const dark = variant === 'dark';
  // 仅最新一页（最后一页）的选项可点击；翻回历史页面时选项禁用并置灰
  const isLatestPage = useBookStore((s) => s.pageIndex === s.pages.length - 1);
  // 选项锁：本回合已按下一个会推进/掷骰的选项后，全部选项置灰禁用，防止重复点击重掷
  const locked = useChoiceLockStore((s) => s.locked);
  // BUG4: 优先解析 action 字段；当 LLM 把检定标记漂移到了 text 字段时回退尝试 text。
  const check = parseCheckAction(ch.action) ?? parseCheckAction(ch.text);
  const isCheck = check !== null;
  const playerSkill = isCheck ? getPlayerSkillValue(check.skillName) : null;
  const enabled = isLatestPage && !locked;
  const isHovered = hovered && enabled;

  return (
    <button
      onClick={() => {
        if (!enabled) return;
        commitRewriteItemGain(ch);
        // 战斗类对抗选项(格斗/斗殴对抗) → 直接进战斗面板，复用这次对抗掷骰作开场；不走普通掷骰提交。
        if (check?.opposed && isCombatOpposed(check.skillName)) {
          useChoiceLockStore.getState().lock();
          const r = rollOpposed(check.target || 50, check.opponentTarget);
          const opener = buildChoiceInput(ch);
          const recent = useBookStore.getState().pages.slice(-2).map((p) => p.leftContent).filter(Boolean).join('\n');
          const present = useNpcStore.getState().getPresent().map((n) => `${n.name}（${n.identity || '身份不明'}，好感${n.favorability}）`).join('；');
          void enterCombat({
            contextText: `${recent}\n调查员行动：${opener}${present ? `\n在场NPC：${present}` : ''}`,
            opener,
            opposed: { playerRoll: r.pRaw, playerTarget: check.target || 50, oppRoll: r.oRaw, oppTarget: check.opponentTarget, outcome: r.outcome },
          });
          return;
        }
        fillInputBar(buildChoiceInput(ch), ch.action);
      }}
      disabled={!enabled}
      title={!isLatestPage ? '只有最新一页的选项可以选择' : (locked ? '正在处理上一个选择…' : undefined)}
      style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: isCheck ? '12px 16px' : '10px 14px',
      border: isCheck ? '1px solid rgba(196,168,85,0.5)' : '1px solid rgba(var(--ink-faded-rgb),0.2)',
      borderRadius: isCheck ? 5 : 3,
      background: isHovered
        ? (isCheck ? 'rgba(196,168,85,0.18)' : 'rgba(196,168,85,0.15)')
        : (isCheck ? 'rgba(196,168,85,0.08)' : 'rgba(196,168,85,0.06)'),
      backdropFilter: isCheck ? 'blur(8px)' : 'none',
      boxShadow: isCheck
        ? (isHovered ? '0 4px 20px rgba(196,168,85,0.15), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 2px 12px rgba(196,168,85,0.08), inset 0 1px 0 rgba(255,255,255,0.04)')
        : 'none',
      borderColor: isHovered ? 'var(--gold)' : (dark ? 'rgba(196,168,85,0.4)' : (isCheck ? 'rgba(196,168,85,0.5)' : 'rgba(var(--ink-faded-rgb),0.2)')),
      color: dark ? (isCheck ? 'var(--parchment)' : '#ece0c8') : (isCheck ? 'var(--ink-deep, #1a1510)' : 'var(--ink)'), fontFamily: 'var(--font-body)', fontSize: 14,
      textAlign: 'left', cursor: enabled ? 'pointer' : 'not-allowed', transition: 'var(--transition-smooth)',
      opacity: enabled ? 1 : 0.45,
      filter: enabled ? 'none' : 'grayscale(0.6)',
    }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--gold)', color: 'var(--gold)', fontSize: 11, fontFamily: 'var(--font-ui)', fontWeight: 600, flexShrink: 0 }}>{ch.num}</span>
      <span style={{ flex: 1, fontWeight: isCheck ? 600 : 400 }}>{cleanChoiceText(ch.text)}</span>
      {isCheck && check && (() => {
        const val = playerSkill?.current ?? 0;
        const isHardOrExtreme = check.target === 0 && (check.difficulty === '困难' || check.difficulty === '极难');
        const effectiveVal = isHardOrExtreme
          ? (check.difficulty === '极难' ? Math.floor(val / 5) : Math.floor(val / 2))
          : val;
        const c = BONUS_COLORS[check.opposed ? 'opposed' : check.bonus];
        const tag = dark
          ? { color: '#ece0c8', bg: 'rgba(196,168,85,0.14)', border: '1px solid rgba(196,168,85,0.3)' }
          : c;
        return (
        <span style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center',
          padding: '2px 8px', borderRadius: 3,
          fontFamily: 'var(--font-mono)', fontWeight: 400, fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0,
          color: tag.color, background: tag.bg, border: tag.border,
          transition: 'border-color 0.35s cubic-bezier(0.4,0,0.2,1), background 0.35s cubic-bezier(0.4,0,0.2,1)',
        }}>
          {check.skillName}
          <span style={{
            display: 'inline-block', overflow: 'hidden', verticalAlign: 'middle',
            maxWidth: isHovered ? (isHardOrExtreme ? 70 : 40) : 0,
            opacity: isHovered ? 1 : 0,
            transition: 'max-width 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s cubic-bezier(0.4,0,0.2,1)',
          }}>
            {isHardOrExtreme ? (
              <>&nbsp;<span style={{ textDecoration: 'line-through', opacity: 0.4 }}>{val}</span> {effectiveVal}</>
            ) : (
              <>&nbsp;{val}</>
            )}
          </span>
        </span>
        );
      })()}
    </button>
  );
}
