// 设置面板内共享样式与组件 — 抽出原 SettingsPanel 内 80 行重复实现，让 CheatingContent
// 等新增 tab 直接复用，避免每加一个 tab 就抄一遍 HelpIcon/Toggle/CategoryBar。
import { useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { getAutoZoom } from '../../hooks/useResponsiveZoom';

/** 行容器：左侧 label/help 右侧控件，淡描底线。 */
export const rowStyle: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.02)',
};

/** 行 label 样式。 */
export const labelStyle: CSSProperties = {
  fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1,
};

/** 统一的数字输入框样式。 */
export const numInputStyle: CSSProperties = {
  width: 64, padding: '4px 8px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)',
  fontSize: 'calc(11px * var(--system-ratio, 1))', textAlign: 'center', outline: 'none',
};

/** 问号 icon 样式（圆形铜边）。 */
export const helpIconStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--brass)',
  color: 'var(--ink-subtle)', cursor: 'help', fontSize: 'calc(9px * var(--system-ratio, 1))', fontWeight: 'bold',
  fontFamily: 'var(--font-ui)', marginLeft: 4,
};

/** 设置分类分割栏：金色小标题 + 两侧渐隐分割线。 */
export function CategoryBar({ label, first }: { label: string; first?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: first ? '2px 0 10px' : '20px 0 10px' }}>
      <span style={{
        fontSize: 'calc(10px * var(--system-ratio, 1))', fontWeight: 700, letterSpacing: 3, color: 'var(--gold)',
        fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', flexShrink: 0,
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(196,168,85,0.35), rgba(196,168,85,0.04))' }} />
    </div>
  );
}

/** 统一的开关按钮（药丸形，开启时金色高亮）。 */
export function Toggle({ on, onChange, onLabel = 'ON', offLabel = 'OFF' }: {
  on: boolean; onChange: () => void; onLabel?: string; offLabel?: string;
}) {
  return (
    <button
      onClick={onChange}
      style={{
        padding: '5px 16px', borderRadius: 20, minWidth: 80, textAlign: 'center',
        border: on ? '1px solid var(--gold)' : '1px solid var(--ink-faded)',
        background: on ? 'rgba(196,168,85,0.18)' : 'rgba(0,0,0,0.18)',
        color: on ? 'var(--gold)' : 'var(--ink-subtle)',
        fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio, 1))', letterSpacing: 2, cursor: 'pointer',
        transition: 'var(--transition-smooth)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = on ? 'var(--gold)' : 'var(--ink-faded)'; e.currentTarget.style.color = on ? 'var(--gold)' : 'var(--ink-subtle)'; }}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}

/** 悬浮显示说明的问号图标。提示窗用 portal 渲染到 body、fixed 定位，
 *  脱离面板溢出裁剪、可超出窗口、不会撑出滚动条。 */
export function HelpIcon({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean }>({ x: 0, y: 0, below: true });
  const ref = useRef<HTMLSpanElement>(null);

  const onEnter = () => {
    const el = ref.current;
    if (el) {
      // v1.11.8: useResponsiveZoom 让 :root 又有 zoom,portal 到 body 的 fixed 浮层需要
      // 把可视坐标除以 auto-zoom 换回布局坐标,否则问号 tooltip 跑右下角。
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
