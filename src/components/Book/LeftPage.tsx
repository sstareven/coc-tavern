import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { renderContentWithCodeBlocks } from '../Shared/CodeBlockRenderer';
import { beautifyText } from '../Shared/TextBeautifier';
import { useScrollGlow, ScrollParticles } from './ScrollParticles';
import type { DiceRecord } from '../../types';

const RESULT_COLORS: Record<string, { color: string; bg: string }> = {
  'crit-success': { color: '#c4a855', bg: 'rgba(196,168,85,0.12)' },
  'extreme-success': { color: '#5a8a4a', bg: 'rgba(90,138,74,0.1)' },
  'hard-success': { color: '#5a8a4a', bg: 'rgba(90,138,74,0.08)' },
  'success': { color: '#6b7a4a', bg: 'rgba(107,122,74,0.08)' },
  'failure': { color: '#8b6040', bg: 'rgba(139,96,64,0.08)' },
  'crit-failure': { color: '#8b3a3a', bg: 'rgba(139,58,58,0.1)' },
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

  const hasMeta = !!(summary || (diceResults && diceResults.length > 0));

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
      <style>{`
        @keyframes critGlow {
          0% { box-shadow: 0 0 4px rgba(196,168,85,0.3), 0 0 8px rgba(196,168,85,0.15); }
          100% { box-shadow: 0 0 8px rgba(196,168,85,0.5), 0 0 16px rgba(196,168,85,0.25), 0 0 24px rgba(196,168,85,0.1); }
        }
        @keyframes critFailGlow {
          0% { box-shadow: 0 0 4px rgba(139,58,58,0.3), 0 0 8px rgba(139,58,58,0.15); }
          100% { box-shadow: 0 0 8px rgba(139,58,58,0.5), 0 0 16px rgba(139,58,58,0.25), 0 0 24px rgba(139,58,58,0.1); }
        }
      `}</style>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 4, marginBottom: hasMeta ? 8 : 16, borderBottom: '1px solid rgba(107,90,58,0.25)', paddingBottom: 10, flexShrink: 0, ...fadeStyle }}>{header}</h3>

      {hasMeta && (
        <div style={{ flexShrink: 0, marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', ...fadeStyle }}>
          {summary && (
            <span style={{
              fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)',
              fontStyle: 'italic', letterSpacing: 0.5, lineHeight: 1.4,
              flex: '1 1 auto', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{summary}</span>
          )}
          {diceResults && diceResults.map((d, i) => {
            const rc = RESULT_COLORS[d.type] || RESULT_COLORS['failure'];
            const isCrit = d.type === 'crit-success';
            const isCritFail = d.type === 'crit-failure';
            return (
              <span key={i} style={{
                fontSize: 9, fontFamily: 'var(--font-mono)', flexShrink: 0,
                padding: '2px 8px', borderRadius: 3,
                color: rc.color,
                background: (isCrit || isCritFail) ? 'rgba(80,60,30,0.2)' : rc.bg,
                border: `1px solid ${rc.color}33`,
                boxShadow: isCrit
                  ? `0 0 6px rgba(196,168,85,0.4), 0 0 12px rgba(196,168,85,0.2)`
                  : isCritFail
                  ? `0 0 6px rgba(139,58,58,0.4), 0 0 12px rgba(139,58,58,0.2)`
                  : 'none',
                animation: isCrit ? 'critGlow 2s ease-in-out infinite alternate' : isCritFail ? 'critFailGlow 2s ease-in-out infinite alternate' : 'none',
              }}>
                {d.skill} {RESULT_LABELS[d.type] || d.type}
              </span>
            );
          })}
        </div>
      )}

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
