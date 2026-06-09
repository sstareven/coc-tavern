import React from 'react';
import type { PrintSegment } from '../../stores/useStreamingPrintStore';

/** LeftPage / MobileNoteView 流式刻印 segment 渲染。每个字符独立 span 触发 streaming-ink-char keyframe。 */
export function renderLpStreamingSegment(seg: PrintSegment, idx: number): React.ReactNode {
  if (seg.kind === 'sanBubble') {
    // 流式期间气泡不可点 — placeholder 用 opacity + pointerEvents:none 表示"未就绪",
    // 流结束切回完整 SanityBubble 自动恢复可点。
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

/** RightPage 流式 segment 渲染。与 Lp 同模式,只是 key 前缀不同避免 React 同 list 冲突。 */
export function renderRpStreamingSegment(seg: PrintSegment, idx: number): React.ReactNode {
  if (seg.kind === 'sanBubble') {
    return (
      <span key={`rsb-${idx}`} style={{
        display: 'inline-block', width: '0.9em', height: '0.9em', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(220,80,80,0.5) 0%, rgba(220,80,80,0.1) 70%)',
        margin: '0 2px', verticalAlign: 'middle', opacity: 0.6, pointerEvents: 'none', cursor: 'wait',
      }} />
    );
  }
  if (seg.kind === 'kw') {
    return (
      <span key={`rkw-${idx}`} style={{
        color: 'var(--gold)', fontWeight: 600, borderBottom: '1px dashed var(--gold)',
      }}>
        {(seg.content ?? '').split('').map((ch, j) => (
          <span key={j} className="streaming-ink-char">{ch}</span>
        ))}
      </span>
    );
  }
  return (
    <span key={`rt-${idx}`}>
      {(seg.content ?? '').split('').map((ch, j) => (
        <span key={j} className="streaming-ink-char">{ch}</span>
      ))}
    </span>
  );
}
