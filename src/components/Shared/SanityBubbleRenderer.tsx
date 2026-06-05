/**
 * A2 重设 — SanityBubbleRenderer: 把含 <san id="N"/> 标签的纯文本拆成
 *  [text, <SanityBubble prompt={...}/>, text, ...] 的 React 节点列表。
 *
 * 与 TextBeautifier 互补:
 *  - TextBeautifier 处理 {{keyword}} 与对话引号
 *  - 本模块处理 <san id="N"/> 内联气泡
 *
 * 调用方(LeftPage / RightPage) 先用本模块拆出气泡节点, 再把残余 string 段交给 beautifyText
 * 做关键词/对话高亮; 反过来不行(beautifyText 不识别 <san> 标签, 会原样塞进 string)。
 *
 * 注: 若 page 没有 sanityCheckPrompts 或为空, 仍然剥掉 <san> 标签字符串(防止它意外漏到 UI)。
 */

import React from 'react';
import type { SanityCheckPrompt } from '../../types';
import { parseSanInlineTags } from '../../sillytavern/sanity-prompt-engine';
import { SanityBubble } from '../Book/SanityBubble';

/**
 * 把单段文本按 <san id="N"/> 拆成 (string | SanityBubble) 交替的节点。
 * 找不到对应 prompt(id 不匹配) → 静默剥除标签, 不渲染气泡, 防 LLM 错配导致页面坏掉。
 */
export function splitTextWithSanBubbles(
  text: string,
  prompts: SanityCheckPrompt[] | undefined,
  keyPrefix: string,
): React.ReactNode[] {
  if (!text) return [];
  const tags = parseSanInlineTags(text);
  if (tags.length === 0) return [text];

  const promptById = new Map<string, SanityCheckPrompt>();
  for (const p of prompts ?? []) promptById.set(p.id, p);

  const out: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    if (tag.start > cursor) out.push(text.slice(cursor, tag.start));
    const prompt = promptById.get(tag.id);
    if (prompt) {
      out.push(<SanityBubble key={`${keyPrefix}-san-${tag.id}-${i}`} prompt={prompt} />);
    }
    // 找不到 prompt: 不渲染气泡, 只剥标签(气泡显示靠 prompt)
    cursor = tag.end;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}
