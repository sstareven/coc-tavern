import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';

interface Props {
  visible: boolean; skillName: string; target: number;
  roll: number; resultType: string; onComplete: () => void;
  bonus?: 'none' | 'bonus' | 'penalty';
  bonusTens?: number;
  opposed?: boolean;
  opponentRoll?: number;
  opponentTarget?: number;
  opponentResultType?: string;
  opposedOutcome?: 'win' | 'lose' | 'draw';
}

const COLORS: Record<string, string> = { 'crit-success': '#69f0ae', 'extreme-success': '#00e676', 'hard-success': '#4fc3f7', 'success': '#69f0ae', 'failure': '#ff5252', 'crit-failure': '#d50000' };
const LABELS: Record<string, string> = { 'crit-success': '大成功', 'extreme-success': '极难成功', 'hard-success': '困难成功', 'success': '成功', 'failure': '失败', 'crit-failure': '大失败' };

let _actx: AudioContext | null = null;
function ctx() { try { if (!_actx || _actx.state === 'closed') _actx = new AudioContext(); if (_actx.state === 'suspended') _actx.resume(); return _actx; } catch { return null; } }

// ── Preloaded rolling WAV ──
let _rollingBuf: AudioBuffer | null = null;
let _rollingPromise: Promise<AudioBuffer | null> | null = null;

async function _loadRollingBuf(): Promise<AudioBuffer | null> {
  try {
    const resp = await fetch('/sfx/dice_rolling.wav');
    if (!resp.ok) throw new Error('fetch failed');
    const c = ctx(); if (!c) throw new Error('no AudioContext');
    _rollingBuf = await c.decodeAudioData(await resp.arrayBuffer());
    return _rollingBuf;
  } catch {
    return null;
  }
}
function loadRollingBuf(): Promise<AudioBuffer | null> {
  if (_rollingBuf) return Promise.resolve(_rollingBuf);
  if (!_rollingPromise) _rollingPromise = _loadRollingBuf();
  return _rollingPromise;
}
// Eager preload on first user interaction (module eval)
if (typeof window !== 'undefined') {
  const preload = () => { const c = ctx(); if (c) { c.resume(); loadRollingBuf(); } };
  window.addEventListener('click', preload, { once: true });
  window.addEventListener('keydown', preload, { once: true });
}
const ROLL_DURATION = 1587; // ms — matched to dice_rolling.wav

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
  } catch { /* audio not available */ }
}


// ── Death knell synthesis: 6 styles with unique rhythm + minor melody ──
// Frequencies: C2=65.4  Eb2=77.8  G2=98.0  Bb2=116.5  C3=130.8  C#2=69.3  D3=146.8
//               Eb3=155.6  F#2=92.5  Ab2=103.8  D2=73.4  G#2=103.8
const _f = { C2: 65.4, Eb2: 77.8, G2: 98, Bb2: 116.5, C3: 130.8, Cs2: 69.3, D2: 73.4, D3: 146.8, Eb3: 155.6, Fs2: 92.5, Ab2: 103.8 };

function playNote(ac: AudioContext, freq: number, vol: number, decay: number, delay: number, opts?: { type?: OscillatorType; subVol?: number; lpCutoff?: number; }) {
  setTimeout(() => {
    const now = ac.currentTime;
    const type = opts?.type ?? 'sine';
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    if (opts?.lpCutoff) {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(opts.lpCutoff, now);
      lp.frequency.exponentialRampToValueAtTime(freq * 0.5, now + decay);
      o.connect(lp); lp.connect(g); g.connect(ac.destination);
    } else {
      o.connect(g); g.connect(ac.destination);
    }
    o.start(now); o.stop(now + decay);
    if (opts?.subVol) {
      const o2 = ac.createOscillator(); const g2 = ac.createGain();
      o2.type = 'sine'; o2.frequency.setValueAtTime(freq * 0.5, now);
      g2.gain.setValueAtTime(opts.subVol, now);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + decay * 1.3);
      o2.connect(g2); g2.connect(ac.destination); o2.start(now); o2.stop(now + decay * 1.3);
    }
  }, delay);
}

// 1: 教堂钟声 — irregular minor-triad tolling: Eb3 C3 G2 C3 Eb2
function style1() {
  const notes: [number, number, number][] = [
    [_f.Eb3, 0, 0.35], [_f.C3, 350, 0.28], [_f.G2, 850, 0.32],
    [_f.C3, 1500, 0.20], [_f.Eb2, 2300, 0.28],
  ];
  notes.forEach(([f, t, v]) => {
    playNote(ctx()!, f, v, 0.65, t, { lpCutoff: f * 6, subVol: v * 0.5, type: 'sine' });
    // Octave overtone
    playNote(ctx()!, f * 2, v * 0.3, 0.55, t, { lpCutoff: f * 8, type: 'sine' });
    // Fifth overtone
    playNote(ctx()!, f * 3, v * 0.15, 0.45, t, { lpCutoff: f * 8, type: 'sine' });
  });
}

// 2: 工业撞击 — dissonant metallic stabs: C3 F#2 C#2 G#2 — minor 2nd + tritone
function style2() {
  const notes: [number, number, number][] = [
    [_f.C3, 0, 0.12], [_f.Fs2, 180, 0.10], [_f.Cs2, 420, 0.14],
    [_f.Ab2, 720, 0.09], [_f.Fs2, 1100, 0.11], [_f.Cs2, 1600, 0.12],
  ];
  notes.forEach(([f, t, v]) => {
    playNote(ctx()!, f, v, 0.35, t, { type: 'square', lpCutoff: f * 5 });
    // Ring-mod dissonance: close detuned second oscillator
    playNote(ctx()!, f * 1.02, v * 0.5, 0.25, t, { type: 'square', lpCutoff: f * 4 });
    playNote(ctx()!, f * 0.75, v * 0.3, 0.3, t, { type: 'triangle' });
  });
}

// 3: 丧鼓 — funeral heartbeat: G2 G2 Eb2 G2 (heavy beats) + soft fills
function style3() {
  const c = ctx(); if (!c) return;
  // Heavy beats: kick drum
  const heavy: [number, number, number][] = [
    [_f.G2, 0, 0.16], [_f.G2, 750, 0.14], [_f.Eb2, 1500, 0.18], [_f.G2, 2300, 0.12],
  ];
  heavy.forEach(([f, t, v]) => {
    // Kick sweep
    setTimeout(() => {
      const now = c.currentTime;
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f * 2, now);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, now + 0.07);
      g.gain.setValueAtTime(v * 0.9, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + 0.12);
    }, t);
    // Body rumble
    playNote(c, f * 0.5, v * 0.4, 0.4, t, { type: 'sine' });
  });
  // Soft fills between beats
  const fills: [number, number, number][] = [
    [_f.Bb2, 350, 0.04], [_f.Bb2, 1100, 0.03], [_f.Eb2, 1850, 0.04],
  ];
  fills.forEach(([f, t, v]) => playNote(c, f, v, 0.2, t, { type: 'sine', lpCutoff: f * 2 }));
}

// 4: 铜管挽歌 — descending C minor pentatonic with ritardando: Eb3 D3 C3 Bb2 G2
function style4() {
  const notes: [number, number, number, number][] = [
    [_f.Eb3, 0, 0.12, 0.5], [_f.D3, 550, 0.10, 0.55],
    [_f.C3, 1200, 0.13, 0.6], [_f.Bb2, 2000, 0.09, 0.7], [_f.G2, 3000, 0.12, 0.85],
  ];
  notes.forEach(([f, t, v, decay]) => {
    playNote(ctx()!, f, v, decay, t, { type: 'sawtooth', lpCutoff: f * 3, subVol: v * 0.4 });
  });
}

// 5: 玻璃共振 — scattered minor pentatonic chimes: C3 Eb3 G2 Bb2 C3 Eb2 G2
function style5() {
  const chimes: [number, number, number][] = [
    [_f.G2, 0, 0.08], [_f.C3, 220, 0.06], [_f.Eb3, 500, 0.07],
    [_f.Bb2, 820, 0.05], [_f.G2, 1180, 0.06], [_f.C3, 1580, 0.04],
    [_f.Eb2, 2000, 0.06], [_f.G2, 2500, 0.04],
  ];
  chimes.forEach(([f, t, v]) => {
    // Inharmonic glass overtones
    [1, 2.3, 3.7, 5.2].forEach((r, j) => {
      playNote(ctx()!, f * r, v * (0.14 / (j + 1)), 0.35 - j * 0.06, t, { type: 'triangle' });
    });
  });
}

// 6: 深渊低鸣 — C2 drone with tremolo + slow descending glissando into void
function style6() {
  const c = ctx(); if (!c) return;
  const now = c.currentTime;
  const duration = 3.5;
  // Main drone
  const o = c.createOscillator(); const g = c.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(_f.C2, now);
  o.frequency.exponentialRampToValueAtTime(_f.C2 * 0.6, now + duration);
  // Tremolo: LFO on gain
  const lfo = c.createOscillator(); const lfoG = c.createGain();
  lfo.type = 'sine'; lfo.frequency.setValueAtTime(1.2, now);
  lfo.frequency.linearRampToValueAtTime(0.4, now + duration);
  lfoG.gain.setValueAtTime(0.3, now);
  lfo.connect(lfoG); lfoG.connect(g.gain);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.16, now + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + duration);
  lfo.start(now); lfo.stop(now + duration);
  // Sub layer: octave below, no tremolo
  playNote(c, _f.C2 * 0.5, 0.08, 3.0, 0, { type: 'sine' });
  // Distant Eb minor chord fade-in
  setTimeout(() => {
    playNote(c, _f.Eb2, 0.04, 2.5, 0, { type: 'sine' });
    playNote(c, _f.G2 * 0.5, 0.03, 2.5, 0, { type: 'sine' });
  }, 800);
}

const TOLL_STYLES: Record<number, () => void> = {
  1: style1, 2: style2, 3: style3, 4: style4, 5: style5, 6: style6,
};

export function playTollStyle(n: number) {
  TOLL_STYLES[n]?.();
}

function resultSfx(isSuccess: boolean, isCrit: boolean) {
  if (isCrit && isSuccess) {
    // Crit-success: big dramatic hit + triumphant sparkle cascade
    impact(0.60, 60, 0.3);
    [0, 1, 2, 3, 4, 5].forEach(i => {
      setTimeout(() => impact(0.11, 500 + i * 200, 0.12), i * 60);
    });
    setTimeout(() => impact(0.20, 40, 0.25), 200);
    setTimeout(() => impact(0.16, 30, 0.2), 100);
  } else if (isCrit && !isSuccess) {
    // Crit-failure: death knell — 3 funeral bell tolls
    playTollStyle(1);
  } else if (isSuccess) {
    // Triumphant: bright ascending three-note
    impact(0.32, 100, 0.22);
    setTimeout(() => impact(0.16, 200, 0.14), 70);
    setTimeout(() => impact(0.12, 400, 0.12), 130);
    setTimeout(() => impact(0.07, 600, 0.1), 180);
  } else {
    // Failure: dissonant descent
    impact(0.24, 100, 0.18);
    setTimeout(() => impact(0.14, 80, 0.14), 60);
    setTimeout(() => impact(0.11, 55, 0.14), 110);
    setTimeout(() => impact(0.07, 35, 0.16), 160);
  }
}

export function DiceAnimation({ visible, skillName, target, roll, resultType, onComplete, bonus = 'none', bonusTens = 0, opposed = false, opponentRoll = 0, opponentTarget = 0, opponentResultType = 'failure', opposedOutcome = 'draw' }: Props) {
  const [phase, setPhase] = useState<'rolling' | 'result' | 'done'>('rolling');
  const [blur, setBlur] = useState(false);
  const [gold, setGold] = useState(false);
  const [fading, setFading] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDual = bonus !== 'none' || opposed;

  useEffect(() => {
    if (!visible) return;
    if (tRef.current) clearTimeout(tRef.current);
    setBlur(false); setGold(false); setFading(false); setPhase('rolling');
    const crit = resultType === 'crit-success' || resultType === 'crit-failure';
    let cancelled = false;

    (async () => {
      const buf = await loadRollingBuf();
      if (cancelled) return;
      if (buf) {
        const c = ctx();
        if (c) {
          await c.resume();
          const src = c.createBufferSource(); src.buffer = buf;
          const g = c.createGain(); g.gain.value = 0.45;
          src.connect(g); g.connect(c.destination);
          src.start();
          if (isDual) {
            setTimeout(async () => {
              const c2 = ctx();
              if (c2 && buf) {
                const src2 = c2.createBufferSource(); src2.buffer = buf;
                const g2 = c2.createGain(); g2.gain.value = 0.35;
                src2.connect(g2); g2.connect(c2.destination);
                src2.start();
              }
            }, 250);
          }
        }
      }

      tRef.current = setTimeout(async () => {
        if (cancelled) return;
        const c = ctx(); if (c) await c.resume();
        setPhase('result');
        if (resultType === 'crit-failure') { setBlur(true); setTimeout(() => setBlur(false), 800); }
        if (resultType === 'crit-success') setGold(true);
        resultSfx(resultType.includes('success'), crit);
        tRef.current = setTimeout(() => {
          if (cancelled) return;
          setPhase('done');
          setFading(true);
          tRef.current = setTimeout(() => onComplete(), 500);
        }, 2300);
      }, ROLL_DURATION);
    })();

    return () => { cancelled = true; if (tRef.current) clearTimeout(tRef.current); };
  }, [visible, onComplete, resultType, isDual]);

  // Random entrance direction — matches the rotation direction feel
  const entrance = useMemo(() => {
    const dirs = [
      { x: -260, y: -120 },
      { x: 260, y: -120 },
      { x: -220, y: 140 },
      { x: 220, y: 140 },
    ];
    const i1 = Math.floor(Math.random() * dirs.length);
    let i2 = (i1 + 1 + Math.floor(Math.random() * 3)) % dirs.length;
    if (i2 === i1) i2 = (i1 + 2) % dirs.length;
    return { main: dirs[i1], alt: dirs[i2] };
  }, [visible, roll]);
  // Remove debug log
  if (!visible) return null;

  const rollStr = String(roll);
  const baseColor = (resultType === 'crit-success' && gold) ? '#ffd700' : (COLORS[resultType] || '#999');
  const color = opposed
    ? (opposedOutcome === 'win' ? '#69f0ae' : opposedOutcome === 'lose' ? '#ef5350' : '#ffd740')
    : baseColor;
  const isSuccess = opposed ? opposedOutcome === 'win' : resultType.includes('success');
  const glowColor = phase === 'rolling' ? '#555' : color;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: fading ? 0.5 : 0.35, ease: fading ? [0.4, 0, 1, 1] : [0.22, 1, 0.36, 1] }}
      style={{ position: 'fixed', inset: 0, zIndex: 960, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: blur ? 'blur(8px)' : 'blur(6px)' }}>
      <motion.div
        initial={{ scale: 0.3, opacity: 0, x: entrance.main.x, y: entrance.main.y }}
        animate={{ scale: fading ? 0.85 : (blur ? 0.95 : 1), opacity: fading ? 0 : 1, x: 0, y: 0, filter: blur ? 'blur(3px)' : 'blur(0px)' }}
        transition={{ duration: fading ? 0.45 : 0.6, ease: fading ? [0.32, 0, 0.67, 0] : [0.34, 1.56, 0.64, 1] }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'var(--font-ui)' }}>

        {/* Dice display area */}
        <div style={{ width: isDual ? 380 : 220, height: 220, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isDual ? 40 : 0 }}>
          <RollingBlock phase={phase} rollStr={rollStr} color={color} glowColor={glowColor} />
          {opposed && (
            <>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#888', fontFamily: 'var(--font-display)', letterSpacing: 2, opacity: 0.6 }}>VS</span>
              <motion.div
                initial={{ opacity: 0, scale: 0.3, x: entrance.alt.x * 0.5, y: entrance.alt.y * 0.5 }}
                animate={{
                  opacity: phase === 'result' && opposedOutcome === 'win' ? 0.3 : 1,
                  scale: phase === 'result' && opposedOutcome === 'win' ? 0.65 : 1,
                  x: 0, y: 0,
                  filter: phase === 'result' && opposedOutcome === 'win' ? 'grayscale(0.8) brightness(0.6)' : 'none',
                }}
                transition={{ duration: 0.6, delay: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <RollingBlock phase={phase} rollStr={String(opponentRoll)} color={COLORS[opponentResultType] || '#999'} glowColor={phase === 'rolling' ? '#555' : (COLORS[opponentResultType] || '#999')} />
              </motion.div>
            </>
          )}
          {!opposed && isDual && (
            <motion.div
              initial={{ opacity: 0, scale: 0.3, x: entrance.alt.x * 0.5, y: entrance.alt.y * 0.5 }}
              animate={{
                opacity: phase === 'result' ? 0.3 : 1,
                scale: phase === 'result' ? 0.65 : 1,
                x: 0, y: 0,
                filter: phase === 'result' ? 'grayscale(0.8) brightness(0.6)' : 'none',
              }}
              transition={{ duration: 0.6, delay: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <RollingBlock phase={phase} rollStr={String(bonusTens * 10 + (roll % 10))} color={color} glowColor={glowColor} />
            </motion.div>
          )}
        </div>

        <div style={{ fontSize: 20, color: 'var(--parchment)', letterSpacing: 4, fontWeight: 600, marginBottom: 4 }}>
          {opposed ? `${skillName}对抗` : `${skillName}检定`}
          {!opposed && isDual && <span style={{ fontSize: 12, marginLeft: 8, color: bonus === 'bonus' ? '#69f0ae' : '#ef5350', opacity: 0.8 }}>{bonus === 'bonus' ? '奖励骰' : '惩罚骰'}</span>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', letterSpacing: 2, opacity: 0.7, marginBottom: 20 }}>
          {opposed ? `${target} vs ${opponentTarget}` : `目标 ${target}`}
        </div>

        <div style={{ height: 52, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {phase === 'result' && !opposed && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div style={{ padding: '8px 36px', background: isSuccess ? 'rgba(58,107,90,0.12)' : 'rgba(139,58,58,0.12)', border: `1px solid ${baseColor}88`, borderRadius: 6, boxShadow: `0 0 24px ${baseColor}22` }}>
                <span style={{ fontSize: 22, fontWeight: 600, color: baseColor, letterSpacing: 8, fontFamily: 'var(--font-display)' }}>{LABELS[resultType]}</span>
              </div>
            </motion.div>
          )}
          {phase === 'result' && opposed && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div style={{ padding: '8px 36px', background: isSuccess ? 'rgba(58,107,90,0.12)' : 'rgba(139,58,58,0.12)', border: `1px solid ${color}88`, borderRadius: 6, boxShadow: `0 0 24px ${color}22` }}>
                <span style={{ fontSize: 22, fontWeight: 600, color, letterSpacing: 8, fontFamily: 'var(--font-display)' }}>
                  {opposedOutcome === 'win' ? '胜 利' : opposedOutcome === 'lose' ? '败 北' : '平 局'}
                </span>
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
    // eslint-disable react-hooks/set-state-in-effect -- intentional animation pattern
    if (phase !== 'rolling') return;
    setAnimKey(k => k + 1); // reset animation on new roll
    const iv = setInterval(() => { setRandomDigits(Array.from({ length: 6 }, () => String(Math.floor(Math.random() * 100) + 1))); }, 60);
    // At 1.0s, freeze all faces to the result number (animation still spinning until 1.2s)
    const stop = setTimeout(() => { clearInterval(iv); setRandomDigits(Array(6).fill(rollStr)); }, 750);
    return () => { clearInterval(iv); clearTimeout(stop); };
    // eslint-enable react-hooks/set-state-in-effect
  }, [phase, rollStr]);

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
          transition={!isRolling ? { duration: 0.4, ease: 'easeOut', times: [0, 0.12, 0.28, 0.5, 0.72, 1.0] } : {}}
          style={{ width: '100%', height: '100%' }}>
          <div style={{ width: '100%', height: '100%' }}>
            {/* Spin — animated during rolling */}
            <motion.div
              key={animKey}
              initial={{ rotateX: 0, rotateY: 0 }}
              animate={{ rotateX: isRolling ? 1440 : 1440, rotateY: isRolling ? 900 : 900 }}
              transition={{ duration: isRolling ? 0.9 : 0, ease: [0.4, 0.0, 0.6, 1.0] }}
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

// ── 多面骰动画（伤害 / 理智损失，如 1D3、1D6）──
interface PolyProps {
  visible: boolean;
  theme: 'damage' | 'sanity';
  label: string;   // 造成伤害 / 理智损失 / 心理学检定
  expr: string;    // 1D6+2 / 暗骰
  total: number;
  sub?: string;    // 副标题（如 SAN 检定 成功/失败）
  hidden?: boolean; // 暗骰：不露点数，只显示「暗骰」
  onComplete: () => void;
}

const POLY_COLORS: Record<'damage' | 'sanity', string> = {
  damage: '#ff5252',
  sanity: '#b388ff',
};

export function PolyRollAnimation({ visible, theme, label, expr, total, sub, hidden = false, onComplete }: PolyProps) {
  const [phase, setPhase] = useState<'rolling' | 'result' | 'done'>('rolling');
  const [fading, setFading] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (tRef.current) clearTimeout(tRef.current);
    setFading(false); setPhase('rolling');
    let cancelled = false;

    (async () => {
      const buf = await loadRollingBuf();
      if (cancelled) return;
      const c = ctx();
      if (buf && c) {
        await c.resume();
        const src = c.createBufferSource(); src.buffer = buf;
        const g = c.createGain(); g.gain.value = 0.45;
        src.connect(g); g.connect(c.destination); src.start();
      }
      tRef.current = setTimeout(async () => {
        if (cancelled) return;
        const c2 = ctx(); if (c2) await c2.resume();
        setPhase('result');
        // 重击声：伤害用低沉撞击，理智损失用更阴冷的双层
        if (theme === 'damage') { impact(0.34, 90, 0.2); setTimeout(() => impact(0.16, 55, 0.18), 70); }
        else { impact(0.22, 70, 0.26); setTimeout(() => impact(0.12, 110, 0.3), 90); }
        tRef.current = setTimeout(() => {
          if (cancelled) return;
          setPhase('done'); setFading(true);
          tRef.current = setTimeout(() => onComplete(), 500);
        }, 2100);
      }, ROLL_DURATION);
    })();

    return () => { cancelled = true; if (tRef.current) clearTimeout(tRef.current); };
  }, [visible, onComplete, theme]);

  if (!visible) return null;

  const color = hidden ? '#9a86c4' : POLY_COLORS[theme];
  const rollStr = hidden ? '?' : String(total);
  const glowColor = phase === 'rolling' ? '#555' : color;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: fading ? 0.5 : 0.35, ease: fading ? [0.4, 0, 1, 1] : [0.22, 1, 0.36, 1] }}
      style={{ position: 'fixed', inset: 0, zIndex: 960, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}>
      <motion.div
        initial={{ scale: 0.3, opacity: 0, y: -100 }}
        animate={{ scale: fading ? 0.85 : 1, opacity: fading ? 0 : 1, y: 0 }}
        transition={{ duration: fading ? 0.45 : 0.6, ease: fading ? [0.32, 0, 0.67, 0] : [0.34, 1.56, 0.64, 1] }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'var(--font-ui)' }}>

        <div style={{ width: 220, height: 220, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RollingBlock phase={phase} rollStr={rollStr} color={color} glowColor={glowColor} />
        </div>

        <div style={{ fontSize: 20, color: 'var(--parchment)', letterSpacing: 4, fontWeight: 600, marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', letterSpacing: 2, opacity: 0.7, marginBottom: 20 }}>
          {expr}{sub ? ` · ${sub}` : ''}
        </div>

        <div style={{ height: 52, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {phase === 'result' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div style={{ padding: '8px 36px', background: `${color}1f`, border: `1px solid ${color}88`, borderRadius: 6, boxShadow: `0 0 24px ${color}22` }}>
                <span style={{ fontSize: 24, fontWeight: 700, color, letterSpacing: 6, fontFamily: 'var(--font-display)' }}>
                  {hidden ? '暗 骰' : (theme === 'sanity' ? `−${total}` : total) + ' 点'}
                </span>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
