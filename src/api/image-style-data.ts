// 文生图风格数据(纯数据,无逻辑)。
// 10 种风格预设 → SD prompt 片段映射 + 默认负面 prompt + 默认正向模板。
// 设计目标:让玩家不用懂 SD prompt 也能拿到剧本风格符合的图;剧本作者只选风格 key 即可。

import type { ScenarioImageStyle } from '../types/scenario';

/** 每种风格对应的 SD prompt 片段(英文 — SD 模型对英文响应远好于中文)。 */
export const IMAGE_STYLE_PROMPTS: Record<ScenarioImageStyle, string> = {
  vintage_photo: '1920s vintage photograph, sepia tone, soft film grain, dim gas-lamp lighting, faded photo album texture, cracked emulsion edges, antique daguerreotype quality, period-accurate costume, melancholic atmosphere, low contrast, muted earth tones',
  oil_painting: 'classical oil painting, thick impasto brushstrokes, dramatic chiaroscuro, baroque composition, varnished canvas texture, deep umber and ochre palette, Rembrandt lighting, museum quality',
  ink_wash: 'traditional Chinese ink wash painting, sumi-e style, monochrome black ink on rice paper, calligraphic brushwork, misty atmospheric perspective, negative space composition, minimalist, meditative',
  watercolor: 'soft watercolor illustration, wet-on-wet technique, pastel washes, bleeding pigments, paper grain visible, dreamlike soft edges, gentle gradients, luminous translucency',
  engraving: 'antique copperplate engraving, fine cross-hatching, monochrome black and white, woodcut illustration style, medieval manuscript marginalia, parchment texture, intricate linework, scholarly atmosphere',
  cinematic: 'cinematic still, anamorphic lens flare, shallow depth of field, dramatic key light with deep shadow, color grading teal and orange, 2.35:1 widescreen composition, film noir mood',
  sepia_film: 'sepia-toned vintage film still, faded photograph, light leak, soft focus, dust and scratches overlay, 1880s nostalgic tone, Victorian era atmosphere',
  photoreal: 'photorealistic, high detail, natural lighting, professional photography, sharp focus, true-to-life colors, 35mm film camera',
  anime: 'anime illustration, cel shading, vibrant colors, expressive lineart, key visual style, Studio Ghibli inspired',
  custom: '', // custom 走 stylePromptOverride,本字段空
};

/** NovelAI 专属风格 prompt 片段(Danbooru tag 风格)。
 *  原因:NovelAI 基于 SDXL 的 Danbooru 动漫专用模型,训练数据没有"1920 复古胶片"这种语义。
 *  SD 通用 tokens 里的 "faded photo album texture / cracked emulsion edges / parchment texture"
 *  在 NovelAI 上会被当主体画成纸张/纹理特写,场景与人物消失。改成 Danbooru 习惯的
 *  逗号分隔短 tag,只保留氛围/时代/服饰描述,不带"texture/cracked/faded"等纹理类词。 */
export const IMAGE_STYLE_PROMPTS_NOVELAI: Record<ScenarioImageStyle, string> = {
  vintage_photo: '1920s, art deco, vintage atmosphere, period dress, sepia tone, soft lighting, scenic background, detailed background, atmospheric',
  oil_painting: 'oil painting (medium), painterly, classical art style, dramatic lighting, detailed background, scenic',
  ink_wash: 'sumi-e, traditional media, monochrome, ink wash, minimalist, atmospheric, scenic',
  watercolor: 'watercolor (medium), traditional media, soft colors, pastel, dreamy, scenic background',
  engraving: 'monochrome, lineart, detailed background, classical, scenic',
  cinematic: 'cinematic, dramatic lighting, scenic, detailed background, depth of field, atmospheric',
  sepia_film: 'sepia, vintage atmosphere, soft focus, period dress, scenic, atmospheric',
  photoreal: 'realistic, photorealistic, detailed background, natural lighting, scenic',
  anime: 'anime style, vibrant, detailed background, scenic, atmospheric',
  custom: '',
};

/** 风格显示名(中文,UI 标签用)。 */
export const IMAGE_STYLE_LABELS: Record<ScenarioImageStyle, string> = {
  vintage_photo: '1920 复古胶片',
  oil_painting: '古典油画',
  ink_wash: '水墨',
  watercolor: '水彩',
  engraving: '铜版画',
  cinematic: '电影摄影',
  sepia_film: '怀旧胶片',
  photoreal: '写实',
  anime: '动漫',
  custom: '自定义',
};

/** 默认负面 prompt(常见 SD 不希望出现的瑕疵)。 */
export const DEFAULT_NEGATIVE_PROMPT =
  'lowres, blurry, watermark, signature, text, error, jpeg artifacts, worst quality, low quality, normal quality, extra fingers, bad anatomy, modern phone, neon sign, plastic, cgi, deformed, oversaturated, overexposed';

/** NovelAI 专属负面 prompt(Danbooru 风格 + NovelAI 推荐 ucPreset 0 配套词)。
 *  关键差异:NovelAI 训练集对 'displeasing/worst quality' 等专门负面 tag 极敏感;
 *  加 'comic, photo, monochrome' 显式禁止纸张/纹理特写主体;加 'bad hands/missing fingers'
 *  这种 Danbooru 风格的解剖学瑕疵词,匹配模型语义。 */
export const DEFAULT_NEGATIVE_PROMPT_NOVELAI =
  'lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, displeasing, comic, photo, monochrome, paper texture, film grain, scratches';

/** 默认正向 prompt 模板。占位符 {{location}}/{{time}}/{{weather}}/{{characters}}/{{san}} 会被运行时替换。
 *  {{style_anchors}} 在 resolveImageGen 末段拼接 styleAnchors 数组。 */
export const DEFAULT_PROMPT_TEMPLATE =
  '{{style}}, {{location}}, {{time}}, {{weather}}, {{characters}}, {{style_anchors}}, masterpiece, best quality, detailed';

/** NovelAI 专属正向 prompt 模板(支持 EJS 条件)。
 *  顺序:主体(characters/location)前置 + 风格在后 — Danbooru 习惯把主体 tag 放前面;
 *  EJS 条件:
 *    · {{characters}}/{{location}}/{{weather}} 字段空时不输出空逗号占位
 *    · V4/V4.5(isV4)末尾加 'very aesthetic, absurdres'(NovelAI 标准 V4 质量 tag)
 *    · V3 末尾加 'best quality, amazing quality'(NovelAI 标准 V3 质量 tag)
 *    · scene_brief(LLM 输出的中文场景简述)放进 v4_prompt 也只在 isV4 时附加。 */
export const DEFAULT_PROMPT_TEMPLATE_NOVELAI =
  '<% if (characters) { %>{{characters}}, <% } %>'
  + '<% if (location) { %>{{location}}, <% } %>'
  + '<% if (time) { %>{{time}}, <% } %>'
  + '<% if (weather) { %>{{weather}}, <% } %>'
  + '{{style}}'
  + '<% if (style_anchors) { %>, {{style_anchors}}<% } %>'
  + ', detailed background, scenic, '
  + '<% if (isV4) { %>masterpiece, best quality, very aesthetic, absurdres<% } else { %>best quality, amazing quality<% } %>';

/** 默认像素 832x224(SD 8 倍数友好,接近 7.43:2 横幅,UI 显示用 834x227 aspectRatio 自适应)。 */
export const DEFAULT_IMAGE_WIDTH = 832;
export const DEFAULT_IMAGE_HEIGHT = 224;
export const DEFAULT_IMAGE_STEPS = 24;
export const DEFAULT_IMAGE_CFG_SCALE = 5;
export const DEFAULT_IMAGE_SAMPLER = 'DPM++ 2M Karras';

/** UI 提供的 sampler 候选(SD WebUI/Comfy 主流采样器,中转站普遍支持)。 */
export const SAMPLER_OPTIONS: { value: string; label: string }[] = [
  { value: 'DPM++ 2M Karras', label: 'DPM++ 2M Karras' },
  { value: 'DPM++ SDE Karras', label: 'DPM++ SDE Karras' },
  { value: 'Euler a', label: 'Euler a' },
  { value: 'Euler', label: 'Euler' },
  { value: 'DDIM', label: 'DDIM' },
  { value: 'UniPC', label: 'UniPC' },
  { value: 'LMS', label: 'LMS' },
];
