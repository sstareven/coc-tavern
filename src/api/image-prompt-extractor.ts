// 图像 prompt 提取子调用(2026-06-08):
// 现状问题:当前 image prompt 模板只塞了 LLM 输出的 location/time/weather/characters
// (中文)+ 风格 tokens(英文)。NovelAI / SD 看不懂中文 → 生成"通用场景图",脱离剧情。
//
// 修复方向:跑一次轻量 LLM 子调用,把当页正文叙事 + 场景信息 → 英文 prompt:
// - NovelAI → Danbooru tag 风格(逗号分隔短 tag)
// - 其他模型(SD / OpenAI / chat-completions)→ 自然语言短句
//
// 失败 fail-open(返回 null),trigger 层 fall back 到原模板渲染结果。

import { callDsSubagent, type DsSubagentRequest } from '../sillytavern/subagent-call';

export interface ImagePromptExtractInput {
  /** 当页正文叙事(BookPage.leftContent),中文。最长截前 800 字喂给 LLM。 */
  leftContent: string;
  /** sceneInfo.location/time/weather(可空)。 */
  location?: string;
  time?: string;
  weather?: string;
  /** 在场重要 NPC 中文名,前 3 个。 */
  characters?: string[];
  /** 调查员当前 SAN(可空,用于氛围调度)。 */
  san?: number;
  /** 协议层标志:决定输出格式(Danbooru tag vs 自然语言短句)。 */
  isNovelAi: boolean;
  /** NovelAI V4/V4.5(影响 prompt 是否能用 character_prompts 嵌套,但本子调用只出顶层 hint)。 */
  isV4: boolean;
  /** characters_outfit 中文串(如「张三(灰大衣)」),非空时 LLM 顺便翻成英文。 */
  charactersOutfit?: string;
}

export interface ImagePromptExtractLlmConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  extraParams?: string;
  signal?: AbortSignal;
}

/** extractImagePromptHint 返回结构:prompt 必填,charactersOutfitEn 可选。 */
export interface ImagePromptExtractResult {
  prompt: string;
  charactersOutfitEn?: string;
}

/** NovelAI 友好的 Danbooru tag 输出指令(英文,全文都让 LLM 看英文以减少误解)。 */
const SYSTEM_NOVELAI = [
  'Your task: convert the player narrative below into a NovelAI-friendly image prompt.',
  '',
  'Output rules:',
  '1. English only. NO Chinese characters in the output.',
  '2. Danbooru-style: comma-separated short tags (e.g. "1girl, looking at viewer, dimly lit room, holding old book, candlelight, sepia, period dress").',
  '3. Describe what is visually happening in this scene: character pose, expression, action, key props, environmental atmosphere.',
  '4. Do NOT add meta-quality tags like "masterpiece, best quality, very aesthetic, absurdres" — the caller will append those.',
  '5. Do NOT add style tags like "anime style", the caller will handle style.',
  '6. Keep it 20-60 tags. Concise. No prose.',
  '7. Output ONLY a JSON object: {"prompt": "tag1, tag2, ..."}',
].join('\n');

/** 通用模型(SD/OpenAI/chat-completions)用自然语言短句指令。 */
const SYSTEM_GENERAL = [
  'Your task: convert the player narrative below into an English image-generation prompt.',
  '',
  'Output rules:',
  '1. English only. NO Chinese characters in the output.',
  '2. Natural-language short sentences (1-3 sentences).',
  '3. Describe what is visually happening: character pose, expression, action, key props, environmental atmosphere, lighting.',
  '4. Do NOT add meta-quality tags like "masterpiece, best quality", the caller will append them.',
  '5. Do NOT add style tags, the caller will handle style.',
  '6. Output ONLY a JSON object: {"prompt": "sentence."}',
].join('\n');

/** outfit 翻译指令:拼到 SYSTEM_NOVELAI / SYSTEM_GENERAL 末尾,告诉 LLM 顺便翻译 outfit 中文串。
 *  charactersOutfit 为空时让 LLM 省略 charactersOutfitEn 字段(parsed 解析后 trim 检查)。 */
const OUTFIT_TRANSLATION_SUFFIX = [
  '',
  'If the user payload contains "Characters with outfit (zh):", also translate it into a single English Danbooru-style or natural-language fragment',
  'describing each character\'s visible outfit and held items. Put the result in a "charactersOutfitEn" field next to "prompt".',
  'Examples: "a man in gray wool coat holding a revolver, a nurse in white uniform with an oil lantern".',
  '',
  'Output JSON: {"prompt":"...", "charactersOutfitEn":"..."} — charactersOutfitEn 可省略(没传入时)。',
].join('\n');

/** 按协议自动判定是否需要跑 LLM 子调用提取英文 image prompt:
 *  - 'chat-completions'(Gemini / nano-banana 假流式中转)→ 不需要,Gemini 系原生支持中文叙事
 *  - 其他协议(novelai / sd-compat / openai-strict / gpt-image-1 / pollinations)→ 需要,
 *    SD/NovelAI 是英文 only 训练,DALL-E/GPT-image-1 也是英文效果显著更好
 *  - 'auto' / '' / 未识别 → 按需要处理(保守开启)
 *
 *  本函数纯逻辑、不依赖 store/网络,可独立单测。 */
export function needsLlmEnglishHint(protocol: string | undefined): boolean {
  if (protocol === 'chat-completions') return false;
  return true;
}

function buildUserPayload(input: ImagePromptExtractInput): string {
  const lines: string[] = [];
  if (input.location) lines.push(`Scene location: ${input.location}`);
  if (input.time) lines.push(`Time of day: ${input.time}`);
  if (input.weather) lines.push(`Weather: ${input.weather}`);
  if (input.characters && input.characters.length > 0) {
    lines.push(`Present important characters: ${input.characters.slice(0, 3).join(', ')}`);
  }
  if (input.charactersOutfit && input.charactersOutfit.trim()) {
    lines.push(`Characters with outfit (zh): ${input.charactersOutfit.trim()}`);
  }
  if (input.san !== undefined) lines.push(`Investigator SAN: ${input.san}`);
  // 正文截前 800 字(中文按字符计) — 避免 token 暴涨
  const narrative = (input.leftContent ?? '').slice(0, 800).trim();
  lines.push('', 'Narrative (translate the visible content into the image prompt):', narrative);
  return lines.join('\n');
}

/** 抽取一行可用的英文 image prompt(以及可选的 charactersOutfitEn 英文 outfit 串)。失败返 null(fail-open)。 */
export async function extractImagePromptHint(
  input: ImagePromptExtractInput,
  llmConfig: ImagePromptExtractLlmConfig,
): Promise<ImagePromptExtractResult | null> {
  if (!llmConfig.apiBaseUrl || !llmConfig.apiKey || !llmConfig.model) return null;
  if (!input.leftContent || !input.leftContent.trim()) return null;

  const system = (input.isNovelAi ? SYSTEM_NOVELAI : SYSTEM_GENERAL) + OUTFIT_TRANSLATION_SUFFIX;
  const user = buildUserPayload(input);

  const req: DsSubagentRequest = {
    apiBaseUrl: llmConfig.apiBaseUrl,
    apiKey: llmConfig.apiKey,
    model: llmConfig.model,
    extraParams: llmConfig.extraParams,
    signal: llmConfig.signal,
    label: 'image-prompt-extract',
    temperature: 0.7,
    maxTokens: 600,
    rpmLane: 'main',
    jsonObject: true,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  try {
    const resp = await callDsSubagent(req);
    const parsed = resp.parsed as { prompt?: string; charactersOutfitEn?: string } | null;
    if (!parsed || typeof parsed.prompt !== 'string' || !parsed.prompt.trim()) return null;
    const out: ImagePromptExtractResult = { prompt: parsed.prompt.trim() };
    if (typeof parsed.charactersOutfitEn === 'string' && parsed.charactersOutfitEn.trim()) {
      out.charactersOutfitEn = parsed.charactersOutfitEn.trim();
    }
    return out;
  } catch {
    return null;
  }
}
