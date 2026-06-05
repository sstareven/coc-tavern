import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getAutoZoom } from '../../hooks/useResponsiveZoom';

// ── Styling constants (matching SettingsPanel.tsx exactly) ──

const categoryBarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  margin: '2px 0 10px',
};
const categoryLabelStyle: React.CSSProperties = {
  fontSize: 'calc(10px * var(--system-ratio, 1))', fontWeight: 700,
  letterSpacing: 3, color: 'var(--gold)',
  fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', flexShrink: 0,
};
const categoryLineStyle: React.CSSProperties = {
  flex: 1, height: 1,
  background: 'linear-gradient(to right, rgba(196,168,85,0.35), rgba(196,168,85,0.04))',
};

const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.02)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 'calc(11px * var(--system-ratio, 1))',
  color: 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1,
};

const helpIconStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--brass)',
  color: 'var(--ink-subtle)', cursor: 'help', fontSize: 'calc(9px * var(--system-ratio, 1))', fontWeight: 'bold',
  fontFamily: 'var(--font-ui)', marginLeft: 4,
};

/** 悬浮（hover）显示说明的问号图标。提示窗用 portal 渲染到 body、fixed 定位，
 *  脱离面板溢出裁剪、可超出窗口、不会撑出滚动条。 */
function HelpIcon({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean }>({ x: 0, y: 0, below: true });
  const ref = useRef<HTMLSpanElement>(null);

  const onEnter = () => {
    const el = ref.current;
    if (el) {
      const s = getAutoZoom();
      const r = el.getBoundingClientRect();
      const W = 300 * s;
      let x = r.left;
      if (x + W > window.innerWidth - 8) x = window.innerWidth - W - 8;
      x = Math.max(8, x);
      const below = r.bottom < window.innerHeight * 0.55;
      const yRaw = below ? r.bottom + 6 : r.top - 6;
      setPos({ x: x / s, y: yRaw / s, below });
    }
    setShow(true);
  };

  return (
    <span
      ref={ref}
      style={{ display: 'inline-flex', verticalAlign: 'middle' }}
      onMouseEnter={onEnter}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => e.preventDefault()}
    >
      <span style={helpIconStyle}>?</span>
      {show && createPortal(
        <div style={{
          position: 'fixed', left: pos.x, top: pos.y, zIndex: 2000,
          ...(pos.below ? {} : { transform: 'translateY(-100%)' }),
          width: 300, maxWidth: 'calc(100vw - 16px)', padding: '8px 10px',
          background: 'var(--leather)', border: '1px solid var(--gold)', borderRadius: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--text-light)', lineHeight: 1.8,
          fontFamily: 'var(--font-ui)', whiteSpace: 'pre-line', pointerEvents: 'none',
        }}>
          {text}
        </div>,
        document.body,
      )}
    </span>
  );
}

// ── Component ──

export function BlessingContent() {
  const [enabled, setEnabled] = useState(false);

  return (
    <div>
      {/* Category header — matches SettingsPanel's CategoryBar */}
      <div style={categoryBarStyle}>
        <span style={categoryLabelStyle}>赐福开关</span>
        <div style={categoryLineStyle} />
      </div>

      {/* Toggle row — matches SettingsPanel's rowStyle + Toggle exactly */}
      <div style={rowStyle}>
        <span style={labelStyle}>
          领受深渊的祝福
          <HelpIcon text="开启后，角色将获得来自深渊的古老祝福。功能开发中，敬请期待。" />
        </span>
        <button
          onClick={() => setEnabled(!enabled)}
          style={{
            padding: '5px 16px', borderRadius: 20, minWidth: 80, textAlign: 'center',
            border: enabled ? '1px solid var(--gold)' : '1px solid var(--ink-faded)',
            background: enabled ? 'rgba(196,168,85,0.18)' : 'rgba(0,0,0,0.18)',
            color: enabled ? 'var(--gold)' : 'var(--ink-subtle)',
            fontFamily: 'var(--font-ui)',
            fontSize: 'calc(11px * var(--system-ratio, 1))',
            letterSpacing: 2, cursor: 'pointer',
            transition: 'var(--transition-smooth)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--gold)';
            e.currentTarget.style.color = 'var(--gold)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = enabled ? 'var(--gold)' : 'var(--ink-faded)';
            e.currentTarget.style.color = enabled ? 'var(--gold)' : 'var(--ink-subtle)';
          }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={enabled ? 'on' : 'off'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'inline-block' }}
            >
              {enabled ? 'ON' : 'OFF'}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}
