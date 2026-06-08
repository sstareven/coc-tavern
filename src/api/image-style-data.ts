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

/** 默认正向 prompt 模板。占位符 {{location}}/{{time}}/{{weather}}/{{characters}}/{{san}} 会被运行时替换。
 *  {{style_anchors}} 在 resolveImageGen 末段拼接 styleAnchors 数组。 */
export const DEFAULT_PROMPT_TEMPLATE =
  '{{style}}, {{location}}, {{time}}, {{weather}}, {{characters}}, {{style_anchors}}, masterpiece, best quality, detailed';

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
