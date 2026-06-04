import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { sfxClick, sfxClickPrimary } from '../../audio/sfx';

/** 一颗待演示的骰子。 */
export interface TossDie {
  value: number;
  faces: number;
  color: string;
  /** 副标题（如「攻击 ≤90」「闪避 ≤30」）。 */
  caption?: string;
}

/** 一次投掷（同时投出若干骰子）：检定投掷(攻击+闪避) 或 伤害投掷(多骰)。 */
export interface DiceToss {
  title: string;
  dice: TossDie[];
  /** 合计（伤害投掷显示）。 */
  total?: number;
}

const ROLL_MS = 820;   // 翻滚时长
const HOLD_MS = 1000;  // 定格停留

/** 单颗方块骰子：从上方抢入、翻滚、落点弹跳，数字跳变后定格。 */
function DieCube({ die, rolling, soundOn }: { die: TossDie; rolling: boolean; soundOn: boolean }) {
  const [shown, setShown] = useState(die.value);
  useEffect(() => {
    if (!rolling) { setShown(die.value); return; }
    const iv = setInterval(() => setShown(Math.floor(Math.random() * die.faces) + 1), 60);
    const stop = setTimeout(() => { clearInterval(iv); setShown(die.value); }, ROLL_MS - 120);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, [rolling, die.value, die.faces]);
  void soundOn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <motion.div
        initial={{ y: -190, rotate: -160, opacity: 0, scale: 0.6 }}
        animate={rolling
          ? { y: [-190, 0, -44, 0, -15, 0], rotate: [-160, 380, 600, 720], opacity: 1, scale: 1 }
          : { y: 0, rotate: 0, opacity: 1, scale: [1.18, 0.94, 1] }}
        transition={rolling
          ? { duration: ROLL_MS / 1000, ease: [0.3, 0.7, 0.35, 1] }
          : { duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
        style={{
          width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-mono)',
          color: rolling ? 'var(--gold)' : die.color,
          background: 'linear-gradient(155deg, rgba(40,28,18,0.97) 0%, rgba(22,15,9,0.98) 100%)',
          border: `2.5px solid ${rolling ? '#7a6a4a' : die.color}`,
          borderRadius: 12,
          boxShadow: `inset 0 2px 0 rgba(255,255,255,0.05), inset 0 -4px 10px rgba(0,0,0,0.4), 0 4px 14px rgba(0,0,0,0.35), 0 0 18px ${rolling ? '#7a6a4a55' : die.color + '66'}`,
          textShadow: rolling ? 'none' : `0 0 16px ${die.color}88`,
        }}
      >{shown}</motion.div>
      {die.caption && (
        <span style={{ fontSize: 10, fontFamily: 'var(--font-ui)', letterSpacing: 1, color: rolling ? 'var(--ink-faded)' : die.color, opacity: rolling ? 0.5 : 1, transition: 'opacity 0.3s, color 0.3s', whiteSpace: 'nowrap' }}>
          {die.caption}
        </span>
      )}
    </div>
  );
}

/**
 * 书页内滚骰动画：把若干「投掷」(检定→伤害)依次演示。每次投掷的骰子同时抢入书页、翻滚弹跳、定格出数。
 * 全程结束后回调 onComplete（CombatPanel 据此逐行揭示战斗日志）。
 */
export function CombatDiceRoll({ tosses, soundOn, onComplete }: { tosses: DiceToss[] | null; soundOn: boolean; onComplete: () => void }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'rolling' | 'settled'>('rolling');
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(onComplete);
  useEffect(() => { doneRef.current = onComplete; });

  useEffect(() => {
    if (!tosses || tosses.length === 0) return;
    let cancelled = false;
    let i = 0;
    const playToss = () => {
      if (cancelled) return;
      setIdx(i); setPhase('rolling');
      if (soundOn) { try { sfxClick(); } catch { /* audio 不可用 */ } }
      tRef.current = setTimeout(() => {
        if (cancelled) return;
        setPhase('settled');
        if (soundOn) { try { sfxClickPrimary(); } catch { /* audio 不可用 */ } }
        tRef.current = setTimeout(() => {
          if (cancelled) return;
          i += 1;
          if (i < tosses.length) playToss();
          else doneRef.current();
        }, HOLD_MS);
      }, ROLL_MS);
    };
    playToss();
    return () => { cancelled = true; if (tRef.current) clearTimeout(tRef.current); };
  }, [tosses, soundOn]);

  if (!tosses || tosses.length === 0) return null;
  const toss = tosses[Math.min(idx, tosses.length - 1)];
  const rolling = phase === 'rolling';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 30, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, rgba(5,3,1,0.9) 0%, rgba(5,3,1,0.72) 50%, rgba(5,3,1,0.4) 100%)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <span style={{ fontSize: 13, fontFamily: 'var(--font-display)', letterSpacing: 4, color: 'var(--parchment)', opacity: 0.85 }}>
        {toss.title}{tosses.length > 1 ? `（${idx + 1}/${tosses.length}）` : ''}
      </span>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {toss.dice.map((d, i) => <DieCube key={`${idx}-${i}`} die={d} rolling={rolling} soundOn={soundOn} />)}
      </div>
      {!rolling && toss.total != null && (
        <motion.span
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
          style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: 2, color: '#ff7043' }}
        >合计 {toss.total}</motion.span>
      )}
    </motion.div>
  );
}
