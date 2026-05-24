import { useBookStore } from '../../stores/useBookStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useDiceStore } from '../../stores/useDiceStore';
import { usePanelStore } from '../../stores/usePanelStore';
import { usePageFlip } from '../../hooks/usePageFlip';
import { LeftPage } from './LeftPage';
import { RightPage } from './RightPage';
import { PageNav } from './PageNav';
import { CSSFlipPage, FadingPage } from './PageFlip3D';
import { BookUtils } from '../Shared/BookUtils';
import { TokenDisplay } from '../Shared/TokenDisplay';

export function Storybook() {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const { flipForward, flipBackward, canGoNext, canGoPrev, direction, isFlipping, flipProgress } = usePageFlip();

  const page = pages[pageIndex];
  if (!page) return null;

  const deletePage = () => {
    // Placeholder: would remove current page in a full implementation
    console.log('[Storybook] Delete page requested:', pageIndex);
  };
  const toggleDebug = () => {
    const event = new CustomEvent('toggle-debug-log');
    document.dispatchEvent(event);
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

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      padding: '0 64px',
    }}>
      {/* Relative container wrapping book + utils + bookmarks */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 880,
      }}>
        {/* BookUtils — outside the book at top-right */}
        <BookUtils onDeletePage={deletePage} onToggleDebug={toggleDebug} />

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
            flex: 1, display: 'flex', position: 'relative',
            background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
            borderRadius: '3px 0 0 3px', overflow: 'hidden',
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
              <LeftPage header={page.leftHeader} content={page.leftContent} pageNum={page.leftPage} />
            )}
          </div>

          {/* [C] 书脊 */}
          <div style={{
            width: 2, flexShrink: 0,
            background: 'linear-gradient(to right, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.03) 50%, rgba(0,0,0,0.06) 100%)',
          }} />

          {/* [B] 右页 */}
          <div style={{
            flex: 1, display: 'flex', position: 'relative',
            background: 'linear-gradient(225deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
            borderRadius: '0 3px 3px 0', overflow: 'hidden',
          }}>
            {isFlipping ? (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex' }}>
                {direction === 'forward' ? (
                  /* [B] flips to the left — rotating + fading out */
                  <CSSFlipPage progress={flipProgress} direction="forward">
                    <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} />
                  </CSSFlipPage>
                ) : (
                  /* Backward: [B] stays static, text fades out gradually */
                  <FadingPage progress={flipProgress}>
                    <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} />
                  </FadingPage>
                )}
              </div>
            ) : (
              <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} />
            )}
          </div>

          {/* TokenDisplay — inside book at bottom-right */}
          <TokenDisplay />

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

          {/* Tab 2: 掷骰 → dice panel */}
          <button
            onClick={() => useDiceStore.getState().open()}
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
            <span style={{ marginRight: 6, fontSize: 10, opacity: 0.5 }}>◆</span>
            掷骰
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
