import { useBookStore } from '../../stores/useBookStore';
import { usePageFlip } from '../../hooks/usePageFlip';
import { LeftPage } from './LeftPage';
import { RightPage } from './RightPage';
import { PageNav } from './PageNav';
import { PageFlip } from './PageFlip';

export function Storybook() {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const isFlipping = useBookStore((s) => s.isFlipping);
  const { flipForward, flipBackward, canGoNext, canGoPrev } = usePageFlip();

  const page = pages[pageIndex];
  if (!page) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      padding: '0 64px',
    }}>
      {/* Book container */}
      <div style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        maxWidth: 880,
        height: 520,
        borderRadius: 4,
        boxShadow: [
          '0 4px 24px rgba(0,0,0,0.5)',
          '0 1px 4px rgba(0,0,0,0.3)',
          'inset 0 0 0 1px rgba(196,168,85,0.08)',
        ].join(', '),
      }}>
        {/* Book thickness — left edge shadow overlay */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 14,
          background: 'linear-gradient(to right, rgba(0,0,0,0.35) 0%, transparent 100%)',
          borderRadius: '4px 0 0 4px',
          pointerEvents: 'none',
          zIndex: 1,
        }} />

        {/* Book thickness — right edge shadow overlay */}
        <div style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 14,
          background: 'linear-gradient(to left, rgba(0,0,0,0.35) 0%, transparent 100%)',
          borderRadius: '0 4px 4px 0',
          pointerEvents: 'none',
          zIndex: 1,
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

        {/* Bottom shadow */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 14,
          right: 14,
          height: 8,
          background: 'linear-gradient(to top, rgba(0,0,0,0.18) 0%, transparent 100%)',
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
        <PageFlip isFlipping={isFlipping} />

        {/* Navigation arrows */}
        <PageNav
          onFlipForward={flipForward}
          onFlipBackward={flipBackward}
          canGoNext={canGoNext}
          canGoPrev={canGoPrev}
        />
      </div>
    </div>
  );
}
