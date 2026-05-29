import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { renderContentWithCodeBlocks } from '../Shared/CodeBlockRenderer';
import { beautifyText } from '../Shared/TextBeautifier';
import { useScrollGlow, ScrollParticles } from './ScrollParticles';
import type { DiceRecord } from '../../types';

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
}

export function LeftPage({ header, content, pageNum, isFlipping, summary, diceResults }: Props) {
  const thRender = useTavernHelperStore((s) => s.render);
  const pt = useTavernHelperStore((s) => s.promptTemplate);
  const { edge, intensity, fading, onScroll } = useScrollGlow();
  const fadeStyle = {
    opacity: isFlipping ? 0 : 1,
    transition: isFlipping ? 'opacity 0.35s ease-in' : 'opacity 0.6s ease-out 0.6s',
  };
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
      fontSize: 15, lineHeight: 1.75, position: 'relative',
    }}>
      <div style={{ flexShrink: 0, marginBottom: 12, borderBottom: '1px solid rgba(107,90,58,0.25)', paddingBottom: 8, ...fadeStyle }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 4, margin: 0 }}>{header}</h3>
        {diceResults && diceResults.length > 0 && diceResults.slice(0, 2).map((d, i) => {
          const rc = RESULT_COLORS[d.type] || RESULT_COLORS['failure'];
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
            }}>
              <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${rc.color}55)` }} />
              <span style={{
                fontSize: 9, fontFamily: 'var(--font-ui)', color: rc.color,
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
            fontSize: 10, fontFamily: 'var(--font-body)', color: 'var(--ink-subtle)',
            fontStyle: 'italic', letterSpacing: 0.3, lineHeight: 1.6,
            margin: '6px 0 0', textIndent: '2em',
          }}>{summary}</p>
        )}
      </div>

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
