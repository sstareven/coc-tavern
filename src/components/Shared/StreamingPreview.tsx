import { useEffect, useRef } from 'react';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { renderContentWithCodeBlocks } from './CodeBlockRenderer';

interface Props {
  visible: boolean;
  /** Accumulated full text so far */
  text: string;
}

// 「贴近底部」阈值:用户主动上滑超过这个距离就不再强抢回底,免得"我想看上面历史"被流式拽回去。
const NEAR_BOTTOM_PX = 40;

export function StreamingPreview({ visible, text }: Props) {
  const thRender = useTavernHelperStore((s) => s.render);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Auto-scroll to bottom — RAF 合并多 token 触发,避免每 chunk 触发同步 layout(scrollTop=scrollHeight 是 read+write,强制 reflow)。
  // 仅当 scrollTop 已接近底部时才拉回,玩家手动上滑后不强抢。
  useEffect(() => {
    if (!visible || !scrollRef.current) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      if (nearBottom) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, visible]);

  if (!visible || !text) return null;

  const rendered = renderContentWithCodeBlocks(text, {
    enabled: thRender.renderEnabled,
    collapse: thRender.codeCollapse,
    noHighlight: thRender.disableCodeHighlight,
  });

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 24, zIndex: 850,
      // width clamp:极窄桌面/分屏视口下也不会溢出右沿。手机端浮窗已由 InputBar 跳过渲染。
      width: 'min(420px, calc(100vw - 48px))', maxHeight: 'min(360px, 50vh)',
      background: 'linear-gradient(180deg, rgba(20,16,12,0.96) 0%, rgba(13,10,7,0.98) 100%)',
      border: '1px solid var(--gold)', borderRadius: 6,
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-ui)',
    }}>
      <div style={{
        padding: '6px 12px', flexShrink: 0,
        borderBottom: '1px solid rgba(196,168,85,0.12)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--gold)', letterSpacing: 2, fontFamily: 'var(--font-mono)' }}>
          ◈ 流式渲染中...
        </span>
        <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-subtle)' }}>
          {text.length} 字符
        </span>
      </div>
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '8px 12px',
        fontSize: 'calc(12px * var(--system-ratio, 1))', color: 'var(--text-light)', lineHeight: 1.6,
        scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)',
      }}>
        {rendered.length === 1 && typeof rendered[0] === 'string' ? (
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{rendered[0]}</p>
        ) : (
          rendered.map((node, i) => typeof node === 'string'
            ? <p key={i} style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{node}</p>
            : <span key={i}>{node}</span>)
        )}
      </div>
    </div>
  );
}
