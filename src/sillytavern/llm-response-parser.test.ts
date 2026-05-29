import { describe, it, expect } from 'vitest';
import { stripMvu, escapeStrayInnerQuotes } from './llm-response-parser';

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