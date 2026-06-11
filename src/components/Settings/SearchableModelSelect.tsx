// src/components/Settings/SearchableModelSelect.tsx —— 跨 profile 扁平模型选择器(带搜索 + 分类)
// 设计:
//   - 单 button 触发,点击展开浮层(absolute,不用 portal — SettingsPanel 内部就够)
//   - 浮层顶部固定搜索框,实时按 modelName/profileLabel 过滤
//   - 过滤结果按 modelName 拆 `-` 取头段分类(如 'deepseek-v4-pro' → 'deepseek')
//   - 分类只显示有命中项的;全无命中显「(空)」
//   - 每项点击 → onSelect(profileId, modelName) + 收起浮层
//   - 当前选中项高亮(铜金边框 + 微亮背景)
//
// 复用关系:
//   - 上层 ApiModelPicker 把 channel→store selectors 接进来
//   - 也可独立用于其他需要「跨 profile 选模型」场景

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  type ProfileModel,
  filterModelsBySearch,
  categorizeModels,
} from '../../api/api-models-engine';

interface Props {
  /** 跨所有 profile 摊平的模型选项池(由调用方用 collectAllProfileModels 准备好)。 */
  items: ProfileModel[];
  selectedProfileId: string | null;
  selectedModel: string;
  /** 点选某项时调用;profileId+modelName 同时设置(原子)。 */
  onSelect: (profileId: string, modelName: string) => void;
  /** 浮层最大高度,默认 280。 */
  maxHeight?: number;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 9px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)',
  fontSize: 'calc(11px * var(--system-ratio, 1))', outline: 'none', caretColor: 'var(--gold)',
  boxSizing: 'border-box',
};

const triggerStyle: React.CSSProperties = {
  width: 220, maxWidth: '100%', padding: '7px 10px',
  border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
  fontFamily: 'var(--font-mono)', fontSize: 'calc(11px * var(--system-ratio, 1))',
  cursor: 'pointer', textAlign: 'left',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 8, transition: 'var(--transition-smooth, all 200ms cubic-bezier(0.4,0,0.2,1))',
};

const popoverStyle: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0,
  width: 'max(260px, 100%)', zIndex: 50,
  background: 'linear-gradient(180deg, #1a130a 0%, #0e0a06 100%)',
  border: '1px solid var(--gold)', borderRadius: 4,
  boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(196,168,85,0.1)',
  padding: 6,
  display: 'flex', flexDirection: 'column', gap: 4,
};

const categoryHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 'calc(9px * var(--system-ratio, 1))',
  color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase',
  padding: '6px 8px 2px', marginTop: 2,
  borderBottom: '1px solid rgba(196,168,85,0.12)',
};

const itemBaseStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 3, cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 'calc(11px * var(--system-ratio, 1))',
  color: 'var(--text-light)',
  display: 'flex', alignItems: 'center', gap: 6,
  transition: 'background 150ms cubic-bezier(0.4,0,0.2,1), color 150ms',
};

function MarqueeLabel({ text }: { text: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  const measure = useCallback(() => {
    const o = outerRef.current;
    const i = innerRef.current;
    if (o && i) setOverflow(i.scrollWidth > o.clientWidth + 1);
  }, []);

  useEffect(() => { measure(); }, [text, measure]);

  const dur = Math.max(3, text.length * 0.18);

  return (
    <div ref={outerRef} style={{ overflow: 'hidden', flex: 1, whiteSpace: 'nowrap' }}>
      <span
        ref={innerRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          ...(overflow ? {
            animation: `marquee-scroll ${dur}s linear infinite`,
            paddingRight: 40,
          } : {}),
        }}
      >{text}{overflow && <span style={{ paddingLeft: 40 }}>{text}</span>}</span>
      {overflow && (
        <style>{`@keyframes marquee-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
      )}
    </div>
  );
}

export function SearchableModelSelect({
  items, selectedProfileId, selectedModel, onSelect, maxHeight = 280,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭浮层
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const filtered = filterModelsBySearch(items, q);
  const groups = categorizeModels(filtered, '-');
  const groupKeys = Object.keys(groups);

  const selected = items.find(
    (it) => it.profileId === selectedProfileId && it.modelName === selectedModel,
  );
  const triggerLabel = selected
    ? `[${selected.profileLabel}] ${selected.modelName}`
    : items.length === 0
      ? '请先在 API 管理添加配置'
      : '请选择模型';

  return (
    <div ref={rootRef} style={{ position: 'relative', width: 220, maxWidth: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          ...triggerStyle,
          borderColor: open ? 'var(--gold)' : 'var(--brass)',
          color: selected ? 'var(--text-light)' : 'var(--ink-faded)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = open ? 'var(--gold)' : 'var(--brass)'; }}
      >
        <MarqueeLabel text={triggerLabel} />
        <span style={{ color: 'var(--gold)', fontSize: 9, opacity: 0.7, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={popoverStyle}>
          <input
            autoFocus
            type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="搜索模型或识别名"
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
          <div style={{
            overflowY: 'auto', maxHeight,
            display: 'flex', flexDirection: 'column',
            marginTop: 2,
          }}>
            {items.length === 0 ? (
              <div style={{
                padding: '14px 10px', textAlign: 'center',
                fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))',
                color: 'var(--ink-faded)', letterSpacing: 1,
              }}>
                尚无 API 配置 — 请到「API 管理」添加
              </div>
            ) : groupKeys.length === 0 ? (
              <div style={{
                padding: '14px 10px', textAlign: 'center',
                fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio, 1))',
                color: 'var(--ink-faded)', letterSpacing: 2,
              }}>(空)</div>
            ) : (
              groupKeys.map((cat) => (
                <div key={cat}>
                  <div style={categoryHeaderStyle}>{cat}</div>
                  {groups[cat].map((it) => {
                    const isSelected = it.profileId === selectedProfileId && it.modelName === selectedModel;
                    return (
                      <div
                        key={`${it.profileId}|${it.modelName}`}
                        onClick={() => { onSelect(it.profileId, it.modelName); setOpen(false); setQ(''); }}
                        style={{
                          ...itemBaseStyle,
                          background: isSelected ? 'rgba(196,168,85,0.18)' : 'transparent',
                          borderLeft: isSelected ? '2px solid var(--gold)' : '2px solid transparent',
                          color: isSelected ? 'var(--gold)' : 'var(--text-light)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'rgba(196,168,85,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span style={{
                          color: 'var(--gold)', opacity: 0.75, fontSize: '0.9em',
                          flexShrink: 0,
                        }}>[{it.profileLabel}]</span>
                        <MarqueeLabel text={it.modelName} />
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
