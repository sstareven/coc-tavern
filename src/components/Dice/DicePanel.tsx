import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDiceStore, canStartPush } from '../../stores/useDiceStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import type { DiceMode, DiceResultType } from '../../types';
import { closeBtnStyle } from '../../styles/panelStyles';
import { DiceDie } from './DiceDie';
import { IconLuck, IconPush } from '../Layout/TabIcons';
import {
  deriveUiStateAfterRoll,
  previewLuckResult,
  commitButtonLabel,
  maxLuckSpend,
  type DicePanelSubState,
} from './dice-panel-state';
import {
  sfxSuccess,
  sfxFailure,
  sfxCritSuccess,
  sfxCritFailure,
} from '../../audio/sfx';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { pickRollForResult } from '../../sillytavern/cheating-helpers';
import { CheatingGrid } from './CheatingGrid';

const resultLabel: Record<DiceResultType, string> = {
  'crit-success': '大成功！',
  'extreme-success': '极难成功',
  'hard-success': '困难成功',
  success: '成功',
  failure: '失败',
  'crit-failure': '大失败！',
};

const resultColor: Record<DiceResultType, string> = {
  'crit-success': 'var(--gold-bright)',
  'extreme-success': 'var(--gold)',
  'hard-success': 'var(--success-bright)',
  success: 'var(--success)',
  failure: 'var(--blood)',
  'crit-failure': 'var(--blood-bright)',
};

function playResultSound(type: DiceResultType) {
  if (type === 'crit-success' || type === 'extreme-success') sfxCritSuccess();
  else if (type === 'success' || type === 'hard-success') sfxSuccess();
  else if (type === 'crit-failure') sfxCritFailure();
  else sfxFailure();
}

function fillResultText(roll: number, type: DiceResultType, target: number) {
  const input = document.querySelector<HTMLTextAreaElement>('footer textarea');
  if (!input) return;
  const text = `[${roll} / ${target}] ${resultLabel[type]}`;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  setter?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Particle effect for crit results ──

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  duration: number;
  delay: number;
  drift: number;
}

function generateParticles(isSuccess: boolean): Particle[] {
  const particles: Particle[] = [];
  const count = 40;
  const color = isSuccess ? '#e8c865' : '#cc3333';
  for (let i = 0; i < count; i++) {
    particles.push({
      id: i,
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      size: Math.random() * 6 + 2,
      color,
      duration: Math.random() * 1.5 + 1,
      delay: Math.random() * 0.6,
      drift: (Math.random() - 0.5) * 200,
    });
  }
  return particles;
}

function ParticleEffect({ isSuccess, onDone }: { isSuccess: boolean; onDone: () => void }) {
  const particles = useRef(generateParticles(isSuccess));

  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 850,
        pointerEvents: 'none', overflow: 'hidden',
      }}
    >
      <motion.div
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{
          position: 'absolute', inset: 0,
          background: isSuccess
            ? 'radial-gradient(circle, rgba(232,200,101,0.3) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(204,51,51,0.25) 0%, transparent 70%)',
        }}
      />
      {!isSuccess && (
        <motion.div
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2, ease: 'easeOut' }}
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(139,58,58,0.5) 100%)',
          }}
        />
      )}
      {particles.current.map((p) => (
        <motion.div key={p.id}
          initial={{ opacity: 1, scale: 0, x: '-50%', y: '-50%', left: '50%', top: '55%' }}
          animate={{
            opacity: [1, 1, 0],
            scale: [0, 1.2, 0],
            x: `calc(-50% + ${p.drift * (isSuccess ? 1 : 0.5)}px)`,
            y: `calc(-50% - ${80 + p.delay * 100 + Math.random() * 120}px)`,
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute', width: p.size, height: p.size,
            borderRadius: '50%', background: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}

// ── Main Panel ──

export function DicePanel() {
  const isOpen = useDiceStore((s) => s.isOpen);
  const mode = useDiceStore((s) => s.mode);
  const target = useDiceStore((s) => s.target);
  const bonusDice = useDiceStore((s) => s.bonusDice);
  const sanCheck = useDiceStore((s) => s.sanCheck);
  const close = useDiceStore((s) => s.close);
  const setMode = useDiceStore((s) => s.setMode);
  const setTarget = useDiceStore((s) => s.setTarget);
  const toggleBonus = useDiceStore((s) => s.toggleBonus);
  const togglePenalty = useDiceStore((s) => s.togglePenalty);
  const toggleSan = useDiceStore((s) => s.toggleSan);
  const rollStaged = useDiceStore((s) => s.rollStaged);
  const commitNow = useDiceStore((s) => s.commitNow);
  const commitWithLuck = useDiceStore((s) => s.commitWithLuck);
  const commitAsPush = useDiceStore((s) => s.commitAsPush);
  const luck = useCharSheetStore((s) => s.sheet.secondary.luck);

  const [localTarget, setLocalTarget] = useState(String(target));
  const [displayOriginal, setDisplayOriginal] = useState(0);
  const [displayBonus, setDisplayBonus] = useState(0);
  const [displayFinal, setDisplayFinal] = useState(0);
  const [displayOppRoll, setDisplayOppRoll] = useState(0);
  const [localResult, setLocalResult] = useState<DiceResultType | null>(null);
  const [showParticles, setShowParticles] = useState(false);
  const [isCritSuccess, setIsCritSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const [flashBg, setFlashBg] = useState(false);
  // A1.5 — 子状态机 + 暂存 originalRoll(给 slider 预览用) + spend
  const [uiState, setUiState] = useState<DicePanelSubState>('idle');
  const [stagedOriginalRoll, setStagedOriginalRoll] = useState(0);
  const [luckSpend, setLuckSpend] = useState(0);
  const cheatingEnabled = useSettingsStore((s) => s.cheatingEnabled);
  const [cheatingOpen, setCheatingOpen] = useState(false);
  const [pendingCheatingType, setPendingCheatingType] = useState<DiceResultType | null>(null);

  useEffect(() => {
    setLocalTarget(String(target));
  }, [target]);

  // 关闭面板时清空子状态机 + 预览数据, 避免下次打开看到上次的残影
  useEffect(() => {
    if (!isOpen) {
      setUiState('idle');
      setLuckSpend(0);
      setStagedOriginalRoll(0);
      setLocalResult(null);
      setDisplayOriginal(0);
      setDisplayBonus(0);
      setDisplayFinal(0);
      setDisplayOppRoll(0);
    }
  }, [isOpen]);

  const handleRoll = useCallback(() => {
    // A1.5 — 改走 staging: 滚但不入 history, 等待玩家选 (直接落账 / 花费幸运 / 推骰)
    rollStaged();
    setTimeout(() => {
      const s = useDiceStore.getState();
      setDisplayOriginal(s.originalRoll);
      setDisplayBonus(s.bonusTens);
      setDisplayFinal(s.finalRoll);
      const oppVal = s.oppTens === 0 && s.oppOnes === 0 ? 100 : s.oppTens * 10 + s.oppOnes;
      setDisplayOppRoll(s.mode === 'opposed' ? oppVal : 0);
      setLocalResult(s.resultType);
      setStagedOriginalRoll(s.originalRoll);
      setLuckSpend(0);
      // 推导子状态: 失败 + 推骰资格 → pushable; 否则 → rolled
      setUiState(deriveUiStateAfterRoll({ resultType: s.resultType, sanCheck: s.sanCheck, mode: s.mode }));

      if (s.resultType) {
        playResultSound(s.resultType);
        fillResultText(s.finalRoll, s.resultType, s.target);

        if (s.resultType === 'crit-success') {
          setIsCritSuccess(true);
          setShowParticles(true);
          setFlashBg(true);
          setTimeout(() => setFlashBg(false), 800);
        } else if (s.resultType === 'crit-failure') {
          setIsCritSuccess(false);
          setShowParticles(true);
          setShake(true);
          setFlashBg(true);
          setTimeout(() => { setShake(false); setFlashBg(false); }, 1200);
        }
      }
    }, 100);
  }, [rollStaged]);

  // 「花费幸运」按钮 → 进入 slider 子态
  const handleEnterLuckSlider = useCallback(() => {
    setUiState('luck-slider');
    setLuckSpend(0);
  }, []);

  // 确认扣点 / 直接落账 — spend>0 走 commitWithLuck, spend=0 走 commitNow
  const handleConfirmLuck = useCallback(() => {
    if (luckSpend > 0) {
      commitWithLuck(luckSpend);
    } else {
      commitNow();
    }
    setUiState('committed');
  }, [luckSpend, commitWithLuck, commitNow]);

  // 直接落账(走非幸运通路) — rolled 状态下用
  const handleCommitNow = useCallback(() => {
    commitNow();
    setUiState('committed');
  }, [commitNow]);

  // 推骰 — 弹 prompt 收集理由后 commitAsPush
  const handlePush = useCallback(() => {
    const reason = window.prompt('推动检定的理由?', '再翻一遍 / 不甘心 / 用力一些');
    if (reason == null) return; // 取消
    commitAsPush(reason);
    // 推骰会产生新的 finalRoll/resultType, 同步显示并按新结果判定 uiState (推过后 alreadyPushed=true 不能再推)
    setTimeout(() => {
      const s = useDiceStore.getState();
      setDisplayFinal(s.finalRoll);
      setDisplayOriginal(s.originalRoll);
      setLocalResult(s.resultType);
      if (s.resultType) playResultSound(s.resultType);
      setUiState('committed'); // 推骰已落账, 不再展示动作按钮
    }, 50);
  }, [commitAsPush]);

  // slider 实时预览: 扣 luckSpend 点会落到哪一级?
  const luckPreview = uiState === 'luck-slider' && stagedOriginalRoll > 0
    ? previewLuckResult(stagedOriginalRoll, luckSpend, target, sanCheck)
    : null;

  const sliderMax = maxLuckSpend(stagedOriginalRoll, luck);
  const showLuckButton = uiState === 'rolled' && luck > 0 && stagedOriginalRoll > 1;
  // pushable 也可走"花费幸运"——但优先推骰按钮更突出
  const showPushButton = uiState === 'pushable' && canStartPush({
    resultType: localResult, sanCheck, mode, alreadyPushed: false,
  });

  const handleTargetBlur = () => {
    const n = Number(localTarget);
    if (!isNaN(n) && n >= 1 && n <= 100) setTarget(n);
    else setLocalTarget(String(target));
  };

  const handleEsc = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') close(); },
    [close],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, handleEsc]);

  if (!isOpen) return null;

  const isBonus = bonusDice > 0;
  const isPenalty = bonusDice < 0;
  const hasBonus = isBonus || isPenalty;

  const critGlow =
    localResult === 'crit-success'
      ? '0 0 40px rgba(232,200,101,0.5), 0 0 80px rgba(232,200,101,0.2)'
      : localResult === 'crit-failure'
        ? '0 0 40px rgba(204,51,51,0.4), 0 0 80px rgba(204,51,51,0.15)'
        : '0 0 80px rgba(0,0,0,0.6), 0 0 20px rgba(196,168,85,0.08)';

  return (
    <>
      <AnimatePresence>
        {showParticles && (
          <ParticleEffect isSuccess={isCritSuccess} onDone={() => setShowParticles(false)} />
        )}
      </AnimatePresence>

      <motion.div
        animate={shake ? {
          x: [0, -8, 10, -6, 8, -4, 2, 0],
          transition: { duration: 0.6, ease: 'easeOut' },
        } : {}}
        style={{
          position: 'fixed', inset: 0, zIndex: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <motion.div
          animate={flashBg ? {
            background: [
              isCritSuccess
                ? 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)'
                : 'linear-gradient(180deg, rgba(139,58,58,0.25) 0%, var(--abyss) 100%)',
              isCritSuccess
                ? 'linear-gradient(180deg, rgba(232,200,101,0.15) 0%, var(--abyss) 100%)'
                : 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
            ],
            transition: { duration: 0.3 },
          } : {}}
          style={{
            background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
            border: localResult === 'crit-success'
              ? '1px solid rgba(232,200,101,0.6)'
              : localResult === 'crit-failure'
                ? '1px solid rgba(204,51,51,0.5)'
                : '1px solid var(--gold)',
            borderRadius: 8,
            padding: '28px 36px 24px',
            minWidth: 400,
            maxWidth: 520,
            width: '90%',
            position: 'relative',
            boxShadow: critGlow,
            transition: 'box-shadow 0.4s, border-color 0.4s',
          }}
        >
          {/* Title bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 24, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 14,
          }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--system-ratio, 1))', color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>
              掷骰检定 / DICE ROLL
            </h3>
            <button onClick={close} style={closeBtnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
            >✕</button>
          </div>

          {/* Mode selector + target */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <select name="dice-panel-mode" value={mode} onChange={(e) => setMode(e.target.value as DiceMode)}
              style={{
                flex: 1, padding: '8px 12px', border: '1px solid var(--brass)', borderRadius: 3,
                background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
                fontFamily: 'var(--font-ui)', fontSize: 'calc(12px * var(--system-ratio, 1))', letterSpacing: 1, outline: 'none', cursor: 'pointer',
              }}>
              <option value="check">技能检定 (Skill Check)</option>
              <option value="opposed">对抗检定 (Opposed)</option>
              <option value="free">自由掷骰 (Free Roll)</option>
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio, 1))', letterSpacing: 2 }}>
              目标
            </div>
            <input type="number" name="dice-panel-target" min={1} max={100} value={localTarget}
              onChange={(e) => setLocalTarget(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTargetBlur(); }}
              style={{
                width: 56, padding: '8px 6px', border: '1px solid var(--brass)', borderRadius: 3,
                background: 'rgba(0,0,0,0.3)', color: 'var(--gold)', fontFamily: 'var(--font-mono)',
                fontSize: 'calc(16px * var(--system-ratio, 1))', fontWeight: 700, textAlign: 'center', outline: 'none', caretColor: 'var(--gold)',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; handleTargetBlur(); }}
            />
          </div>

          {/* Toggle buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
            {(['bonus', 'penalty', 'san'] as const).map((t) => {
              const active = t === 'bonus' ? isBonus : t === 'penalty' ? isPenalty : sanCheck;
              const label = t === 'bonus' ? '奖励 BONUS' : t === 'penalty' ? '惩罚 PENALTY' : 'SAN';
              const onClick = t === 'bonus' ? toggleBonus : t === 'penalty' ? togglePenalty : toggleSan;
              return (
                <button key={t} onClick={onClick}
                  style={{
                    padding: '6px 16px',
                    border: active ? '1px solid var(--gold)' : '1px solid var(--brass)',
                    borderRadius: 3,
                    background: active ? 'rgba(196,168,85,0.15)' : 'rgba(0,0,0,0.2)',
                    color: active ? 'var(--gold)' : 'var(--ink-subtle)',
                    fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', letterSpacing: 2,
                    cursor: 'pointer', transition: 'var(--transition-smooth)',
                  }}>
                  {label}
                </button>
              );
            })}
          </div>

          {/* Dice display area */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
            padding: '24px 0', marginBottom: 16,
            border: '1px solid rgba(196,168,85,0.1)', borderRadius: 6,
            background: 'rgba(0,0,0,0.2)',
            flexWrap: 'wrap',
          }}>
            {/* Main d100 die — shows ORIGINAL roll before bonus/penalty */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <DiceDie value={displayOriginal} color="player" label="原始出目" large />
            </div>

            {/* Bonus/Penalty tens die — shows raw bonus tens value */}
            {hasBonus && (
              <>
                <span style={{
                  color: isBonus ? 'var(--success)' : 'var(--blood)',
                  fontSize: 'calc(16px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
                }}>
                  {isBonus ? '← 取小' : '← 取大'}
                </span>
                <DiceDie value={displayBonus} color="bonus"
                  label={isBonus ? '奖励骰' : '惩罚骰'}
                />
              </>
            )}

            {/* Opponent dice */}
            {mode === 'opposed' && (
              <>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 8px',
                }}>
                  <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', color: 'var(--blood)', letterSpacing: 2 }}>
                    VS
                  </span>
                </div>
                <DiceDie value={displayOppRoll} color="opponent" label="对方出目" large />
              </>
            )}

            {/* Final result — shown when bonus/penalty applied and different from original */}
            {hasBonus && displayOriginal !== displayFinal && (
              <>
                <span style={{
                  color: 'var(--ink-subtle)', fontSize: 'calc(18px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)',
                }}>
                  →
                </span>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  opacity: 0.85,
                }}>
                  <div style={{
                    width: 72, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid var(--gold-bright)', borderRadius: 6,
                    background: 'rgba(232,200,101,0.12)',
                    fontSize: 'calc(30px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', fontWeight: 700,
                    color: 'var(--gold-bright)',
                    boxShadow: '0 0 12px rgba(232,200,101,0.25)',
                  }}>
                    {displayFinal}
                  </div>
                  <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', color: 'var(--gold)', letterSpacing: 1 }}>
                    最终结果
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Roll button */}
          <motion.button onClick={handleRoll} whileTap={{ scale: 0.96 }}
            style={{
              width: '100%', padding: '12px 0', border: '1px solid var(--gold)',
              borderRadius: 4, background: 'rgba(196,168,85,0.12)', color: 'var(--gold)',
              fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--system-ratio, 1))', letterSpacing: 8,
              cursor: 'pointer', transition: 'var(--transition-smooth)', marginBottom: 16,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.25)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.12)'; }}
          >
            掷 骰
          </motion.button>

          {/* Cheating ✦ button — only when cheating is ON, not yet rolled, and panel not open */}
          {cheatingEnabled && uiState === 'idle' && !cheatingOpen && (
            <button
              onClick={() => setCheatingOpen(true)}
              style={{
                ...stagingBtnStyle,
                width: 40, padding: '8px 0', flexShrink: 0,
                opacity: 0.4,
                transition: 'var(--transition-smooth)',
                marginBottom: 16,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              ✦
            </button>
          )}

          {/* Cheating result selection panel */}
          {cheatingOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.8 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}
            >
              <CheatingGrid
                selectedType={pendingCheatingType}
                onSelect={(type) => setPendingCheatingType(pendingCheatingType === type ? null : type)}
                animated
              />

              {/* Bottom action buttons */}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button
                  onClick={() => { setCheatingOpen(false); setPendingCheatingType(null); }}
                  style={{ ...stagingBtnSubtleStyle, flex: 1, justifyContent: 'center' }}
                >
                  取消
                </button>
                {pendingCheatingType && (
                  <button
                    onClick={() => {
                      const target = localTarget || 50;
                      const sanCheck = useDiceStore.getState().sanCheck;
                      const roll = pickRollForResult(pendingCheatingType, Number(target), sanCheck);
                      if (roll !== null) {
                        setDisplayFinal(roll);
                        setLocalResult(pendingCheatingType);
                        // Transition uiState from 'idle' → 'rolled' / 'pushable'
                        // so staging buttons (推骰/花费幸运/直接落账) appear
                        const nextState = deriveUiStateAfterRoll({
                          resultType: pendingCheatingType,
                          sanCheck,
                          mode,
                        });
                        setUiState(nextState);
                        setCheatingOpen(false);
                        setPendingCheatingType(null);
                      }
                    }}
                    style={{ ...stagingBtnStyle, flex: 1, justifyContent: 'center' }}
                  >
                    确认
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Result bar with crit animation */}
          <AnimatePresence mode="wait">
            {localResult && (
              <motion.div key={localResult}
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={
                  localResult === 'crit-success'
                    ? { opacity: 1, scale: [0.8, 1.08, 1], y: 0 }
                    : localResult === 'crit-failure'
                      ? { opacity: 1, scale: [0.8, 1.05, 0.96, 1], y: [0, -4, 2, 0] }
                      : { opacity: 1, scale: 1, y: 0 }
                }
                exit={{ opacity: 0, scale: 0.8 }}
                transition={
                  localResult === 'crit-success'
                    ? { duration: 0.6, ease: 'easeOut' }
                    : localResult === 'crit-failure'
                      ? { duration: 0.7, ease: 'easeOut', times: [0, 0.3, 0.6, 1] }
                      : { duration: 0.3 }
                }
                style={{
                  padding: '10px 16px', border: `1px solid ${resultColor[localResult]}`,
                  borderRadius: 4, background: `${resultColor[localResult]}15`,
                  color: resultColor[localResult], fontFamily: 'var(--font-display)',
                  fontSize: 'calc(15px * var(--system-ratio, 1))', letterSpacing: 3, textAlign: 'center',
                }}
              >
                <motion.span
                  animate={localResult === 'crit-success'
                    ? { textShadow: ['0 0 8px rgba(232,200,101,0.6)', '0 0 24px rgba(232,200,101,0.9)', '0 0 8px rgba(232,200,101,0.6)'] }
                    : localResult === 'crit-failure'
                      ? { textShadow: ['0 0 8px rgba(204,51,51,0.5)', '0 0 20px rgba(204,51,51,0.8)', '0 0 8px rgba(204,51,51,0.5)'] }
                    : {}}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ display: 'inline-block' }}
                >
                  {resultLabel[localResult]}
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* A1.5 — Staging 子状态动作栏 (rolled / pushable / luck-slider) */}
          {(uiState === 'rolled' || uiState === 'pushable') && (
            <div style={stagingActionRowStyle} data-testid="dice-panel-actions">
              {showLuckButton && (
                <button
                  data-testid="btn-luck-spend"
                  onClick={handleEnterLuckSlider}
                  style={stagingBtnStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(232,200,101,0.22)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(232,200,101,0.08)'; e.currentTarget.style.transform = 'scale(1)'; }}
                  onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                  onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
                >
                  <IconLuck size={14} /> 花费幸运 (剩 {luck})
                </button>
              )}
              {showPushButton && (
                <button
                  data-testid="btn-push"
                  onClick={handlePush}
                  style={stagingBtnPrimaryStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(204,51,51,0.22)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(204,51,51,0.08)'; e.currentTarget.style.transform = 'scale(1)'; }}
                  onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                  onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
                >
                  <IconPush size={14} /> 推 骰
                </button>
              )}
              <button
                data-testid="btn-commit-now"
                onClick={handleCommitNow}
                style={stagingBtnSubtleStyle}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.18)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
              >
                直接落账
              </button>
            </div>
          )}

          {uiState === 'luck-slider' && (
            <div style={luckSliderBoxStyle} data-testid="dice-panel-luck-slider">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-ui)', fontSize: 'calc(12px * var(--system-ratio, 1))', letterSpacing: 2 }}>
                  <IconLuck size={12} /> 幸运扣点
                </span>
                <span style={{ color: 'var(--ink-subtle)', fontSize: 'calc(11px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)' }}>
                  原 {stagedOriginalRoll} − {luckSpend} = {luckPreview?.previewRoll ?? stagedOriginalRoll}
                </span>
              </div>
              <input
                name="dice-panel-luck-spend"
                type="range" min={0} max={sliderMax} value={luckSpend}
                data-testid="luck-slider-input"
                onChange={(e) => setLuckSpend(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--gold)' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-subtle)' }}>0</span>
                <span data-testid="luck-preview-tier" style={{
                  fontSize: 'calc(12px * var(--system-ratio, 1))', fontFamily: 'var(--font-display)', letterSpacing: 2,
                  color: luckPreview ? resultColor[luckPreview.previewResult] : 'var(--ink-subtle)',
                }}>
                  {luckPreview ? resultLabel[luckPreview.previewResult] : ''}
                </span>
                <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-subtle)' }}>{sliderMax}</span>
              </div>
              <button
                data-testid="btn-confirm-luck"
                onClick={handleConfirmLuck}
                style={{ ...stagingBtnPrimaryStyle, width: '100%', marginTop: 10, justifyContent: 'center' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(232,200,101,0.22)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(232,200,101,0.08)'; e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
              >
                {commitButtonLabel(luckSpend)}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </>
  );
}

// A1.5 — staging 动作栏样式 (cubic-bezier(0.4,0,0.2,1) 已由 var(--transition-smooth) 全局定义)
const stagingActionRowStyle: React.CSSProperties = {
  display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap',
};
const stagingBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 18px', border: '1px solid var(--gold)', borderRadius: 4,
  background: 'rgba(232,200,101,0.08)', color: 'var(--gold)',
  fontFamily: 'var(--font-ui)', fontSize: 'calc(12px * var(--system-ratio, 1))', letterSpacing: 2,
  cursor: 'pointer', transition: 'var(--transition-smooth)', transform: 'scale(1)',
};
const stagingBtnPrimaryStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 18px', border: '1px solid var(--blood)', borderRadius: 4,
  background: 'rgba(204,51,51,0.08)', color: 'var(--blood)',
  fontFamily: 'var(--font-ui)', fontSize: 'calc(12px * var(--system-ratio, 1))', letterSpacing: 2,
  cursor: 'pointer', transition: 'var(--transition-smooth)', transform: 'scale(1)',
};
const stagingBtnSubtleStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 18px', border: '1px solid var(--brass)', borderRadius: 4,
  background: 'rgba(0,0,0,0.2)', color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-ui)', fontSize: 'calc(12px * var(--system-ratio, 1))', letterSpacing: 2,
  cursor: 'pointer', transition: 'var(--transition-smooth)', transform: 'scale(1)',
};
const luckSliderBoxStyle: React.CSSProperties = {
  marginTop: 14, padding: '12px 14px',
  border: '1px solid rgba(232,200,101,0.35)', borderRadius: 4,
  background: 'rgba(232,200,101,0.05)',
};

