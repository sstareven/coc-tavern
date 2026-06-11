import { describe, it, expect } from 'vitest';
import {
  expandSimplePattern,
  cleanClicheText,
  type CleanerRuleGroup,
} from '../cliche-cleaner-engine';
import { DEFAULT_CLEANER_RULES } from '../cliche-cleaner-rules';

// ── expandSimplePattern ──────────────────────────────────

describe('expandSimplePattern', () => {
  it('expands single group', () => {
    expect(expandSimplePattern('{a,b,c}')).toBe('(?:a|b|c)');
  });

  it('expands multiple groups (cartesian)', () => {
    const pat = expandSimplePattern('{几不,微不}{可查,可察}');
    const re = new RegExp(pat);
    expect(re.test('几不可查')).toBe(true);
    expect(re.test('几不可察')).toBe(true);
    expect(re.test('微不可查')).toBe(true);
    expect(re.test('微不可察')).toBe(true);
    expect(re.test('不可查')).toBe(false);
  });

  it('handles literal text around groups', () => {
    const pat = expandSimplePattern('{深深,浅浅}的');
    const re = new RegExp(pat);
    expect(re.test('深深的')).toBe(true);
    expect(re.test('浅浅的')).toBe(true);
    expect(re.test('深深')).toBe(false);
  });

  it('handles optional suffix with ?', () => {
    const pat = expandSimplePattern('{极其,极度}{的,地}?');
    expect(pat).toMatch(/\?/);
    const re = new RegExp(pat);
    // With the optional group
    expect(re.test('极其的')).toBe(true);
    expect(re.test('极度地')).toBe(true);
    // Without the optional group (? makes it optional)
    expect(re.test('极其')).toBe(true);
    expect(re.test('极度')).toBe(true);
  });

  it('returns literal when no groups', () => {
    expect(expandSimplePattern('不轻不重')).toBe('不轻不重');
  });

  it('escapes regex-special chars in literal segments', () => {
    const pat = expandSimplePattern('a.b');
    expect(pat).toBe('a\\.b');
    const re = new RegExp(pat);
    expect(re.test('a.b')).toBe(true);
    expect(re.test('aXb')).toBe(false);
  });

  it('escapes regex-special chars inside groups', () => {
    const pat = expandSimplePattern('{a.b,c+d}');
    expect(pat).toBe('(?:a\\.b|c\\+d)');
  });
});

// ── cleanClicheText ──────────────────────────────────────

describe('cleanClicheText', () => {
  const rules: CleanerRuleGroup[] = [
    {
      name: '形副词系',
      enabled: true,
      subRules: [
        { targets: ['{微微,稍微,略微}{的,地}?'], replacements: [], mode: 'simple', remark: '删程度壳' },
        { targets: ['头颅'], replacements: ['头'], mode: 'text', remark: '人体词' },
        { targets: ['四肢百骸'], replacements: ['全身'], mode: 'text', remark: '身体范围' },
      ],
    },
    {
      name: '删陈词',
      enabled: true,
      subRules: [
        {
          targets: ['(?:[，,](?:[好就]?像|仿佛|如[若同]|[宛犹][如若]))[\\u4e00-\\u9fff]*(?=。)'],
          replacements: [],
          mode: 'regex',
          remark: '删句尾比喻',
        },
      ],
    },
    { name: '禁用组', enabled: false, subRules: [{ targets: ['好的'], replacements: ['坏的'], mode: 'text' }] },
  ];

  it('deletes simple-mode cliché (empty replacement)', () => {
    expect(cleanClicheText('他微微的点了点头', rules)).toBe('他点了点头');
  });

  it('replaces text-mode match', () => {
    expect(cleanClicheText('他抬起头颅', rules)).toBe('他抬起头');
  });

  it('replaces with specific text', () => {
    expect(cleanClicheText('四肢百骸都在颤抖', rules)).toBe('全身都在颤抖');
  });

  it('applies regex-mode deletion', () => {
    expect(cleanClicheText('他站在那里，仿佛一座雕像。', rules)).toBe('他站在那里。');
  });

  it('skips disabled groups', () => {
    expect(cleanClicheText('好的东西', rules)).toBe('好的东西');
  });

  it('preserves <tag> structures', () => {
    expect(cleanClicheText('<san id="1"/>他微微的颤抖', rules)).toBe('<san id="1"/>他颤抖');
  });

  it('preserves {{macro}} structures', () => {
    expect(cleanClicheText('{{getvar::test}}他微微的笑了', rules)).toBe('{{getvar::test}}他笑了');
  });

  it('handles empty text', () => {
    expect(cleanClicheText('', rules)).toBe('');
  });

  it('handles no matching rules', () => {
    expect(cleanClicheText('完全正常的文本', rules)).toBe('完全正常的文本');
  });

  it('multiple replacements in same text', () => {
    expect(cleanClicheText('他微微的抬起头颅', rules)).toBe('他抬起头');
  });

  it('random replacement selection when multiple replacements available', () => {
    const ruleWithMulti: CleanerRuleGroup[] = [{
      name: 'test', enabled: true,
      subRules: [{ targets: ['甬道'], replacements: ['穴', '洞'], mode: 'text' }],
    }];
    const result = cleanClicheText('甬道', ruleWithMulti);
    expect(['穴', '洞']).toContain(result);
  });

  it('deterministic replacement with injected RNG', () => {
    const ruleWithMulti: CleanerRuleGroup[] = [{
      name: 'test', enabled: true,
      subRules: [{ targets: ['甬道'], replacements: ['穴', '洞'], mode: 'text' }],
    }];
    // rng returns 0 → floor(0*2)=0 → '穴'
    expect(cleanClicheText('甬道', ruleWithMulti, () => 0)).toBe('穴');
    // rng returns 0.5 → floor(0.5*2)=1 → '洞'
    expect(cleanClicheText('甬道', ruleWithMulti, () => 0.5)).toBe('洞');
  });

  it('handles multiple protected structures interleaved with text', () => {
    const input = '<check skill="INT"/>微微地{{getvar::x}}微微的看';
    const expected = '<check skill="INT"/>{{getvar::x}}看';
    expect(cleanClicheText(input, rules)).toBe(expected);
  });

  it('does not modify text inside protected tags', () => {
    // "头颅" inside a tag attribute should NOT be replaced
    const input = '<item name="头颅">他抬起头颅</item>';
    const expected = '<item name="头颅">他抬起头</item>';
    expect(cleanClicheText(input, rules)).toBe(expected);
  });

  it('applies simple-mode without optional suffix', () => {
    // "略微" without trailing 的/地 should also be deleted
    expect(cleanClicheText('他略微颤抖', rules)).toBe('他颤抖');
  });
});

// ── DEFAULT_CLEANER_RULES ───────────────────────────────

describe('DEFAULT_CLEANER_RULES', () => {
  it('all enabled rules compile without error', () => {
    const result = cleanClicheText('测试文本', DEFAULT_CLEANER_RULES);
    expect(typeof result).toBe('string');
  });

  it('cleans known cliche: 微微的', () => {
    expect(cleanClicheText('他微微的点了点头', DEFAULT_CLEANER_RULES)).toBe('他点了点头');
  });

  it('cleans known cliche: 头颅 -> 头', () => {
    expect(cleanClicheText('他抬起头颅', DEFAULT_CLEANER_RULES)).toBe('他抬起头');
  });

  it('cleans known cliche: 四肢百骸 -> 全身', () => {
    expect(cleanClicheText('四肢百骸都在颤抖', DEFAULT_CLEANER_RULES)).toBe('全身都在颤抖');
  });

  it('cleans duplicate punctuation', () => {
    expect(cleanClicheText('真的吗？？？', DEFAULT_CLEANER_RULES)).toBe('真的吗？');
  });

  // GROUP 1 extras
  it('cleans template modifiers: 狡黠地', () => {
    expect(cleanClicheText('他狡黠地笑了', DEFAULT_CLEANER_RULES)).toBe('他笑了');
  });

  it('cleans state modifiers: 绝望的', () => {
    expect(cleanClicheText('发出绝望的叫声', DEFAULT_CLEANER_RULES)).toBe('发出叫声');
  });

  it('cleans exaggeration: 惊人的', () => {
    expect(cleanClicheText('以惊人的速度', DEFAULT_CLEANER_RULES)).toBe('以速度');
  });

  it('cleans degree words: 极其', () => {
    expect(cleanClicheText('极其危险', DEFAULT_CLEANER_RULES)).toBe('危险');
  });

  // GROUP 2
  it('cleans 一丝 but preserves 一丝不挂', () => {
    expect(cleanClicheText('一丝恐惧', DEFAULT_CLEANER_RULES)).toBe('恐惧');
    expect(cleanClicheText('一丝不挂', DEFAULT_CLEANER_RULES)).toBe('一丝不挂');
  });

  it('cleans callus template', () => {
    expect(cleanClicheText('布满薄茧的手', DEFAULT_CLEANER_RULES)).toBe('手');
  });

  // GROUP 3
  it('cleans 脊背 -> 背', () => {
    expect(cleanClicheText('脊背发凉', DEFAULT_CLEANER_RULES)).toBe('背发凉');
  });

  it('cleans 躯体 -> 身体', () => {
    expect(cleanClicheText('躯体僵硬', DEFAULT_CLEANER_RULES)).toBe('身体僵硬');
  });

  it('cleans 肩胛骨 -> 肩膀', () => {
    expect(cleanClicheText('肩胛骨疼痛', DEFAULT_CLEANER_RULES)).toBe('肩膀疼痛');
  });

  it('cleans 指骨 -> 手指', () => {
    expect(cleanClicheText('指骨发白', DEFAULT_CLEANER_RULES)).toBe('手指发白');
  });

  it('cleans 肌理 -> 肌肉', () => {
    expect(cleanClicheText('肌理紧绷', DEFAULT_CLEANER_RULES)).toBe('肌肉紧绷');
  });

  // GROUP 4
  it('cleans 嘴角弧度 cliche', () => {
    expect(cleanClicheText('嘴角勾起一抹淡笑', DEFAULT_CLEANER_RULES)).toBe('笑了一下');
  });

  it('cleans touch template: 粗糙的指腹 (粗糙的 stripped by group 1)', () => {
    expect(cleanClicheText('用粗糙的指腹抚过', DEFAULT_CLEANER_RULES)).toBe('用指腹抚过');
  });

  // GROUP 5
  it('cleans trailing simile', () => {
    expect(cleanClicheText('他站在那里，仿佛一座雕像。', DEFAULT_CLEANER_RULES)).toBe('他站在那里。');
  });

  it('cleans inserted simile shell', () => {
    expect(cleanClicheText('声音像破碎的玻璃一样刺耳', DEFAULT_CLEANER_RULES)).toBe('声音刺耳');
  });

  // GROUP 6
  it('cleans 不是X而是 -> 是', () => {
    expect(cleanClicheText('不是恐惧，而是愤怒', DEFAULT_CLEANER_RULES)).toBe('是愤怒');
  });

  it('cleans 平日里', () => {
    expect(cleanClicheText('平日里安静的小镇', DEFAULT_CLEANER_RULES)).toBe('安静的小镇');
  });

  // GROUP 7
  it('cleans excess ellipsis', () => {
    expect(cleanClicheText('他说……………', DEFAULT_CLEANER_RULES)).toBe('他说……');
  });

  it('cleans excess dashes', () => {
    expect(cleanClicheText('他想————不对', DEFAULT_CLEANER_RULES)).toBe('他想——不对');
  });

  it('cleans repeated exclamation', () => {
    expect(cleanClicheText('快跑！！！', DEFAULT_CLEANER_RULES)).toBe('快跑！');
  });
});
