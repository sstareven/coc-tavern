// src/components/Shared/InlineMarkdown.tsx
//
// 行内 markdown 解析（纯函数）—— 支持六种最常见的内联标记：
//   **bold** / __bold__ / *italic* / _italic_ / ~~strike~~ / `code`
//
// 不支持块级（标题/列表/引用/水平线）—— LeftPage/RightPage 上层已经按段落
// 切分，块级语义由上层维护。
//
// 设计要点：
//   - 字符串里的 {{keyword}} 与对话引号 「」「『』『""』""」原样保留，
//     由上层 beautifyText 后续处理 —— 三者可叠加：
//       **{{词}}**           → <strong>{{词}}</strong>（上层再把 {{}} 转 KeywordTooltip）
//       「**强调**对话」       → 「<strong>强调</strong>对话」（上层再把 「」 转对话橘色）
//   - 跨行不识别（避免误吞段落）：所有 marker 内部排除 \n。
//   - 数学 / 乘法 a * b * c 不识别为斜体：`*` 与内容之间不允许直接空白。
//   - `**` 在 `*` 前匹配，避免 `**a**` 被吃成 `*` + 「a」 + `*`。
//
// 按 [decoupling-modularity-required] 独立纯函数,单测覆盖。

import React from 'react';

/**
 * 一条统一正则按优先级分支匹配六种内联 markdown。
 * groups (1-based):
 *   1 = **bold**     2 = __bold__
 *   3 = ~~strike~~   4 = `code`
 *   5 = *italic*     6 = _italic_
 *
 * 注意：italic 分支要求内容首尾非空白字符 —— 防 `a * b` 误识为 italic（中文叙事极少这种乘法语境，但保留防御性）。
 */
const INLINE_MD_RE =
  /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|~~([^~\n]+?)~~|`([^`\n]+?)`|\*([^*\s\n][^*\n]*?[^*\s\n]|[^*\s\n])\*|_([^_\s\n][^_\n]*?[^_\s\n]|[^_\s\n])_/g;

/**
 * 把字符串里的内联 markdown 转成 React 节点数组。
 *
 * @param text       原文
 * @param keyPrefix  React key 前缀（避免上层多次调用产生 key 冲突）
 * @returns          string 与 React 元素的混合数组（与 beautifyText 同款形式）
 */
export function parseInlineMarkdown(text: string, keyPrefix = 'md'): React.ReactNode[] {
  if (!text) return [];

  const result: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  INLINE_MD_RE.lastIndex = 0;
  while ((match = INLINE_MD_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      result.push(text.slice(lastIdx, match.index));
    }
    const key = `${keyPrefix}-${match.index}`;
    if (match[1] !== undefined) {
      result.push(<strong key={key}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      result.push(<strong key={key}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      result.push(<del key={key}>{match[3]}</del>);
    } else if (match[4] !== undefined) {
      result.push(<code key={key} style={CODE_STYLE}>{match[4]}</code>);
    } else if (match[5] !== undefined) {
      result.push(<em key={key}>{match[5]}</em>);
    } else if (match[6] !== undefined) {
      result.push(<em key={key}>{match[6]}</em>);
    }
    lastIdx = INLINE_MD_RE.lastIndex;
  }

  if (lastIdx < text.length) {
    result.push(text.slice(lastIdx));
  }

  // 无任何标记 → 原样返回单字符串（与 beautifyText 同款契约）
  return result.length > 0 ? result : [text];
}

/** 行内 code 的轻量样式：等宽字体 + 淡背景 + 圆角，不抢戏。 */
const CODE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.92em',
  padding: '1px 5px',
  borderRadius: 3,
  background: 'rgba(196,168,85,0.12)',
  border: '1px solid rgba(196,168,85,0.18)',
};
