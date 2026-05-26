import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';

interface Props {
  visible: boolean; skillName: string; target: number;
  roll: number; resultType: string; onComplete: () => void;
}

const COLORS: Record<string, string> = { 'crit-success': '#69f0ae', 'extreme-success': '#00e676', 'hard-success': '#4fc3f7', 'success': '#69f0ae', 'failure': '#ff5252', 'crit-failure': '#d50000' };
const LABELS: Record<string, string> = { 'crit-success': '大成功', 'extreme-success': '极难成功', 'hard-success': '困难成功', 'success': '成功', 'failure': '失败', 'crit-failure': '大失败' };

let _actx: AudioContext | null = null;
function ctx() { try { if (!_actx || _actx.state === 'closed') _actx = new AudioContext(); if (_actx.state === 'suspended') _actx.resume(); return _actx; } catch { return null; } }

// ── v2: resonant wooden impact ──
function impact(vol = 0.06, freq = 300, decay = 0.04) {
  const c = ctx(); if (!c) return;
  try {
    const now = c.currentTime;
    // Body resonance (fundamental + overtone)
    const o1 = c.createOscillator(); const g1 = c.createGain();
    o1.type = 'sine'; o1.frequency.setValueAtTime(freq, now);
    o1.frequency.exponentialRampToValueAtTime(freq * 0.1, now + decay);
    g1.gain.setValueAtTime(vol, now); g1.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    o1.connect(g1); g1.connect(c.destination); o1.start(now); o1.stop(now + decay);
    // Click transient (harmonics)
    const o2 = c.createOscillator(); const g2 = c.createGain();
    o2.type = 'triangle'; o2.frequency.setValueAtTime(freq * 3, now);
    o2.frequency.exponentialRampToValueAtTime(freq * 0.5, now + decay * 0.4);
    g2.gain.setValueAtTime(vol * 0.5, now); g2.gain.exponentialRampToValueAtTime(0.0001, now + decay * 0.3);
    o2.connect(g2); g2.connect(c.destination); o2.start(now); o2.stop(now + decay);
  } catch {}
}

function tick() { impact(0.06, 250 + Math.random() * 350, 0.035); }

function resultSfx() {
  impact(0.16, 100, 0.22);           // heavy thud
  setTimeout(() => impact(0.07, 60, 0.14), 80);   // bounce
  setTimeout(() => impact(0.03, 180, 0.08), 160);  // final rattle
}

function critSfx() {
  impact(0.22, 70, 0.3);
  [0.03, 0.07, 0.12, 0.18, 0.25].forEach((d, i) => {
    setTimeout(() => impact(0.05 - i * 0.008, 350 + i * 250, 0.16), d * 1000);
  });
  setTimeout(() => impact(0.08, 50, 0.2), 150);
}

export function DiceAnimation({ visible, skillName, target, roll, resultType, onComplete }: Props) {
  const [phase, setPhase] = useState<'rolling' | 'result' | 'done'>('rolling');
  const [blur, setBlur] = useState(false);
  const [gold, setGold] = useState(false);
  const ivRef = useRef<ReturnType<typeof setInterval>>();
  const tRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!visible) return;
    if (ivRef.current) clearInterval(ivRef.current);
    if (tRef.current) clearTimeout(tRef.current);
    setBlur(false); setGold(false); setPhase('rolling');
    const crit = resultType === 'crit-success' || resultType === 'crit-failure';
    // Decelerating tick rhythm: maps elapsed time to next tick delay
    // Early (dense): 50ms → Late (sparse): 300ms
    const scheduleTick = (elapsed: number) => {
      tick();
      const nextDelay = 50 + (elapsed / 1300) * 300; // 50ms → 350ms over 1.3s
      const next = elapsed + nextDelay;
      if (next < 1300) ivRef.current = setTimeout(() => scheduleTick(next), nextDelay);
    };
    ivRef.current = setTimeout(() => scheduleTick(0), 10);
    tRef.current = setTimeout(() => {
      if (ivRef.current) clearTimeout(ivRef.current);
      setPhase('result');
      if (resultType === 'crit-failure') { setBlur(true); setTimeout(() => setBlur(false), 800); }
      if (resultType === 'crit-success') setGold(true);
      crit ? critSfx() : resultSfx();
      tRef.current = setTimeout(() => { setPhase('done'); onComplete(); }, 2300);
    }, 1300);
    return () => { if (ivRef.current) clearInterval(ivRef.current); if (tRef.current) clearTimeout(tRef.current); };
  }, [visible, onComplete, resultType]);

  // Random entrance direction — matches the rotation direction feel
  const entrance = useMemo(() => {
    const dirs = [
      { x: -260, y: -120 }, // top-left
      { x: 260, y: -120 },  // top-right
      { x: -220, y: 140 },  // bottom-left
      { x: 220, y: 140 },   // bottom-right
    ];
    return dirs[Math.floor(Math.random() * dirs.length)];
  }, [visible, roll]);
  // Remove debug log
  if (!visible) return null;

  const rollStr = String(roll).padStart(2, '0');
  const color = (resultType === 'crit-success' && gold) ? '#ffd700' : (COLORS[resultType] || '#999');
  const isSuccess = resultType.includes('success');
  const isCrit = resultType === 'crit-success' || resultType === 'crit-failure';
  const glowColor = phase === 'rolling' ? '#555' : color;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ position: 'fixed', inset: 0, zIndex: 960, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: blur ? 'blur(8px)' : 'blur(6px)' }}>
      <motion.div
        initial={{ scale: 0.3, opacity: 0, x: entrance.x, y: entrance.y }}
        animate={{ scale: blur ? 0.95 : 1, opacity: 1, x: 0, y: 0, filter: blur ? 'blur(3px)' : 'blur(0px)' }}
        transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'var(--font-ui)' }}>

        {/* Dice display area */}
        <div style={{ width: 220, height: 220, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RollingBlock phase={phase} rollStr={rollStr} color={color} glowColor={glowColor} />
        </div>

        <div style={{ fontSize: 20, color: 'var(--parchment)', letterSpacing: 4, fontWeight: 600, marginBottom: 4 }}>{skillName}检定</div>
        <div style={{ fontSize: 13, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', letterSpacing: 2, opacity: 0.7, marginBottom: 20 }}>目标 {target}</div>

        <div style={{ height: 52, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {phase === 'result' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div style={{ padding: '8px 36px', background: isSuccess ? 'rgba(58,107,90,0.12)' : 'rgba(139,58,58,0.12)', border: `1px solid ${color}88`, borderRadius: 6, boxShadow: `0 0 24px ${color}22` }}>
                <span style={{ fontSize: 22, fontWeight: 600, color, letterSpacing: 8, fontFamily: 'var(--font-display)' }}>{LABELS[resultType]}</span>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function RollingBlock({ phase, rollStr, color, glowColor }: { phase: string; rollStr: string; color: string; glowColor: string }) {
  const [randomDigits, setRandomDigits] = useState(['00', '00', '00', '00', '00', '00']);
  const [animKey, setAnimKey] = useState(0);
  useEffect(() => {
    if (phase !== 'rolling') return;
    setAnimKey(k => k + 1); // reset animation on new roll
    const iv = setInterval(() => { setRandomDigits(Array.from({ length: 6 }, () => String(Math.floor(Math.random() * 100) + 1).padStart(2, '0'))); }, 60);
    // At 1.0s, freeze all faces to the result number (animation still spinning until 1.2s)
    const stop = setTimeout(() => { clearInterval(iv); setRandomDigits(Array(6).fill(rollStr)); }, 1050);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, [phase]);

  const digits = phase === 'rolling' ? randomDigits : Array(6).fill(rollStr);
  const faceColor = phase === 'result' ? color : 'var(--gold)';
  const isRolling = phase === 'rolling';
  const size = 150, half = size / 2;
  const faceS: React.CSSProperties = {
    position: 'absolute', width: size, height: size,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 58, fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: faceColor,
    background: 'linear-gradient(155deg, rgba(35,24,16,0.96) 0%, rgba(18,12,8,0.98) 100%)',
    border: `3px solid ${glowColor}`, borderRadius: 12,
    boxShadow: `inset 0 2px 0 rgba(255,255,255,0.04), inset 0 -4px 12px rgba(0,0,0,0.4), 0 0 20px ${glowColor}66, 0 0 40px ${glowColor}33`,
    textShadow: isRolling ? 'none' : `0 0 30px ${color}88`,
  };

  return (
    <>
      <style>{`
        .cube-scene { perspective: 400px; perspective-origin: center; width: ${size}px; height: ${size}px; }
        .cube-scene > div { transform-style: preserve-3d !important; -webkit-transform-style: preserve-3d !important; }
        .cube-scene * { transform-style: preserve-3d !important; -webkit-transform-style: preserve-3d !important; }
      `}</style>
      {/* Perspective layer — plain div, never animated */}
      <div className="cube-scene" style={{ width: size, height: size }}>
        {/* Wobble — only animated during result phase */}
        <motion.div
          animate={!isRolling ? { rotateX: [0, 10, -7, 4, -2, 0], rotateY: [0, -7, 10, -5, 2, 0] } : {}}
          transition={!isRolling ? { duration: 0.7, ease: 'easeOut', times: [0, 0.12, 0.28, 0.5, 0.72, 1.0] } : {}}
          style={{ width: '100%', height: '100%' }}>
          <div style={{ width: '100%', height: '100%' }}>
            {/* Spin — animated during rolling */}
            <motion.div
              key={animKey}
              initial={{ rotateX: 0, rotateY: 0 }}
              animate={{ rotateX: isRolling ? 1440 : 1440, rotateY: isRolling ? 900 : 900 }}
              transition={{ duration: isRolling ? 1.2 : 0, ease: [0.4, 0.0, 0.6, 1.0] }}
              style={{ width: '100%', height: '100%' }}>
              {/* 3D context — never animated */}
              <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div style={{ ...faceS, transform: `translateZ(${half}px)` }}>{digits[0]}</div>
                <div style={{ ...faceS, transform: `rotateY(180deg) translateZ(${half}px)` }}>{digits[1]}</div>
                <div style={{ ...faceS, transform: `rotateY(90deg) translateZ(${half}px)` }}>{digits[2]}</div>
                <div style={{ ...faceS, transform: `rotateY(-90deg) translateZ(${half}px)` }}>{digits[3]}</div>
                <div style={{ ...faceS, transform: `rotateX(90deg) translateZ(${half}px)` }}>{digits[4]}</div>
                <div style={{ ...faceS, transform: `rotateX(-90deg) translateZ(${half}px)` }}>{digits[5]}</div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
