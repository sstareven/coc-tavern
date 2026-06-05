import { useMemo } from 'react';
import { useLocationElementStore } from '../../stores/useLocationElementStore';
import type { LocationElementCategory } from '../../types';

// 各类型徽标配色（贴合金色/羊皮纸主题）。
const CATEGORY_COLOR: Record<LocationElementCategory, string> = {
  陈设: '#b9975b',
  机关: '#c4a855',
  痕迹: '#9a8a6a',
  通道: '#6a9a86',
  容器: '#a88a5a',
  异常: '#c46a6a',
  其他: '#8a8a7a',
};

interface Props {
  /** 当前选中（或默认当前）的地点名；空串则展示占位文案。 */
  locationName: string;
}

/**
 * 地图右页底部「地点元素」区：展示选中地点的环境元素，可滚动浏览（复用主题滚动条）。
 * 订阅 store.elements（稳定引用）后用 useMemo 过滤——避免直接用「返回新数组」的选择器触发无限重渲染。
 */
export function LocationElementsPanel({ locationName }: Props) {
  const elements = useLocationElementStore((s) => s.elements);
  const getByLocation = useLocationElementStore((s) => s.getByLocation);
  const items = useMemo(
    () => (locationName.trim() ? getByLocation(locationName) : []),
    // elements 进依赖以在抽取入库后刷新；getByLocation 为稳定方法引用
    [elements, locationName, getByLocation],
  );

  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid rgba(196,168,85,0.2)', paddingTop: 8, marginTop: 8, display: 'flex', flexDirection: 'column', maxHeight: 190 }}>
      <div style={{ flexShrink: 0, marginBottom: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(14px * var(--system-ratio, 1))', color: 'var(--gold)', letterSpacing: 3, margin: 0 }}>地点元素</h4>
        {locationName.trim() && (
          <span style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {locationName}</span>
        )}
        <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>{items.length}</span>
      </div>

      <div
        className="inv-scroll"
        style={{ flex: 1, overflowY: 'auto', minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.3)' }}
      >
        {items.length === 0 ? (
          <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontStyle: 'italic' }}>
            {locationName.trim() ? '此地暂无记录的元素……' : '点击地点查看其元素'}
          </div>
        ) : (
          items.map((el) => (
            <div
              key={el.id}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 4px', borderBottom: '1px solid rgba(196,168,85,0.08)' }}
            >
              <span
                style={{
                  flexShrink: 0, marginTop: 1, fontSize: 'calc(9px * var(--system-ratio, 1))', lineHeight: '16px', height: 16, padding: '0 6px',
                  borderRadius: 8, fontFamily: 'var(--font-ui)', letterSpacing: 1,
                  color: CATEGORY_COLOR[el.category], border: `1px solid ${CATEGORY_COLOR[el.category]}`,
                  background: 'rgba(0,0,0,0.2)',
                }}
              >
                {el.category}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'calc(13px * var(--system-ratio, 1))', color: 'var(--parchment)', fontFamily: 'var(--font-body)' }}>{el.name}</div>
                {el.description && (
                  <div style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--parchment)', opacity: 0.7, marginTop: 2, lineHeight: 1.55 }}>{el.description}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
