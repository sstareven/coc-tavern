import { describe, it, expect } from 'vitest';
import { buildFusionPreset, FUSION_PRESET_ID } from './fusion-preset';
import { COC_KP_PRESET } from '../constants/presets';
import { FUSION_SAMPLERS } from './fusion-config';
import { assemblePrompt } from './prompt-assembler';

// 最小双人成行式 ST 预设：含 main(marker) + worldInfoBefore(marker) + 一个模型专属条目(Gemini,在 disableIds)
// + 一个默认开启的功能条目(🔪大清洗)。
const stFixture = JSON.stringify({
  temperature: 1, top_p: 1, top_k: 40,
  prompts: [
    { identifier: 'main', name: '✅双人成行（Atri&Deach）', role: 'system', content: '双人成行人设颂歌……' },
    { identifier: 'worldInfoBefore', name: '🔵角色定义之前', role: 'system', content: '' },
    { identifier: '57cadf85-d3b2-4268-aaf6-d8b248e886c8', name: '✨Gemini✨', role: 'system', content: 'gemini 专属设定' },
    { identifier: '0f4098fb-b5aa-4960-94ac-91d458e57024', name: '🔪大清洗', role: 'system', content: '变量清空' },
  ],
  prompt_order: [{ character_id: 100001, order: [
    { identifier: 'main', enabled: true },
    { identifier: 'worldInfoBefore', enabled: true },
    { identifier: '57cadf85-d3b2-4268-aaf6-d8b248e886c8', enabled: true },
    { identifier: '0f4098fb-b5aa-4960-94ac-91d458e57024', enabled: true },
  ] }],
});

describe('buildFusionPreset — 双人成行融合', () => {
  const preset = buildFusionPreset(stFixture)!;

  it('成功构建并使用固定 id/名称', () => {
    expect(preset).toBeTruthy();
    expect(preset.id).toBe(FUSION_PRESET_ID);
  });

  it('强制注入 COC 机制命脉 marker（守秘人指令 / FORMAT / JSON 双页提醒）', () => {
    const ids = preset.promptItems.map((p) => p.id);
    expect(ids).toContain('coc_kp_system');
    expect(ids).toContain('formatInstruction');
    expect(ids).toContain('postHistoryInstructions');
    const sys = preset.promptItems.find((p) => p.id === 'coc_kp_system')!;
    expect(sys.content).toBe(COC_KP_PRESET.systemPrompt);
    expect(sys.enabled).toBe(true);
    const post = preset.promptItems.find((p) => p.id === 'postHistoryInstructions')!;
    expect(post.content).toContain('JSON'); // COC 的 JSON 双页提醒
    expect(post.enabled).toBe(true);
  });

  it('守秘人指令置顶、JSON 提醒置底（order 保证机制契约的注入位置）', () => {
    const ord = (id: string) => preset.promptItems.find((p) => p.id === id)!.order;
    const others = preset.promptItems
      .filter((p) => !['coc_kp_system', 'formatInstruction', 'postHistoryInstructions'].includes(p.id))
      .map((p) => p.order);
    expect(ord('coc_kp_system')).toBeLessThan(Math.min(...others));
    expect(ord('formatInstruction')).toBeLessThan(Math.min(...others));
    expect(ord('postHistoryInstructions')).toBeGreaterThan(Math.max(...others));
  });

  it('双人成行 main 人设默认关闭（COC 守秘人优先）', () => {
    const main = preset.promptItems.find((p) => p.id === 'main')!;
    expect(main.enabled).toBe(false);
  });

  it('模型专属条目（Gemini，在 disableIds）强制关闭', () => {
    const gem = preset.promptItems.find((p) => p.id.includes('57cadf85'))!;
    expect(gem.enabled).toBe(false);
  });

  it('兼容增强条目（🔪大清洗）按分类默认开启', () => {
    const clean = preset.promptItems.find((p) => p.id.includes('0f4098fb'))!;
    expect(clean.enabled).toBe(true);
  });

  it('套用 DeepSeek 采样参数', () => {
    expect(preset.temperature).toBe(FUSION_SAMPLERS.temperature);
    expect(preset.topP).toBe(FUSION_SAMPLERS.topP);
    expect(preset.topK).toBe(FUSION_SAMPLERS.topK);
  });

  it('非法 JSON 返回 null', () => {
    expect(buildFusionPreset('not json')).toBeNull();
  });
});

describe('融合预设经 assemblePrompt — COC 机制契约端到端', () => {
  const preset = buildFusionPreset(stFixture)!;
  const msgs = assemblePrompt('测试输入', [], preset, [], {}, 'FORMAT_MARKER_TEXT', { before: '', after: '' });
  const joined = msgs.map((m) => m.content).join('\n---\n');

  it('守秘人主指令被注入', () => {
    expect(joined).toContain(COC_KP_PRESET.systemPrompt.slice(0, 12));
  });
  it('format-instruction（JSON 契约）被注入', () => {
    expect(joined).toContain('FORMAT_MARKER_TEXT');
  });
  it('JSON 双页提醒（postHistory）被注入', () => {
    expect(joined).toContain('leftContent');
  });
  it('双人成行 main 人设（默认关）不出现在组装结果中', () => {
    expect(joined).not.toContain('双人成行人设颂歌');
  });
  it('模型专属 Gemini 条目（默认关）不出现', () => {
    expect(joined).not.toContain('gemini 专属设定');
  });
  it('兼容增强（大清洗，默认开）出现', () => {
    expect(joined).toContain('变量清空');
  });
});
