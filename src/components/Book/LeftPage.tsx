import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { renderContentWithCodeBlocks } from '../Shared/CodeBlockRenderer';
import { beautifyText } from '../Shared/TextBeautifier';
import { useScrollGlow, ScrollParticles } from './ScrollParticles';

interface Props {
  header: string;
  content: string;
  pageNum: string;
  isFlipping?: boolean;
}

export function LeftPage({ header, content, pageNum, isFlipping }: Props) {
  const thRender = useTavernHelperStore((s) => s.render);
  const pt = useTavernHelperStore((s) => s.promptTemplate);
  const { edge, intensity, fading, onScroll } = useScrollGlow();
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
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {edge !== 'none' && <ScrollParticles edge={edge} fading={fading} intensity={intensity} />}
        <div className="lp-scroll" onScroll={onScroll} style={{ height: '100%', overflowY: 'auto', paddingRight: 6, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)', ...fadeStyle }}>
        {renderedContent.length === 1 && typeof renderedContent[0] === 'string' ? (
          <p style={{ textIndent: '2em', marginBottom: 12 }}>{beautifyText(renderedContent[0])}</p>
        ) : (
          renderedContent.map((node, i) => typeof node === 'string'
            ? <p key={i} style={{ textIndent: '2em', marginBottom: 8 }}>{beautifyText(node)}</p>
            : <span key={i}>{node}</span>)
        )}
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', letterSpacing: 3, paddingTop: 10, borderTop: '1px solid rgba(107,90,58,0.15)', flexShrink: 0, ...fadeStyle }}>{pageNum}</div>
    </div>
  );
}
