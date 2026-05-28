import { useState, useRef, useCallback, useEffect } from 'react';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { renderContentWithCodeBlocks } from '../Shared/CodeBlockRenderer';
import { beautifyText } from '../Shared/TextBeautifier';

interface Props {
  header: string;
  content: string;
  pageNum: string;
  isFlipping?: boolean;
}

function useScrollGlow() {
  const [edge, setEdge] = useState<'none' | 'top' | 'bottom'>('none');
  const lastY = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const dir = el.scrollTop > lastY.current ? 'bottom' : 'top';
    lastY.current = el.scrollTop;
    setEdge(dir);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setEdge('none'), 800);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { edge, onScroll };
}

const PARTICLE_COUNT = 8;

function ScrollParticles({ edge }: { edge: 'top' | 'bottom' }) {
  const [particles] = useState(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      left: 8 + Math.random() * 84,
      size: 2 + Math.random() * 3,
      duration: 1.2 + Math.random() * 1.0,
      delay: Math.random() * 0.5,
      drift: -10 + Math.random() * 20,
    }))
  );

  const isBottom = edge === 'bottom';

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, height: 40, pointerEvents: 'none', zIndex: 2, overflow: 'hidden',
      ...(isBottom ? { bottom: 30 } : { top: 40 }),
    }}>
      <div style={{
        position: 'absolute', left: '5%', right: '5%', height: 1,
        ...(isBottom ? { bottom: 0 } : { top: 0 }),
        background: 'linear-gradient(90deg, transparent 0%, rgba(196,168,85,0.4) 30%, rgba(196,168,85,0.6) 50%, rgba(196,168,85,0.4) 70%, transparent 100%)',
        boxShadow: '0 0 8px rgba(196,168,85,0.3), 0 0 20px rgba(196,168,85,0.15)',
        animation: 'glowPulse 1.5s ease-in-out infinite alternate',
      }} />
      {particles.map((p) => (
        <div key={p.id} style={{
          position: 'absolute',
          left: `${p.left}%`,
          ...(isBottom ? { bottom: 0 } : { top: 0 }),
          width: p.size, height: p.size, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(196,168,85,0.9) 0%, rgba(196,168,85,0) 70%)',
          boxShadow: `0 0 ${p.size * 2}px rgba(196,168,85,0.4)`,
          animation: `particleFloat${isBottom ? 'Up' : 'Down'} ${p.duration}s ease-out ${p.delay}s infinite`,
          opacity: 0,
        }} />
      ))}
      <style>{`
        @keyframes particleFloatUp {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          15% { opacity: 0.8; }
          100% { transform: translateY(-35px) translateX(var(--drift, 5px)); opacity: 0; }
        }
        @keyframes particleFloatDown {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          15% { opacity: 0.8; }
          100% { transform: translateY(35px) translateX(var(--drift, 5px)); opacity: 0; }
        }
        @keyframes glowPulse {
          0% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function LeftPage({ header, content, pageNum, isFlipping }: Props) {
  const thRender = useTavernHelperStore((s) => s.render);
  const pt = useTavernHelperStore((s) => s.promptTemplate);
  const { edge, onScroll } = useScrollGlow();
  const fadeStyle = {
    opacity: isFlipping ? 0 : 1,
    transition: isFlipping ? 'opacity 0.35s ease-in' : 'opacity 0.6s ease-out 0.6s',
  };
  // Skip rendering if PT disabled or render disabled
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
      padding: '28px 24px 20px 28px', minHeight: 0,
      background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
      borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
      boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.04)',
      color: 'var(--ink)', fontFamily: 'var(--font-body)',
      fontSize: 15, lineHeight: 1.75, position: 'relative',
    }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 4, marginBottom: 16, borderBottom: '1px solid rgba(107,90,58,0.25)', paddingBottom: 10, flexShrink: 0, ...fadeStyle }}>{header}</h3>
      {edge !== 'none' && <ScrollParticles edge={edge} />}
      <div className="lp-scroll" onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', paddingRight: 6, minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)', ...fadeStyle }}>
        {renderedContent.length === 1 && typeof renderedContent[0] === 'string' ? (
          <p style={{ textIndent: '2em', marginBottom: 12 }}>{beautifyText(renderedContent[0])}</p>
        ) : (
          renderedContent.map((node, i) => typeof node === 'string'
            ? <p key={i} style={{ textIndent: '2em', marginBottom: 8 }}>{beautifyText(node)}</p>
            : <span key={i}>{node}</span>)
        )}
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', letterSpacing: 3, paddingTop: 10, borderTop: '1px solid rgba(107,90,58,0.15)', flexShrink: 0, ...fadeStyle }}>{pageNum}</div>
    </div>
  );
}
