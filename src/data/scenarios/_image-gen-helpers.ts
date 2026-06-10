// 内置剧本生图预设(2026-06-10)。每本剧本在 imageGen 字段挂一份预设,让左页插画
// 强行带上世界化前缀 + 时代锚定 + 针对性负面禁词,避免"木卫二剧本画出田园木屋"
// 这种穿帮。
//
// 三层 merge(image-gen-merge.ts):settings.imageDefaults 基线 → scn.imageGen 覆盖
// → 运行时 ImageRenderContext。这里只填覆盖层,玩家在 ImageGenTab 仍可继续覆写。
//
// 模板设计:
//   · 世界前缀放在 prompt 头部(token 权重最高),把"哪个时代/哪个地点/什么质感"
//     先于具体 location 锁住主体。
//   · NovelAI 路径优先用 image_hint(LLM 子调用产出的英文 Danbooru tag);SD/OpenAI
//     路径走中文 ctx(characters/location/time/weather)。EJS 条件用 isNovelAi/isV4。
//   · 风格 token({{style}}) 与风格锚定({{style_anchors}}) 拼在主体后,最后接质量 tag。

import type { ScenarioImageGen } from '../../types/scenario';

/** 构造一份带世界化前缀的 promptTemplate,兼容 SD / NovelAI / OpenAI 三路径。 */
function makeScenarioPrompt(worldPrefix: string): string {
  return (
    `${worldPrefix}, `
    + '<% if (isNovelAi && image_hint) { %>{{image_hint}}, <% } else { %>'
    + '<% if (characters) { %>{{characters}}, <% } %>'
    + '<% if (location) { %>{{location}}, <% } %>'
    + '<% if (time) { %>{{time}}, <% } %>'
    + '<% if (weather) { %>{{weather}}, <% } %>'
    + '<% } %>'
    + '{{style}}'
    + '<% if (style_anchors) { %>, {{style_anchors}}<% } %>'
    + ', '
    + '<% if (isNovelAi && isV4) { %>masterpiece, best quality, very aesthetic, absurdres'
    + '<% } else if (isNovelAi) { %>best quality, amazing quality'
    + '<% } else { %>masterpiece, best quality, detailed<% } %>'
  );
}

/** 9 本内置剧本的生图预设。key = ScenarioDoc.id。 */
export const IMAGE_GEN_PRESETS: Record<string, ScenarioImageGen> = {
  // 自由探索 — 1920 马萨诸塞,雾色未散
  '__free': {
    style: 'vintage_photo',
    promptTemplate: makeScenarioPrompt(
      '1920s Massachusetts, autumn fog, weathered New England coastline, sepia-tinged daylight',
    ),
    styleAnchors: [
      'period 1920s attire',
      'sepia toned',
      'film grain',
      'fog-shrouded coast',
      'overcast diffuse light',
    ],
    negativePromptAppend:
      'modern car, smartphone, neon sign, skyscraper, plastic, anime, cyberpunk, contemporary fashion',
  },

  // 罗马阴影 — 罗马帝国,军团 / 阿庇亚大道
  'sc-rome-cthulhu': {
    style: 'oil_painting',
    promptTemplate: makeScenarioPrompt(
      'ancient Roman Empire 1st century BC, marble columns, legion standards, mediterranean light, classical antiquity',
    ),
    styleAnchors: [
      'classical roman attire',
      'toga and lorica segmentata',
      'fresco palette',
      'historical oil epic',
      'amber dust light',
    ],
    negativePromptAppend:
      'modern clothing, firearms, gothic cathedral, victorian gas lamp, skyscraper, neon, smartphone, anime, medieval plate armor, samurai',
  },

  // 黑暗时代 — 中世纪修道院 / 羊皮书
  'sc-dark-ages': {
    style: 'oil_painting',
    promptTemplate: makeScenarioPrompt(
      'medieval Europe 9th century, candlelit monastery interior, gothic stone arches, vellum manuscripts, illuminated tapestry tone',
    ),
    styleAnchors: [
      'medieval monk habit',
      'tonsured cleric',
      'chiaroscuro candlelight',
      'gold-leaf illumination',
      'romanesque stone architecture',
    ],
    negativePromptAppend:
      'firearms, victorian gas lamp, skyscraper, modern clothing, neon, smartphone, anime, hard sci-fi, full plate armor, samurai, asian temple',
  },

  // 萨迦冰岛 — 维京 / 峡湾 / 长船
  'sc-mystic-iceland': {
    style: 'engraving',
    promptTemplate: makeScenarioPrompt(
      'viking age Iceland, dramatic fjord landscape, longship harbor, runestones, harsh nordic light, sagas era',
    ),
    styleAnchors: [
      'nordic carved wood',
      'wool tunic and fur cloak',
      'rough hewn timber halls',
      'cold blue-grey palette',
      'overcast salt-spray sky',
    ],
    negativePromptAppend:
      'medieval plate armor, firearms, gothic cathedral, sandstone temple, asian architecture, modern clothing, skyscraper, neon, anime',
  },

  // 古战阵 — 泛西方古典战阵
  'sc-blade-and-arrow': {
    style: 'oil_painting',
    promptTemplate: makeScenarioPrompt(
      'pre-gunpowder pitched battle, war camp at dusk, ridge silhouettes, spears bows shields, classical military epic',
    ),
    styleAnchors: [
      'classical military epic',
      'banner-strewn ridge',
      'campfire glow on tents',
      'mailed leather hauberk',
      'siege banners',
    ],
    negativePromptAppend:
      'firearms, cannon, gunpowder, modern clothing, futuristic, asian temple, japanese armor, samurai, skyscraper, anime, neon',
  },

  // 雾都阴影 — 维多利亚伦敦 / 白教堂 / 煤气灯
  'sc-gaslight': {
    style: 'engraving',
    promptTemplate: makeScenarioPrompt(
      'Victorian London 1890s, gaslit cobbled streets, Thames fog, Whitechapel district, hansom cabs, soot-stained brick',
    ),
    styleAnchors: [
      'victorian fashion',
      'top hat and frock coat',
      'wet cobblestones',
      'gas lamp glow',
      'sooty brick walls',
      'penny dreadful illustration',
    ],
    negativePromptAppend:
      'modern car, smartphone, neon sign, skyscraper, anime, plastic, denim, t-shirt, leather jacket, hard sci-fi, samurai',
  },

  // 幻梦境 — 洛夫克拉夫特幻梦境
  'sc-dreamlands': {
    style: 'watercolor',
    promptTemplate: makeScenarioPrompt(
      'Lovecraftian Dreamlands, surreal liminal architecture, soft moonlight, pastel mist, oneiric atmosphere, dream-logic geometry',
    ),
    styleAnchors: [
      'ethereal pastel palette',
      'soft watercolor brushwork',
      'floating staircases',
      'impossible perspective',
      'twilight glow',
      'storybook illustration',
    ],
    negativePromptAppend:
      'gore, harsh photoreal grit, modern city, firearms, neon, smartphone, contemporary fashion, anime',
  },

  // 木卫二静默 — 近未来太空 / 木卫二冰下基地
  'sc-icarus': {
    style: 'cinematic',
    promptTemplate: makeScenarioPrompt(
      'Europa subsurface ocean, abyssal research station interior, submersible bulkheads, near-future hard sci-fi, deep blue darkness, biolume hues',
    ),
    styleAnchors: [
      'hard sci-fi',
      'industrial metal corridors',
      'volumetric blue lighting',
      'submersible portholes',
      'ice ceiling above',
      'NASA aesthetic',
    ],
    // 用户明确点名:不能出现"木屋"。这里把田园 / 中世 / 维多利亚 / 奇幻全禁掉。
    negativePromptAppend:
      'wooden cabin, log house, rural village, forest, daylight, blue sky, victorian, candlelight, fireplace, medieval, fantasy, anime, sword, horse, hansom cab, samurai',
  },

  // 末日收割 — 末日废土 / 灰烬覆盖
  'sc-harvest': {
    style: 'sepia_film',
    promptTemplate: makeScenarioPrompt(
      'post-apocalyptic ashfall world, pale sun behind smoke, charcoal sky, nomadic tribal camp, ruined city silhouette in distance',
    ),
    styleAnchors: [
      'grey ash coats everything',
      'desaturated palette',
      'ragged tribal garb',
      'bone and leather accessories',
      'derelict skyscraper silhouette',
      'fog of soot',
    ],
    negativePromptAppend:
      'green lush forest, blue clear sky, neon, modern city, anime, plastic, victorian, fantasy castle, samurai, sunshine, beach',
  },
};
