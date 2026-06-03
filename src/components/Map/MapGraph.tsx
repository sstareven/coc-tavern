import { useRef } from 'react';
import type { MapLocation, MapEdge } from '../../types';

const NODE_R = 22;          // 节点圆半径
const COL_GAP = 150;        // 列间距（左→右）
const ROW_GAP = 96;         // 同列节点纵向间距
const PAD_X = 64;           // 左右内边距
const PAD_Y = 70;           // 上下内边距
const MIN_H = 280;          // 画布最小高度，避免单列时过扁

interface Placed { pos: Map<string, { x: number; y: number }>; W: number; H: number }

/**
 * 分层流向布局（无外部依赖）：按通行方向把节点从左到右分列。
 * - 以「无 oneway 入边」的源头为根做无向 BFS，得到基础列号——让双向链也能左右铺开；
 *   全图皆双向（无 oneway）时退化为单一种子（当前地点 / 第一个地点）展开。
 * - 再用 oneway 边做前向松弛：保证 A-->B（单向不可逆）一定 col(B) > col(A)，箭头始终朝右。
 * - 同列节点纵向居中均分；画布尺寸随列数/行数增长，由外层容器横向滚动承接。
 */
function computeLayout(locations: MapLocation[], edges: MapEdge[], currentId: string | null): Placed {
  const n = locations.length;
  if (n === 0) return { pos: new Map(), W: 320, H: MIN_H };
  const order = locations.map((l) => l.id);
  const present = new Set(order);

  // 无向邻接（BFS 铺开用）
  const adj = new Map<string, string[]>();
  order.forEach((id) => adj.set(id, []));
  for (const e of edges) {
    if (!present.has(e.fromId) || !present.has(e.toId)) continue;
    adj.get(e.fromId)!.push(e.toId);
    adj.get(e.toId)!.push(e.fromId);
  }

  // 根 = 无 oneway 入边的节点（progression 源头）
  const onewayIn = new Map<string, number>();
  order.forEach((id) => onewayIn.set(id, 0));
  for (const e of edges) {
    if (e.type === 'oneway' && present.has(e.toId)) onewayIn.set(e.toId, (onewayIn.get(e.toId) ?? 0) + 1);
  }
  let roots = order.filter((id) => (onewayIn.get(id) ?? 0) === 0);
  // 全图无 oneway 约束（所有节点都算源头）→ 收敛为单一种子，避免全挤在第 0 列
  if (roots.length === order.length) {
    const seed = currentId && present.has(currentId) ? currentId : order[0];
    roots = [seed];
  }

  // BFS 赋列号；未连通的节点依次作为新种子（col 0）继续
  const col = new Map<string, number>();
  const queue: string[] = [];
  for (const r of roots) if (!col.has(r)) { col.set(r, 0); queue.push(r); }
  let qi = 0, seedIdx = 0;
  while (col.size < n || qi < queue.length) {
    if (qi >= queue.length) {
      while (seedIdx < order.length && col.has(order[seedIdx])) seedIdx++;
      if (seedIdx >= order.length) break;
      col.set(order[seedIdx], 0);
      queue.push(order[seedIdx]);
    }
    const cur = queue[qi++];
    const d = col.get(cur)!;
    for (const nb of adj.get(cur) ?? []) {
      if (!col.has(nb)) { col.set(nb, d + 1); queue.push(nb); }
    }
  }

  // oneway 前向松弛：保证单向边一定指向右侧更高列
  for (let it = 0; it < n; it++) {
    let changed = false;
    for (const e of edges) {
      if (e.type !== 'oneway') continue;
      const cf = col.get(e.fromId), ct = col.get(e.toId);
      if (cf != null && ct != null && ct < cf + 1) { col.set(e.toId, cf + 1); changed = true; }
    }
    if (!changed) break;
  }

  // 按列分组（同列保持原始顺序，减少视觉跳动）
  const colCount = Math.max(1, ...Array.from(col.values()).map((c) => c + 1));
  const byCol: string[][] = Array.from({ length: colCount }, () => []);
  for (const id of order) byCol[col.get(id) ?? 0].push(id);
  const maxRows = Math.max(1, ...byCol.map((c) => c.length));

  const W = PAD_X * 2 + (colCount - 1) * COL_GAP;
  const H = Math.max(MIN_H, PAD_Y * 2 + (maxRows - 1) * ROW_GAP);
  const cy = H / 2;

  const pos = new Map<string, { x: number; y: number }>();
  byCol.forEach((colIds, c) => {
    const x = PAD_X + c * COL_GAP;
    const m = colIds.length;
    colIds.forEach((id, i) => {
      const y = cy + (i - (m - 1) / 2) * ROW_GAP;
      pos.set(id, { x, y });
    });
  });

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
  const { pos, W, H } = computeLayout(locations, edges, currentId);

  // 抓取拖动平移（touchscreen 式 grab-pan）：鼠标按住地图任意处拖动，画布跟手平移，
  // 取代「只能拖滚动条」。仅对鼠标生效——触屏交给浏览器原生 overflow 平移，避免冲突。
  // 拖动时按 -delta 改 scrollLeft/Top：内容跟随指针（拖右→看到左侧内容，与滚动条相反）。
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, x: 0, y: 0, moved: false });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return; // 触屏/笔走原生滚动；仅鼠标左键抓取
    drag.current = { active: true, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.style.cursor = 'grabbing';
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active || !scrollRef.current) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return; // 阈值：小抖动不算拖动，保留点击选中节点
    d.moved = true;
    scrollRef.current.scrollLeft -= dx;
    scrollRef.current.scrollTop -= dy;
    d.x = e.clientX; d.y = e.clientY;
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    e.currentTarget.style.cursor = 'grab';
  };
  // 拖动过的这一下产生的 click 不应选中节点——捕获阶段吞掉它（纯点击 moved=false 不受影响）。
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) { e.stopPropagation(); drag.current.moved = false; }
  };

  return (
    <div ref={scrollRef}
      style={{ flex: 1, minHeight: 0, width: '100%', overflow: 'auto', cursor: 'grab' }}
      className="inv-scroll"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onClickCapture={onClickCapture}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', margin: 'auto', minWidth: W, minHeight: H }}>
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
          const R = NODE_R + 2;
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
              <circle cx={p.x} cy={p.y} r={NODE_R}
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
    </div>
  );
}
