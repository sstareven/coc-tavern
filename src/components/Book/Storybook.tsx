import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBookStore } from '../../stores/useBookStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { usePanelStore } from '../../stores/usePanelStore';
import { usePageFlip } from '../../hooks/usePageFlip';
import { LeftPage } from './LeftPage';
import { RightPage } from './RightPage';
import { PageNav } from './PageNav';
import { CSSFlipPage, FadingPage, AppearPage } from './PageFlip3D';
import { BookUtils } from '../Shared/BookUtils';
import { TokenDisplay } from '../Shared/TokenDisplay';

export function Storybook() {
  const pages = useBookStore((s) => s.pages);
  const [showToc, setShowToc] = useState(false);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const isFlipping = useBookStore((s) => s.isFlipping);
  const flipProgress = useBookStore((s) => s.flipProgress);
  const direction = useBookStore((s) => s.flipDirection);
  const { flipForward, flipBackward, canGoNext, canGoPrev } = usePageFlip();

  const page = pages[pageIndex];
  if (!page) return null;

  // Debug: log right page data source
  if (page.rightHeader === '行动' && page.rightContent === '接下来你打算怎么做？') {
    console.warn('[Storybook] 第' + pageIndex + '页右页使用默认值 — 可能JSON解析失败或字段缺失', page);
  }

  const deletePageStore = useBookStore((s) => s.deletePage);

  const deletePage = () => {
    deletePageStore(pageIndex);
  };

  // --- paper-style bookmark tab ---
  const bookmarkTab: React.CSSProperties = {
    width: 130,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 14,
    fontFamily: '"PingFang SC", "DengXian", "Noto Serif SC", var(--font-ui), sans-serif',
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#4a3020',
    background: `
      linear-gradient(175deg, #f2e0c0 0%, #e8d0a0 50%, #f0dab0 100%)
    `,
    border: '1px solid rgba(139,100,60,0.2)',
    borderLeft: 'none',
    borderRadius: '2px 6px 6px 2px',
    cursor: 'pointer',
    boxShadow: `
      1px 2px 4px rgba(0,0,0,0.12),
      inset 0 1px 0 rgba(255,255,255,0.3)
    `,
    transition: 'all 0.25s ease',
    position: 'relative' as const,
  };

  const tocTabActive: React.CSSProperties = {
    ...bookmarkTab,
    color: 'var(--gold)',
    background: 'linear-gradient(175deg, #1a1510 0%, #0e0c08 50%, #1a1510 100%)',
    border: '1px solid rgba(196,168,85,0.3)',
    borderLeft: 'none',
    boxShadow: '1px 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(196,168,85,0.1)',
    paddingLeft: 18,
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      padding: '0 64px',
    }}>
      <style>{`
        .lp-scroll::-webkit-scrollbar,.rp-scroll::-webkit-scrollbar{width:5px}
        .lp-scroll::-webkit-scrollbar-track,.rp-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.06);border-radius:3px}
        .lp-scroll::-webkit-scrollbar-thumb,.rp-scroll::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}
        .lp-scroll::-webkit-scrollbar-thumb:hover,.rp-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}
      `}</style>
      {/* Relative container wrapping book + utils + bookmarks */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 880,
      }}>
        {/* BookUtils — outside the book at top-right */}
        <BookUtils onDeletePage={deletePage} />

        {/* Book container — perspective for 3D page flip */}
        <div style={{
          position: 'relative',
          zIndex: 3,
          display: 'flex',
          width: '100%',
          height: 520,
          perspective: '1400px',
          perspectiveOrigin: 'center center',
          borderRadius: 4,
          background: 'linear-gradient(180deg, rgba(42,31,20,0.95) 0%, rgba(32,24,16,0.98) 100%)',
          boxShadow: [
            // Main floating shadow
            '0 4px 24px rgba(0,0,0,0.5)',
            '0 1px 4px rgba(0,0,0,0.3)',
            'inset 0 0 0 1px rgba(196,168,85,0.08)',
            // Left cover edge — dark leather thickness
            '-8px 0 12px -4px rgba(0,0,0,0.6)',
            // Right page stack edge — paper-toned
            '6px 0 10px -2px rgba(180,164,130,0.15)',
          ].join(', '),
        }}>
          {/* Book thickness — left cover edge pseudo-element effect */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 14,
            background: 'linear-gradient(to right, rgba(20,14,8,0.55) 0%, rgba(40,28,16,0.3) 40%, transparent 100%)',
            borderRadius: '4px 0 0 4px',
            pointerEvents: 'none',
            zIndex: 1,
          }} />

          {/* Book thickness — right page stack edge */}
          <div style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 14,
            background: 'linear-gradient(to left, rgba(180,164,130,0.18) 0%, rgba(212,196,160,0.06) 40%, transparent 100%)',
            borderRadius: '0 4px 4px 0',
            pointerEvents: 'none',
            zIndex: 1,
          }} />

          {/* Book thickness — bottom page stack with line texture */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 14,
            right: 14,
            height: 18,
            background: [
              'linear-gradient(to top, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.12) 30%, transparent 100%)',
              'repeating-linear-gradient(to top, rgba(180,164,130,0.06) 0px, rgba(180,164,130,0.06) 1px, transparent 1px, transparent 3px)',
            ].join(', '),
            borderRadius: '0 0 4px 4px',
            pointerEvents: 'none',
            zIndex: 0,
          }} />

          {/* Top shadow */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 14,
            right: 14,
            height: 8,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, transparent 100%)',
            pointerEvents: 'none',
            zIndex: 1,
          }} />

          {/* [A] 左页 */}
          <div style={{
            flex: 1, display: 'flex', position: 'relative', minHeight: 0,
            background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
            borderRadius: '3px 0 0 3px',
          }}>
            {isFlipping ? (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex' }}>
                {direction === 'backward' ? (
                  /* [A] flips to the right — rotating + fading out */
                  <CSSFlipPage progress={flipProgress} direction="backward">
                    <LeftPage header={page.leftHeader} content={page.leftContent} pageNum={page.leftPage} />
                  </CSSFlipPage>
                ) : (
                  /* Forward: [A] stays static, text fades out gradually */
                  <FadingPage progress={flipProgress}>
                    <LeftPage header={page.leftHeader} content={page.leftContent} pageNum={page.leftPage} />
                  </FadingPage>
                )}
              </div>
            ) : (
              <AppearPage pageIndex={pageIndex}>
                <LeftPage header={page.leftHeader} content={page.leftContent} pageNum={page.leftPage} />
              </AppearPage>
            )}
          </div>

          {/* [C] 书脊 */}
          <div style={{
            width: 2, flexShrink: 0,
            background: 'linear-gradient(to right, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.03) 50%, rgba(0,0,0,0.06) 100%)',
          }} />

          {/* [B] 右页 */}
          <div style={{
            flex: 1, display: 'flex', position: 'relative', minHeight: 0,
            background: 'linear-gradient(225deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
            borderRadius: '0 3px 3px 0',
          }}>
            {isFlipping ? (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex' }}>
                {direction === 'forward' ? (
                  /* [B] flips to the left — rotating + fading out */
                  <CSSFlipPage progress={flipProgress} direction="forward">
                    <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} />
                  </CSSFlipPage>
                ) : (
                  /* Backward: [B] stays static, text fades out gradually */
                  <FadingPage progress={flipProgress}>
                    <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} />
                  </FadingPage>
                )}
              </div>
            ) : (
              <AppearPage pageIndex={pageIndex}>
                <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} />
              </AppearPage>
            )}
          </div>

          {/* TokenDisplay — inside book at bottom-right */}
          <TokenDisplay />

          {/* Table of Contents overlay */}
          <AnimatePresence>
            {showToc && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  position: 'absolute', inset: 0, zIndex: 10,
                  background: 'linear-gradient(180deg, #0a0808 0%, #12100c 50%, #0a0808 100%)',
                  borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}
              >
                <div style={{ padding: '32px 40px 16px', borderBottom: '1px solid rgba(196,168,85,0.2)', flexShrink: 0 }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold)', letterSpacing: 8, margin: 0 }}>目录</h2>
                  <p style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'rgba(196,168,85,0.4)', letterSpacing: 4, marginTop: 4 }}>TABLE OF CONTENTS</p>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 28px', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.3)' }}>
                  {pages.map((p, i) => {
                    const isCurrent = i === pageIndex;
                    return (
                      <div
                        key={i}
                        onClick={() => { useBookStore.getState().goToPage(i); setShowToc(false); }}
                        style={{
                          display: 'flex', gap: 14, alignItems: 'baseline', padding: '10px 12px', cursor: 'pointer',
                          borderBottom: '1px solid rgba(196,168,85,0.06)',
                          background: isCurrent ? 'rgba(196,168,85,0.08)' : 'transparent',
                          borderLeft: isCurrent ? '2px solid var(--gold)' : '2px solid transparent',
                          transition: 'var(--transition-smooth)',
                        }}
                        onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'rgba(196,168,85,0.05)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = isCurrent ? 'rgba(196,168,85,0.08)' : 'transparent'; }}
                      >
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(196,168,85,0.35)', flexShrink: 0, width: 24 }}>{p.leftPage}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: isCurrent ? 'var(--gold)' : 'rgba(196,168,85,0.75)', letterSpacing: 2 }}>
                            {p.leftHeader}
                          </div>
                          {p.summary && (
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'rgba(196,168,85,0.35)', marginTop: 3, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.summary}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation arrows */}
          <PageNav
            onFlipForward={flipForward}
            onFlipBackward={flipBackward}
            canGoNext={canGoNext}
            canGoPrev={canGoPrev}
          />
        </div>

        {/* Bookmark tabs — positioned on the LEFT, tucked under book edge */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: '20%',
          transform: 'translateX(-85%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          zIndex: 2,
        }}>
          {/* Tab 1: 调查员记录 → character sheet */}
          <button
            onClick={() => useCharSheetStore.getState().toggle()}
            style={bookmarkTab}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#8b3a3a';
              e.currentTarget.style.background = 'linear-gradient(175deg, #f8ecd0 0%, #edd8a8 50%, #f4e4c0 100%)';
              e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)';
              e.currentTarget.style.paddingLeft = '18px';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#4a3020';
              e.currentTarget.style.background = 'linear-gradient(175deg, #f2e0c0 0%, #e8d0a0 50%, #f0dab0 100%)';
              e.currentTarget.style.boxShadow = '1px 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)';
              e.currentTarget.style.paddingLeft = '14px';
            }}
          >
            <span style={{ marginRight: 6, fontSize: 10, opacity: 0.5 }}>✦</span>
            调查员记录
          </button>

          {/* Tab 2: 目录 → table of contents overlay */}
          <button
            onClick={() => setShowToc(!showToc)}
            style={showToc ? tocTabActive : bookmarkTab}
            onMouseEnter={(e) => {
              if (!showToc) {
                e.currentTarget.style.color = '#8b3a3a';
                e.currentTarget.style.background = 'linear-gradient(175deg, #f8ecd0 0%, #edd8a8 50%, #f4e4c0 100%)';
                e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)';
                e.currentTarget.style.paddingLeft = '18px';
              }
            }}
            onMouseLeave={(e) => {
              if (!showToc) {
                e.currentTarget.style.color = '#4a3020';
                e.currentTarget.style.background = 'linear-gradient(175deg, #f2e0c0 0%, #e8d0a0 50%, #f0dab0 100%)';
                e.currentTarget.style.boxShadow = '1px 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)';
                e.currentTarget.style.paddingLeft = '14px';
              }
            }}
          >
            <span style={{ marginRight: 6, fontSize: 10, opacity: 0.5 }}>{showToc ? '◁' : '☰'}</span>
            {showToc ? '返回' : '目录'}
          </button>

          {/* Tab 3: 检定记录 → dice history */}
          <button
            onClick={() => usePanelStore.getState().open('diceHistory')}
            style={bookmarkTab}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#8b3a3a';
              e.currentTarget.style.background = 'linear-gradient(175deg, #f8ecd0 0%, #edd8a8 50%, #f4e4c0 100%)';
              e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)';
              e.currentTarget.style.paddingLeft = '18px';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#4a3020';
              e.currentTarget.style.background = 'linear-gradient(175deg, #f2e0c0 0%, #e8d0a0 50%, #f0dab0 100%)';
              e.currentTarget.style.boxShadow = '1px 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)';
              e.currentTarget.style.paddingLeft = '14px';
            }}
          >
            <span style={{ marginRight: 6, fontSize: 10, opacity: 0.5 }}>◈</span>
            检定记录
          </button>
        </div>
      </div>
    </div>
  );
}
