import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStatusToastStore, type StatusKind } from '../../stores/useStatusToastStore';

/** Per-kind accent: processing/done use gold, error uses blood. */
const accent: Record<StatusKind, { color: string; border: string; glow: string }> = {
  processing: { color: 'var(--gold-bright)', border: 'rgba(196,168,85,0.35)', glow: 'rgba(196,168,85,0.25)' },
  done: { color: 'var(--gold-bright)', border: 'rgba(196,168,85,0.35)', glow: 'rgba(196,168,85,0.25)' },
  error: { color: 'var(--blood-bright)', border: 'rgba(139,58,58,0.45)', glow: 'rgba(139,58,58,0.3)' },
};

const wrapStyle: React.CSSProperties = {
  position: 'fixed',
  top: 18,
  left: '50%',
  zIndex: 1200,
  pointerEvents: 'none',
  display: 'flex',
  justifyContent: 'center',
};

export function StatusToast() {
  const toast = useStatusToastStore((s) => s.toast);
  const kind: StatusKind = toast?.kind ?? 'processing';
  const a = accent[kind];

  // 处理/排队中的提示附带实时计时器：按 toast.id 重置，每 100ms 走表。
  const isProcessing = toast?.kind === 'processing';
  const activeId = isProcessing ? toast!.id : null;
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  useEffect(() => {
    if (activeId == null) return;
    startRef.current = Date.now();
    setElapsed(0);
    const iv = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 100);
    return () => clearInterval(iv);
  }, [activeId]);

  return (
    <div style={wrapStyle}>
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ y: -28, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: -16, opacity: 0, x: '-50%' }}
            transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 20px',
              borderRadius: 999,
              background: 'rgba(20,15,10,0.55)',
              border: `1px solid ${a.border}`,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: `0 4px 24px rgba(0,0,0,0.45), 0 0 16px ${a.glow}`,
              color: a.color,
              fontFamily: 'var(--font-display)',
              fontSize: 'calc(13px * var(--system-ratio, 1))',
              letterSpacing: 1.5,
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {kind === 'processing' ? (
              <motion.span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: a.color,
                  boxShadow: `0 0 8px ${a.color}`,
                  flexShrink: 0,
                }}
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.1, 0.85] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : (
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: a.color,
                  boxShadow: `0 0 8px ${a.color}`,
                  flexShrink: 0,
                }}
              />
            )}
            <span>{toast.message}</span>
            {isProcessing && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'calc(11px * var(--system-ratio, 1))',
                  opacity: 0.7,
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 38,
                  textAlign: 'right',
                }}
              >
                {elapsed.toFixed(1)}s
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
