import React from "react";
import { KeywordTooltip } from "./KeywordTooltip";
import { parseInlineMarkdown } from "./InlineMarkdown";

/* ──────────────────────────────────────────────
 * 文本美化：<kw>keyword</kw> 加粗 + 对话橘色高亮
 *
 * 1) <kw>keyword</kw> — 包裹关键词的 XML 标签，剥离标签、
 *    按关键词渲染（有释义的显示 hover tooltip）。
 *    v1.11.3 起从旧 {{xxx}} 双花括号语法迁移而来——旧语法与
 *    MVU 变量宏 {{xxx.yyy}} 共享语法空间，导致 FORMAT_INSTRUCTION
 *    示例里的 {{阿卡姆}} 被 unified-macro-engine 当变量错误替换，
 *    污染 DS 缓存静态前缀。老存档里的 {{xxx}} 不再被识别为关键词，
 *    会按字面显示（已与用户确认）。
 *
 * 2) 对话高亮 — 「…」『…』"…" "…" 包裹的对白渲染为橘色。
 *    旧实现是产出 <span> HTML 的"显示端 regex 脚本"，但本应用
 *    的页面正文来自原始响应、渲染端只输出 React 文本节点，HTML
 *    永远不会被解释，故高亮从未生效。此处改为原生 React 转换。
 *
 * 两者在单次扫描中处理；对话内部仍解析 <kw>keyword</kw>。
 * ────────────────────────────────────────────── */

// 关键词标签：<kw>...</kw>，内部不允许嵌 < 避免嵌套歧义
const KW_TAG_SRC = "<kw>([^<]+)</kw>";
const KW_TAG_RE = new RegExp(KW_TAG_SRC, "g");
// 对话引号：中文直角引号「」『』、中文弯引号 “”、ASCII 双引号 ""
const DIALOGUE_SRC = '「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"';
const TOKEN_RE = new RegExp(`(${KW_TAG_SRC})|(${DIALOGUE_SRC})`, "g");

const DIALOGUE_STYLE: React.CSSProperties = {
  color: "#a35d18",
  fontWeight: 600,
  // 深琥珀对话在米色背景上已自带对比，仅留一道细暗边增加分量与边缘清晰度
  textShadow: "0 0 1px rgba(0,0,0,0.45), 0 1px 1px rgba(0,0,0,0.2)",
};

/** 仅解析 <kw>keyword</kw>（用于对话内部的嵌套关键词）。keyPrefix 让多段调用产生的 key 不撞车。 */
function beautifyKeywords(text: string, keyPrefix = 'dlg'): React.ReactNode[] {
  if (!text) return [];
  const result: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  KW_TAG_RE.lastIndex = 0;
  while ((match = KW_TAG_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      result.push(...parseInlineMarkdown(text.slice(lastIdx, match.index), `${keyPrefix}-md-${lastIdx}`));
    }
    const keyword = match[1].trim();
    if (keyword) {
      result.push(
        <KeywordTooltip key={`${keyPrefix}-kw-${match.index}`} keyword={keyword} tone="red">
          {keyword}
        </KeywordTooltip>,
      );
    }
    lastIdx = KW_TAG_RE.lastIndex;
  }
  if (lastIdx < text.length) {
    result.push(...parseInlineMarkdown(text.slice(lastIdx), `${keyPrefix}-md-${lastIdx}`));
  }
  return result;
}

/**
 * 解析 <kw>keyword</kw> 加粗标记与对话橘色高亮。
 * 返回字符串与 ReactElement 混合的数组。
 *
 * @param text       原文
 * @param keyPrefix  React key 前缀——splitTextWithSanBubbles 把 text 拆成多段时,
 *                   每段都从 match.index=0 开始扫描,若不区分前缀,多段同 index 的
 *                   <span>/keyword 节点会撞 key（2026-06-05 bug：dlg-118 同 key）。
 *                   默认 'btx',独立调用场景下足以保证段内 key 唯一。
 */
export function beautifyText(text: string, keyPrefix = 'btx'): React.ReactNode[] {
  if (!text) return [];

  const result: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    // 标记前的纯文本 → 走 inline markdown 解析（**bold** / *italic* / ~~strike~~ / `code`）
    if (match.index > lastIdx) {
      result.push(...parseInlineMarkdown(text.slice(lastIdx, match.index), `${keyPrefix}-md-${lastIdx}`));
    }

    if (match[1] !== undefined) {
      // <kw>keyword</kw> → KeywordTooltip。match[2] 是 KW_TAG_SRC 内部捕获组里的关键词内容。
      const keyword = match[2]?.trim();
      if (keyword) {
        result.push(
          <KeywordTooltip key={`${keyPrefix}-kw-${match.index}`} keyword={keyword}>
            {keyword}
          </KeywordTooltip>,
        );
      }
    } else {
      // 对话 → 橘色 span（内部仍解析 <kw>keyword</kw> 与 markdown，并把 keyPrefix 传下去）
      result.push(
        <span key={`${keyPrefix}-dlg-${match.index}`} style={DIALOGUE_STYLE}>
          {beautifyKeywords(match[3]!, `${keyPrefix}-dlg-${match.index}`)}
        </span>,
      );
    }

    lastIdx = TOKEN_RE.lastIndex;
  }

  // 最后一个标记之后的剩余文本 → 同样走 inline markdown
  if (lastIdx < text.length) {
    result.push(...parseInlineMarkdown(text.slice(lastIdx), `${keyPrefix}-md-${lastIdx}`));
  }

  // 没有任何标记时，原样返回单个字符串（向后兼容 beautifyText 旧契约）
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
