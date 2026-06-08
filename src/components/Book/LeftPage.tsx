import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { renderContentWithCodeBlocks } from '../Shared/CodeBlockRenderer';
import { beautifyText } from '../Shared/TextBeautifier';
import { splitTextWithSanBubbles } from '../Shared/SanityBubbleRenderer';
import { useScrollGlow, ScrollParticles } from './ScrollParticles';
import { PageBanner } from './PageBanner';
import type { DiceRecord, SanityCheckPrompt } from '../../types';
import type { PrintSegment } from '../../stores/useStreamingPrintStore';
import React from 'react';

const RESULT_COLORS: Record<string, { color: string; bg: string }> = {
  'crit-success': { color: '#e8c84a', bg: 'rgba(196,168,85,0.12)' },
  'extreme-success': { color: '#5a8a4a', bg: 'rgba(90,138,74,0.1)' },
  'hard-success': { color: '#5a8a4a', bg: 'rgba(90,138,74,0.08)' },
  'success': { color: '#6b7a4a', bg: 'rgba(107,122,74,0.08)' },
  'failure': { color: '#8b6040', bg: 'rgba(139,96,64,0.08)' },
  'crit-failure': { color: '#d45050', bg: 'rgba(139,58,58,0.1)' },
};

const RESULT_LABELS: Record<string, string> = {
  'crit-success': '大成功', 'extreme-success': '极难成功', 'hard-success': '困难成功',
  'success': '成功', 'failure': '失败', 'crit-failure': '大失败',
};

interface Props {
  header: string;
  content: string;
  pageNum: string;
  isFlipping?: boolean;
  summary?: string;
  diceResults?: DiceRecord[];
  /** A2 重设: 本页 LLM 输出的 SAN check 气泡条目, 用来把 <san id="N"/> 替换成 React 组件。 */
  sanityCheckPrompts?: SanityCheckPrompt[];
  /** 文生图(2026-06-08):本页插画 URL('blob://<pageId>' 或远程 URL),空=无图不渲染 PageBanner。 */
  imageUrl?: string;
  /** blob:// 占位需要 pageId 去 db.pageImages 取 Blob。 */
  imagePageId?: string;
  imageGenStatus?: 'pending' | 'done' | 'failed' | 'skipped';
  /** 文生图(2026-06-08):本页插画生成时间戳,重生成后变化触发 PageBanner 重新拉 Blob。 */
  imageGenAt?: number;
  onRegenerateImage?: () => void;
  /** 流式刻印模式 — true 时:
   *  - header / content / sanityCheckPrompts / imageUrl 等原 props 被【忽略】,
   *  - 改用 streamingHeader 与 streamingSegments 渲染叙事文本,
   *  - PageBanner / 完整 SanityBubble 不渲染(避免半成数据触发副作用)。
   *  isStreamingPrint=false 走原渲染路径,所有 props 恢复有效。 */
  isStreamingPrint?: boolean;
  /** 已刻印的 segments(由 useStreamingPrintStore 提供) */
  streamingSegments?: PrintSegment[];
  /** 已刻印的 header 文本(流式期间覆盖 header) */
  streamingHeader?: string;
  /** 流式刻印的小总结(显示在 header 下方,流式时先于正文出现) */
  streamingSummary?: PrintSegment[];
}

export function LeftPage({ header, content, pageNum, isFlipping, summary, diceResults, sanityCheckPrompts, imageUrl, imagePageId, imageGenStatus, imageGenAt, onRegenerateImage, isStreamingPrint, streamingSegments, streamingHeader, streamingSummary }: Props) {
  const thRender = useTavernHelperStore((s) => s.render);
  const pt = useTavernHelperStore((s) => s.promptTemplate);
  const { edge, intensity, fading, onScroll } = useScrollGlow();
  const fadeStyle = {
    opacity: isFlipping ? 0 : 1,
    transition: isFlipping ? 'opacity 0.35s ease-in' : 'opacity 0.6s ease-out 0.6s',
  };

  // 流式刻印模式 — 不走 renderContentWithCodeBlocks(那需要完整字符串),直接渲染 segments。
  // 不渲染 PageBanner / 完整 SanityBubble(spec § 5.4):
  //  - PageBanner 依赖 imageUrl/imageGenStatus,流式期间这些字段尚未到位
  //  - 完整 SanityBubble 依赖 sanityCheckPrompts 字典,流式期间也没到位
  //  - 流结束 isStreamingPrint=false 后,Storybook 退回常规 LeftPage 渲染,这些都自动恢复。
  if (isStreamingPrint) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: '28px 24px 20px 28px', minHeight: 0, minWidth: 0,
        background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
        borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
        boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.04)',
        color: 'var(--ink)', fontFamily: 'var(--font-body)',
        fontSize: 'calc(15px * var(--text-ratio, 1))', lineHeight: 1.75, position: 'relative',
      }}>
        <div style={{ flexShrink: 0, marginBottom: 12, borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.25)', paddingBottom: 8, ...fadeStyle }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--text-ratio, 1))', color: 'var(--ink)', letterSpacing: 4, margin: 0 }}>
            {streamingHeader || header || ''}
          </h3>
          {streamingSummary && streamingSummary.length > 0 && (
            <p style={{
              fontSize: 'calc(10px * var(--text-ratio, 1))', fontFamily: 'var(--font-body)', color: 'var(--ink-subtle)',
              fontStyle: 'italic', letterSpacing: 0.3, lineHeight: 1.6,
              margin: '6px 0 0', textIndent: '2em',
            }}>
              {streamingSummary.map((seg, i) => renderStreamingSegment(seg, i))}
            </p>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <div className="lp-scroll" onScroll={onScroll} style={{ height: '100%', overflowY: 'auto', paddingRight: 6, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)', ...fadeStyle }}>
            <p style={{ textIndent: '2em', marginBottom: 12, whiteSpace: 'pre-wrap' }}>
              {(streamingSegments ?? []).map((seg, i) => renderStreamingSegment(seg, i))}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 'calc(12px * var(--text-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', letterSpacing: 3, paddingTop: 10, borderTop: '1px solid rgba(var(--ink-faded-rgb),0.15)', flexShrink: 0, ...fadeStyle }}>
          {pageNum}
        </div>
      </div>
    );
  }

  const effectiveRender = pt.enabled ? pt.renderEnabled : true;
  const renderedContent = effectiveRender
    ? renderContentWithCodeBlocks(content, {
        enabled: thRender.renderEnabled,
        collapse: thRender.codeCollapse,
        noHighlight: thRender.disableCodeHighlight,
        codeBlocks: pt.enabled ? pt.codeBlocksEnabled : true,
      })
    : [content];


  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '28px 24px 20px 28px', minHeight: 0, minWidth: 0,
      background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
      borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
      boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.04)',
      color: 'var(--ink)', fontFamily: 'var(--font-body)',
      fontSize: 'calc(15px * var(--text-ratio, 1))', lineHeight: 1.75, position: 'relative',
    }}>
      <div style={{ flexShrink: 0, marginBottom: 12, borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.25)', paddingBottom: 8, ...fadeStyle }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--text-ratio, 1))', color: 'var(--ink)', letterSpacing: 4, margin: 0 }}>{header}</h3>
        {diceResults && diceResults.length > 0 && diceResults.slice(0, 2).map((d, i) => {
          const rc = RESULT_COLORS[d.type] || RESULT_COLORS['failure'];
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
            }}>
              <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${rc.color}55)` }} />
              <span style={{
                fontSize: 'calc(9px * var(--text-ratio, 1))', fontFamily: 'var(--font-ui)', color: rc.color,
                letterSpacing: 1.5, whiteSpace: 'nowrap',
              }}>
                {d.skill} {RESULT_LABELS[d.type] || d.type}
              </span>
              <div style={{ flex: 1, height: 1, background: `linear-gradient(to left, transparent, ${rc.color}55)` }} />
            </div>
          );
        })}
        {summary && (
          <p style={{
            fontSize: 'calc(10px * var(--text-ratio, 1))', fontFamily: 'var(--font-body)', color: 'var(--ink-subtle)',
            fontStyle: 'italic', letterSpacing: 0.3, lineHeight: 1.6,
            margin: '6px 0 0', textIndent: '2em',
          }}>{summary}</p>
        )}
      </div>
      {(imageUrl || imageGenStatus === 'pending' || imageGenStatus === 'failed') && (
        <PageBanner
          src={imageUrl}
          pageId={imagePageId}
          imageAt={imageGenAt}
          alt={header}
          isFlipping={isFlipping}
          status={imageGenStatus}
          onRegenerate={onRegenerateImage}
        />
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {edge !== 'none' && <ScrollParticles edge={edge} fading={fading} intensity={intensity} />}
        <div className="lp-scroll" onScroll={onScroll} style={{ height: '100%', overflowY: 'auto', paddingRight: 6, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)', ...fadeStyle }}>
        {renderedContent.length === 1 && typeof renderedContent[0] === 'string' ? (
          <p style={{ textIndent: '2em', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{renderStringWithBubblesAndBeauty(renderedContent[0], sanityCheckPrompts, 'lp0')}</p>
        ) : (
          renderedContent.map((node, i) => typeof node === 'string'
            ? <p key={i} style={{ textIndent: '2em', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{renderStringWithBubblesAndBeauty(node, sanityCheckPrompts, `lp${i}`)}</p>
            : <span key={i}>{node}</span>)
        )}
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 'calc(12px * var(--text-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', letterSpacing: 3, paddingTop: 10, borderTop: '1px solid rgba(var(--ink-faded-rgb),0.15)', flexShrink: 0, ...fadeStyle }}>{pageNum}</div>
    </div>
  );
}

/**
 * A2 重设: 先用 splitTextWithSanBubbles 把 <san id="N"/> 替换成 SanityBubble 组件,
 * 再对其中残留的 string 段调 beautifyText(关键词高亮 + 对话橘色)。
 * 没有 <san> 时退化为单次 beautifyText。
 */
function renderStringWithBubblesAndBeauty(
  text: string,
  prompts: SanityCheckPrompt[] | undefined,
  keyPrefix: string,
): React.ReactNode[] {
  const parts = splitTextWithSanBubbles(text, prompts, keyPrefix);
  return parts.flatMap((node, idx) => {
    if (typeof node !== 'string') return [node];
    // 关键：把段索引 idx 传进 beautifyText 的 keyPrefix —— splitTextWithSanBubbles 把 text 拆成
    // 多段后,每段 string 都从 match.index=0 重新计；若不区分前缀,两段相同位置的对话会撞同 key
    // （如 dlg-118 重复，2026-06-05 用户实测 console 警告）。
    const beautified = beautifyText(node, `${keyPrefix}-s${idx}`);
    return beautified.map((n, j) => typeof n === 'string'
      ? <React.Fragment key={`${keyPrefix}-s${idx}-${j}`}>{n}</React.Fragment>
      : n);
  });
}

/** 流式刻印模式下的 segment 渲染。每个汉字单独 span 触发 streaming-ink keyframe。 */
function renderStreamingSegment(seg: PrintSegment, idx: number): React.ReactNode {
  if (seg.kind === 'sanBubble') {
    // 流式期间气泡不可点 — placeholder 用 opacity + pointerEvents:none 表示"未就绪",
    // t6 后切回完整 SanityBubble 自动恢复可点。
    return (
      <span key={`sb-${idx}`} style={{
        display: 'inline-block', width: '0.9em', height: '0.9em', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(220,80,80,0.5) 0%, rgba(220,80,80,0.1) 70%)',
        margin: '0 2px', verticalAlign: 'middle', opacity: 0.6, pointerEvents: 'none', cursor: 'wait',
      }} />
    );
  }
  if (seg.kind === 'kw') {
    return (
      <span key={`kw-${idx}`} style={{
        color: 'var(--gold)', fontWeight: 600, borderBottom: '1px dashed var(--gold)',
      }}>
        {(seg.content ?? '').split('').map((ch, j) => (
          <span key={j} className="streaming-ink-char">{ch}</span>
        ))}
      </span>
    );
  }
  return (
    <span key={`t-${idx}`}>
      {(seg.content ?? '').split('').map((ch, j) => (
        <span key={j} className="streaming-ink-char">{ch}</span>
      ))}
    </span>
  );
}
