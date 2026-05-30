import React from "react";
import { KeywordTooltip } from "./KeywordTooltip";

/* ──────────────────────────────────────────────
 * 文本美化：{{keyword}} 加粗 + 对话橘色高亮
 *
 * 1) {{keyword}} — 匹配不以已有宏前缀(setvar/getvar/incvar/
 *    decvar/set:/get_/format_)开头的 {{...}}，剥离括号、按
 *    关键词渲染（有释义的显示 hover tooltip）。已有宏原样透传。
 *
 * 2) 对话高亮 — 「…」『…』“…” "…" 包裹的对白渲染为橘色。
 *    旧实现是产出 <span> HTML 的“显示端 regex 脚本”，但本应用
 *    的页面正文来自原始响应、渲染端只输出 React 文本节点，HTML
 *    永远不会被解释，故高亮从未生效。此处改为原生 React 转换。
 *
 * 两者在单次扫描中处理；对话内部仍解析 {{keyword}}。
 * ────────────────────────────────────────────── */

const MACRO_GUARD = "(?!setvar|getvar|incvar|decvar|set:|get_|format_)";
const BARE_MACRO_RE = new RegExp(`\\{\\{${MACRO_GUARD}([^}]+)\\}\\}`, "g");
// 对话引号：中文直角引号「」『』、中文弯引号 “”、ASCII 双引号 ""
const DIALOGUE_SRC = '「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"';
const TOKEN_RE = new RegExp(`(\\{\\{${MACRO_GUARD}[^}]+\\}\\})|(${DIALOGUE_SRC})`, "g");

const DIALOGUE_STYLE: React.CSSProperties = { color: "#e8a040", fontWeight: 500 };

/** 仅解析 {{keyword}}（用于对话内部的嵌套关键词）。 */
function beautifyKeywords(text: string): React.ReactNode[] {
  if (!text) return [];
  const result: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  BARE_MACRO_RE.lastIndex = 0;
  while ((match = BARE_MACRO_RE.exec(text)) !== null) {
    if (match.index > lastIdx) result.push(text.slice(lastIdx, match.index));
    const keyword = match[1].trim();
    if (keyword) {
      result.push(
        <KeywordTooltip key={`mk-${match.index}`} keyword={keyword}>
          {keyword}
        </KeywordTooltip>,
      );
    }
    lastIdx = BARE_MACRO_RE.lastIndex;
  }
  if (lastIdx < text.length) result.push(text.slice(lastIdx));
  return result;
}

/**
 * 解析 {{keyword}} 加粗标记与对话橘色高亮。
 * 返回字符串与 ReactElement 混合的数组。
 */
export function beautifyText(text: string): React.ReactNode[] {
  if (!text) return [];

  const result: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    // 标记前的纯文本
    if (match.index > lastIdx) {
      result.push(text.slice(lastIdx, match.index));
    }

    if (match[1] !== undefined) {
      // {{keyword}} → KeywordTooltip（剥离括号）
      const keyword = match[1].slice(2, -2).trim();
      if (keyword) {
        result.push(
          <KeywordTooltip key={`mk-${match.index}`} keyword={keyword}>
            {keyword}
          </KeywordTooltip>,
        );
      }
    } else {
      // 对话 → 橘色 span（内部仍解析 {{keyword}}）
      result.push(
        <span key={`dlg-${match.index}`} style={DIALOGUE_STYLE}>
          {beautifyKeywords(match[2])}
        </span>,
      );
    }

    lastIdx = TOKEN_RE.lastIndex;
  }

  // 最后一个标记之后的剩余文本
  if (lastIdx < text.length) {
    result.push(text.slice(lastIdx));
  }

  // 没有任何标记时，原样返回单个字符串
  return result.length > 0 ? result : [text];
}

/**
 * Beautify the output of renderContentWithCodeBlocks.
 * String nodes get beautified; ReactElement nodes (code blocks) pass through.
 */
export function beautifyContentNodes(nodes: React.ReactNode[]): React.ReactNode[] {
  return nodes.map((node, i) => {
    if (typeof node === "string") {
      const beautified = beautifyText(node);
      if (beautified.length === 1 && typeof beautified[0] === "string") return node;
      return React.createElement(React.Fragment, { key: i }, ...beautified);
    }
    return node;
  });
}
