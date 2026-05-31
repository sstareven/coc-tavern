import { describe, it, expect } from 'vitest';
import { runRegexScript } from './regex-engine';
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
