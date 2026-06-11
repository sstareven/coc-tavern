// ===== Default Cliche Cleaner Rules =====
// 7 rule groups adapted from Gemini anti-八股 reference.
// COC-appropriate only (no NSFW groups).

import type { CleanerRuleGroup } from './cliche-cleaner-engine';

export const DEFAULT_CLEANER_RULES: CleanerRuleGroup[] = [
  // ── GROUP 1: 形副词系 ──────────────────────────────────
  {
    name: '形副词系',
    enabled: true,
    subRules: [
      {
        targets: ['{几不,微不}{可查,可察,可闻}{的,地}'],
        replacements: [],
        mode: 'simple',
        remark: '删绝对/模糊修饰: 几不可查的 etc.',
      },
      {
        targets: ['{粗糙,逼仄,戏谑,狡黠,玩味,餍足,旖旎,甜腻,黏腻,低哑,喑哑,沙哑,嘶哑,微哑}{的,地}'],
        replacements: [],
        mode: 'simple',
        remark: '删模板形容词: 粗糙的、狡黠地 etc.',
      },
      {
        targets: ['{谄媚,讨好,虔诚,狂热,崩溃,绝望,病态,空洞,麻木,木讷,笨拙,僵硬,机械,毫无生气}{的,地}'],
        replacements: [],
        mode: 'simple',
        remark: '删状态修饰: 谄媚的、绝望地 etc.',
      },
      {
        targets: ['{惊人,灭顶,细若蚊蝇,不似人声,似有似无,若有若无,铺天盖地}{般,}{的,地}'],
        replacements: [],
        mode: 'simple',
        remark: '删夸张比拟: 惊人般的、灭顶的 etc.',
      },
      {
        targets: ['{极其,极度,极致,死死,紧紧,深深,浅浅,微微,完全,彻底,格外,突然,忽然,近乎,下意识,不自觉}{的,地}?'],
        replacements: [],
        mode: 'simple',
        remark: '删低信息量程度词: 极其的、微微地、突然 etc.',
      },
    ],
  },

  // ── GROUP 2: 形副量词 ──────────────────────────────────
  {
    name: '形副量词',
    enabled: true,
    subRules: [
      {
        targets: ['一丝(?!不[挂苟])'],
        replacements: [],
        mode: 'regex',
        remark: '删模糊量词"一丝"(保留"一丝不挂""一丝不苟")',
      },
      {
        targets: ['(?:[布长带生][满有着]|满是)[薄老厚]茧的'],
        replacements: [],
        mode: 'regex',
        remark: '删手茧模板: 布满薄茧的、长满老茧的 etc.',
      },
    ],
  },

  // ── GROUP 3: 人体词汇 ──────────────────────────────────
  {
    name: '人体词汇',
    enabled: true,
    subRules: [
      {
        targets: ['头颅'],
        replacements: ['头'],
        mode: 'text',
        remark: '头颅 → 头',
      },
      {
        targets: ['脊背', '背脊'],
        replacements: ['背'],
        mode: 'text',
        remark: '脊背/背脊 → 背',
      },
      {
        targets: ['躯体', '身躯'],
        replacements: ['身体'],
        mode: 'text',
        remark: '躯体/身躯 → 身体',
      },
      {
        targets: ['四肢百骸'],
        replacements: ['全身'],
        mode: 'text',
        remark: '四肢百骸 → 全身',
      },
      {
        targets: ['肩胛骨'],
        replacements: ['肩膀'],
        mode: 'text',
        remark: '肩胛骨 → 肩膀',
      },
      {
        targets: ['指骨'],
        replacements: ['手指'],
        mode: 'text',
        remark: '指骨 → 手指',
      },
      {
        targets: ['肌理'],
        replacements: ['肌肉'],
        mode: 'text',
        remark: '肌理 → 肌肉',
      },
    ],
  },

  // ── GROUP 4: 删陈词滥调 ────────────────────────────────
  {
    name: '删陈词滥调',
    enabled: true,
    subRules: [
      {
        targets: ['嘴角[不]?[自]?[觉]?(?:勾起|扬起|弯起|上扬|微微上扬|勾出|噙着|挂着|浮起|泛起)(?:一[抹丝个])?(?:[淡浅苦涩玩味讥讽冷]*)?(?:的)?(?:弧度|笑意|微笑|笑容|笑|弧线)'],
        replacements: ['笑了一下'],
        mode: 'regex',
        remark: '嘴角弧度套话 -> 笑了一下',
      },
      {
        targets: ['声音格外清晰', '声音格外突兀'],
        replacements: [],
        mode: 'text',
        remark: '删"声音格外清晰/突兀"',
      },
      {
        targets: ['粗糙的指腹', '掌心干燥温热', '冰凉的触感'],
        replacements: [],
        mode: 'text',
        remark: '删触感模板: 粗糙的指腹、掌心干燥温热、冰凉的触感',
      },
    ],
  },

  // ── GROUP 5: 修剪比喻类 ────────────────────────────────
  {
    name: '修剪比喻类',
    enabled: true,
    subRules: [
      {
        targets: ['(?:[，,](?:[好就]?像|仿佛|如[若同]|[宛犹][如若]))[\\u4e00-\\u9fff]*(?=。)'],
        replacements: [],
        mode: 'regex',
        remark: '删句尾比喻: ，仿佛XXX。 → 。',
      },
      {
        targets: ['[，,]?像[\\u4e00-\\u9fff]*?(?:似的|一般|一样)'],
        replacements: [],
        mode: 'regex',
        remark: '删插入式比喻壳: 像...似的/一般/一样',
      },
    ],
  },

  // ── GROUP 6: 修剪复合句 ────────────────────────────────
  {
    name: '修剪复合句',
    enabled: true,
    subRules: [
      {
        targets: ['并没有[\\u4e00-\\u9fff]{1,8}[，,]而是'],
        replacements: [],
        mode: 'regex',
        remark: '"并没有X，而是" → 删除(保留后续主句)',
      },
      {
        targets: ['不是[\\u4e00-\\u9fff]{1,8}[，,]而是'],
        replacements: ['是'],
        mode: 'regex',
        remark: '"不是X，而是" → "是"',
      },
      {
        targets: ['平日里'],
        replacements: [],
        mode: 'text',
        remark: '删"平日里"',
      },
    ],
  },

  // ── GROUP 7: 连续符号去重 ──────────────────────────────
  {
    name: '连续符号去重',
    enabled: true,
    subRules: [
      {
        targets: ['([,，。!！?？])\\1+'],
        replacements: ['$1'],
        mode: 'regex',
        remark: '重复标点去重: ？？？ → ？',
      },
      {
        targets: ['[…]{2,}'],
        replacements: ['……'],
        mode: 'regex',
        remark: '多余省略号: ………… → ……',
      },
      {
        targets: ['。{3,}'],
        replacements: ['……'],
        mode: 'regex',
        remark: '句号省略号: 。。。 → ……',
      },
      {
        targets: ['——{2,}'],
        replacements: ['——'],
        mode: 'regex',
        remark: '多余破折号: ———— → ——',
      },
    ],
  },
];
