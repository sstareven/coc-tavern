import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface Props {
  visible: boolean; skillName: string; target: number;
  roll: number; resultType: string; onComplete: () => void;
}

const COLORS: Record<string, string> = { 'crit-success': '#69f0ae', 'extreme-success': '#00e676', 'hard-success': '#4fc3f7', 'success': '#69f0ae', 'failure': '#ff5252', 'crit-failure': '#d50000' };
const LABELS: Record<string, string> = { 'crit-success': '大成功', 'extreme-success': '极难成功', 'hard-success': '困难成功', 'success': '成功', 'failure': '失败', 'crit-failure': '大失败' };

let _actx: AudioContext | null = null;
function ctx() { try { if (!_actx || _actx.state === 'closed') _actx = new AudioContext(); if (_actx.state === 'suspended') _actx.resume(); return _actx; } catch { return null; } }
function tick() { const c = ctx(); if (!c) return; try { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'triangle'; o.frequency.setValueAtTime(400 + Math.random() * 400, c.currentTime); g.gain.setValueAtTime(0.04, c.currentTime); g.gain.linearRampToValueAtTime(0, c.currentTime + 0.05); o.start(); o.stop(c.currentTime + 0.05); } catch {} }
function resultSfx() { const c = ctx(); if (!c) return; try { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sine'; g.gain.setValueAtTime(0.06, c.currentTime); o.frequency.setValueAtTime(400, c.currentTime); o.frequency.linearRampToValueAtTime(1000, c.currentTime + 0.18); g.gain.linearRampToValueAtTime(0, c.currentTime + 0.18); o.start(); o.stop(c.currentTime + 0.18); } catch {} }
function critSfx() { const c = ctx(); if (!c) return; try { [600, 900, 1400, 2000].forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sine'; g.gain.setValueAtTime(0.04, c.currentTime + i * 0.06); o.frequency.setValueAtTime(f, c.currentTime + i * 0.06); g.gain.linearRampToValueAtTime(0, c.currentTime + 0.25 + i * 0.06); o.start(c.currentTime + i * 0.06); o.stop(c.currentTime + 0.25 + i * 0.06); }); } catch {} }

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
    ivRef.current = setInterval(tick, 80);
    tRef.current = setTimeout(() => {
      clearInterval(ivRef.current);
      setPhase('result');
      if (resultType === 'crit-failure') { setBlur(true); setTimeout(() => setBlur(false), 800); }
      if (resultType === 'crit-success') setGold(true);
      crit ? critSfx() : resultSfx();
      tRef.current = setTimeout(() => { setPhase('done'); onComplete(); }, 2300);
    }, 1300);
    return () => { if (ivRef.current) clearInterval(ivRef.current); if (tRef.current) clearTimeout(tRef.current); };
  }, [visible, onComplete, resultType]);

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
        initial={{ scale: 0.3, opacity: 0, y: -100 }}
        animate={{ scale: blur ? 0.95 : 1, opacity: 1, y: 0, filter: blur ? 'blur(3px)' : 'blur(0px)' }}
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
    return () => clearInterval(iv);
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
