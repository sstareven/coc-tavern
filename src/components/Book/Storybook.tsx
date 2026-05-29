import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBookStore } from '../../stores/useBookStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { InventoryOverlay } from '../Inventory/InventoryPanel';
import { usePanelStore } from '../../stores/usePanelStore';
import { usePageFlip } from '../../hooks/usePageFlip';
import { LeftPage } from './LeftPage';
import { RightPage } from './RightPage';
import { PageNav } from './PageNav';
import { CSSFlipPage, FadingPage, AppearPage, FlipShadow } from './PageFlip3D';
import { BookUtils } from '../Shared/BookUtils';
import { TokenDisplay } from '../Shared/TokenDisplay';
import { sfxPageFlip } from '../../audio/sfx';

export function Storybook() {
  const pages = useBookStore((s) => s.pages);
  const [showToc, setShowToc] = useState(false);
  const [selectedToc, setSelectedToc] = useState(-1);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const isFlipping = useBookStore((s) => s.isFlipping);
  const flipProgress = useBookStore((s) => s.flipProgress);
  const direction = useBookStore((s) => s.flipDirection);
  const { flipForward, flipBackward, canGoNext, canGoPrev } = usePageFlip();
  const inventoryOpen = useInventoryStore((s) => s.isOpen);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inventoryOpen) useInventoryStore.getState().close();
        if (showToc) { setShowToc(false); setSelectedToc(-1); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [inventoryOpen, showToc]);

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
    borderTop: '1px solid rgba(139,100,60,0.2)',
    borderRight: '1px solid rgba(139,100,60,0.2)',
    borderBottom: '1px solid rgba(139,100,60,0.2)',
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
    borderTop: '1px solid rgba(196,168,85,0.3)',
    borderRight: '1px solid rgba(196,168,85,0.3)',
    borderBottom: '1px solid rgba(196,168,85,0.3)',
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
        .lp-scroll::-webkit-scrollbar,.rp-scroll::-webkit-scrollbar,.inv-scroll::-webkit-scrollbar{width:5px}
        .lp-scroll::-webkit-scrollbar-track,.rp-scroll::-webkit-scrollbar-track,.inv-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.06);border-radius:3px}
        .lp-scroll::-webkit-scrollbar-thumb,.rp-scroll::-webkit-scrollbar-thumb,.inv-scroll::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}
        .lp-scroll::-webkit-scrollbar-thumb:hover,.rp-scroll::-webkit-scrollbar-thumb:hover,.inv-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}
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
            flex: '1 1 0', display: 'flex', position: 'relative', minHeight: 0, minWidth: 0,
            background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
            borderRadius: '3px 0 0 3px',
          }}>
            {isFlipping ? (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex' }}>
                {direction === 'backward' ? (
                  /* [A] flips to the right — rotating + fading out */
                  <CSSFlipPage progress={flipProgress} direction="backward">
                    <LeftPage header={page.leftHeader} content={page.leftContent} pageNum={page.leftPage} summary={page.summary} diceResults={page.diceResults} />
                  </CSSFlipPage>
                ) : (
                  /* Forward: [A] stays static, text fades out gradually */
                  <>
                    <FadingPage progress={flipProgress}>
                      <LeftPage header={page.leftHeader} content={page.leftContent} pageNum={page.leftPage} summary={page.summary} diceResults={page.diceResults} />
                    </FadingPage>
                    <FlipShadow progress={flipProgress} side="left" />
                  </>
                )}
              </div>
            ) : (
              <AppearPage pageIndex={pageIndex}>
                <LeftPage header={page.leftHeader} content={page.leftContent} pageNum={page.leftPage} summary={page.summary} diceResults={page.diceResults} />
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
            flex: '1 1 0', display: 'flex', position: 'relative', minHeight: 0, minWidth: 0,
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
                  <>
                    <FadingPage progress={flipProgress}>
                      <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} />
                    </FadingPage>
                    <FlipShadow progress={flipProgress} side="right" />
                  </>
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

                {/* Left page — Title */}
                <motion.div
                  style={{
                    flex: '1 1 0', display: 'flex', flexDirection: 'column',
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
                    共 {pages.length} 页
                  </p>
                </motion.div>

                {/* Spine */}
                <div style={{
                  width: 2, flexShrink: 0,
                  background: 'linear-gradient(to right, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.03) 50%, rgba(0,0,0,0.06) 100%)',
                }} />

                {/* Right page — Entries */}
                <motion.div
                  variants={{ exit: { rotateY: -180 } }}
                  transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                  style={{
                    flex: '1 1 0', display: 'flex', flexDirection: 'column',
                    background: 'linear-gradient(180deg, #0a0808 0%, #12100c 50%, #0a0808 100%)',
                    borderRadius: '0 4px 4px 0',
                    transformOrigin: '0% 50%',
                    backfaceVisibility: 'hidden',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.3)' }}>
                    {pages.map((p, i) => {
                      const isCurrent = i === pageIndex;
                      const isSelected = i === selectedToc;
                      return (
                        <div
                          key={i}
                          onClick={() => { setSelectedToc(isSelected ? -1 : i); }}
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
                  <motion.div
                    variants={{ exit: { opacity: 0.15 } }}
                    initial={{ opacity: 0 }}
                    style={{
                      position: 'absolute', inset: 0, pointerEvents: 'none',
                      background: 'linear-gradient(to left, rgba(0,0,0,0.3) 0%, transparent 60%)',
                      borderRadius: '0 4px 4px 0',
                    }}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inventory overlay — book-page style */}
          <AnimatePresence>
            {inventoryOpen && <InventoryOverlay />}
          </AnimatePresence>

          {/* Navigation arrows — hidden when TOC or Inventory is open */}
          <div style={{
            opacity: showToc || inventoryOpen ? 0 : 1, pointerEvents: showToc || inventoryOpen ? 'none' : 'auto',
            transition: 'opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>
            <PageNav
              onFlipForward={flipForward}
              onFlipBackward={flipBackward}
              canGoNext={canGoNext}
              canGoPrev={canGoPrev}
            />
          </div>
        </div>

        {/* Bookmark tabs — positioned on the LEFT, tucked under book edge */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: '12%',
          transform: 'translateX(-100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          zIndex: 2,
        }}>
          {/* Tab 0: 背包/装备 → inventory overlay */}
          <button
            onClick={() => {
              if (inventoryOpen) {
                try { sfxPageFlip(); } catch { /* audio not available */ }
                useInventoryStore.getState().close();
                return;
              }
              useCharSheetStore.getState().close();
              if (showToc) { setShowToc(false); setSelectedToc(-1); }
              useBookStore.getState().decorativeFlip('backward', 800);
              useInventoryStore.getState().toggle();
            }}
            style={inventoryOpen ? tocTabActive : bookmarkTab}
            onMouseEnter={(e) => {
              if (!inventoryOpen) {
                e.currentTarget.style.color = '#8b3a3a';
                e.currentTarget.style.background = 'linear-gradient(175deg, #f8ecd0 0%, #edd8a8 50%, #f4e4c0 100%)';
                e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)';
                e.currentTarget.style.paddingLeft = '18px';
              }
            }}
            onMouseLeave={(e) => {
              if (!inventoryOpen) {
                e.currentTarget.style.color = '#4a3020';
                e.currentTarget.style.background = 'linear-gradient(175deg, #f2e0c0 0%, #e8d0a0 50%, #f0dab0 100%)';
                e.currentTarget.style.boxShadow = '1px 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)';
                e.currentTarget.style.paddingLeft = '14px';
              }
            }}
          >
            <span style={{ marginRight: 6, fontSize: 10, opacity: 0.5 }}>{inventoryOpen ? '◁' : '◆'}</span>
            {inventoryOpen ? '返回' : '背包/装备'}
          </button>

          {/* Tab 1: 调查员记录 → character sheet */}
          <button
            onClick={() => {
              useInventoryStore.getState().close();
              useCharSheetStore.getState().toggle();
            }}
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
            onClick={() => {
              if (showToc) {
                if (selectedToc >= 0) useBookStore.getState().goToPage(selectedToc);
                setSelectedToc(-1);
                try { sfxPageFlip(); } catch { /* audio not available */ }
                setShowToc(false);
                return;
              }
              useInventoryStore.getState().close();
              useBookStore.getState().decorativeFlip('backward', 800);
              setShowToc(true);
            }}
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
