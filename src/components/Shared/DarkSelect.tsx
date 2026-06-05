import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { inputStyle } from '../CharSheet/styles';

const selectTriggerBase: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  position: 'relative',
  userSelect: 'none',
};

const compactOverride: React.CSSProperties = {
  fontSize: 'calc(11px * var(--system-ratio, 1))',
  padding: '6px 9px',
  textAlign: 'left',
  fontFamily: 'var(--font-ui)',
};

export function DarkSelect({ value, onChange, options, style, compact }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string; sub?: string; separator?: boolean }[];
  style?: React.CSSProperties;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const toggle = () => {
    if (!open && ref.current) setRect(ref.current.getBoundingClientRect());
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t?.closest) return;
      if (ref.current?.contains(t) || t.closest('.darkselect-menu')) return;
      setOpen(false);
    };
    const r = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target?.closest) return;
      if (ref.current && !ref.current.contains(target) && !target.closest('.darkselect-menu')) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    window.addEventListener('scroll', r, true);
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('scroll', r, true); };
  }, [open]);

  const menuItemFontSize = compact ? 10 : 12;
  const menuItemPadding = compact ? '5px 10px' : '8px 12px';
  const menuItemAlign = compact ? 'left' : 'center';
  const menuItemFont = compact ? 'var(--font-ui)' : 'var(--font-body)';

  const menu = (open && rect) ? (() => {
    // v1.11.7: 不再有 zoom 整页缩放,fixed 坐标直接用,无需除以 uiScale。
    return createPortal(
    <div className="darkselect-menu" style={{
      position: 'fixed',
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      top: rect.bottom + 2, minWidth: rect.width, maxWidth: 'calc(100vw - 16px)', zIndex: 9999,
      background: 'linear-gradient(180deg, rgba(26,20,14,0.99) 0%, rgba(18,14,10,0.99) 100%)',
      border: '1px solid var(--gold)', borderRadius: 4,
      boxShadow: '0 6px 24px rgba(0,0,0,0.7)',
      maxHeight: 240, overflowY: 'auto',
      scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.3)',
    }}>
      {options.map((o) => {
        if (o.separator || o.value.startsWith('__sep')) {
          return <div key={o.value} style={{ padding: '4px 12px', fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', borderBottom: '1px solid rgba(196,168,85,0.08)', cursor: 'default' }}>{o.label}</div>;
        }
        return (
          <div key={o.value}
            onClick={() => { onChange(o.value); setOpen(false); }}
            style={{
              padding: menuItemPadding, cursor: 'pointer', fontSize: menuItemFontSize, textAlign: menuItemAlign,
              color: o.value === value ? 'var(--gold)' : 'var(--text-light)',
              fontFamily: menuItemFont, borderBottom: '1px solid rgba(255,255,255,0.03)',
              background: o.value === value ? 'rgba(196,168,85,0.1)' : 'transparent',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = o.value === value ? 'rgba(196,168,85,0.1)' : 'transparent'; }}
          >
            <div>{o.label}</div>
            {o.sub && <div style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>{o.sub}</div>}
          </div>
        );
      })}
    </div>,
    document.body,
    );
  })() : null;

  const selectTriggerStyle = compact
    ? { ...selectTriggerBase, ...compactOverride }
    : selectTriggerBase;

  return (
    <div ref={ref} style={{ ...style }}>
      <div
        onClick={toggle}
        style={{ ...selectTriggerStyle, position: 'relative', transition: 'var(--transition-smooth)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.12)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = (selectTriggerStyle.background as string) ?? ''; e.currentTarget.style.borderColor = (selectTriggerStyle.borderColor as string) ?? ''; e.currentTarget.style.transform = 'scale(1)'; }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <span style={{ color: value ? 'var(--text-light)' : 'var(--ink-subtle)' }}>
          {selected ? selected.label : '选择…'}
        </span>
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gold)', fontSize: 'calc(10px * var(--system-ratio, 1))', transition: '0.2s' }}>{open ? '▲' : '▼'}</span>
      </div>
      {menu}
    </div>
  );
}
