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

// Dice clatter — layered impulse
function tick() {
  const c = ctx(); if (!c) return;
  try {
    const now = c.currentTime;
    // Multi-click impulse (simulates dice corners hitting)
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.008;
      // Sharp click
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(200 + Math.random() * 300, now + delay);
      o.frequency.linearRampToValueAtTime(40, now + delay + 0.02);
      g.gain.setValueAtTime(0.08 - i * 0.02, now + delay);
      g.gain.linearRampToValueAtTime(0, now + delay + 0.025);
      o.connect(g); g.connect(c.destination);
      o.start(now + delay); o.stop(now + delay + 0.025);
    }
  } catch {}
}

// Result settle — deeper thud + rattle fade
function resultSfx() {
  const c = ctx(); if (!c) return;
  try {
    const now = c.currentTime;
    // Impact thud
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(60, now);
    o.frequency.linearRampToValueAtTime(40, now + 0.12);
    g.gain.setValueAtTime(0.12, now); g.gain.linearRampToValueAtTime(0, now + 0.15);
    o.connect(g); g.connect(c.destination);
    o.start(now); o.stop(now + 0.15);
    // Rattle decay (noise)
    const buf = c.createBuffer(1, c.sampleRate * 0.15, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const noise = c.createBufferSource(); noise.buffer = buf;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.04, now); ng.gain.linearRampToValueAtTime(0, now + 0.15);
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.setValueAtTime(3000, now); nf.Q.setValueAtTime(0.5, now);
    noise.connect(nf); nf.connect(ng); ng.connect(c.destination);
    noise.start(now); noise.stop(now + 0.15);
  } catch {}
}
function critSfx() {
  const c = ctx(); if (!c) return;
  try {
    const now = c.currentTime;
    // Heavy impact
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(50, now);
    o.frequency.linearRampToValueAtTime(30, now + 0.2);
    g.gain.setValueAtTime(0.15, now); g.gain.linearRampToValueAtTime(0, now + 0.25);
    o.connect(g); g.connect(c.destination);
    o.start(now); o.stop(now + 0.25);
    // Chime harmonics (layered sine waves)
    [400, 600, 900, 1400, 2000].forEach((f, i) => {
      const o2 = c.createOscillator(); const g2 = c.createGain();
      o2.type = 'sine'; g2.gain.setValueAtTime(0.03, now + i * 0.04);
      o2.frequency.setValueAtTime(f, now + i * 0.04);
      g2.gain.linearRampToValueAtTime(0, now + 0.3 + i * 0.04);
      o2.connect(g2); g2.connect(c.destination);
      o2.start(now + i * 0.04); o2.stop(now + 0.3 + i * 0.04);
    });
    // Rattle burst
    const buf = c.createBuffer(1, c.sampleRate * 0.2, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const noise = c.createBufferSource(); noise.buffer = buf;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.05, now); ng.gain.linearRampToValueAtTime(0, now + 0.2);
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.setValueAtTime(4000, now);
    noise.connect(nf); nf.connect(ng); ng.connect(c.destination);
    noise.start(now); noise.stop(now + 0.2);
  } catch {}
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
