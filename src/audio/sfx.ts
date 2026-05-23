let ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function sfxPageFlip() {
  const c = getCtx(); const now = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / d.length) * Math.PI) * 0.5;
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.setValueAtTime(0.18, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1200, now); f.frequency.exponentialRampToValueAtTime(600, now + 0.35); f.Q.value = 1.2;
  src.connect(f); f.connect(g); g.connect(c.destination); src.start(now); src.stop(now + 0.6);
}

export function sfxSuccess() {
  const c = getCtx();
  [523.25, 659.25].forEach((freq, i) => {
    const t = c.currentTime + 0.2 + i * 0.12;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.4);
  });
}

export function sfxFailure() {
  const c = getCtx(); const now = c.currentTime;
  const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(200, now); o.frequency.exponentialRampToValueAtTime(120, now + 0.7);
  const g = c.createGain(); g.gain.setValueAtTime(0.18, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + 0.9);
}

export function sfxCritSuccess() {
  const c = getCtx(); const now = c.currentTime;
  [180, 270].forEach((f, i) => {
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 2, now + 0.8);
    const g = c.createGain(); g.gain.setValueAtTime(i === 0 ? 0.2 : 0.14, now); g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + 1.2);
  });
}

export function sfxCritFailure() {
  const c = getCtx(); const now = c.currentTime;
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(50, now); o.frequency.linearRampToValueAtTime(30, now + 1.5);
  const g = c.createGain(); g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; f.Q.value = 1;
  o.connect(f); f.connect(g); g.connect(c.destination); o.start(now); o.stop(now + 2.8);
}
