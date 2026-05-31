import { describe, it, expect } from 'vitest';
import { buildKeywordInjection } from './keyword-injection';
import type { BookPage } from '../types';

/** 构造最小 BookPage（仅 keyword-injection 消费 keywords 字段）。 */
function page(keywords: Record<string, string>): BookPage {
  return { id: `p${Math.random().toString(36).slice(2)}`, keywords } as BookPage;
}

describe('buildKeywordInjection — 混合策略关键词注入', () => {
  it('无任何关键词时返回空串', () => {
    expect(buildKeywordInjection({ recentPages: [], accumulated: {}, scanText: '任意' })).toBe('');
  });

  it('常驻：合并最近 N 页关键词并保留首见(先出现优先)', () => {
    const pages = [
      page({ 印斯茅斯: '没落渔港' }),
      page({ 印斯茅斯: '后出现的释义应被忽略', 深潜者: '两栖类人生物' }),
    ];
    const out = buildKeywordInjection({ recentPages: pages, accumulated: {}, scanText: '' });
    expect(out).toContain('- 印斯茅斯：没落渔港');
    expect(out).not.toContain('后出现的释义应被忽略');
    expect(out).toContain('- 深潜者：两栖类人生物');
    expect(out).toContain('[已知词条');
  });

  it('匹配：老词仅在 scanText 子串命中时注入', () => {
    const accumulated = { 阿卡姆: '古老城镇', 邓里奇: '荒村' };
    const hit = buildKeywordInjection({ recentPages: [], accumulated, scanText: '我前往阿卡姆调查' });
    expect(hit).toContain('- 阿卡姆：古老城镇');
    expect(hit).not.toContain('邓里奇');
  });

  it('常驻词不因 accumulated 重复出现两次', () => {
    const pages = [page({ 克苏鲁: '旧日支配者' })];
    const accumulated = { 克苏鲁: '旧日支配者' };
    const out = buildKeywordInjection({ recentPages: pages, accumulated, scanText: '克苏鲁' });
    expect(out.match(/克苏鲁/g)?.length).toBe(1);
  });

  it('上限截断：常驻优先保留，超出丢弃', () => {
    const pages = [page({ A: '1', B: '2', C: '3' })];
    const accumulated = { D: '4', E: '5' };
    const out = buildKeywordInjection({ recentPages: pages, accumulated, scanText: 'D E', maxEntries: 2 });
    const lines = out.split('\n').filter((l) => l.startsWith('- '));
    expect(lines).toHaveLength(2);
    expect(out).toContain('- A：1');
    expect(out).toContain('- B：2');
    expect(out).not.toContain('- D：');
  });

  it('忽略空词/空释义', () => {
    const pages = [page({ 有效: '释义', 无释义: '' })];
    const out = buildKeywordInjection({ recentPages: pages, accumulated: {}, scanText: '' });
    expect(out).toContain('- 有效：释义');
    expect(out).not.toContain('无释义');
  });
});
