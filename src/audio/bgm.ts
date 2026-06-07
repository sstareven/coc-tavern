// src/audio/bgm.ts —— BGM 系统(基于 /public/BGM.mp3 + WebAudio 滤波链)
// 设计:
//   - 单一 HTMLAudioElement(loop=true)流式加载 /BGM.mp3,preload=auto,首屏不阻塞
//   - MediaElementAudioSourceNode 接到现有 BGM 总线,与 sfx.ts 共用 AudioContext
//   - 4 个 track 共用同一音源,各走不同 BiquadFilter 链做氛围差异化:
//       * menu          直通(清亮)
//       * investigation 轻量低通 ~5kHz(温柔)
//       * combat        低通 1.5kHz + 高架衰减 -3dB(压抑紧张)
//       * mythos        低通 700Hz + 低架+4dB(深沉模糊,邪神/坏结局)
//   - 切轨用 GainNode.linearRampToValueAtTime 做 ~1.2s crossfade,音源不停
//   - 受 musicVolume(0-100)+ soundEnabled 控制(由 App.tsx 订阅 store)

import { getAudioContext } from './sfx';

export type BgmTrack = 'menu' | 'investigation' | 'combat' | 'mythos';

interface TrackChain {
  /** mediaSource → entry → 滤波器们 → exit → masterBus。exit.gain 是 crossfade 控点。 */
  entry: GainNode;
  exit: GainNode;
  /** 该 chain 创建的所有节点(含 entry/exit/中间滤波器),stop 时一并 disconnect。 */
  nodes: AudioNode[];
}

const CROSSFADE = 1.2;     // 切轨淡入淡出时长(秒)
const BGM_PEAK = 0.85;     // mp3 已自带音量信息,这里给 masterBus 留头空间不过载
const BGM_SRC = '/BGM.mp3';

let masterBus: GainNode | null = null;
let musicVolume = 0.4;
let audio: HTMLAudioElement | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
let current: { track: BgmTrack; chain: TrackChain } | null = null;
let started = false;
let loadFailed = false;

// ============ 总线 ============

function bus(): GainNode {
  const c = getAudioContext();
  if (!masterBus) {
    masterBus = c.createGain();
    masterBus.gain.value = musicVolume * BGM_PEAK;
    masterBus.connect(c.destination);
  }
  return masterBus;
}

// ============ HTMLAudio 单例 ============

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(BGM_SRC);
    audio.loop = true;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.addEventListener('error', () => { loadFailed = true; }, { once: true });
  }
  return audio;
}

function getMediaSource(): MediaElementAudioSourceNode {
  // MediaElementAudioSourceNode 同一 element 只能创建一次,所以单例化
  if (!mediaSource) {
    const c = getAudioContext();
    mediaSource = c.createMediaElementSource(getAudio());
  }
  return mediaSource;
}

// ============ 滤波链工厂 ============

function buildChain(track: BgmTrack): TrackChain {
  const c = getAudioContext();
  const entry = c.createGain();
  const exit = c.createGain();
  exit.gain.value = 0; // crossfade 用,初始 0
  const nodes: AudioNode[] = [entry, exit];

  switch (track) {
    case 'menu':
      entry.connect(exit);
      break;
    case 'investigation': {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 5000; lp.Q.value = 0.5;
      entry.connect(lp); lp.connect(exit);
      nodes.push(lp);
      break;
    }
    case 'combat': {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 1.2;
      const hs = c.createBiquadFilter();
      hs.type = 'highshelf'; hs.frequency.value = 3000; hs.gain.value = -3;
      const g = c.createGain(); g.gain.value = 0.95;
      entry.connect(lp); lp.connect(hs); hs.connect(g); g.connect(exit);
      nodes.push(lp, hs, g);
      break;
    }
    case 'mythos': {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 1.5;
      const ls = c.createBiquadFilter();
      ls.type = 'lowshelf'; ls.frequency.value = 200; ls.gain.value = 4;
      const g = c.createGain(); g.gain.value = 0.85;
      entry.connect(lp); lp.connect(ls); ls.connect(g); g.connect(exit);
      nodes.push(lp, ls, g);
      break;
    }
  }

  exit.connect(bus());
  return { entry, exit, nodes };
}

function fadeOutAndDestroy(chain: TrackChain, when: number): void {
  const c = getAudioContext();
  chain.exit.gain.cancelScheduledValues(when);
  chain.exit.gain.setValueAtTime(chain.exit.gain.value, when);
  chain.exit.gain.linearRampToValueAtTime(0.0001, when + CROSSFADE);
  // CROSSFADE 后 disconnect 整条 chain,避免节点累积
  const cleanupAt = when + CROSSFADE + 0.05;
  const sentinel = c.createBufferSource();
  sentinel.buffer = c.createBuffer(1, 1, c.sampleRate);
  sentinel.onended = () => {
    try { for (const n of chain.nodes) n.disconnect(); } catch { /* noop */ }
  };
  sentinel.start(cleanupAt);
}

function fadeIn(chain: TrackChain, when: number): void {
  chain.exit.gain.cancelScheduledValues(when);
  chain.exit.gain.setValueAtTime(0.0001, when);
  chain.exit.gain.linearRampToValueAtTime(1.0, when + CROSSFADE);
}

// ============ 公开 API ============

/** 首次启动 BGM(必须在用户手势后调用以满足自动播放策略)。重复调用幂等。 */
export function startBgm(track: BgmTrack = 'menu'): void {
  if (started && current) return;
  if (loadFailed) return; // 加载失败后不再重试,避免控制台刷错
  started = true;
  const c = getAudioContext();
  bus();
  const a = getAudio();
  const src = getMediaSource();
  const chain = buildChain(track);
  src.connect(chain.entry);
  current = { track, chain };
  fadeIn(chain, c.currentTime);
  // play() 可能因自动播放策略被拒,捕获后将 started 置回 false,以便下次手势重试
  a.play().catch(() => {
    started = false;
    try { src.disconnect(chain.entry); } catch { /* noop */ }
    fadeOutAndDestroy(chain, c.currentTime);
    current = null;
  });
}

/** 淡出停止 BGM。pause audio 节省 CPU/带宽。 */
export function stopBgm(): void {
  if (!current) { started = false; return; }
  const c = getAudioContext();
  fadeOutAndDestroy(current.chain, c.currentTime);
  try { getMediaSource().disconnect(current.chain.entry); } catch { /* noop */ }
  // 等淡出完再 pause,避免硬切
  const a = audio;
  window.setTimeout(() => { try { a?.pause(); } catch { /* noop */ } }, (CROSSFADE + 0.1) * 1000);
  current = null;
  started = false;
}

/** 切换主题,~1.2s crossfade。相同 track 无视;未启动则启动并播放该 track。 */
export function setBgmTrack(track: BgmTrack): void {
  if (!started) { startBgm(track); return; }
  if (current && current.track === track) return;
  const c = getAudioContext();
  const now = c.currentTime;
  const src = getMediaSource();
  if (current) {
    fadeOutAndDestroy(current.chain, now);
    try { src.disconnect(current.chain.entry); } catch { /* noop */ }
  }
  const chain = buildChain(track);
  src.connect(chain.entry);
  current = { track, chain };
  fadeIn(chain, now);
}

/** 设置 BGM 音量(0-1)。 */
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
  return started && current !== null && !!audio && !audio.paused;
}
