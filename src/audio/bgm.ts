// src/audio/bgm.ts —— 程序化 BGM 系统
// 设计:
//   - 复用 sfx.ts 的 AudioContext(getAudioContext),保证音量条/后台 resume 一致
//   - BGM 走独立 master gain → destination(受 musicVolume 控制,与 SFX 分轨)
//   - 4 个主题 stem 全部用 Oscillator/LFO/AudioBuffer 程序合成,零二进制依赖
//   - 长循环靠 AudioBufferSourceNode(loop=true)+ 持续 Oscillator,无 setInterval/setTimeout
//   - 调度全部用 AudioContext.currentTime → 后台标签页仍发声(浏览器只节流 timer/rAF)
//   - 切轨用 GainNode.linearRampToValueAtTime 做 ~1.2s crossfade
//   - 整体峰值 ≈ -18dBFS,不抢叙事文字

import { getAudioContext } from './sfx';

export type BgmTrack = 'menu' | 'investigation' | 'combat' | 'mythos';

interface Stem {
  /** 顶层 gain,crossfade 用它 ramp。stop() 时 disconnect 整条链路。 */
  gain: GainNode;
  /** 该 stem 创建的所有持续音源,stop 时一并停掉。 */
  nodes: AudioScheduledSourceNode[];
}

const CROSSFADE = 1.2; // 主题切换淡入淡出时长(秒)
const BGM_PEAK = 0.18; // ≈ -15dBFS,stem 内还有衰减,实际听感约 -18dBFS
const PRESCHEDULE_SEC = 300; // 周期性音符一次性预排 5 分钟,切轨/超时自动重排

let masterBus: GainNode | null = null;
let musicVolume = 0.4; // 0-1,响应「音乐音量」滑块
let current: { track: BgmTrack; stem: Stem } | null = null;
let started = false;

// ============ 工具 ============

function bus(): GainNode {
  const c = getAudioContext();
  if (!masterBus) {
    masterBus = c.createGain();
    masterBus.gain.value = musicVolume * BGM_PEAK;
    masterBus.connect(c.destination); // 独立于 sfx masterGain
  }
  return masterBus;
}

/** 生成 N 秒粉噪 buffer。loop=true 即可无限延伸。 */
function noiseBuffer(sec: number, lpFreq = 20000): AudioBuffer {
  const c = getAudioContext();
  const len = Math.floor(c.sampleRate * sec);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  const k = Math.min(1, lpFreq / (c.sampleRate * 0.5));
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = last + k * (w - last);
    d[i] = last;
  }
  return buf;
}

function osc(stem: Stem, type: OscillatorType, freq: number, gainVal: number, dest: AudioNode | AudioParam): OscillatorNode {
  const c = getAudioContext();
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gainVal;
  o.connect(g);
  if (dest instanceof AudioParam) g.connect(dest); else g.connect(dest);
  o.start();
  stem.nodes.push(o);
  return o;
}

function loopSrc(stem: Stem, buf: AudioBuffer, dest: AudioNode, gainVal: number): AudioBufferSourceNode {
  const c = getAudioContext();
  const s = c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  const g = c.createGain();
  g.gain.value = gainVal;
  s.connect(g); g.connect(dest);
  s.start();
  stem.nodes.push(s);
  return s;
}

function scheduleNote(
  at: number, freq: number, dur: number, type: OscillatorType,
  peak: number, dest: AudioNode, filterFreq?: number,
): void {
  const c = getAudioContext();
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.04, dur * 0.1));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  if (filterFreq !== undefined) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    o.connect(f); f.connect(g);
  } else {
    o.connect(g);
  }
  g.connect(dest);
  o.start(at);
  o.stop(at + dur + 0.1);
}

// ============ 主题 stem 工厂 ============

/** 主菜单:低频 drone(A1+E2 五度)+ 缓慢 a 小调钢琴 arpeggio(A-C-E-A) */
function buildMenuStem(): Stem {
  const c = getAudioContext();
  const stem: Stem = { gain: c.createGain(), nodes: [] };
  stem.gain.gain.value = 0;
  stem.gain.connect(bus());

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
  lp.connect(stem.gain);
  osc(stem, 'sawtooth', 55, 0.22, lp);
  osc(stem, 'sawtooth', 82.4, 0.16, lp);
  osc(stem, 'sine', 0.07, 180, lp.frequency);

  const arpDest = c.createGain(); arpDest.gain.value = 0.5; arpDest.connect(stem.gain);
  const notes = [220, 261.6, 329.6, 440];
  const start = c.currentTime + 0.2;
  const stepBeat = 1.1;
  const cycle = stepBeat * notes.length + 0.6;
  const cycles = Math.ceil(PRESCHEDULE_SEC / cycle);
  for (let k = 0; k < cycles; k++) {
    for (let i = 0; i < notes.length; i++) {
      scheduleNote(start + k * cycle + i * stepBeat, notes[i], 1.8, 'triangle', 0.08, arpDest, 2400);
    }
  }
  return stem;
}

/** 探索/对话:Cmaj7 长 Pad + 极轻纸张窸窣 + 偶尔深远钟声 */
function buildInvestigationStem(): Stem {
  const c = getAudioContext();
  const stem: Stem = { gain: c.createGain(), nodes: [] };
  stem.gain.gain.value = 0;
  stem.gain.connect(bus());

  const padLp = c.createBiquadFilter();
  padLp.type = 'lowpass'; padLp.frequency.value = 1400; padLp.Q.value = 0.5;
  padLp.connect(stem.gain);
  [130.8, 164.8, 196.0, 246.9].forEach((f) => osc(stem, 'sine', f, 0.08, padLp));
  osc(stem, 'sine', 0.05, 8, padLp.frequency);

  const paper = noiseBuffer(8, 8000);
  const paperHp = c.createBiquadFilter();
  paperHp.type = 'highpass'; paperHp.frequency.value = 3200; paperHp.Q.value = 0.6;
  paperHp.connect(stem.gain);
  loopSrc(stem, paper, paperHp, 0.04);

  const bellDest = c.createGain(); bellDest.gain.value = 0.5; bellDest.connect(stem.gain);
  const start = c.currentTime + 8;
  const period = 18;
  const cycles = Math.ceil(PRESCHEDULE_SEC / period);
  for (let k = 0; k < cycles; k++) {
    const t = start + k * period + (Math.random() * 4 - 2);
    scheduleNote(t, 65.4, 6, 'triangle', 0.09, bellDest, 600);
    scheduleNote(t, 130.8, 5, 'sine', 0.04, bellDest, 1200);
  }
  return stem;
}

/** 战斗:E1 drone + 80BPM 心跳(2/4) + 增四度 stab */
function buildCombatStem(): Stem {
  const c = getAudioContext();
  const stem: Stem = { gain: c.createGain(), nodes: [] };
  stem.gain.gain.value = 0;
  stem.gain.connect(bus());

  const droneLp = c.createBiquadFilter();
  droneLp.type = 'lowpass'; droneLp.frequency.value = 180;
  droneLp.connect(stem.gain);
  osc(stem, 'sawtooth', 41.2, 0.12, droneLp);

  const bpm = 80;
  const beat = 60 / bpm;
  const heartDest = c.createGain(); heartDest.gain.value = 0.55; heartDest.connect(stem.gain);
  const stabDest = c.createGain(); stabDest.gain.value = 0.35; stabDest.connect(stem.gain);
  const start = c.currentTime + 0.1;
  const totalBeats = Math.ceil(PRESCHEDULE_SEC / beat);
  for (let i = 0; i < totalBeats; i++) {
    const t = start + i * beat;
    scheduleNote(t, 55, 0.18, 'sine', 0.18, heartDest, 200);
    scheduleNote(t + 0.18, 48, 0.16, 'sine', 0.12, heartDest, 200);
    if (i % 8 === 4) {
      scheduleNote(t, 246.9, 0.6, 'sawtooth', 0.06, stabDest, 1600);
      scheduleNote(t, 349.2, 0.6, 'sawtooth', 0.05, stabDest, 1600);
    }
  }
  return stem;
}

/** 邪神/坏结局:18Hz 次声 + 半音 cluster(C/Db/F#/G) + 反向钹 */
function buildMythosStem(): Stem {
  const c = getAudioContext();
  const stem: Stem = { gain: c.createGain(), nodes: [] };
  stem.gain.gain.value = 0;
  stem.gain.connect(bus());

  osc(stem, 'sine', 18, 0.18, stem.gain);

  const clusterLp = c.createBiquadFilter();
  clusterLp.type = 'lowpass'; clusterLp.frequency.value = 900; clusterLp.Q.value = 1.2;
  clusterLp.connect(stem.gain);
  [130.8, 138.6, 185.0, 196.0].forEach((f) => osc(stem, 'sawtooth', f, 0.05, clusterLp));
  osc(stem, 'sine', 0.03, 400, clusterLp.frequency);

  const noise = noiseBuffer(2, 12000);
  const start = c.currentTime + 5;
  const period = 9;
  const cycles = Math.ceil(PRESCHEDULE_SEC / period);
  for (let k = 0; k < cycles; k++) {
    const t = start + k * period + Math.random() * 2;
    const src = c.createBufferSource();
    src.buffer = noise;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 1.6);
    g.gain.setValueAtTime(0.12, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.62);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 4000;
    src.connect(hp); hp.connect(g); g.connect(stem.gain);
    src.start(t); src.stop(t + 1.7);
    stem.nodes.push(src);
  }
  return stem;
}

function buildStem(track: BgmTrack): Stem {
  switch (track) {
    case 'menu': return buildMenuStem();
    case 'investigation': return buildInvestigationStem();
    case 'combat': return buildCombatStem();
    case 'mythos': return buildMythosStem();
  }
}

// ============ 公开 API ============

function fadeOutAndStop(stem: Stem, when: number): void {
  const c = getAudioContext();
  stem.gain.gain.cancelScheduledValues(when);
  stem.gain.gain.setValueAtTime(stem.gain.gain.value, when);
  stem.gain.gain.linearRampToValueAtTime(0.0001, when + CROSSFADE);
  const stopAt = when + CROSSFADE + 0.05;
  for (const n of stem.nodes) {
    try { n.stop(stopAt); } catch { /* 已 stop */ }
  }
  // 用 0 长 BufferSource.onended 在 ctx 时刻清理 disconnect,避免 setTimeout 在后台被节流
  const sentinel = c.createBufferSource();
  sentinel.buffer = c.createBuffer(1, 1, c.sampleRate);
  sentinel.onended = () => { try { stem.gain.disconnect(); } catch { /* noop */ } };
  sentinel.start(stopAt);
}

function fadeIn(stem: Stem, when: number): void {
  stem.gain.gain.cancelScheduledValues(when);
  stem.gain.gain.setValueAtTime(0.0001, when);
  stem.gain.gain.linearRampToValueAtTime(1.0, when + CROSSFADE);
}

/** 首次启动 BGM。重复调用幂等(已在播则无视)。track 默认 'menu'。
 *  调用方需在用户首次手势(pointerdown/keydown)之后调用,以满足浏览器自动播放策略。 */
export function startBgm(track: BgmTrack = 'menu'): void {
  if (started && current) return;
  started = true;
  const c = getAudioContext();
  bus();
  const stem = buildStem(track);
  current = { track, stem };
  fadeIn(stem, c.currentTime);
}

/** 淡出并停止 BGM。下次 startBgm 才会再发声。 */
export function stopBgm(): void {
  if (!current) { started = false; return; }
  const c = getAudioContext();
  fadeOutAndStop(current.stem, c.currentTime);
  current = null;
  started = false;
}

/** 切换主题,带 ~1.2s crossfade。相同 track 无视;未启动则启动并播放该 track。 */
export function setBgmTrack(track: BgmTrack): void {
  if (!started) { startBgm(track); return; }
  if (current && current.track === track) return;
  const c = getAudioContext();
  const now = c.currentTime;
  if (current) fadeOutAndStop(current.stem, now);
  const stem = buildStem(track);
  current = { track, stem };
  fadeIn(stem, now);
}

/** 设置 BGM 音量(0-1)。响应设置面板「音乐音量」滑块。 */
export function setBgmVolume(v: number): void {
  musicVolume = Math.max(0, Math.min(1, v));
  if (masterBus) {
    const c = getAudioContext();
    masterBus.gain.cancelScheduledValues(c.currentTime);
    masterBus.gain.linearRampToValueAtTime(musicVolume * BGM_PEAK, c.currentTime + 0.08);
  }
}

/** 当前是否在播放(供调试/检测)。 */
export function isBgmPlaying(): boolean {
  return started && current !== null;
}
