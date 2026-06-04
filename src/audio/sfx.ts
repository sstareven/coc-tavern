let ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

let masterGain: GainNode | null = null;
let sfxVolume = 1; // 0-1，音效主音量

/** 所有音效统一汇入的主增益节点（受 sfxVolume 控制，供音量滑块调节）。 */
function out(): AudioNode {
  const c = getCtx();
  if (!masterGain) { masterGain = c.createGain(); masterGain.connect(c.destination); }
  masterGain.gain.value = sfxVolume;
  return masterGain;
}

/** 设置音效主音量（0-1）。由设置面板的「音效音量」滑块驱动。 */
export function setSfxVolume(v: number): void {
  sfxVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = sfxVolume;
}

export function sfxPageFlip() {
  const c = getCtx(); const now = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / d.length) * Math.PI) * 0.5;
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.setValueAtTime(0.18, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1200, now); f.frequency.exponentialRampToValueAtTime(600, now + 0.35); f.Q.value = 1.2;
  src.connect(f); f.connect(g); g.connect(out()); src.start(now); src.stop(now + 0.6);
}

export function sfxSuccess() {
  const c = getCtx();
  [523.25, 659.25].forEach((freq, i) => {
    const t = c.currentTime + 0.2 + i * 0.12;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(out()); o.start(t); o.stop(t + 0.4);
  });
}

export function sfxFailure() {
  const c = getCtx(); const now = c.currentTime;
  const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(200, now); o.frequency.exponentialRampToValueAtTime(120, now + 0.7);
  const g = c.createGain(); g.gain.setValueAtTime(0.18, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  o.connect(g); g.connect(out()); o.start(now); o.stop(now + 0.9);
}

export function sfxCritSuccess() {
  const c = getCtx(); const now = c.currentTime;
  [180, 270].forEach((f, i) => {
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 2, now + 0.8);
    const g = c.createGain(); g.gain.setValueAtTime(i === 0 ? 0.2 : 0.14, now); g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    o.connect(g); g.connect(out()); o.start(now); o.stop(now + 1.2);
  });
}

export function sfxCritFailure() {
  const c = getCtx(); const now = c.currentTime;
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(50, now); o.frequency.linearRampToValueAtTime(30, now + 1.5);
  const g = c.createGain(); g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; f.Q.value = 1;
  o.connect(f); f.connect(g); g.connect(out()); o.start(now); o.stop(now + 2.8);
}

// ===== 通用 UI 按钮音（柔和木质点击，全局委托播放，按 soundEnabled 门控）=====

/** 柔和木质「嗒」声：短促、带通滤波的衰减噪声。通用按钮默认音。 */
export function sfxClick() {
  const c = getCtx(); const now = c.currentTime; const dur = 0.06;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-(i / d.length) * 8);
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.setValueAtTime(0.07, now); g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 820; f.Q.value = 0.8;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
  src.connect(f); f.connect(lp); lp.connect(g); g.connect(out()); src.start(now); src.stop(now + dur);
}

/** 主要动作按钮音：更有「木质」分量、稍低更饱满的「叩」声（生成/提交/确认/开始等）。 */
export function sfxClickPrimary() {
  const c = getCtx(); const now = c.currentTime; const dur = 0.1;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-(i / d.length) * 6);
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.setValueAtTime(0.11, now); g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.9;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
  src.connect(f); f.connect(lp); lp.connect(g); g.connect(out()); src.start(now); src.stop(now + dur);
}

/** 轻音：更轻更短的木质微响（关闭/返回/次要图标）。 */
export function sfxClickSoft() {
  const c = getCtx(); const now = c.currentTime; const dur = 0.05;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-(i / d.length) * 10);
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.setValueAtTime(0.045, now); g.gain.exponentialRampToValueAtTime(0.0006, now + dur);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.7;
  src.connect(f); f.connect(g); g.connect(out()); src.start(now); src.stop(now + dur);
}

/**
 * 生成完成提醒音「叮~」：清亮的钟铃声（两枚正弦谐音叠加 + 快起长衰的钟形包络）。
 * 比 UI 点击音更醒目、余韵更长，用于提醒可能已切到后台的玩家。
 * 走 Web Audio（AudioContext 在后台标签页仍会发声——浏览器节流的是 timer/rAF 而非音频播放），
 * 且 getCtx() 会在 suspended 时 resume()，故后台触发也能听见。略微提前调度避开 resume 竞态。
 */
export function sfxDing() {
  const c = getCtx();
  const now = c.currentTime + 0.02; // 小幅前置，规避后台 resume 后 currentTime 落在过去
  // [主音, 增益, 衰减时长]：E6 主体 + B6 高谐音点亮，纯正弦得干净的「叮」。
  const partials: [number, number, number][] = [
    [1318.5, 0.26, 1.1],
    [1975.5, 0.13, 0.9],
  ];
  for (const [freq, peak, decay] of partials) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.008); // 快起，避免起始爆音
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay); // 长衰，留下铃铛余韵
    o.connect(g); g.connect(out()); o.start(now); o.stop(now + decay + 0.05);
  }
}
