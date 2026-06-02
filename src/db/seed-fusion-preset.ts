import { kvGet, kvSet } from './kv';
import { buildFusionPreset, FUSION_DS_ID, FUSION_XY_ID, FUSION_DS_NAME, FUSION_XY_NAME } from '../sillytavern/fusion-preset';
import type { ChatPreset } from '../types';

const SEED_FLAG = 'coc_fusion_seeded';
const SEED_VERSION = 'v6.1-dual'; // bump：种入 DS + 向斜阳 两个预设
const PRESET_STORAGE_KEY = 'coc_presets_v1';
const LAST_PRESET_KEY = 'coc_last_preset';

/**
 * 启动时幂等种入两个双人成行融合预设并设 DeepSeek 版为默认：
 * - DS 专用版（DeepSeek 优化，含 DS专杀/🐳思考模式）→ id=shuangren-ds（默认）
 * - 向斜阳版（多模型：Gemini/Claude/GLM）→ id=shuangren-xy
 * 悬浮窗「核心驱动模型」在二者间切换。
 *
 * 幂等：靠 SEED_VERSION 标记，只种一次；只读写预设存储，不碰存档表；异常不阻塞启动。
 */
export async function seedFusionPreset(): Promise<void> {
  try {
    if (kvGet(SEED_FLAG) === SEED_VERSION) return;

    const base = import.meta.env.BASE_URL || '/';
    const [dsJson, xyJson] = await Promise.all([
      fetch(base + 'presets/shuangren-ds.json').then((r) => (r.ok ? r.text() : null)).catch(() => null),
      fetch(base + 'presets/shuangren-v6.json').then((r) => (r.ok ? r.text() : null)).catch(() => null),
    ]);
    if (!dsJson && !xyJson) { console.warn('[fusion] 预设资源拉取失败'); return; }

    let presets: Record<string, ChatPreset> = {};
    const raw = kvGet(PRESET_STORAGE_KEY);
    if (raw) { try { presets = JSON.parse(raw) as Record<string, ChatPreset>; } catch { presets = {}; } }

    if (dsJson) { const p = buildFusionPreset(dsJson, FUSION_DS_ID, FUSION_DS_NAME); if (p) presets[FUSION_DS_ID] = p; }
    if (xyJson) { const p = buildFusionPreset(xyJson, FUSION_XY_ID, FUSION_XY_NAME); if (p) presets[FUSION_XY_ID] = p; }

    kvSet(PRESET_STORAGE_KEY, JSON.stringify(presets));
    kvSet(LAST_PRESET_KEY, FUSION_DS_ID); // 默认 DeepSeek 专用版
    kvSet(SEED_FLAG, SEED_VERSION);
    console.log('[fusion] 双人成行 DS/向斜阳 两个融合预设已种入，默认 DeepSeek');
  } catch (err) {
    console.warn('[fusion] 种入异常（不阻塞启动）:', err);
  }
}
