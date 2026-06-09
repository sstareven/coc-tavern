import { useReadingModeStore } from '../../stores/useReadingModeStore';

function CollapseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 6 L5 6 L5 3 M14 6 L11 6 L11 3 M2 10 L5 10 L5 13 M14 10 L11 10 L11 13" />
    </svg>
  );
}

function ExpandIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 5 L2 2 L5 2 M11 2 L14 2 L14 5 M2 11 L2 14 L5 14 M11 14 L14 14 L14 11" />
    </svg>
  );
}

export function ImmersiveToggleFAB() {
  const immersive = useReadingModeStore((s) => s.immersive);
  const toggle = useReadingModeStore((s) => s.toggleImmersive);
  return (
    <button
      type="button"
      onClick={toggle}
      title={immersive ? '展开界面' : '沉浸阅读'}
      className="immersive-fab"
      style={{
        position: 'fixed',
        right: 12,
        bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
        width: 36,
        height: 36,
        zIndex: 6,
        border: '1px solid var(--gold)',
        borderRadius: '50%',
        background: 'rgba(20,16,12,0.92)',
        color: 'var(--gold)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {immersive ? <ExpandIcon /> : <CollapseIcon />}
      <style>{`
        .immersive-fab:hover { border-color: var(--gold-bright); transform: scale(1.08); }
        .immersive-fab:active { transform: scale(0.94); }
      `}</style>
    </button>
  );
}
