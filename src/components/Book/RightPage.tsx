import { useState } from 'react';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { useDiceStore } from '../../stores/useDiceStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { renderContentWithCodeBlocks } from '../Shared/CodeBlockRenderer';
import { beautifyText } from '../Shared/TextBeautifier';
import { useScrollGlow, ScrollParticles } from './ScrollParticles';
import { resolvePlayerValue } from './resolvePlayerValue';
import type { ChoiceItem, DiceResultType } from '../../types';

interface Props {
  header: string;
  content: string;
  choices: ChoiceItem[];
  pageNum?: string;
  isFlipping?: boolean;
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

function parseCheckAction(text: string): CheckInfo | null {
  // Format: 对抗检定 "进行力量对抗(玩家目标值:60, 对手目标值:45)"
  const mo = text.match(/进行(.+?)对抗\s*\(玩家目标值\s*[:：]\s*(\d+)[,，]\s*对手目标值\s*[:：]\s*(\d+)\)/);
  if (mo) {
    return { skillName: mo[1].trim(), target: parseInt(mo[2]), opponentTarget: parseInt(mo[3]), difficulty: '普通', bonus: 'none', opposed: true };
  }
  // Format 1: "进行XX检定(目标值:NN, 奖励骰/惩罚骰)" — legacy with explicit target
  const m1 = text.match(/进行(.+?)检定\s*\(目标值\s*[:：]\s*(\d+)([^)]*)\)/);
  if (m1) {
    const rest = m1[3] || '';
    let bonus: BonusType = 'none';
    if (/奖励骰/.test(rest)) bonus = 'bonus';
    else if (/惩罚骰/.test(rest)) bonus = 'penalty';
    return { skillName: m1[1].trim(), target: parseInt(m1[2]), difficulty: '普通', bonus, opposed: false, opponentTarget: 0 };
  }
  // Format 2: "进行XX检定(普通/困难/极难, 奖励骰/惩罚骰)" — difficulty-based, target from char sheet
  const m2 = text.match(/进行(.+?)检定\s*\((普通|困难|极难)([^)]*)\)/);
  if (m2) {
    const rest = m2[3] || '';
    let bonus: BonusType = 'none';
    if (/奖励骰/.test(rest)) bonus = 'bonus';
    else if (/惩罚骰/.test(rest)) bonus = 'penalty';
    return { skillName: m2[1].trim(), target: 0, difficulty: m2[2], bonus, opposed: false, opponentTarget: 0 };
  }
  // Format 3: "[检定:XX 难度]"
  const m3 = text.match(/\[检定\s*[:：]\s*(.+?)\s+(普通|困难|极难)\s*\]/);
  if (m3) {
    return { skillName: m3[1].trim(), target: 0, difficulty: m3[2], bonus: 'none', opposed: false, opponentTarget: 0 };
  }
  return null;
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
  let resultType = 'failure';
  const fifth = Math.floor(target / 5);
  const half = Math.floor(target / 2);
  if (raw === 100 || (target < 50 && raw >= 96)) resultType = 'crit-failure';
  else if (raw === 1) resultType = 'crit-success';
  else if (raw <= fifth) resultType = 'extreme-success';
  else if (raw <= half) resultType = 'hard-success';
  else if (raw <= target) resultType = 'success';
  const labels: Record<string, string> = {
    'crit-success': '大成功！', 'extreme-success': '极难成功', 'hard-success': '困难成功',
    'success': '成功', 'failure': '失败', 'crit-failure': '大失败！',
  };
  return { raw, resultType, label: labels[resultType] || resultType, bonusTens, tensUsed: t, tensAlt: bonus !== 'none' ? (t === t1 ? t2 : t1) : t, ones: o };
}

const RESULT_RANK: Record<string, number> = {
  'crit-success': 5, 'extreme-success': 4, 'hard-success': 3, 'success': 2, 'failure': 1, 'crit-failure': 0,
};

function rollOpposed(playerTarget: number, opponentTarget: number) {
  const d10 = () => Math.floor(Math.random() * 10);
  const pt = d10(), po = d10(), ot = d10(), oo = d10();
  const pRaw = (pt === 0 && po === 0) ? 100 : pt * 10 + po;
  const oRaw = (ot === 0 && oo === 0) ? 100 : ot * 10 + oo;

  function getResult(roll: number, target: number) {
    const fifth = Math.floor(target / 5), half = Math.floor(target / 2);
    let rt = 'failure';
    if (roll === 100 || (target < 50 && roll >= 96)) rt = 'crit-failure';
    else if (roll === 1) rt = 'crit-success';
    else if (roll <= fifth) rt = 'extreme-success';
    else if (roll <= half) rt = 'hard-success';
    else if (roll <= target) rt = 'success';
    return rt;
  }

  const pResult = getResult(pRaw, playerTarget);
  const oResult = getResult(oRaw, opponentTarget);
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

function fillInputBar(text: string) {
  const input = document.querySelector<HTMLTextAreaElement>('footer textarea');
  if (!input) return;
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value',
  )?.set;

  const parsed = parseCheckAction(text);

  if (parsed && parsed.opposed) {
    const r = rollOpposed(parsed.target, parsed.opponentTarget);
    const outcomeLabel = r.outcome === 'win' ? '胜利' : r.outcome === 'lose' ? '失败' : '平局';
    const resultLine = `[${parsed.skillName}对抗 玩家d100=${r.pRaw}/${parsed.target}(${r.pLabel}) vs 对手d100=${r.oRaw}/${parsed.opponentTarget}(${r.oLabel}) → ${outcomeLabel}]\n`;

    useDiceStore.getState().addRecord({
      skill: `${parsed.skillName}(对抗)`,
      roll: String(r.pRaw),
      target: String(parsed.target),
      type: r.pResult as DiceResultType,
      time: Date.now(),
    });

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

    useDiceStore.getState().addRecord({
      skill: parsed.bonus === 'bonus' ? `${parsed.skillName}(奖励骰)` : parsed.bonus === 'penalty' ? `${parsed.skillName}(惩罚骰)` : parsed.skillName,
      roll: String(result.raw),
      target: String(parsed.target),
      type: result.resultType as DiceResultType,
      time: Date.now(),
    });

    document.dispatchEvent(new CustomEvent('dice-roll-animate', {
      detail: {
        skillName: parsed.skillName, target: parsed.target,
        roll: result.raw, resultType: result.resultType,
        inputText: resultLine + text,
        bonus: parsed.bonus, bonusTens: result.bonusTens,
        tensUsed: result.tensUsed, tensAlt: result.tensAlt, ones: result.ones,
      },
    }));
  } else if (parsed && parsed.target === 0) {
    const resolvedTarget = resolveTargetFromSheet(parsed.skillName, parsed.difficulty);
    const result = rollWithBonus(resolvedTarget, parsed.bonus);
    const rollStr = String(result.raw).padStart(2, '0');
    const diffLabel = parsed.difficulty !== '普通' ? ` ${parsed.difficulty}` : '';
    const bonusLabel = parsed.bonus === 'bonus' ? ' 奖励骰' : parsed.bonus === 'penalty' ? ' 惩罚骰' : '';
    const resultLine = `[${parsed.skillName}${diffLabel} d100=${rollStr}/${resolvedTarget}${bonusLabel} ${result.label}]\n`;

    useDiceStore.getState().addRecord({
      skill: `${parsed.skillName}${diffLabel}${bonusLabel}`,
      roll: String(result.raw),
      target: String(resolvedTarget),
      type: result.resultType as DiceResultType,
      time: Date.now(),
    });

    document.dispatchEvent(new CustomEvent('dice-roll-animate', {
      detail: {
        skillName: parsed.skillName, target: resolvedTarget,
        roll: result.raw, resultType: result.resultType,
        inputText: resultLine + text,
        bonus: parsed.bonus, bonusTens: result.bonusTens,
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

export function RightPage({ header, content, choices, pageNum, isFlipping }: Props) {
  const thRender = useTavernHelperStore((s) => s.render);
  const pt = useTavernHelperStore((s) => s.promptTemplate);
  const { edge, intensity, fading, onScroll } = useScrollGlow();
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
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 4, marginBottom: 16, borderBottom: '1px solid rgba(107,90,58,0.25)', paddingBottom: 10, flexShrink: 0, ...fadeStyle }}>{header}</h3>
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
        </div>
      </div>
      {pageNum && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', letterSpacing: 3, paddingTop: 10, borderTop: '1px solid rgba(107,90,58,0.15)', flexShrink: 0, ...fadeStyle }}>{pageNum}</div>
      )}
    </div>
  );
}

const BONUS_COLORS = {
  bonus: { color: '#2e5c1e', bg: 'rgba(46,125,50,0.1)', border: '1px solid rgba(46,125,50,0.35)' },
  penalty: { color: '#8b2020', bg: 'rgba(183,28,28,0.08)', border: '1px solid rgba(183,28,28,0.3)' },
  none: { color: '#5a4a2a', bg: 'rgba(107,90,58,0.08)', border: '1px solid rgba(107,90,58,0.3)' },
  opposed: { color: '#5c2e8b', bg: 'rgba(92,46,139,0.1)', border: '1px solid rgba(92,46,139,0.35)' },
};

function ChoiceButton({ choice: ch }: { choice: ChoiceItem }) {
  const [hovered, setHovered] = useState(false);
  const check = parseCheckAction(ch.action);
  const isCheck = check !== null;
  const playerSkill = isCheck ? getPlayerSkillValue(check.skillName) : null;

  return (
    <button onClick={() => fillInputBar(ch.action)} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: isCheck ? '12px 16px' : '10px 14px',
      border: isCheck ? '1px solid rgba(196,168,85,0.5)' : '1px solid rgba(107,90,58,0.2)',
      borderRadius: isCheck ? 5 : 3,
      background: hovered
        ? (isCheck ? 'rgba(196,168,85,0.18)' : 'rgba(196,168,85,0.15)')
        : (isCheck ? 'rgba(196,168,85,0.08)' : 'rgba(196,168,85,0.06)'),
      backdropFilter: isCheck ? 'blur(8px)' : 'none',
      boxShadow: isCheck
        ? (hovered ? '0 4px 20px rgba(196,168,85,0.15), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 2px 12px rgba(196,168,85,0.08), inset 0 1px 0 rgba(255,255,255,0.04)')
        : 'none',
      borderColor: hovered ? 'var(--gold)' : (isCheck ? 'rgba(196,168,85,0.5)' : 'rgba(107,90,58,0.2)'),
      color: isCheck ? 'var(--ink-deep, #1a1510)' : 'var(--ink)', fontFamily: 'var(--font-body)', fontSize: 14,
      textAlign: 'left', cursor: 'pointer', transition: 'var(--transition-smooth)',
    }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--gold)', color: 'var(--gold)', fontSize: 11, fontFamily: 'var(--font-ui)', fontWeight: 600, flexShrink: 0 }}>{ch.num}</span>
      <span style={{ flex: 1, fontWeight: isCheck ? 600 : 400 }}>{ch.text}</span>
      {isCheck && check && (() => {
        const val = playerSkill?.current ?? 0;
        const isDifficulty = check.target === 0;
        const effectiveVal = isDifficulty
          ? (check.difficulty === '极难' ? Math.floor(val / 5) : Math.floor(val / 2))
          : val;
        const c = BONUS_COLORS[check.opposed ? 'opposed' : check.bonus];
        return (
        <span style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center',
          padding: '2px 8px', borderRadius: 3,
          fontFamily: 'var(--font-mono)', fontWeight: 400, fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0,
          color: c.color, background: c.bg, border: c.border,
          transition: 'border-color 0.35s cubic-bezier(0.4,0,0.2,1), background 0.35s cubic-bezier(0.4,0,0.2,1)',
        }}>
          {check.skillName}
          <span style={{
            display: 'inline-block', overflow: 'hidden', verticalAlign: 'middle',
            maxWidth: hovered ? (isDifficulty ? 70 : 40) : 0,
            opacity: hovered ? 1 : 0,
            transition: 'max-width 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s cubic-bezier(0.4,0,0.2,1)',
          }}>
            {isDifficulty ? (
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
