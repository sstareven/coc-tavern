import { useState } from 'react';
import { useBookStore } from '../../stores/useBookStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useDiceStore } from '../../stores/useDiceStore';
import { usePanelStore } from '../../stores/usePanelStore';
import { usePageFlip } from '../../hooks/usePageFlip';
import { LeftPage } from './LeftPage';
import { RightPage } from './RightPage';
import { PageNav } from './PageNav';
import { PageFlip } from './PageFlip';
import { BookUtils } from '../Shared/BookUtils';
import { TokenDisplay } from '../Shared/TokenDisplay';

export function Storybook() {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const isFlipping = useBookStore((s) => s.isFlipping);
  const { flipForward, flipBackward, canGoNext, canGoPrev, direction } = usePageFlip();

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

  // --- bookmark tab styles ---
  const bookmarkTab: React.CSSProperties = {
    position: 'absolute',
    left: -48,
    bottom: -6,
    width: 120,
    height: 24,
    transform: 'rotate(-90deg)',
    transformOrigin: 'top right',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-ui)',
    fontSize: 10,
    letterSpacing: 1,
    color: 'var(--text-light)',
    background: 'linear-gradient(180deg, rgba(212,196,160,0.18) 0%, rgba(180,164,130,0.1) 100%)',
    border: '1px solid rgba(196,168,85,0.15)',
    borderLeft: '2px solid var(--blood)',
    borderBottom: 'none',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    padding: '2px 8px',
    backdropFilter: 'blur(2px)',
    transition: 'var(--transition-smooth)',
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

        {/* Book container */}
        <div style={{
          position: 'relative',
          display: 'flex',
          width: '100%',
          height: 520,
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

          {/* Left page */}
          <div style={{
            flex: 1,
            display: 'flex',
            opacity: isFlipping ? 0.25 : 1,
            transition: 'opacity 0.35s ease-in-out',
          }}>
            <LeftPage
              header={page.leftHeader}
              content={page.leftContent}
              pageNum={page.leftPage}
            />
          </div>

          {/* Spine */}
          <div style={{
            width: 22,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative',
          }}>
            {/* Spine center line */}
            <div style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: 1,
              background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 15%, rgba(0,0,0,0.28) 50%, rgba(0,0,0,0.35) 85%, transparent 100%)',
            }} />
            {/* Spine inner shadow on pages */}
            <div style={{
              flex: 1,
              width: '100%',
              background: 'linear-gradient(to right, rgba(0,0,0,0.08) 0%, transparent 50%, rgba(0,0,0,0.08) 100%)',
            }} />
          </div>

          {/* Right page */}
          <div style={{
            flex: 1,
            display: 'flex',
            opacity: isFlipping ? 0.25 : 1,
            transition: 'opacity 0.35s ease-in-out',
          }}>
            <RightPage
              header={page.rightHeader}
              content={page.rightContent}
              choices={page.rightChoices}
            />
          </div>

          {/* Page flip animation overlay */}
          <PageFlip isFlipping={isFlipping} direction={direction} />

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

        {/* Bookmark tabs — positioned below and to the LEFT of the book */}
        <div style={{
          position: 'absolute',
          left: -34,
          bottom: -96,
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
          zIndex: 5,
        }}>
          {/* Tab 1: 调查员记录 → character sheet */}
          <button
            onClick={() => useCharSheetStore.getState().toggle()}
            style={{
              ...bookmarkTab,
              bottom: 30,
              left: -32,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--gold)';
              e.currentTarget.style.background = 'linear-gradient(180deg, rgba(212,196,160,0.3) 0%, rgba(180,164,130,0.18) 100%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-light)';
              e.currentTarget.style.background = 'linear-gradient(180deg, rgba(212,196,160,0.18) 0%, rgba(180,164,130,0.1) 100%)';
            }}
          >
            调查员记录
          </button>

          {/* Tab 2: 掷骰 → dice panel */}
          <button
            onClick={() => useDiceStore.getState().open()}
            style={{
              ...bookmarkTab,
              bottom: -8,
              left: -32,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--gold)';
              e.currentTarget.style.background = 'linear-gradient(180deg, rgba(212,196,160,0.3) 0%, rgba(180,164,130,0.18) 100%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-light)';
              e.currentTarget.style.background = 'linear-gradient(180deg, rgba(212,196,160,0.18) 0%, rgba(180,164,130,0.1) 100%)';
            }}
          >
            掷骰
          </button>

          {/* Tab 3: 检定记录 → dice history */}
          <button
            onClick={() => usePanelStore.getState().open('diceHistory')}
            style={{
              ...bookmarkTab,
              bottom: -46,
              left: -32,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--gold)';
              e.currentTarget.style.background = 'linear-gradient(180deg, rgba(212,196,160,0.3) 0%, rgba(180,164,130,0.18) 100%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-light)';
              e.currentTarget.style.background = 'linear-gradient(180deg, rgba(212,196,160,0.18) 0%, rgba(180,164,130,0.1) 100%)';
            }}
          >
            检定记录
          </button>
        </div>
      </div>
    </div>
  );
}
