import { kvGet, kvSet } from './kv';
import { buildFusionPreset, FUSION_PRESET_ID } from '../sillytavern/fusion-preset';
import type { ChatPreset } from '../types';

const SEED_FLAG = 'coc_fusion_seeded';
const SEED_VERSION = 'v6.1';
const PRESET_STORAGE_KEY = 'coc_presets_v1';
const LAST_PRESET_KEY = 'coc_last_preset';

/**
 * 启动时幂等种入「双人成行融合预设」到预设存储（coc_presets_v1）并设为默认主预设。
 *
 * - 幂等：靠 SEED_FLAG 版本标记，只种一次——之后用户在悬浮窗/预设编辑器改的开关不会被覆盖。
 * - 资源从 public/presets/shuangren-v6.json 运行时拉取（不进 JS bundle）。
 * - 只读写「预设存储」与「当前预设指针」，绝不触碰 conversations/pages/charsheets 等存档表。
 * - 任何异常都不阻塞启动（尽力而为）。
 */
export async function seedFusionPreset(): Promise<void> {
  try {
    if (kvGet(SEED_FLAG) === SEED_VERSION) return; // 已种入：不覆盖用户后续改动

    const url = (import.meta.env.BASE_URL || '/') + 'presets/shuangren-v6.json';
    const resp = await fetch(url);
    if (!resp.ok) { console.warn('[fusion] 预设资源拉取失败:', resp.status); return; }
    const json = await resp.text();

    const preset = buildFusionPreset(json);
    if (!preset) { console.warn('[fusion] 融合预设构建失败'); return; }

    let presets: Record<string, ChatPreset> = {};
    const raw = kvGet(PRESET_STORAGE_KEY);
    if (raw) { try { presets = JSON.parse(raw) as Record<string, ChatPreset>; } catch { presets = {}; } }
    presets[FUSION_PRESET_ID] = preset;
    kvSet(PRESET_STORAGE_KEY, JSON.stringify(presets));
    kvSet(LAST_PRESET_KEY, FUSION_PRESET_ID); // 设为默认主预设（取代旧 COC 守秘人的默认地位）
    kvSet(SEED_FLAG, SEED_VERSION);
    console.log('[fusion] 双人成行融合预设已种入并设为默认主预设');
  } catch (err) {
    console.warn('[fusion] 种入异常（不阻塞启动）:', err);
  }
}
