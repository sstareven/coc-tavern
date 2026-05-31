import { describe, it, expect } from 'vitest';
import { resolveMeaning } from './KeywordTooltip';

describe('resolveMeaning — 关键词释义匹配（容忍音译拼写变体）', () => {
  it('精确命中', () => {
    expect(resolveMeaning('阿卡姆', [{ 阿卡姆: 'A' }])).toBe('A');
  });

  it('归一化命中（去后缀/标点）', () => {
    expect(resolveMeaning('调查员们', [{ 调查员: 'A' }])).toBe('A');
  });

  it('音译变体（替换一字）模糊命中：托尼克 ↔ 塔尼克', () => {
    expect(resolveMeaning('密斯卡托尼克河', [{ 密斯卡塔尼克河: '河释义' }])).toBe('河释义');
  });

  it('音译变体（多一字）模糊命中：托尼克河 ↔ 托尼河', () => {
    expect(resolveMeaning('密斯卡托尼克河', [{ 密斯卡托尼河: '河释义2' }])).toBe('河释义2');
  });

  it('短词（<4 字）不做模糊匹配，避免误配', () => {
    expect(resolveMeaning('梦', [{ 门: 'X' }])).toBeUndefined();
    expect(resolveMeaning('命运', [{ 命门: 'X' }])).toBeUndefined();
  });

  it('编辑距离 >1 不匹配', () => {
    expect(resolveMeaning('阿卡姆镇区', [{ 印斯茅斯港: 'X' }])).toBeUndefined();
  });

  it('精确/归一化优先于模糊', () => {
    expect(resolveMeaning('密斯卡托尼克河', [
      { 密斯卡塔尼克河: '模糊', 密斯卡托尼克河: '精确' },
    ])).toBe('精确');
  });

  it('多表按顺序查（KEYWORD_MEANINGS 优先于会话 store）', () => {
    expect(resolveMeaning('调查员', [{ 调查员: '内置' }, { 调查员: '会话' }])).toBe('内置');
  });

  it('查不到返回 undefined', () => {
    expect(resolveMeaning('不存在的词', [{ 阿卡姆: 'A' }])).toBeUndefined();
  });
});
