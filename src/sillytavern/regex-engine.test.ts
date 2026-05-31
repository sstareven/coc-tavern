import { describe, it, expect } from 'vitest';
import { runRegexScript, escapeRegexMetachars } from './regex-engine';
import type { RegexScript } from '../types';

/** 构造一个最小可用的 RegexScript（runRegexScript 仅消费 findRegex/replaceString/trimStrings/disabled/substituteRegex）。 */
function makeScript(partial: Partial<RegexScript>): RegexScript {
  return {
    id: 'test',
    scriptName: 'test',
    findRegex: '',
    replaceString: '',
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    ...partial,
  };
}

describe('runRegexScript — 捕获组替换', () => {
  it('数字捕获组 $1 正常替换', () => {
    const script = makeScript({ findRegex: '/(\\w+)@(\\w+)/', replaceString: '$2.$1' });
    expect(runRegexScript(script, 'alice@example')).toBe('example.alice');
  });

  it('命名捕获组 $<name> 正常替换（回归：此前因 args 索引取错恒返回空）', () => {
    const script = makeScript({
      findRegex: '/(?<user>\\w+)@(?<host>\\w+)/',
      replaceString: '$<host>/$<user>',
    });
    expect(runRegexScript(script, 'alice@example')).toBe('example/alice');
  });

  it('混用命名组与字面量', () => {
    const script = makeScript({
      findRegex: '/【(?<tag>[^】]+)】/g',
      replaceString: '[$<tag>]',
    });
    expect(runRegexScript(script, '【线索】与【危险】')).toBe('[线索]与[危险]');
  });

  it('无命名组时 $<name> 解析为空，不误吞输入字符串', () => {
    // findRegex 无命名组：$<missing> 应解析为 ''，{{match}} 仍正常。
    const script = makeScript({ findRegex: '/(\\d+)/', replaceString: '<$<missing>>$1' });
    expect(runRegexScript(script, 'x42y')).toBe('x<>42y');
  });
});
describe('runRegexScript — SubstituteFindRegex 转义语义', () => {
  // 模拟宏注入：把 findRegex 中的 {{val}} 替换为变量值；ESCAPED 时对注入值施加 escaper。
  const VALUE = 'a.b(c)'; // 含正则元字符 . ( )
  const makeResolver = () => (text: string, escaper?: (v: string) => string): string =>
    text.replace(/\{\{val\}\}/g, escaper ? escaper(VALUE) : VALUE);

  it('ESCAPED(2)：注入值的元字符被转义，按字面匹配', () => {
    const script = makeScript({
      findRegex: '/{{val}}/g',
      replaceString: 'HIT',
      substituteRegex: 2,
    });
    // 字面串 'a.b(c)' 命中；'aXbZc'（仅当 . ( ) 作正则元字符才会命中的串）不命中。
    expect(runRegexScript(script, 'x a.b(c) y', makeResolver())).toBe('x HIT y');
    expect(runRegexScript(script, 'x aXbZc y', makeResolver())).toBe('x aXbZc y');
  });

  it('RAW(1)：注入值不转义，元字符按正则语义匹配（与 ESCAPED 形成差异）', () => {
    const script = makeScript({
      findRegex: '/{{val}}/g',
      replaceString: 'HIT',
      substituteRegex: 1,
    });
    // 'a.b(c)' 作为正则：. 匹配任意字符，(c) 捕获字面 c → 命中 'aXbc'。
    // 关键差异：同一输入 'aXbc' 在 RAW 下命中、在 ESCAPED 下不命中。
    expect(runRegexScript(script, 'x aXbc y', makeResolver())).toBe('x HIT y');
  });

  it('NONE(0)：findRegex 不经 resolver 替换，{{val}} 按字面留存', () => {
    const script = makeScript({
      findRegex: '/{{val}}/g',
      replaceString: 'HIT',
      substituteRegex: 0,
    });
    // NONE 不替换 findRegex：findRegex 字面为 /{{val}}/g → 只命中字面 '{{val}}' 子串。
    expect(runRegexScript(script, 'x {{val}} y', makeResolver())).toBe('x HIT y');
    // 含元字符的真实变量值未被注入，故 'a.b(c)' 原样保留。
    expect(runRegexScript(script, 'x a.b(c) y', makeResolver())).toBe('x a.b(c) y');
  });
});

describe('escapeRegexMetachars', () => {
  it('转义全部正则元字符', () => {
    expect(escapeRegexMetachars('a.b')).toBe('a\\.b');
    expect(escapeRegexMetachars('(x)')).toBe('\\(x\\)');
    expect(escapeRegexMetachars('a+b*c?')).toBe('a\\+b\\*c\\?');
    expect(escapeRegexMetachars('[a]{1}')).toBe('\\[a\\]\\{1\\}');
    expect(escapeRegexMetachars('a|b^$')).toBe('a\\|b\\^\\$');
    expect(escapeRegexMetachars('a\\b')).toBe('a\\\\b');
    expect(escapeRegexMetachars('plain')).toBe('plain');
  });
});

