/**
 * COC7e 神话典籍目录 — 8 本著名克苏鲁神话禁书的数据与查阅工具。
 * 纯数据/纯逻辑，不依赖 React / Zustand。
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CocTome {
  /** 中文典籍名 */
  name: string;
  /** 原文语言 */
  language: string;
  /** 通读所需周数 */
  readingWeeks: number;
  /** 初次阅读 SAN 损失（骰子表达式） */
  initialSanLoss: string;
  /** 完整阅读 SAN 损失（骰子表达式） */
  fullSanLoss: string;
  /** 完整阅读后克苏鲁神话技能增长 */
  mythosGain: number;
  /** 典籍中包含的法术（留空表示未列出） */
  spellsContained: string[];
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

export const COC_TOMES: readonly CocTome[] = [
  {
    name: '死灵之书',
    language: '拉丁语',
    readingWeeks: 36,
    initialSanLoss: '1D6',
    fullSanLoss: '2D10',
    mythosGain: 15,
    spellsContained: [],
  },
  {
    name: '黄衣之王',
    language: '法语',
    readingWeeks: 2,
    initialSanLoss: '1D3',
    fullSanLoss: '2D6',
    mythosGain: 5,
    spellsContained: [],
  },
  {
    name: '食尸鬼教典',
    language: '英语',
    readingWeeks: 4,
    initialSanLoss: '1D4',
    fullSanLoss: '2D6',
    mythosGain: 9,
    spellsContained: [],
  },
  {
    name: '艾本之书',
    language: '拉丁语',
    readingWeeks: 24,
    initialSanLoss: '1D4',
    fullSanLoss: '2D8',
    mythosGain: 11,
    spellsContained: [],
  },
  {
    name: '水神克塔亚特',
    language: '英语',
    readingWeeks: 8,
    initialSanLoss: '1D3',
    fullSanLoss: '1D8',
    mythosGain: 7,
    spellsContained: [],
  },
  {
    name: '塞拉伊诺断章',
    language: '英语',
    readingWeeks: 6,
    initialSanLoss: '1D3',
    fullSanLoss: '1D6',
    mythosGain: 5,
    spellsContained: [],
  },
  {
    name: '梦境秘典',
    language: '英语',
    readingWeeks: 10,
    initialSanLoss: '1D4',
    fullSanLoss: '2D6',
    mythosGain: 8,
    spellsContained: [],
  },
  {
    name: '无名邪教',
    language: '德语',
    readingWeeks: 8,
    initialSanLoss: '1D4',
    fullSanLoss: '2D6',
    mythosGain: 9,
    spellsContained: [],
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** 按名称查找典籍（支持模糊前缀匹配，如「死灵」→「死灵之书」）。 */
export function findTome(name: string): CocTome | undefined {
  const trimmed = name.trim();
  return (
    COC_TOMES.find((t) => t.name === trimmed) ??
    COC_TOMES.find((t) => t.name.startsWith(trimmed) || trimmed.startsWith(t.name))
  );
}

/**
 * 计算阅读进度百分比（0-100），clamp 到 [0, 100]。
 * @param weeksSpent 已投入周数
 * @param totalWeeks 通读所需总周数
 */
export function readingProgress(weeksSpent: number, totalWeeks: number): number {
  if (totalWeeks <= 0) return 100;
  if (weeksSpent <= 0) return 0;
  return Math.min(100, Math.round((weeksSpent / totalWeeks) * 100));
}

/**
 * 生成供 LLM 注入的典籍目录摘要文本。
 * 每行格式：「《名》(语言, N周) 初阅SAN:X / 通读SAN:Y / 神话+Z」
 */
export function buildTomeCatalogSummary(): string {
  const lines = COC_TOMES.map(
    (t) =>
      `《${t.name}》(${t.language}, ${t.readingWeeks}周) 初阅SAN:${t.initialSanLoss} / 通读SAN:${t.fullSanLoss} / 神话+${t.mythosGain}`,
  );
  return '【神话典籍目录】\n' + lines.join('\n');
}
