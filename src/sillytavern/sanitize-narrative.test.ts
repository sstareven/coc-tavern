import { describe, expect, it } from 'vitest';
import { stripCjkGluedEnglish, collapseRepeatedPunctuation, sanitizeNarrative, normalizeKeywordBraces } from './sanitize-narrative';

describe('stripCjkGluedEnglish', () => {
  it('剥除中文紧贴的英文释义（含无空格连写与空格分词）', () => {
    expect(stripCjkGluedEnglish('你走到借书台circulation desk前')).toBe('你走到借书台前');
    expect(stripCjkGluedEnglish('借书台circulationdesk')).toBe('借书台');
    expect(stripCjkGluedEnglish('来到阿卡姆Arkham的街道')).toBe('来到阿卡姆的街道');
    expect(stripCjkGluedEnglish('翻开奈克特抄本Necronomicon')).toBe('翻开奈克特抄本');
  });

  it('保留合法情形：汉字后单字母、标点/空格后英文、汉字前英文、纯英文', () => {
    expect(stripCjkGluedEnglish('注射维生素C')).toBe('注射维生素C');     // 单字母保留
    expect(stripCjkGluedEnglish('拍了张X光片')).toBe('拍了张X光片');     // 英文在汉字前
    expect(stripCjkGluedEnglish('他低声说 hello there')).toBe('他低声说 hello there'); // 空格分隔保留
    expect(stripCjkGluedEnglish('墙上写着「Cthulhu」')).toBe('墙上写着「Cthulhu」');   // 引号后保留
    expect(stripCjkGluedEnglish('Arkham is cold.')).toBe('Arkham is cold.');         // 纯英文保留
  });

  it('多处黏连各自剥除、不跨标点吞并', () => {
    expect(stripCjkGluedEnglish('门Door开了，她Walked进来')).toBe('门开了，她进来');
  });

  it('空串/无中文安全', () => {
    expect(stripCjkGluedEnglish('')).toBe('');
    expect(stripCjkGluedEnglish('hello world')).toBe('hello world');
  });
});

describe('collapseRepeatedPunctuation', () => {
  it('折叠连续相同标点为一个', () => {
    expect(collapseRepeatedPunctuation('好的。。')).toBe('好的。');
    expect(collapseRepeatedPunctuation('等等，，，再想想')).toBe('等等，再想想');
    expect(collapseRepeatedPunctuation('什么！！！')).toBe('什么！');
  });
  it('保留省略号与不同标点组合', () => {
    expect(collapseRepeatedPunctuation('沉默……')).toBe('沉默……');      // 省略号不动
    expect(collapseRepeatedPunctuation('真的吗？！')).toBe('真的吗？！');  // 不同标点保留
  });
});

describe('normalizeKeywordBraces', () => {
  it('修复嵌套+引号黏连畸形花括号', () => {
    expect(normalizeKeywordBraces('你来到{{「{{南极}}」}}的边缘')).toBe('你来到{{南极}}的边缘');
    expect(normalizeKeywordBraces('{{{{死灵之书}}}}')).toBe('{{死灵之书}}');
    expect(normalizeKeywordBraces('{{「阿卡姆」}}')).toBe('{{阿卡姆}}');
  });
  it('保留合法写法', () => {
    expect(normalizeKeywordBraces('走进{{阿卡姆}}的街道')).toBe('走进{{阿卡姆}}的街道');
    expect(normalizeKeywordBraces('「{{南极}}」很冷')).toBe('「{{南极}}」很冷');
    expect(normalizeKeywordBraces('他说「危险」')).toBe('他说「危险」');
  });
});

describe('sanitizeNarrative（组合）', () => {
  it('同时剥中英黏连 + 折叠重复标点', () => {
    expect(sanitizeNarrative('你走到借书台circulation desk前。。')).toBe('你走到借书台前。');
  });
});
