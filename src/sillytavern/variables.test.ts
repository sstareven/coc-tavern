import { describe, it, expect } from 'vitest';
import { extractXmlVariables } from './variables';

describe('extractXmlVariables — 单/双引号兼容（修引号 bug 回归）', () => {
  it('双引号 <var> 正常解析', () => {
    expect(extractXmlVariables('<var name="调查员.生命值.当前" value="8"/>')).toEqual({
      '调查员.生命值.当前': '8',
    });
  });

  it('单引号 <var> 正常解析（此前正则只认双引号导致单引号静默丢失）', () => {
    expect(extractXmlVariables("<var name='调查员.理智值.当前' value='60'/>")).toEqual({
      '调查员.理智值.当前': '60',
    });
  });

  it('同一文本混合单双引号', () => {
    const out = extractXmlVariables(`<var name="世界.地点" value="书房"/> <var name='战斗.是否战斗中' value='false'/>`);
    expect(out).toEqual({ '世界.地点': '书房', '战斗.是否战斗中': 'false' });
  });

  it('空 value 可解析', () => {
    expect(extractXmlVariables("<var name='线索' value=''/>")).toEqual({ 线索: '' });
  });
});
