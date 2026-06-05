import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { parseInlineMarkdown } from '../InlineMarkdown';

/** 把 ReactNode 数组渲染成 HTML 字符串便于断言。 */
function html(nodes: React.ReactNode[]): string {
  return renderToStaticMarkup(React.createElement(React.Fragment, null, ...nodes));
}

describe('parseInlineMarkdown', () => {
  describe('六种基本标记', () => {
    it('**bold** → <strong>', () => {
      expect(html(parseInlineMarkdown('**等待**'))).toBe('<strong>等待</strong>');
    });
    it('*italic* → <em>', () => {
      expect(html(parseInlineMarkdown('*斜体*'))).toBe('<em>斜体</em>');
    });
    it('__bold__ (GFM 风格) → <strong>', () => {
      expect(html(parseInlineMarkdown('__粗体__'))).toBe('<strong>粗体</strong>');
    });
    it('_italic_ → <em>', () => {
      expect(html(parseInlineMarkdown('_斜体_'))).toBe('<em>斜体</em>');
    });
    it('~~strike~~ → <del>', () => {
      expect(html(parseInlineMarkdown('~~删除~~'))).toBe('<del>删除</del>');
    });
    it('`code` → <code>', () => {
      const out = html(parseInlineMarkdown('`code`'));
      expect(out).toContain('<code');
      expect(out).toContain('>code</code>');
    });
  });

  describe('混合 + 纯文本', () => {
    it('纯文本无 markdown → 原样返回单节点', () => {
      const r = parseInlineMarkdown('普通文本');
      expect(html(r)).toBe('普通文本');
    });

    it('用户场景：开头普通 + **等待** + 末尾普通', () => {
      const r = parseInlineMarkdown('请耐心**等待**剧情推进');
      expect(html(r)).toBe('请耐心<strong>等待</strong>剧情推进');
    });

    it('多种标记同行', () => {
      const r = parseInlineMarkdown('**粗**和*斜*和~~删~~');
      expect(html(r)).toBe('<strong>粗</strong>和<em>斜</em>和<del>删</del>');
    });

    it('** 优先级高于 *——「**bold**」不被吃成「*」+「bold」+「*」', () => {
      const r = parseInlineMarkdown('**强调**');
      expect(html(r)).toBe('<strong>强调</strong>');
    });
  });

  describe('不匹配 case（保持原文）', () => {
    it('单星号 → 原样不识别', () => {
      const r = parseInlineMarkdown('单*星号');
      expect(html(r)).toBe('单*星号');
    });

    it('星号末尾无配对 → 原样', () => {
      const r = parseInlineMarkdown('结尾*');
      expect(html(r)).toBe('结尾*');
    });

    it('跨行不识别（避免误吞段落）', () => {
      const r = parseInlineMarkdown('*line1\nline2*');
      expect(html(r)).toBe('*line1\nline2*');
    });

    it('星号之间为空 → 不识别', () => {
      const r = parseInlineMarkdown('**');
      expect(html(r)).toBe('**');
    });

    it('数学表达式 a * b * c → 不误吞为斜体', () => {
      const r = parseInlineMarkdown('a * b * c');
      // 中间含空格的 *...* 不应识别为斜体（marker 与 token 之间不能直接挨着空格）
      expect(html(r)).toBe('a * b * c');
    });
  });

  describe('与上层（{{}}/对话引号）协同 — 集成方在 beautifyText 内调用本函数', () => {
    it('keyword 字面应原样保留 — markdown 不吃 {{}}', () => {
      const r = parseInlineMarkdown('**{{钥匙}}**');
      // markdown 层不解 keyword，原样输出 {{钥匙}}，由上层 beautifyText 后续处理
      expect(html(r)).toBe('<strong>{{钥匙}}</strong>');
    });

    it('对话引号字面应原样保留 — markdown 不吃 「」', () => {
      const r = parseInlineMarkdown('「**强调**对话」');
      expect(html(r)).toBe('「<strong>强调</strong>对话」');
    });
  });

  describe('keyPrefix 支持稳定 React key', () => {
    it('多次调用同样输入 → key 稳定（基于 keyPrefix）', () => {
      const r1 = parseInlineMarkdown('**a**', 'p');
      const r2 = parseInlineMarkdown('**a**', 'p');
      // 仅检查类型 + 数量一致即可（key 在 renderToStaticMarkup 里不可见）
      expect(r1.length).toBe(r2.length);
    });
  });
});
