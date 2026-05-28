import { useEffect, useRef } from 'react';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { renderContentWithCodeBlocks } from './CodeBlockRenderer';

interface Props {
  visible: boolean;
  /** Accumulated full text so far */
  text: string;
}

export function StreamingPreview({ visible, text }: Props) {
  const thRender = useTavernHelperStore((s) => s.render);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!visible || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
      width: 420, maxHeight: 360,
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
        <span style={{ fontSize: 10, color: 'var(--gold)', letterSpacing: 2, fontFamily: 'var(--font-mono)' }}>
          ◈ 流式渲染中...
        </span>
        <span style={{ fontSize: 9, color: 'var(--ink-subtle)' }}>
          {text.length} 字符
        </span>
      </div>
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '8px 12px',
        fontSize: 12, color: 'var(--text-light)', lineHeight: 1.6,
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
