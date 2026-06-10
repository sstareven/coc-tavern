import { describe, it, expect } from 'vitest';
import { buildNameSubstitutions, applyNameSubstitutions } from './npc-name-substitution';

describe('buildNameSubstitutions', () => {
  it('从 aliases 构建替换映射', () => {
    const profiles = {
      a: { id: 'a', name: '小美', aliases: ['卡尔·迈尔斯'], createdAt: 0 },
      b: { id: 'b', name: '胖虎', aliases: ['赫斯提亚'], createdAt: 0 },
    };
    const subs = buildNameSubstitutions(profiles as any);
    expect(subs.get('卡尔·迈尔斯')).toBe('小美');
    expect(subs.get('赫斯提亚')).toBe('胖虎');
  });

  it('无 aliases 时返回空 map', () => {
    const profiles = { a: { id: 'a', name: 'NPC', createdAt: 0 } };
    expect(buildNameSubstitutions(profiles as any).size).toBe(0);
  });

  it('alias 与当前名相同时跳过', () => {
    const profiles = { a: { id: 'a', name: 'X', aliases: ['X'], createdAt: 0 } };
    expect(buildNameSubstitutions(profiles as any).size).toBe(0);
  });
});

describe('applyNameSubstitutions', () => {
  it('替换所有旧名', () => {
    const subs = new Map([['赫斯提亚', '哆啦A梦'], ['埃伦娜·武', '小美']]);
    const text = '赫斯提亚说话了。埃伦娜·武走过来。赫斯提亚又说了一次。';
    expect(applyNameSubstitutions(text, subs)).toBe('哆啦A梦说话了。小美走过来。哆啦A梦又说了一次。');
  });

  it('空 subs 返回原文', () => {
    expect(applyNameSubstitutions('hello', new Map())).toBe('hello');
  });

  it('空文本返回空', () => {
    expect(applyNameSubstitutions('', new Map([['a', 'b']]))).toBe('');
  });

  it('长名优先替换防止子串误替', () => {
    const subs = new Map([['安娜', '小花'], ['安娜·李', '大花']]);
    expect(applyNameSubstitutions('安娜·李来了', subs)).toBe('大花来了');
  });
});
