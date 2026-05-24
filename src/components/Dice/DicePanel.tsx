import { useState, useEffect, useCallback } from 'react';
import { useDiceStore } from '../../stores/useDiceStore';
import type { DiceMode, DiceResultType } from '../../types';
import { DiceDie } from './DiceDie';
import {
  sfxSuccess,
  sfxFailure,
  sfxCritSuccess,
  sfxCritFailure,
} from '../../audio/sfx';

const modeLabels: Record<DiceMode, string> = {
  check: '技能检定',
  opposed: '对抗检定',
  free: '自由掷骰',
};

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

function fillResultText(roll: string, type: DiceResultType, target: number) {
  const input = document.querySelector<HTMLInputElement>('footer input[type="text"]');
  if (!input) return;
  const label = resultLabel[type];
  const text = `[${roll} / ${target}] ${label}`;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function DicePanel() {
  const isOpen = useDiceStore((s) => s.isOpen);
  const mode = useDiceStore((s) => s.mode);
  const target = useDiceStore((s) => s.target);
  const bonusDice = useDiceStore((s) => s.bonusDice);
  const sanCheck = useDiceStore((s) => s.sanCheck);
  const tens = useDiceStore((s) => s.tens);
  const ones = useDiceStore((s) => s.ones);
  const bonusTens = useDiceStore((s) => s.bonusTens);
  const oppTens = useDiceStore((s) => s.oppTens);
  const oppOnes = useDiceStore((s) => s.oppOnes);
  const resultType = useDiceStore((s) => s.resultType);
  const close = useDiceStore((s) => s.close);
  const setMode = useDiceStore((s) => s.setMode);
  const setTarget = useDiceStore((s) => s.setTarget);
  const toggleBonus = useDiceStore((s) => s.toggleBonus);
  const togglePenalty = useDiceStore((s) => s.togglePenalty);
  const toggleSan = useDiceStore((s) => s.toggleSan);
  const roll = useDiceStore((s) => s.roll);

  const [localTarget, setLocalTarget] = useState(String(target));
  const [rolledTens, setRolledTens] = useState(0);
  const [rolledOnes, setRolledOnes] = useState(0);
  const [rolledBonus, setRolledBonus] = useState(0);
  const [rolledOppTens, setRolledOppTens] = useState(0);
  const [rolledOppOnes, setRolledOppOnes] = useState(0);
  const [localResult, setLocalResult] = useState<DiceResultType | null>(null);

  useEffect(() => {
    setLocalTarget(String(target));
  }, [target]);

  const handleRoll = useCallback(() => {
    roll();
    // After roll updates store state, schedule local state update for animation
    setTimeout(() => {
      const s = useDiceStore.getState();
      setRolledTens(s.tens);
      setRolledOnes(s.ones);
      setRolledBonus(s.bonusTens);
      setRolledOppTens(s.oppTens);
      setRolledOppOnes(s.oppOnes);
      setLocalResult(s.resultType);
      if (s.resultType) {
        playResultSound(s.resultType);
        const rollVal = s.tens === 0 && s.ones === 0 ? 100 : s.tens * 10 + s.ones;
        fillResultText(String(rollVal), s.resultType, s.target);
      }
    }, 50);
  }, [roll]);

  const handleTargetBlur = () => {
    const n = Number(localTarget);
    if (!isNaN(n) && n >= 1 && n <= 100) {
      setTarget(n);
    } else {
      setLocalTarget(String(target));
    }
  };

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    },
    [close],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, handleEsc]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
          border: '1px solid var(--gold)',
          borderRadius: 8,
          padding: '28px 36px 24px',
          minWidth: 400,
          maxWidth: 520,
          width: '90%',
          boxShadow: '0 0 80px rgba(0,0,0,0.6), 0 0 20px rgba(196,168,85,0.08)',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
            borderBottom: '1px solid rgba(196,168,85,0.18)',
            paddingBottom: 14,
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              color: 'var(--gold)',
              letterSpacing: 4,
              margin: 0,
            }}
          >
            掷骰检定 / DICE ROLL
          </h3>
          <button
            onClick={close}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid transparent',
              borderRadius: 3,
              background: 'transparent',
              color: 'var(--ink-subtle)',
              fontSize: 16,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--gold)';
              e.currentTarget.style.borderColor = 'var(--brass)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--ink-subtle)';
              e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            ✕
          </button>
        </div>

        {/* Mode selector + target */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as DiceMode)}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid var(--brass)',
              borderRadius: 3,
              background: 'rgba(0,0,0,0.3)',
              color: 'var(--text-light)',
              fontFamily: 'var(--font-ui)',
              fontSize: 12,
              letterSpacing: 1,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="check">技能检定 (Skill Check)</option>
            <option value="opposed">对抗检定 (Opposed)</option>
            <option value="free">自由掷骰 (Free Roll)</option>
          </select>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--ink-subtle)',
            fontFamily: 'var(--font-ui)',
            fontSize: 11,
            letterSpacing: 2,
          }}>
            目标
          </div>
          <input
            type="number"
            min={1}
            max={100}
            value={localTarget}
            onChange={(e) => setLocalTarget(e.target.value)}
            onBlur={handleTargetBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') handleTargetBlur(); }}
            style={{
              width: 56,
              padding: '8px 6px',
              border: '1px solid var(--brass)',
              borderRadius: 3,
              background: 'rgba(0,0,0,0.3)',
              color: 'var(--gold)',
              fontFamily: 'var(--font-mono)',
              fontSize: 16,
              fontWeight: 700,
              textAlign: 'center',
              outline: 'none',
              caretColor: 'var(--gold)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; handleTargetBlur(); }}
          />
        </div>

        {/* Toggle buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
          {(['bonus', 'penalty', 'san'] as const).map((t) => {
            const active =
              t === 'bonus' ? bonusDice > 0
              : t === 'penalty' ? bonusDice < 0
              : sanCheck;
            const label =
              t === 'bonus' ? '奖励 BONUS'
              : t === 'penalty' ? '惩罚 PENALTY'
              : 'SAN';
            const onClick =
              t === 'bonus' ? toggleBonus
              : t === 'penalty' ? togglePenalty
              : toggleSan;
            return (
              <button
                key={t}
                onClick={onClick}
                style={{
                  padding: '6px 16px',
                  border: active ? '1px solid var(--gold)' : '1px solid var(--brass)',
                  borderRadius: 3,
                  background: active ? 'rgba(196,168,85,0.15)' : 'rgba(0,0,0,0.2)',
                  color: active ? 'var(--gold)' : 'var(--ink-subtle)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 10,
                  letterSpacing: 2,
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Dice display area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '20px 0',
            marginBottom: 16,
            border: '1px solid rgba(196,168,85,0.1)',
            borderRadius: 6,
            background: 'rgba(0,0,0,0.2)',
          }}
        >
          {/* Player dice */}
          <DiceDie value={rolledTens} color="player" label="十位" />
          <DiceDie value={rolledOnes} color="player" label="个位" />

          {/* Bonus die if active */}
          {bonusDice !== 0 && (
            <>
              <span style={{ color: 'var(--ink-subtle)', fontSize: 14, fontFamily: 'var(--font-mono)' }}>
                {bonusDice > 0 ? '+' : '-'}
              </span>
              <DiceDie value={rolledBonus} color="bonus" label="奖励骰" />
            </>
          )}

          {/* Opposed dice */}
          {mode === 'opposed' && (
            <>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '0 8px',
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-ui)',
                    color: 'var(--blood)',
                    letterSpacing: 2,
                  }}
                >
                  VS
                </span>
              </div>
              <DiceDie value={rolledOppTens} color="opponent" label="十位" />
              <DiceDie value={rolledOppOnes} color="opponent" label="个位" />
            </>
          )}
        </div>

        {/* Roll button */}
        <button
          onClick={handleRoll}
          style={{
            width: '100%',
            padding: '12px 0',
            border: '1px solid var(--gold)',
            borderRadius: 4,
            background: 'rgba(196,168,85,0.12)',
            color: 'var(--gold)',
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            letterSpacing: 8,
            cursor: 'pointer',
            transition: 'var(--transition-smooth)',
            marginBottom: 16,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(196,168,85,0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(196,168,85,0.12)';
          }}
        >
          掷 骰
        </button>

        {/* Result bar */}
        {localResult && (
          <div
            style={{
              padding: '10px 16px',
              border: `1px solid ${resultColor[localResult]}`,
              borderRadius: 4,
              background: `${resultColor[localResult]}15`,
              color: resultColor[localResult],
              fontFamily: 'var(--font-display)',
              fontSize: 15,
              letterSpacing: 3,
              textAlign: 'center',
            }}
          >
            {resultLabel[localResult]}
          </div>
        )}
      </div>
    </div>
  );
}
