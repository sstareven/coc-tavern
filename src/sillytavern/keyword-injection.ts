/**
 * 关键词词典注入 — inspired by SillyTavern's world info（混合策略）。
 *
 * 把 LLM 每页产出并累积的关键词（词→释义）按混合策略组织成一段「已知词条」上下文：
 * - 常驻：最近 N 页 page.keywords 合并（保留首见），始终注入。
 * - 匹配：accumulated 累积词典中不在常驻、且当前文本子串命中的老词。
 * 常驻优先截到 maxEntries。无任何条目时返回 ''（调用方据此跳过注入）。
 *
 * 纯计算层：不导入 stores，零副作用。调用方负责切片 recentPages 与提供 accumulated。
 */
import type { BookPage } from '../types';

export function buildKeywordInjection(opts: {
  recentPages: BookPage[];
  accumulated: Record<string, string>;
  scanText: string;
  maxEntries?: number;
}): string {
  const { recentPages, accumulated, scanText, maxEntries = 40 } = opts;

  // 常驻：最近 N 页关键词合并，保留首见（先出现优先）。
  const resident = new Map<string, string>();
  for (const page of recentPages) {
    const kw = page.keywords;
    if (!kw) continue;
    for (const [word, meaning] of Object.entries(kw)) {
      if (word && meaning && !resident.has(word)) resident.set(word, meaning);
    }
  }

  // 匹配：accumulated 中不在常驻、且 scanText 子串命中的老词（中文无词边界，用 includes）。
  const matched = new Map<string, string>();
  for (const [word, meaning] of Object.entries(accumulated)) {
    if (!word || !meaning || resident.has(word)) continue;
    if (scanText.includes(word)) matched.set(word, meaning);
  }

  // 合并：常驻在前、匹配在后，截到 maxEntries（常驻优先保留）。
  const merged = [...resident, ...matched];
  if (merged.length === 0) return '';
  const capped = merged.slice(0, Math.max(0, maxEntries));
  if (capped.length === 0) return '';

  const lines = capped.map(([word, meaning]) => `- ${word}：${meaning}`);
  return `[已知词条 — 守秘人参考，可在叙事中自然沿用以下既定设定]\n${lines.join('\n')}`;
}
