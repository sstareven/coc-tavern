import type { ChatPreset, PromptItem } from '../types';
import { importPresetFromST } from './format-converter';
import { COC_KP_PRESET } from '../constants/presets';
import { FUSION_SAMPLERS } from './fusion-config';
import { FUSION_MENU } from './fusion-menu';

/** 两个融合预设：DS专用版(DeepSeek)与向斜阳版(多模型)。悬浮窗模型栏在二者间切换；默认 DeepSeek。 */
export const FUSION_DS_ID = 'shuangren-ds';
export const FUSION_XY_ID = 'shuangren-xy';
export const FUSION_DS_NAME = '双人成行 · DS专用（DeepSeek）';
export const FUSION_XY_NAME = '双人成行 · 向斜阳（多模型）';
/** 兼容旧引用：默认主预设 = DeepSeek 专用版。 */
export const FUSION_PRESET_ID = FUSION_DS_ID;

/** buildFusionPreset 强制注入的 COC 机制条目 id —— 注入前先剔除同 id，避免与双人成行潜在重名冲突。 */
const INJECTED_IDS = new Set(['coc_kp_system', 'formatInstruction', 'postHistoryInstructions']);

/**
 * 双人成行原生「🚒// COT //推剧情」条目 id（DS 版 / 向斜阳版各一）。
 * 二者都在作者预设里默认关闭，但其 cot 思考主体（思考模式）始终 getvar 推进变量
 * （DS=推剧情 / XY=cot_plot_push），关着就渲染为空、剧情推进框架从不生效。
 * COC 要求每回合实质推进剧情，故强制开启，让推进由这套双人成行原生 cot 接管，
 * COC format-instruction 不再重复硬约束（避免双份推进指令）。
 */
// 双人成行原生「🚒// COT //推剧情」条目（DS/向斜阳两版 name 相同、id 不同），作者默认关，
// 其 cot 思考主体始终 getvar 推进变量、关着就渲染为空。COC 每回合须实质推进，故强制开。
const PLOT_PUSH_NAMES = new Set(['🚒// COT //推剧情']);

// 按名字关掉的两类（DS版/向斜阳版 id 不同，故用名字匹配，两版通用）：
// ① 美化结构/前端生成——与 COC JSON 双页冲突；② NSFW。
const KILL_NAME = /Core|输出格式|锋芒|前端|视觉交互|日期卡片|顶部日期|小剧场|快捷回复|播放器|状态面板|htm1|自定义前端|变量更新强调|大总结|防掉格式/;
const NSFW_NAME = /🔞|🐬|🥵|色情|官能凝视|H特化|腿部特化|足部特化|性器特化|臀部特化|胸部特化|脸部特化|反差特化|启用特化|语气符号/;

// 洛夫克拉夫特文风条目 name；默认文风即它。
export const LOVECRAFT_NAME = '洛夫克拉夫特文风';
// 文风库（菜单 exclusive 组）所有选项的 name。文风全库单选：仅这些条目参与
// 「默认只开洛夫克拉夫特、其余关」。按 name 匹配（两版 name 相同）。
const STYLE_NAMES = new Set<string>(
  (FUSION_MENU.find((g) => g.exclusive)?.subs ?? [])
    .flatMap((s) => s.options)
    .map((o) => o.name),
);

/**
 * 把「双人成行 V6.1」SillyTavern 预设融合为本项目的 COC 守秘人预设。
 *
 * - 解析双人成行全部条目（importPresetFromST）。
 * - 条目开关以 ST JSON 自带的 prompt_order.enabled 为基础，再叠加规则：lib_ 缓存条目关、
 *   使用指南关、KILL_NAME 美化结构/前端关、NSFW 关、文风库整组单选（仅洛夫克拉夫特开）、
 *   main 主人设强制开、推剧情 cot（PLOT_PUSH_NAMES）强制开。
 * - 强制注入并置顶 COC 机制命脉：守秘人主指令（order 最前）、formatInstruction marker、
 *   JSON 双页提醒 postHistoryInstructions（order 最后）——保证无论双人成行多复杂，COC 的
 *   结构化输出契约始终注入。
 * - 套用 DeepSeek 友好采样参数。
 *
 * 失败（JSON 非法）返回 null。
 */
export function buildFusionPreset(stJson: string, presetId: string, presetName: string): ChatPreset | null {
  const imported = importPresetFromST(stJson, presetName);
  if (!imported) return null;
  const base = imported.preset;

  // 1) 应用默认 enabled：分类表优先；模型专属强制关；library 缓存默认关。
  const tuned: PromptItem[] = base.promptItems
    .filter((p) => !INJECTED_IDS.has(p.id)) // 剔除可能与注入项重名的条目，下面统一注入
    .map((p) => {
      let enabled = p.enabled; // 以作者原始组合为基础
      if (p.id.startsWith('lib_')) enabled = false; // 不在 prompt_order 的缓存项
      if (/使用指南/.test(p.name)) enabled = false; // 使用指南仅作说明,不参与生成
      if (KILL_NAME.test(p.name)) enabled = false; // 美化结构/前端生成,与 COC JSON 冲突
      if (NSFW_NAME.test(p.name)) enabled = false; // NSFW
      // 文风全库单选：仅文风库（exclusive 组）的条目参与，默认仅洛夫克拉夫特开、其余关。
      if (STYLE_NAMES.has(p.name)) enabled = p.name === LOVECRAFT_NAME;
      if (p.id === 'main') enabled = true; // 双人成行核心人设(Atri&Deach)默认开启（与 COC 守秘人共存）
      if (PLOT_PUSH_NAMES.has(p.name)) enabled = true; // 强制开启双人成行原生剧情推进 cot（作者默认关）
      return { ...p, enabled };
    });

  // 2) 注入 COC 机制命脉条目。
  const cocSystem: PromptItem = {
    id: 'coc_kp_system', name: 'COC 守秘人主指令', role: 'system', trigger: [],
    position: 'relative', depth: 0, order: -1000, content: COC_KP_PRESET.systemPrompt,
    enabled: true, kind: 'marker', readOnly: true,
  };
  const formatMarker: PromptItem = {
    id: 'formatInstruction', name: 'Format Instruction', role: 'system', trigger: [],
    position: 'relative', depth: 0, order: -999, content: '', enabled: true, kind: 'marker',
  };
  const cocPostHistory = COC_KP_PRESET.promptItems.find((p) => p.id === 'postHistoryInstructions');
  const postMarker: PromptItem = {
    id: 'postHistoryInstructions', name: 'Post-History Instructions（JSON 双页提醒）', role: 'system',
    trigger: [], position: 'relative', depth: 0, order: 100000,
    content: cocPostHistory?.content ?? '', enabled: true, kind: 'marker',
  };

  // assemblePrompt 内部按 order 排序：守秘人指令 + FORMAT 置顶，双人成行内容居中，JSON 提醒置底。
  const promptItems = [cocSystem, formatMarker, ...tuned, postMarker];

  // 3) DeepSeek 采样参数 + 固定身份。
  return {
    ...base,
    id: presetId,
    name: presetName,
    temperature: FUSION_SAMPLERS.temperature,
    topP: FUSION_SAMPLERS.topP,
    topK: FUSION_SAMPLERS.topK,
    frequencyPenalty: FUSION_SAMPLERS.frequencyPenalty,
    presencePenalty: FUSION_SAMPLERS.presencePenalty,
    maxTokens: FUSION_SAMPLERS.maxTokens,
    maxResponseTokens: FUSION_SAMPLERS.maxTokens,
    promptItems,
  };
}
