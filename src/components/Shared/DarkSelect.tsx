import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { inputStyle } from '../CharSheet/styles';

const selectTriggerStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  position: 'relative',
  userSelect: 'none',
};

export function DarkSelect({ value, onChange, options, style }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string; sub?: string; separator?: boolean }[];
  style?: React.CSSProperties;
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

  const menu = open && rect && createPortal(
    <div className="darkselect-menu" style={{
      position: 'fixed', left: rect.left, top: rect.bottom + 2, minWidth: rect.width, zIndex: 9999,
      background: 'linear-gradient(180deg, rgba(26,20,14,0.99) 0%, rgba(18,14,10,0.99) 100%)',
      border: '1px solid var(--gold)', borderRadius: 4,
      boxShadow: '0 6px 24px rgba(0,0,0,0.7)',
      maxHeight: 240, overflowY: 'auto',
      scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.3)',
    }}>
      {options.map((o) => {
        if (o.separator || o.value.startsWith('__sep')) {
          return <div key={o.value} style={{ padding: '4px 12px', fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', borderBottom: '1px solid rgba(196,168,85,0.08)', cursor: 'default' }}>{o.label}</div>;
        }
        return (
          <div key={o.value}
            onClick={() => { onChange(o.value); setOpen(false); }}
            style={{
              padding: '8px 12px', cursor: 'pointer', fontSize: 12, textAlign: 'center',
              color: o.value === value ? 'var(--gold)' : 'var(--text-light)',
              fontFamily: 'var(--font-body)', borderBottom: '1px solid rgba(255,255,255,0.03)',
              background: o.value === value ? 'rgba(196,168,85,0.1)' : 'transparent',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = o.value === value ? 'rgba(196,168,85,0.1)' : 'transparent'; }}
          >
            <div>{o.label}</div>
            {o.sub && <div style={{ fontSize: 9, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>{o.sub}</div>}
          </div>
        );
      })}
    </div>,
    document.body,
  );

  return (
    <div ref={ref} style={{ ...style }}>
      <div onClick={toggle} style={{ ...selectTriggerStyle, position: 'relative' }}>
        <span style={{ color: value ? 'var(--text-light)' : 'var(--ink-subtle)' }}>
          {selected ? selected.label : '选择…'}
        </span>
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gold)', fontSize: 10, transition: '0.2s' }}>{open ? '▲' : '▼'}</span>
      </div>
      {menu}
    </div>
  );
}
