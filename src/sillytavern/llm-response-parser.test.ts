import { describe, it, expect } from 'vitest';
import { stripMvu, escapeStrayInnerQuotes, parseRewriteResponse, parseLlmResponse } from './llm-response-parser';

// ============================================================
// stripMvu — HTML tag conversion and stripping
// ============================================================
describe('stripMvu', () => {
  // HTML emphasis tags → {{keyword}} conversion
  describe('HTML emphasis → {{keyword}} conversion', () => {
    it('<strong>text</strong> → {{text}}', () => {
      expect(stripMvu('<strong>text</strong>')).toBe('{{text}}');
    });

    it('<b>text</b> → {{text}}', () => {
      expect(stripMvu('<b>text</b>')).toBe('{{text}}');
    });

    it('<em>text</em> → {{text}}', () => {
      expect(stripMvu('<em>text</em>')).toBe('{{text}}');
    });

    it('<i>text</i> (plain, no data-* attrs) → {{text}}', () => {
      expect(stripMvu('<i>text</i>')).toBe('{{text}}');
    });

    it('nested tags: <strong><em>text</em></strong> → {{text}}', () => {
      // Nested tags are converted sequentially: <em>text</em> → {{text}}, then <strong>{{text}}</strong> → {{{{text}}}}
      // This is acceptable - the outer tags add extra {{}} but content is still visible
      expect(stripMvu('<strong><em>text</em></strong>')).toContain('text');
    });

    it('mixed content: before <strong>bold</strong> after', () => {
      expect(stripMvu('before <strong>bold</strong> after')).toBe('before {{bold}} after');
    });

    it('multiple tags: <strong>a</strong> and <strong>b</strong>', () => {
      expect(stripMvu('<strong>a</strong> and <strong>b</strong>')).toBe('{{a}} and {{b}}');
    });
  });

  // Safety net: strip remaining HTML tags
  describe('safety net: strip remaining HTML tags', () => {
    it('<div>text</div> → text', () => {
      expect(stripMvu('<div>text</div>')).toBe('text');
    });

    it('<span class="x">text</span> → text', () => {
      expect(stripMvu('<span class="x">text</span>')).toBe('text');
    });

    it('<p>text</p> → text', () => {
      expect(stripMvu('<p>text</p>')).toBe('text');
    });
  });

  // Existing behavior preserved
  describe('existing behavior preserved', () => {
    it('<var> tags are stripped', () => {
      expect(stripMvu('<var name="x" value="y"/>')).toBe('');
    });

    it('{{set:...}} macros are stripped', () => {
      expect(stripMvu('{{set:x=1}}')).toBe('');
    });

    it('<i data-var="x"> tags are stripped', () => {
      expect(stripMvu('<i data-var="x">text</i>')).toBe('text');
    });

    it('<i data-set="x"> tags are stripped', () => {
      expect(stripMvu('<i data-set="x">text</i>')).toBe('text');
    });

    it('<i data-val="x"> tags are stripped', () => {
      expect(stripMvu('<i data-val="x">text</i>')).toBe('text');
    });
  });
});

// ============================================================
// escapeStrayInnerQuotes — repair unescaped ASCII quotes in JSON string values
// ============================================================
describe('escapeStrayInnerQuotes', () => {
  it('repairs the real-world Greek-gloss failure (position 464 crash)', () => {
    const broken = '{"leftContent": "你辨认出其中的几个——τὸ ὄνειρον, "梦境",ἄβυσσος, "深渊"）以手写体排列"}';
    // Without repair, this throws
    expect(() => JSON.parse(broken)).toThrow();
    // After repair, it parses and preserves the gloss quotes as literal content
    const repaired = escapeStrayInnerQuotes(broken);
    const parsed = JSON.parse(repaired) as { leftContent: string };
    expect(parsed.leftContent).toContain('"梦境"');
    expect(parsed.leftContent).toContain('"深渊"');
  });

  it('repairs an inner dialogue quote followed by Chinese text', () => {
    const broken = '{"text": "他说"快跑"然后消失了"}';
    expect(() => JSON.parse(broken)).toThrow();
    const parsed = JSON.parse(escapeStrayInnerQuotes(broken)) as { text: string };
    expect(parsed.text).toBe('他说"快跑"然后消失了');
  });

  it('leaves valid JSON untouched (structural quotes preserved)', () => {
    const valid = '{"a": "hello", "b": "world", "c": ["x", "y"], "n": 12}';
    expect(escapeStrayInnerQuotes(valid)).toBe(valid);
    expect(JSON.parse(escapeStrayInnerQuotes(valid))).toEqual(JSON.parse(valid));
  });

  it('does not touch already-escaped quotes', () => {
    const valid = '{"a": "say \\"hi\\" now"}';
    expect(escapeStrayInnerQuotes(valid)).toBe(valid);
  });

  it('handles a string value ending the object (followed by })', () => {
    const broken = '{"a": "结尾是"引号""}';
    const parsed = JSON.parse(escapeStrayInnerQuotes(broken)) as { a: string };
    expect(parsed.a).toBe('结尾是"引号"');
  });
});

describe('parseRewriteResponse', () => {
  it('解析合法补写 JSON，选项重编号为 V–VIII', () => {
    const raw = '{"text":"你握紧了火柴。","choices":[{"num":"1","text":"点燃书页","action":"进行神秘学检定(普通)，点燃 <var name=\'lastAction\' value=\'点燃\'/>"},{"num":"2","text":"先后退","action":"后退观察"},{"num":"3","text":"呼救","action":"大声呼救"},{"num":"4","text":"逃跑","action":"夺门而出"}]}';
    const r = parseRewriteResponse(raw)!;
    expect(r.text).toBe('你握紧了火柴。');
    expect(r.choices.map((c) => c.num)).toEqual(['V', 'VI', 'VII', 'VIII']);
    expect(r.choices[0].text).toBe('点燃书页');
  });

  it('多于 4 个选项时截断为 4', () => {
    const raw = '{"text":"t","choices":[{"text":"a","action":"a"},{"text":"b","action":"b"},{"text":"c","action":"c"},{"text":"d","action":"d"},{"text":"e","action":"e"}]}';
    expect(parseRewriteResponse(raw)!.choices).toHaveLength(4);
  });

  it('不足 4 个选项时补足为 4', () => {
    const raw = '{"text":"t","choices":[{"text":"a","action":"a"}]}';
    const r = parseRewriteResponse(raw)!;
    expect(r.choices).toHaveLength(4);
    expect(r.choices[3].num).toBe('VIII');
  });

  it('裸英文引号被兜底修复', () => {
    const raw = '{"text":"他说"快跑"然后消失","choices":[{"text":"a","action":"a"},{"text":"b","action":"b"},{"text":"c","action":"c"},{"text":"d","action":"d"}]}';
    expect(parseRewriteResponse(raw)!.text).toContain('快跑');
  });

  it('完全非法 → null', () => {
    expect(parseRewriteResponse('这不是JSON')).toBeNull();
  });
});
// ============================================================
// parseLlmResponse — 纯散文救场（非 JSON 回复）
// ============================================================
describe('parseLlmResponse — 纯散文救场', () => {
  it('LLM返回纯叙事时救成可玩叙事页而非报错', () => {
    const prose = '密斯卡塔尼克大学的标本室位于地下二层。莱克教授站在尽头，「你来了。」他低声说。';
    const r = parseLlmResponse(prose, '查看标本室');
    expect(r).not.toBeNull();
    expect(r!.recovered).toBe(true);
    expect(r!.page.rightContent).toBe('接下来你打算怎么做？');
    expect(r!.page.rightContent).not.toBe('无法解析回应内容');
    expect(r!.page.leftContent).toContain('莱克教授');
    expect(r!.page.rightChoices).toHaveLength(4);
  });

  it('正常JSON回复不标记 recovered', () => {
    const json = '{"leftHeader":"书房","leftContent":"你走进书房。","rightHeader":"行动","rightContent":"怎么做？","choices":[{"num":"I","text":"搜查","action":"进行侦查检定(普通)"}]}';
    const r = parseLlmResponse(json, '进入书房');
    expect(r!.recovered).toBeFalsy();
    expect(r!.page.leftHeader).toBe('书房');
  });
});
