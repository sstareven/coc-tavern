// src/components/Book/TocOverlay.tsx
import { motion } from 'framer-motion';
import type { BookPage } from '../../types';
import { useIsMobile } from '../../hooks/useIsMobile';

interface Props {
  pages: BookPage[];
  pageIndex: number;
  selectedToc: number;
  onSelect: (i: number) => void;
}

/** 目录覆盖层（书页风格）。从 Storybook 抽出，桌面/手机共用。 */
export function TocOverlay({ pages, pageIndex, selectedToc, onSelect }: Props) {
  const isMobile = useIsMobile();
  return (
    <motion.div
      initial="enter"
      animate="visible"
      exit="exit"
      variants={{
        enter: { opacity: 0 },
        visible: { opacity: 1 },
        exit: { opacity: 0 },
      }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: 'absolute', inset: 0, zIndex: 10,
        display: 'flex', borderRadius: 4,
      }}
    >
      <style>{`
        @keyframes tocTicker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .toc-marquee-track { display: flex; width: max-content; animation: tocTicker var(--toc-dur, 10s) linear infinite; }
        .toc-marquee-track span { flex-shrink: 0; padding-right: 80px; }
      `}</style>

      {/* Left page — Title（手机端隐藏装饰标题页） */}
      <motion.div
        style={{
          flex: '1 1 0', display: isMobile ? 'none' : 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center',
          background: 'linear-gradient(180deg, #0a0808 0%, #12100c 50%, #0a0808 100%)',
          borderRadius: '4px 0 0 4px',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: 120, height: 1, background: 'rgba(196,168,85,0.15)', marginBottom: 28 }} />
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--gold)', letterSpacing: 10, margin: 0 }}>目录</h2>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'rgba(196,168,85,0.4)', letterSpacing: 5, marginTop: 6 }}>TABLE OF CONTENTS</p>
        <div style={{ width: 120, height: 1, background: 'rgba(196,168,85,0.15)', marginTop: 28 }} />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(196,168,85,0.25)', marginTop: 32, letterSpacing: 2 }}>
          共 {pages.length * 2 + 2} 页
        </p>
      </motion.div>

      {/* Spine */}
      <div style={{
        width: 2, flexShrink: 0, display: isMobile ? 'none' : 'block',
        background: 'linear-gradient(to right, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.03) 50%, rgba(0,0,0,0.06) 100%)',
      }} />

      {/* Right page — Entries */}
      <motion.div
        variants={isMobile ? undefined : { exit: { rotateY: -180 } }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        style={{
          flex: '1 1 0', display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, #0a0808 0%, #12100c 50%, #0a0808 100%)',
          borderRadius: isMobile ? 4 : '0 4px 4px 0',
          transformOrigin: '0% 50%',
          backfaceVisibility: 'hidden',
          overflow: 'hidden',
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.3)' }}>
          {pages.map((p, i) => {
            const isCurrent = i === pageIndex;
            const isSelected = i === selectedToc;
            return (
              <div
                key={i}
                className="cv-row"
                onClick={() => onSelect(isSelected ? -1 : i)}
                style={{
                  display: 'flex', gap: 10, alignItems: 'baseline', padding: isSelected ? '14px 10px' : '10px 10px', cursor: 'pointer',
                  borderBottom: '1px solid rgba(196,168,85,0.06)',
                  background: isSelected ? 'rgba(196,168,85,0.12)' : isCurrent ? 'rgba(196,168,85,0.06)' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--gold)' : isCurrent ? '2px solid rgba(196,168,85,0.4)' : '2px solid transparent',
                  transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = isCurrent ? 'rgba(196,168,85,0.08)' : 'rgba(196,168,85,0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? 'rgba(196,168,85,0.12)' : isCurrent ? 'rgba(196,168,85,0.06)' : 'transparent'; }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: isSelected ? 12 : 10,
                  color: isSelected ? 'var(--gold)' : 'rgba(196,168,85,0.35)',
                  flexShrink: 0, width: 24,
                  transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                }}>{p.leftPage}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: isSelected ? 16 : 14,
                    color: isSelected ? 'var(--gold)' : isCurrent ? 'rgba(196,168,85,0.8)' : 'rgba(196,168,85,0.55)',
                    letterSpacing: isSelected ? 3 : 2,
                    transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}>
                    {p.leftHeader}
                  </div>
                  {p.summary && (
                    <div style={{
                      fontFamily: 'var(--font-body)', fontSize: 11,
                      color: isSelected ? 'rgba(196,168,85,0.55)' : 'rgba(196,168,85,0.25)',
                      marginTop: 3, lineHeight: 1.5,
                      overflow: 'hidden', whiteSpace: 'nowrap', position: 'relative',
                      transition: 'color 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                      textOverflow: isSelected ? 'clip' : 'ellipsis',
                      maskImage: isSelected ? 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)' : 'none',
                      WebkitMaskImage: isSelected ? 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)' : 'none',
                    }}>
                      {isSelected ? (
                        <div className="toc-marquee-track" style={{ '--toc-dur': `${Math.max(6, (p.summary || '').length * 0.2 + 2)}s` } as React.CSSProperties}>
                          <span>{p.summary}</span>
                          <span>{p.summary}</span>
                        </div>
                      ) : (
                        <span>{p.summary}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
