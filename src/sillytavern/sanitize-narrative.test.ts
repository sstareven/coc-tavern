import { describe, expect, it } from 'vitest';
import { stripCjkGluedEnglish } from './sanitize-narrative';

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
