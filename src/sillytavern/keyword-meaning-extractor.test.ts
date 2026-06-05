import { describe, it, expect } from 'vitest';
import { extractKwTaggedKeywords } from './keyword-meaning-extractor';

describe('extractKwTaggedKeywords — 扫叙事里的 <kw>X</kw>', () => {
  it('单个标签', () => {
    expect(extractKwTaggedKeywords('走进<kw>阿卡姆</kw>的街道')).toEqual(['阿卡姆']);
  });

  it('多个标签按首见顺序', () => {
    const t = '从<kw>阿卡姆</kw>到<kw>印斯茅斯</kw>，路过<kw>大学图书馆</kw>';
    expect(extractKwTaggedKeywords(t)).toEqual(['阿卡姆', '印斯茅斯', '大学图书馆']);
  });

  it('重复出现只算一次（去重保首见）', () => {
    const t = '<kw>阿卡姆</kw>的街道。<kw>阿卡姆</kw>的图书馆。<kw>印斯茅斯</kw>。';
    expect(extractKwTaggedKeywords(t)).toEqual(['阿卡姆', '印斯茅斯']);
  });

  it('无标签返回空数组', () => {
    expect(extractKwTaggedKeywords('普通文本没有任何标记')).toEqual([]);
  });

  it('空串/空白返回空数组', () => {
    expect(extractKwTaggedKeywords('')).toEqual([]);
    expect(extractKwTaggedKeywords('   ')).toEqual([]);
  });

  it('孤立 <kw> 或 </kw> 不识别（由 stripOrphanKwTags 兜底）', () => {
    expect(extractKwTaggedKeywords('孤立</kw>不被识别')).toEqual([]);
    expect(extractKwTaggedKeywords('<kw>未闭合也不被识别')).toEqual([]);
  });

  it('标签内 trim 空白', () => {
    expect(extractKwTaggedKeywords('<kw>  阿卡姆  </kw>')).toEqual(['阿卡姆']);
  });

  it('内部空字符串不收录', () => {
    expect(extractKwTaggedKeywords('<kw>   </kw>X<kw>阿卡姆</kw>')).toEqual(['阿卡姆']);
  });

  it('混合段落 + 对话引语', () => {
    const t = '他说「我去过<kw>阿卡姆</kw>」，又走向<kw>密斯卡塔尼克大学</kw>';
    expect(extractKwTaggedKeywords(t)).toEqual(['阿卡姆', '密斯卡塔尼克大学']);
  });

  it('跨段落扫描', () => {
    const t = '第一段<kw>阿卡姆</kw>。\n\n第二段<kw>印斯茅斯</kw>。';
    expect(extractKwTaggedKeywords(t)).toEqual(['阿卡姆', '印斯茅斯']);
  });
});
