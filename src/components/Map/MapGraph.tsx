import type { MapLocation, MapEdge } from '../../types';

const BASE_W = 520;
const BASE_H = 460;
const NODE_R = 24;            // 节点圆半径
const MIN_GAP = 14;           // 相邻节点之间最小净间隙
const SPACING = NODE_R * 2 + MIN_GAP; // 相邻节点中心所需最小弧间距

/**
 * 用确定性多层同心环布局排布节点（无外部依赖）；当前地点居中高亮。
 * 环半径随该环节点数 k 自适应：保证相邻节点弧间距 ≥ 节点直径+间隙，
 * 并设下限（修掉 k=1/2 时半径为 0 导致与中心重合的 bug）。一环放不下就分多层。
 * 返回布局尺寸 W/H：当外环半径较大时随之增长，保持 preserveAspectRatio 不溢出/不重叠。
 */
function layout(locations: MapLocation[], currentId: string | null): {
  pos: Map<string, { x: number; y: number }>; W: number; H: number;
} {
  const pos = new Map<string, { x: number; y: number }>();
  const n = locations.length;
  if (n === 0) return { pos, W: BASE_W, H: BASE_H };

  const ring = locations.filter((l) => l.id !== currentId);
  const hasCenter = !!currentId && locations.some((l) => l.id === currentId);
  // 无明确当前地点时，让第一个地点居中，其余成环（与旧行为一致）。
  const centerId = hasCenter ? currentId! : (ring.length === n ? locations[0].id : null);
  const ringNodes = centerId ? ring.filter((l) => l.id !== centerId) : ring;

  // 把环上节点按容量分配到一层或多层同心环；第 t 层基础半径随层数递增。
  const layers: MapLocation[][] = [];
  let idx = 0;
  let layerNo = 0;
  while (idx < ringNodes.length) {
    // 该层基础半径：随层号递增，留出中心节点空间。
    const base = NODE_R * 2 + MIN_GAP + layerNo * (NODE_R * 2 + MIN_GAP);
    // 该层周长能容纳的节点数（按最小弧间距）。
    const cap = Math.max(1, Math.floor((2 * Math.PI * base) / SPACING));
    const slice = ringNodes.slice(idx, idx + cap);
    layers.push(slice);
    idx += slice.length;
    layerNo++;
  }

  let maxR = 0;
  layers.forEach((slice, t) => {
    const k = slice.length;
    const base = NODE_R * 2 + MIN_GAP + t * (NODE_R * 2 + MIN_GAP);
    // 半径下限 base（保证不与中心重合）；并保证 k 个节点不互相重叠。
    const need = k > 1 ? SPACING / (2 * Math.sin(Math.PI / k)) : 0;
    const r = Math.max(base, need);
    maxR = Math.max(maxR, r);
    // 逐层错开起始角，避免内外层节点径向连成一条线。
    const offset = (-Math.PI / 2) + (t % 2) * (Math.PI / Math.max(1, k));
    slice.forEach((l, i) => {
      const a = offset + (2 * Math.PI * i) / Math.max(1, k);
      // 中心坐标在外层用占位，最后统一按动态尺寸换算；先记录相对偏移。
      pos.set(l.id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
    });
  });

  // 根据外环半径决定画布尺寸：需容纳 maxR + 节点半径 + 文字/边距。
  const margin = NODE_R + 18;
  const W = Math.max(BASE_W, Math.ceil((maxR + margin) * 2));
  const H = Math.max(BASE_H, Math.ceil((maxR + margin) * 2));
  const cx = W / 2, cy = H / 2;

  // 把相对偏移换算成绝对坐标，并落定中心节点。
  for (const [id, p] of pos) pos.set(id, { x: cx + p.x, y: cy + p.y });
  if (centerId) pos.set(centerId, { x: cx, y: cy });
  if (!pos.has(locations[0].id)) pos.set(locations[0].id, { x: cx, y: cy });

  return { pos, W, H };
}

/** 受控的地图网络可视化（仅 SVG）。选中态/详情由父级管理。 */
export function MapGraph({ locations, edges, currentId, selectedId, onSelect }: {
  locations: MapLocation[];
  edges: MapEdge[];
  currentId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { pos, W, H } = layout(locations, currentId);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ flex: 1, minHeight: 260, width: '100%' }}>
      <defs>
        <marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(196,168,85,0.85)" />
        </marker>
      </defs>
      {/* 边 */}
      {edges.map((e) => {
        const a = pos.get(e.fromId), b = pos.get(e.toId);
        if (!a || !b) return null;
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
            markerEnd={e.type === 'oneway' ? 'url(#map-arrow)' : undefined}
          />
        );
      })}
      {/* 节点 */}
      {locations.map((l) => {
        const p = pos.get(l.id);
        if (!p) return null;
        const isCur = l.id === currentId;
        const isSel = l.id === selectedId;
        return (
          <g key={l.id} onClick={() => onSelect(l.id)} style={{ cursor: 'pointer' }}>
            <circle cx={p.x} cy={p.y} r={24}
              fill={isCur ? 'rgba(196,168,85,0.22)' : 'rgba(26,20,14,0.55)'}
              stroke={isCur ? 'var(--gold)' : isSel ? 'rgba(196,168,85,0.7)' : 'rgba(196,168,85,0.35)'}
              strokeWidth={isCur ? 2.5 : isSel ? 2 : 1.4} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11}
              fill={isCur ? 'var(--gold)' : 'var(--parchment)'} fontFamily="var(--font-ui)"
              style={{ pointerEvents: 'none' }}>
              {l.name.length > 5 ? l.name.slice(0, 4) + '…' : l.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
