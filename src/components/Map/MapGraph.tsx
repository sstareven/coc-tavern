import { useState } from 'react';
import type { MapLocation, MapEdge } from '../../types';

const W = 560;
const H = 460;

/** 用确定性圆形布局排布节点（无外部依赖）；当前地点居中高亮。 */
function layout(locations: MapLocation[], currentId: string | null): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const cx = W / 2, cy = H / 2;
  const n = locations.length;
  if (n === 0) return pos;
  // 当前地点放中心，其余环绕；无当前地点时全部环绕。
  const ring = locations.filter((l) => l.id !== currentId);
  if (currentId && locations.some((l) => l.id === currentId)) {
    pos.set(currentId, { x: cx, y: cy });
  }
  const r = Math.min(W, H) * (ring.length > 1 ? 0.36 : 0.0);
  ring.forEach((l, i) => {
    const a = (-Math.PI / 2) + (2 * Math.PI * i) / Math.max(1, ring.length);
    pos.set(l.id, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  });
  // 若没有 current，把第一个放中心更稳
  if (!pos.has(locations[0].id)) pos.set(locations[0].id, { x: cx, y: cy });
  return pos;
}

export function MapGraph({ locations, edges, currentId }: { locations: MapLocation[]; edges: MapEdge[]; currentId: string | null }) {
  const [sel, setSel] = useState<string | null>(currentId);
  const pos = layout(locations, currentId);
  const byId = new Map(locations.map((l) => [l.id, l]));
  const selLoc = sel ? byId.get(sel) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ flex: 1, minHeight: 0, width: '100%' }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="rgba(196,168,85,0.85)" />
          </marker>
        </defs>
        {/* 边 */}
        {edges.map((e) => {
          const a = pos.get(e.fromId), b = pos.get(e.toId);
          if (!a || !b) return null;
          // 缩短到节点边缘
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const R = 26;
          const x1 = a.x + ux * R, y1 = a.y + uy * R, x2 = b.x - ux * R, y2 = b.y - uy * R;
          return (
            <line key={e.id} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={e.type === 'oneway' ? 'rgba(196,168,85,0.7)' : 'rgba(140,120,80,0.55)'}
              strokeWidth={1.6}
              strokeDasharray={e.type === 'oneway' ? '5 3' : undefined}
              markerEnd={e.type === 'oneway' ? 'url(#arrow)' : undefined}
            />
          );
        })}
        {/* 节点 */}
        {locations.map((l) => {
          const p = pos.get(l.id);
          if (!p) return null;
          const isCur = l.id === currentId;
          const isSel = l.id === sel;
          return (
            <g key={l.id} onClick={() => setSel(l.id)} style={{ cursor: 'pointer' }}>
              <circle cx={p.x} cy={p.y} r={24}
                fill={isCur ? 'rgba(196,168,85,0.22)' : 'rgba(26,20,14,0.55)'}
                stroke={isCur ? 'var(--gold)' : isSel ? 'rgba(196,168,85,0.7)' : 'rgba(196,168,85,0.35)'}
                strokeWidth={isCur ? 2.5 : 1.4} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11}
                fill={isCur ? 'var(--gold)' : 'var(--parchment)'} fontFamily="var(--font-ui)"
                style={{ pointerEvents: 'none' }}>
                {l.name.length > 5 ? l.name.slice(0, 4) + '…' : l.name}
              </text>
            </g>
          );
        })}
      </svg>
      {/* 选中地点详情 */}
      <div style={{ flexShrink: 0, minHeight: 52, padding: '8px 12px', borderTop: '1px solid rgba(196,168,85,0.18)', background: 'rgba(13,10,7,0.4)' }}>
        {selLoc ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold)', letterSpacing: 2 }}>{selLoc.name}</span>
              {selLoc.id === currentId && <span style={{ fontSize: 9, color: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 8, padding: '0 7px' }}>所在</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--parchment)', opacity: 0.85, marginTop: 3, lineHeight: 1.5 }}>{selLoc.description || '（无描述）'}</div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--ink-subtle)', fontStyle: 'italic' }}>点击节点查看地点详情　·　实线=可往返　虚线箭头=单向不可逆</div>
        )}
      </div>
    </div>
  );
}
