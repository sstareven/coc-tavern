import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useBookStore } from '../../stores/useBookStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { InventoryOverlay } from '../Inventory/InventoryPanel';
import { CharSheetOverlay } from '../CharSheet/CharSheetOverlay';
import { usePanelStore } from '../../stores/usePanelStore';
import { useChatStore } from '../../stores/useChatStore';
import { persistActiveGameState } from '../../stores/sessionLifecycle';
import { usePageFlip } from '../../hooks/usePageFlip';
import { LeftPage } from './LeftPage';
import { RightPage } from './RightPage';
import { TocOverlay } from './TocOverlay';
import { PageNav } from './PageNav';
import { CSSFlipPage, FadingPage, AppearPage } from './PageFlip3D';
import { BookUtils } from '../Shared/BookUtils';
import { TokenDisplay } from '../Shared/TokenDisplay';
import { sfxPageFlip } from '../../audio/sfx';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobileBookView } from './MobileBookView';
import type { MobileTab } from '../Layout/MobileTabBar';

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
  const charSheetOpen = useCharSheetStore((s) => s.isOpen);
  const deletePageStore = useBookStore((s) => s.deletePage);
  const isMobile = useIsMobile();
  const activeConvId = useChatStore((s) => s.activeId);

  // 切换/读取会话时收起目录浮层（库存/角色卡由 clearAllGameState 负责关闭）。
  useEffect(() => {
    setShowToc(false);
    setSelectedToc(-1);
  }, [activeConvId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inventoryOpen) useInventoryStore.getState().close();
        if (charSheetOpen) useCharSheetStore.getState().close();
        if (showToc) { setShowToc(false); setSelectedToc(-1); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [inventoryOpen, charSheetOpen, showToc]);

  const page = pages[pageIndex];
  if (!page) return null;

  const handleMobileTab = (tab: MobileTab) => {
    if (tab === 'inventory') {
      if (inventoryOpen) { useInventoryStore.getState().close(); return; }
      useCharSheetStore.getState().close();
      if (showToc) { setShowToc(false); setSelectedToc(-1); }
      useInventoryStore.getState().toggle();
    } else if (tab === 'charsheet') {
      if (charSheetOpen) { useCharSheetStore.getState().close(); return; }
      useInventoryStore.getState().close();
      if (showToc) { setShowToc(false); setSelectedToc(-1); }
      useCharSheetStore.getState().toggle();
    } else if (tab === 'toc') {
      if (showToc) {
        if (selectedToc >= 0) useBookStore.getState().goToPage(selectedToc);
        setSelectedToc(-1); setShowToc(false); return;
      }
      useInventoryStore.getState().close();
      useCharSheetStore.getState().close();
      setShowToc(true);
    } else if (tab === 'dice') {
      usePanelStore.getState().open('diceHistory');
    }
  };

  if (isMobile) {
    return (
      <MobileBookView
        showToc={showToc}
        selectedToc={selectedToc}
        onTocSelect={(i) => setSelectedToc(selectedToc === i ? -1 : i)}
        onTab={handleMobileTab}
      />
    );
  }

  // Debug: log right page data source
  if (page.rightHeader === '行动' && page.rightContent === '接下来你打算怎么做？') {
    console.warn('[Storybook] 第' + pageIndex + '页右页使用默认值 — 可能JSON解析失败或字段缺失', page);
  }

  // 删除会级联清除本页至最新页，确认弹窗中提示这些页加入的全部物品
  const affectedItems = pages
    .slice(pageIndex)
    .flatMap((p) => p.inventoryChanges ?? [])
    .filter((c) => c.action === 'add' || (c.action === 'update' && (c.quantity ?? 0) > 0))
    .map((c) => c.name)
    .filter((n): n is string => Boolean(n));

  const deletePage = () => {
    // 级联删除本页至最新页：撤销这些页的全部物品变更，避免遗留幽灵物品
    const all = useBookStore.getState().pages.slice(pageIndex);
    const changes = all.flatMap((p) => p.inventoryChanges ?? []);
    if (changes.length) {
      useInventoryStore.getState().revertChanges(changes);
    }
    deletePageStore(pageIndex);
    persistActiveGameState();
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
        <BookUtils onDeletePage={deletePage} affectedItems={affectedItems} />

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
                  <FadingPage progress={flipProgress}>
                    <LeftPage header={page.leftHeader} content={page.leftContent} pageNum={page.leftPage} summary={page.summary} diceResults={page.diceResults} />
                  </FadingPage>
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
                    <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} rewrite={page.rewrite} inventoryChanges={page.inventoryChanges} />
                  </CSSFlipPage>
                ) : (
                  /* Backward: [B] stays static, text fades out gradually */
                  <FadingPage progress={flipProgress}>
                    <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} rewrite={page.rewrite} inventoryChanges={page.inventoryChanges} />
                  </FadingPage>
                )}
              </div>
            ) : (
              <AppearPage pageIndex={pageIndex}>
                <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} rewrite={page.rewrite} inventoryChanges={page.inventoryChanges} />
              </AppearPage>
            )}
          </div>

          {/* TokenDisplay — inside book at bottom-right */}
          <TokenDisplay />

          {/* Table of Contents overlay */}
          <AnimatePresence>
            {showToc && (
              <TocOverlay pages={pages} pageIndex={pageIndex} selectedToc={selectedToc} onSelect={setSelectedToc} />
            )}
          </AnimatePresence>

          {/* Inventory overlay — book-page style */}
          <AnimatePresence>
            {inventoryOpen && <InventoryOverlay />}
          </AnimatePresence>

          {/* Investigator record overlay — book-page style */}
          <AnimatePresence>
            {charSheetOpen && <CharSheetOverlay />}
          </AnimatePresence>

          {/* Navigation arrows — hidden when TOC, Inventory or record is open */}
          <div style={{
            opacity: showToc || inventoryOpen || charSheetOpen ? 0 : 1, pointerEvents: showToc || inventoryOpen || charSheetOpen ? 'none' : 'auto',
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
          {/* Tab 0: 物品/线索 → inventory overlay */}
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
            {inventoryOpen ? '返回' : '物品/线索'}
          </button>

          {/* Tab 1: 调查员记录 → character sheet overlay */}
          <button
            onClick={() => {
              if (charSheetOpen) {
                try { sfxPageFlip(); } catch { /* audio not available */ }
                useCharSheetStore.getState().close();
                return;
              }
              useInventoryStore.getState().close();
              if (showToc) { setShowToc(false); setSelectedToc(-1); }
              useBookStore.getState().decorativeFlip('backward', 800);
              useCharSheetStore.getState().toggle();
            }}
            style={charSheetOpen ? tocTabActive : bookmarkTab}
            onMouseEnter={(e) => {
              if (!charSheetOpen) {
                e.currentTarget.style.color = '#8b3a3a';
                e.currentTarget.style.background = 'linear-gradient(175deg, #f8ecd0 0%, #edd8a8 50%, #f4e4c0 100%)';
                e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)';
                e.currentTarget.style.paddingLeft = '18px';
              }
            }}
            onMouseLeave={(e) => {
              if (!charSheetOpen) {
                e.currentTarget.style.color = '#4a3020';
                e.currentTarget.style.background = 'linear-gradient(175deg, #f2e0c0 0%, #e8d0a0 50%, #f0dab0 100%)';
                e.currentTarget.style.boxShadow = '1px 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)';
                e.currentTarget.style.paddingLeft = '14px';
              }
            }}
          >
            <span style={{ marginRight: 6, fontSize: 10, opacity: 0.5 }}>{charSheetOpen ? '◁' : '✦'}</span>
            {charSheetOpen ? '返回' : '调查员记录'}
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
              useCharSheetStore.getState().close();
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
