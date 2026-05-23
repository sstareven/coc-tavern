interface Props {
  onFlipForward: () => void;
  onFlipBackward: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

export function PageNav({ onFlipForward, onFlipBackward, canGoNext, canGoPrev }: Props) {
  return (
    <>
      {/* Left arrow */}
      <button
        onClick={onFlipBackward}
        disabled={!canGoPrev}
        aria-label="Previous page"
        style={{
          position: 'absolute',
          left: -48,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: `1px solid ${canGoPrev ? 'var(--gold)' : 'rgba(107,90,58,0.25)'}`,
          background: canGoPrev ? 'rgba(196,168,85,0.08)' : 'transparent',
          color: canGoPrev ? 'var(--gold)' : 'var(--ink-subtle)',
          fontSize: 20,
          fontFamily: 'var(--font-display)',
          cursor: canGoPrev ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          transition: 'var(--transition-smooth)',
          opacity: canGoPrev ? 1 : 0.35,
        }}
        onMouseEnter={(e) => {
          if (!canGoPrev) return;
          e.currentTarget.style.background = 'rgba(196,168,85,0.2)';
          e.currentTarget.style.boxShadow = '0 0 12px rgba(196,168,85,0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(196,168,85,0.08)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        &#8249;
      </button>

      {/* Right arrow */}
      <button
        onClick={onFlipForward}
        disabled={!canGoNext}
        aria-label="Next page"
        style={{
          position: 'absolute',
          right: -48,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: `1px solid ${canGoNext ? 'var(--gold)' : 'rgba(107,90,58,0.25)'}`,
          background: canGoNext ? 'rgba(196,168,85,0.08)' : 'transparent',
          color: canGoNext ? 'var(--gold)' : 'var(--ink-subtle)',
          fontSize: 20,
          fontFamily: 'var(--font-display)',
          cursor: canGoNext ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          transition: 'var(--transition-smooth)',
          opacity: canGoNext ? 1 : 0.35,
        }}
        onMouseEnter={(e) => {
          if (!canGoNext) return;
          e.currentTarget.style.background = 'rgba(196,168,85,0.2)';
          e.currentTarget.style.boxShadow = '0 0 12px rgba(196,168,85,0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(196,168,85,0.08)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        &#8250;
      </button>
    </>
  );
}
