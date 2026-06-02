import { describe, it, expect } from 'vitest';
import { buildFusionPreset, FUSION_PRESET_ID } from './fusion-preset';
import { COC_KP_PRESET } from '../constants/presets';
import { FUSION_SAMPLERS } from './fusion-config';
import { assemblePrompt } from './prompt-assembler';
import { resolveAllMacrosBatch, type MacroContext } from './unified-macro-engine';
import { coerceJsonObject } from './llm-response-parser';

// 最小双人成行式 ST 预设：含 main(marker) + worldInfoBefore(marker) + 一个模型专属条目(Gemini,在 disableIds)
// + 一个默认开启的功能条目(🔪大清洗)。
const stFixture = JSON.stringify({
  temperature: 1, top_p: 1, top_k: 40,
  prompts: [
    { identifier: 'main', name: '✅双人成行（Atri&Deach）', role: 'system', content: '双人成行人设颂歌……' },
    { identifier: 'worldInfoBefore', name: '🔵角色定义之前', role: 'system', content: '' },
    { identifier: '4ea7f2d4-a8de-4134-a905-574fa89b1645', name: '🎨Claude🎨', role: 'system', content: 'claude 专属设定' },
    { identifier: '0f4098fb-b5aa-4960-94ac-91d458e57024', name: '🔪大清洗', role: 'system', content: '变量清空' },
    { identifier: 'scenario', name: '⚫角色情景', role: 'system', content: '角色当前所处情景设定' },
    { identifier: 'nsfw-seam', name: '✅色情要求自缝合', role: 'system', content: 'NSFW 缝合' },
  ],
  prompt_order: [{ character_id: 100001, order: [
    { identifier: 'main', enabled: true },
    { identifier: 'worldInfoBefore', enabled: true },
    { identifier: '4ea7f2d4-a8de-4134-a905-574fa89b1645', enabled: true },
    { identifier: '0f4098fb-b5aa-4960-94ac-91d458e57024', enabled: true },
    { identifier: 'scenario', enabled: true },
    { identifier: 'nsfw-seam', enabled: true },
  ] }],
});

describe('buildFusionPreset — 双人成行融合', () => {
  const preset = buildFusionPreset(stFixture, FUSION_PRESET_ID, '双人成行测试')!;

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

  it('双人成行 main 人设默认开启（核心人设 Atri&Deach 与 COC 守秘人共存）', () => {
    const main = preset.promptItems.find((p) => p.id === 'main')!;
    expect(main.enabled).toBe(true);
  });

  it('模型条目保留作者原始启用（不强制关，模型由预设栏切换控制）', () => {
    const claude = preset.promptItems.find((p) => p.id.includes('4ea7f2d4'))!;
    expect(claude.enabled).toBe(true);
  });

  it('兼容增强条目（🔪大清洗）按分类默认开启', () => {
    const clean = preset.promptItems.find((p) => p.id.includes('0f4098fb'))!;
    expect(clean.enabled).toBe(true);
  });

  it('NSFW 误杀修复：⚫角色情景 保留启用（「色情」是「角色」+「情景」的巧合子串，不应被 NSFW_NAME 命中）', () => {
    const scenario = preset.promptItems.find((p) => p.id === 'scenario')!;
    expect(scenario.enabled).toBe(true);
  });

  it('真 NSFW 条目（✅色情要求自缝合）仍被关闭', () => {
    const nsfw = preset.promptItems.find((p) => p.name === '✅色情要求自缝合')!;
    expect(nsfw.enabled).toBe(false);
  });

  it('套用 DeepSeek 采样参数', () => {
    expect(preset.temperature).toBe(FUSION_SAMPLERS.temperature);
    expect(preset.topP).toBe(FUSION_SAMPLERS.topP);
    expect(preset.topK).toBe(FUSION_SAMPLERS.topK);
  });

  it('非法 JSON 返回 null', () => {
    expect(buildFusionPreset('not json', 'x', 'y')).toBeNull();
  });
});

describe('融合预设经 assemblePrompt — COC 机制契约端到端', () => {
  const preset = buildFusionPreset(stFixture, FUSION_PRESET_ID, '双人成行测试')!;
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
  it('双人成行 main 人设（默认开）出现在组装结果中', () => {
    expect(joined).toContain('双人成行人设颂歌');
  });
  it('模型条目 Claude（作者原始启用）出现在组装结果中', () => {
    expect(joined).toContain('claude 专属设定');
  });
  it('兼容增强（大清洗，默认开）出现', () => {
    const clean = joined;
    expect(clean).toContain('变量清空');
  });
});

describe('Phase A: promptItems 宏跨条目作用域（双人成行 setvar/getvar 真正生效）', () => {
  it('同一 batch 内前部 setvar 设值、后部 getvar 能读到（按序共享作用域）', () => {
    const ctx: MacroContext = { macroVars: {}, charVars: {}, gameVars: {}, charName: '', userName: '', modelName: 'deepseek' };
    // 模拟：双人成行的"文风/人称"开关条目(order靠前)先 setvar，核心条目(order靠后)再 getvar 组装。
    const r = resolveAllMacrosBatch([
      '{{setvar::文风::轻小说}}',
      '{{setvar::人称::第二人称}}',
      '文风={{getvar::文风}} 人称={{getvar::人称}}',
    ], ctx);
    expect(r[2].text).toContain('轻小说');
    expect(r[2].text).toContain('第二人称');
  });
});

describe('思考链与 JSON 共存：剥离思考块后仍能提取纯 JSON', () => {
  it('coerceJsonObject 剥离含花括号的 <thinking> 块后，正确提取 JSON 双页', () => {
    const raw = '<thinking>推演：本回合要推进 {剧情}，角色基于认知一致反应，需做侦查检定</thinking>\n{"leftHeader":"洞穴","leftContent":"潮湿的石壁","choices":[]}';
    const { parsed } = coerceJsonObject(raw);
    expect(parsed).toBeTruthy();
    expect((parsed as Record<string, unknown>).leftContent).toBe('潮湿的石壁');
  });
});
