import React from "react";
import { KeywordTooltip } from "./KeywordTooltip";

/* ──────────────────────────────────────────────
 * {{keyword}} bold markers (MVU-style, bare, no ::)
 *
 * Matches {{...}} where content does NOT start with an
 * existing macro prefix (setvar, getvar, incvar, decvar,
 * get_, format_).  The {{ and }} brackets are STRIPPED
 * from display; only the keyword renders as bold.
 *
 * Keywords with defined meanings show a hover tooltip.
 * Existing macros ({{setvar::...}}, {{getvar::...}}, etc.)
 * pass through unmodified as plain text.
 * ────────────────────────────────────────────── */

const BARE_MACRO_RE = /\{\{(?!setvar|getvar|incvar|decvar|set:|get_|format_)([^}]+)\}\}/g;

/**
 * Resolve {{keyword}} bold markers in text.
 * Keywords wrap in KeywordTooltip for hover explanations.
 * Returns an array of strings and ReactElements.
 */
export function beautifyText(text: string): React.ReactNode[] {
  if (!text) return [];

  const result: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  BARE_MACRO_RE.lastIndex = 0;
  while ((match = BARE_MACRO_RE.exec(text)) !== null) {
    // Plain text before this marker
    if (match.index > lastIdx) {
      result.push(text.slice(lastIdx, match.index));
    }

    // {{keyword}} → KeywordTooltip (brackets stripped, hover shows meaning)
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

  // Remaining text after last marker
  if (lastIdx < text.length) {
    result.push(text.slice(lastIdx));
  }

  // If no markers found, return the original text as single string
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
