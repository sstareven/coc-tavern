// 设置面板内共享样式与组件 — 抽出原 SettingsPanel 内 80 行重复实现，让 CheatingContent
// 等新增 tab 直接复用，避免每加一个 tab 就抄一遍 HelpIcon/Toggle/CategoryBar。
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getAutoZoom } from '../../hooks/useResponsiveZoom';
import { useSettingsStore } from '../../stores/useSettingsStore';

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

/** 统一的下拉选择框样式(与 numInputStyle 同色调,铜版风边框)。 */
export const selectStyle: CSSProperties = {
  padding: '5px 10px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-ui)',
  fontSize: 'calc(11px * var(--system-ratio, 1))', letterSpacing: 1, outline: 'none',
  cursor: 'pointer', minWidth: 140,
};

/** 子分组小标题(比 CategoryBar 轻,无横线,左侧短铜条作分隔)。 */
export function SubLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      margin: '14px 0 6px',
    }}>
      <span style={{
        width: 3, height: 12, background: 'var(--brass)', borderRadius: 1, flexShrink: 0,
      }} />
      <span style={{
        fontSize: 'calc(9px * var(--system-ratio, 1))', fontWeight: 600,
        letterSpacing: 2, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)',
      }}>{label}</span>
      {hint && (
        <span style={{
          fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)',
          fontFamily: 'var(--font-ui)', letterSpacing: 0.5,
        }}>· {hint}</span>
      )}
    </div>
  );
}

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
 *  脱离面板溢出裁剪、可超出窗口、不会撑出滚动条。
 *  超长内容自带 maxHeight + overflowY,鼠标可移入 tooltip 滚动(hover bridge 防瞬时关闭)。 */
export function HelpIcon({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean; maxH: number }>(
    { x: 0, y: 0, below: true, maxH: 500 },
  );
  const ref = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  const onEnter = () => {
    const el = ref.current;
    if (el) {
      // v1.11.8: useResponsiveZoom 让 :root 又有 zoom,portal 到 body 的 fixed 浮层需要
      // 把可视坐标除以 auto-zoom 换回布局坐标,否则问号 tooltip 跑右下角。
      const s = getAutoZoom();
      const r = el.getBoundingClientRect();
      const W = 320 * s;
      let x = r.left;
      if (x + W > window.innerWidth - 8) x = window.innerWidth - W - 8;
      x = Math.max(8, x);
      const below = r.bottom < window.innerHeight * 0.55;
      const yRaw = below ? r.bottom + 6 : r.top - 6;
      // 按上下方向算余量(留 16px 安全边),tooltip 内部 overflowY 自带滚动
      const headroom = below
        ? window.innerHeight - r.bottom - 22
        : r.top - 22;
      const maxH = Math.max(120, headroom / s);
      setPos({ x: x / s, y: yRaw / s, below, maxH });
    }
    cancelClose();
    // 按设置面板「提示延迟」延后显示。0 = 立即。store 直接 getState,避免每次 hover 都订阅。
    const delay = useSettingsStore.getState().tooltipDelay;
    if (showTimer.current !== null) window.clearTimeout(showTimer.current);
    if (delay <= 0) {
      setShow(true);
    } else {
      showTimer.current = window.setTimeout(() => { setShow(true); showTimer.current = null; }, delay);
    }
  };

  const onLeave = () => {
    if (showTimer.current !== null) { window.clearTimeout(showTimer.current); showTimer.current = null; }
    // hover bridge:延迟 150ms 关闭,允许鼠标从问号挪到 tooltip 滚动
    cancelClose();
    closeTimer.current = window.setTimeout(() => { setShow(false); closeTimer.current = null; }, 150);
  };

  return (
    <span
      ref={ref}
      style={{ display: 'inline-flex', verticalAlign: 'middle' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={(e) => e.preventDefault()}
    >
      <span style={helpIconStyle}>?</span>
      {show && createPortal(
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={() => setShow(false)}
          style={{
            position: 'fixed', left: pos.x, top: pos.y, zIndex: 2000,
            ...(pos.below ? {} : { transform: 'translateY(-100%)' }),
            width: 320, maxWidth: 'calc(100vw - 16px)',
            maxHeight: pos.maxH,
            overflowY: 'auto',
            padding: '10px 12px',
            background: 'var(--leather)', border: '1px solid var(--gold)', borderRadius: 4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--text-light)', lineHeight: 1.8,
            fontFamily: 'var(--font-ui)', whiteSpace: 'pre-line',
            pointerEvents: 'auto',
          }}
        >
          {text}
        </div>,
        document.body,
      )}
    </span>
  );
}

/**
 * 统一的「滑块行」：label + 可选 HelpIcon + range + 数值后缀（百分号/单位/自定义文案）。
 * 抽出原 SettingsPanel 内 10+ 处重复实现的滑块行，统一 gap/width/accentColor/数值字号与颜色，
 * 让音乐音量/音效音量/温度/重试/maxTokens 等全部走同一模板。
 *
 * 默认尺寸：range 宽 120、数值后缀宽 48、calc(11px * --system-ratio) gold 显示。
 */
export function SliderRow({
  label, help, value, onChange, min, max, step = 1,
  suffix, suffixWidth,
  rangeWidth = 120, accentColor = 'var(--gold)',
  indent = false,
  /** 数值后缀展示文案；省略时显示 `{value}{unit}` */
  formatValue,
  unit = '',
}: {
  label: ReactNode;
  help?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  /** 若给出 suffix(ReactNode) 直接展示该节点；否则按 formatValue/unit 自动生成。 */
  suffix?: ReactNode;
  suffixWidth?: number;
  rangeWidth?: number;
  accentColor?: string;
  indent?: boolean;
  formatValue?: (v: number) => string;
  unit?: string;
}) {
  const displayText = formatValue ? formatValue(value) : `${value}${unit}`;
  // 估算后缀宽度（按字符 *7 + 4）保持各行右端对齐；外部可覆盖
  const w = suffixWidth ?? Math.max(28, Math.min(60, displayText.length * 7 + 4));
  return (
    <div style={{ ...rowStyle, ...(indent ? { paddingLeft: 16 } : null) }}>
      <span style={labelStyle}>
        {label}
        {help && <HelpIcon text={help} />}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: rangeWidth, accentColor }}
        />
        {suffix !== undefined ? suffix : (
          <span style={{
            fontSize: 'calc(11px * var(--system-ratio, 1))',
            fontFamily: 'var(--font-mono)',
            color: 'var(--gold)',
            width: w,
            textAlign: 'right',
            whiteSpace: 'nowrap',
          }}>
            {displayText}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── BrassSelect:铜版风自定义下拉(替代原生 <select>) ──────────────────────
// 原生 <select> 展开后的下拉列表走系统主题(白底黑字),无法 CSS 控制。
// BrassSelect 用 absolute popover 复现 SearchableModelSelect 的视觉,
// 让协议模式/存储方式/采样器/风格等下拉与整体铜版风一致。
//
// 接口刻意贴近原生 <select>:value/onChange/options[{value,label,brief?}]。
// brief 字段会在 popover 每行选项标题下方以小灰字显示一行说明,适合协议模式这种需要释义的场景。

export interface BrassSelectOption {
  value: string;
  label: string;
  /** 每项下方的小灰字说明(协议模式释义之类)。可选。 */
  brief?: string;
}

interface BrassSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: BrassSelectOption[];
  /** trigger 宽度(px),popover 最少宽 220。默认 'auto'(随内容)。 */
  width?: number | 'auto';
  /** popover 最大高度,默认 320。 */
  popoverMaxHeight?: number;
  /** 占位文案(value 不在 options 时显示)。 */
  placeholder?: string;
}

export function BrassSelect({
  value, onChange, options,
  width = 'auto', popoverMaxHeight = 320, placeholder = '请选择',
}: BrassSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);
  const triggerLabel = current ? current.label : placeholder;

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        width: width === 'auto' ? undefined : width,
        minWidth: 160,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          padding: '5px 10px',
          border: `1px solid ${open ? 'var(--gold)' : 'var(--brass)'}`,
          borderRadius: 3,
          background: 'rgba(0,0,0,0.3)',
          color: current ? 'var(--text-light)' : 'var(--ink-faded)',
          fontFamily: 'var(--font-ui)',
          fontSize: 'calc(11px * var(--system-ratio, 1))',
          letterSpacing: 1,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = open ? 'var(--gold)' : 'var(--brass)'; }}
      >
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>{triggerLabel}</span>
        <span style={{ color: 'var(--gold)', fontSize: 9, opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 'max(220px, 100%)',
            zIndex: 50,
            background: 'linear-gradient(180deg, #1a130a 0%, #0e0a06 100%)',
            border: '1px solid var(--gold)',
            borderRadius: 4,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(196,168,85,0.1)',
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: popoverMaxHeight,
            overflowY: 'auto',
          }}
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  padding: '7px 10px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  background: selected ? 'rgba(196,168,85,0.18)' : 'transparent',
                  borderLeft: selected ? '2px solid var(--gold)' : '2px solid transparent',
                  color: selected ? 'var(--gold)' : 'var(--text-light)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'calc(11px * var(--system-ratio, 1))',
                  letterSpacing: 1,
                  transition: 'background 150ms cubic-bezier(0.4,0,0.2,1), color 150ms',
                }}
                onMouseEnter={(e) => {
                  if (!selected) e.currentTarget.style.background = 'rgba(196,168,85,0.08)';
                }}
                onMouseLeave={(e) => {
                  if (!selected) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div>{opt.label}</div>
                {opt.brief && (
                  <div style={{
                    fontSize: 'calc(9px * var(--system-ratio, 1))',
                    color: selected ? 'rgba(196,168,85,0.75)' : 'var(--ink-faded)',
                    fontFamily: 'var(--font-ui)',
                    lineHeight: 1.5,
                    marginTop: 2,
                    letterSpacing: 0.5,
                  }}>
                    {opt.brief}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

