import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  visible: boolean; skillName: string; target: number;
  roll: number; resultType: string; onComplete: () => void;
}

const COLORS: Record<string, string> = { 'crit-success': '#ffd700', 'extreme-success': '#00e676', 'hard-success': '#4fc3f7', 'success': '#69f0ae', 'failure': '#ff5252', 'crit-failure': '#d50000' };
const LABELS: Record<string, string> = { 'crit-success': '大成功！', 'extreme-success': '极难成功', 'hard-success': '困难成功', 'success': '成功', 'failure': '失败', 'crit-failure': '大失败！' };

function getBorderColor(resultType: string): string {
  if (resultType.includes('fail')) return '#d50000';
  if (resultType.includes('success')) return '#69f0ae';
  return 'var(--gold)';
}

let _audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  } catch { return null; }
}

function playTick() {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'triangle'; g.gain.setValueAtTime(0.04, ctx.currentTime);
    o.frequency.setValueAtTime(400 + Math.random() * 400, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
    o.start(); o.stop(ctx.currentTime + 0.05);
  } catch {}
}

function playResult() {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; g.gain.setValueAtTime(0.06, ctx.currentTime);
    o.frequency.setValueAtTime(400, ctx.currentTime);
    o.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.18);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
    o.start(); o.stop(ctx.currentTime + 0.18);
  } catch {}
}

function playCrit() {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    [600, 900, 1400, 2000].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; g.gain.setValueAtTime(0.04, ctx.currentTime + i * 0.06);
      o.frequency.setValueAtTime(f, ctx.currentTime + i * 0.06);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25 + i * 0.06);
      o.start(ctx.currentTime + i * 0.06); o.stop(ctx.currentTime + 0.25 + i * 0.06);
    });
  } catch {}
}

// Burst particles for dramatic results
function BurstParticles({ color, count }: { color: string; count: number }) {
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
    const dist = 60 + Math.random() * 120;
    return { id: i, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, size: 3 + Math.random() * 6, delay: Math.random() * 0.2 };
  }), [count, color]);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      {particles.map((p) => (
        <motion.div key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: [0, 1.5, 0] }}
          transition={{ duration: 1.0 + Math.random() * 0.5, delay: p.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: p.size, height: p.size, borderRadius: '50%', background: color, boxShadow: `0 0 ${p.size * 2}px ${color}`, transform: 'translate(-50%, -50%)' }} />
      ))}
    </div>
  );
}

export function DiceAnimation({ visible, skillName, target, roll, resultType, onComplete }: Props) {
  const [phase, setPhase] = useState<'rolling' | 'result' | 'done'>('rolling');
  const rollStr = String(roll).padStart(2, '0');
  const color = COLORS[resultType] || '#999';
  const borderColor = phase === 'result' ? getBorderColor(resultType) : 'var(--gold)';
  const isCrit = resultType === 'crit-success' || resultType === 'crit-failure';
  const isSuccess = resultType.includes('success') || resultType === 'success';
  const blur = phase === 'result' && resultType === 'crit-failure';

  const ivRef = useRef<ReturnType<typeof setInterval>>();
  const tRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!visible) return;
    // Clear any previous animation
    if (ivRef.current) clearInterval(ivRef.current);
    if (tRef.current) clearTimeout(tRef.current);

    setPhase('rolling');
    const crit = resultType === 'crit-success' || resultType === 'crit-failure';
    ivRef.current = setInterval(() => { playTick(); }, 80);
    tRef.current = setTimeout(() => {
      clearInterval(ivRef.current);
      setPhase('result');
      crit ? playCrit() : playResult();
      tRef.current = setTimeout(() => { setPhase('done'); onComplete(); }, 2300);
    }, 1300);

    return () => {
      if (ivRef.current) clearInterval(ivRef.current);
      if (tRef.current) clearTimeout(tRef.current);
    };
  }, [visible, onComplete, resultType]);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 960, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: blur ? 'blur(8px)' : 'blur(6px)', transition: 'backdrop-filter 0.3s' }}>

      <motion.div
        animate={blur ? { filter: 'blur(3px)', scale: 0.95 } : { filter: 'blur(0px)', scale: 1 }}
        transition={{ duration: 0.3 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, fontFamily: 'var(--font-ui)', transformOrigin: 'center center' }}>

        {/* ── Background plate with dynamic border ── */}
        <div style={{
          position: 'relative',
          width: 220, height: 220,
          background: 'linear-gradient(155deg, rgba(30,20,12,0.95) 0%, rgba(15,10,5,0.98) 100%)',
          borderRadius: 16,
          border: `3px solid ${borderColor}`,
          boxShadow: `0 0 40px ${borderColor}33, 0 0 80px ${borderColor}11, inset 0 1px 0 rgba(255,255,255,0.03)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
          overflow: 'visible',
        }}>
          {/* Burst particles on crit */}
          {phase === 'result' && isCrit && (
            <BurstParticles color={resultType === 'crit-success' ? '#ffd700' : '#d50000'} count={24} />
          )}

          {/* Ambient sparkles */}
          <Sparkles count={phase === 'result' && !isCrit ? 12 : 6} />

          {/* Central number */}
          <motion.div
            animate={phase === 'rolling' ? { scale: [1, 0.95, 1.06, 1] } : {}}
            transition={{ duration: 0.25, repeat: phase === 'rolling' ? Infinity : 0 }}
            style={{ zIndex: 2 }}>
            {phase === 'rolling' ? (
              <RollingDice color="var(--gold)" />
            ) : (
              <motion.div initial={{ scale: 0.2 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 160 }}>
                <div style={{
                  fontSize: 80, fontWeight: 'bold', color, lineHeight: 1,
                  fontFamily: 'var(--font-mono)',
                  textShadow: `0 0 40px ${color}88, 0 0 80px ${color}33`,
                }}>{rollStr}</div>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* ── Skill name + Target ── */}
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 20, color: 'var(--parchment)', letterSpacing: 4, fontWeight: 600 }}>{skillName}检定</div>
          <div style={{ fontSize: 13, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', letterSpacing: 2, marginTop: 4, opacity: 0.7 }}>目标 {target}</div>
        </div>

        {/* ── Result tag with fixed-height container to prevent layout shift ── */}
        <div style={{ height: 52, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {phase === 'result' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div style={{
                padding: '8px 36px',
                background: isSuccess ? 'rgba(58,107,90,0.12)' : 'rgba(139,58,58,0.12)',
                border: `1px solid ${color}88`, borderRadius: 6,
                boxShadow: `0 0 24px ${color}22`,
              }}>
                <span style={{ fontSize: 22, fontWeight: 600, color, letterSpacing: 8, fontFamily: 'var(--font-display)' }}>{LABELS[resultType]}</span>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function RollingDice({ color = 'var(--gold)' }: { color?: string }) {
  const [digits, setDigits] = useState('00');
  useEffect(() => {
    const iv = setInterval(() => { setDigits(String(Math.floor(Math.random() * 100) + 1).padStart(2, '0')); }, 60);
    return () => clearInterval(iv);
  }, []);
  return <span style={{ fontSize: 80, fontWeight: 'bold', color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{digits}</span>;
}

function Sparkles({ count }: { count: number }) {
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i, x: 15 + Math.random() * 70, y: 15 + Math.random() * 70,
    size: 2 + Math.random() * 3, delay: Math.random() * 1.0, duration: 0.5 + Math.random() * 0.6,
  })), [count]);
  return (
    <>
      {particles.map((p) => (
        <motion.div key={p.id}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 0.8, 0], scale: [0, 1.2, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, borderRadius: '50%', background: 'var(--gold)', transform: 'translate(-50%, -50%)', zIndex: 1 }} />
      ))}
    </>
  );
}
