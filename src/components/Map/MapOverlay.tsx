import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMapStore } from '../../stores/useMapStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobilePageToggle, type Side } from '../Book/MobilePageToggle';
import { MapGraph } from './MapGraph';

const PAGE_BG = 'linear-gradient(160deg, #14100b 0%, #0d0a07 100%)';

export function MapOverlay() {
  const locations = useMapStore((s) => s.locations);
  const edges = useMapStore((s) => s.edges);
  const currentLocationId = useMapStore((s) => s.currentLocationId);
  const isMobile = useIsMobile();
  const [side, setSide] = useState<Side>('right');
  const [selId, setSelId] = useState<string | null>(currentLocationId);

  const sel = locations.find((l) => l.id === (selId ?? currentLocationId)) ?? null;
  const empty = locations.length === 0;

  return (
    <motion.div
      data-fixed-dark="on"
      initial="enter" animate="visible" exit="exit"
      variants={{ enter: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: isMobile ? 'column' : 'row', borderRadius: 4 }}
    >
      {isMobile && <MobilePageToggle left="清单" right="地图" side={side} onSide={setSide} />}

      {/* Left page — 地点清单 + 详情 */}
      <motion.div style={{
        flex: '1 1 0', display: isMobile && side !== 'left' ? 'none' : 'flex', flexDirection: 'column',
        background: PAGE_BG, borderRadius: '3px 0 0 3px', boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.3)',
        padding: '28px 20px 16px 28px', overflow: 'hidden',
      }}>
        <div style={{ borderBottom: '1px solid rgba(196,168,85,0.2)', paddingBottom: 8, marginBottom: 8, flexShrink: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>地点清单</h3>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-faded)', letterSpacing: 2 }}>LOCATIONS</span>
        </div>

        <div className="inv-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.3)' }}>
          {empty ? (
            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-subtle)', fontStyle: 'italic' }}>尚未探索任何地点……</div>
          ) : (
            locations.map((l) => {
              const isCur = l.id === currentLocationId;
              const isSel = l.id === (selId ?? currentLocationId);
              return (
                <div key={l.id} onClick={() => setSelId(l.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', cursor: 'pointer',
                    borderLeft: isSel ? '2px solid var(--gold)' : '2px solid transparent',
                    background: isSel ? 'rgba(196,168,85,0.1)' : 'transparent',
                    transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)',
                  }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = 'rgba(196,168,85,0.05)'; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontFamily: 'var(--font-body)', color: isCur ? 'var(--gold)' : 'var(--parchment)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                  {isCur && <span style={{ flexShrink: 0, fontSize: 9, color: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 8, padding: '0 6px' }}>所在</span>}
                </div>
              );
            })
          )}
        </div>

        {/* 选中地点详情 */}
        <div style={{ flexShrink: 0, borderTop: '1px solid rgba(196,168,85,0.18)', paddingTop: 8, marginTop: 6, minHeight: 56 }}>
          {sel ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold)', letterSpacing: 2 }}>{sel.name}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--parchment)', opacity: 0.85, marginTop: 3, lineHeight: 1.55 }}>{sel.description || '（无描述）'}</div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--ink-subtle)', fontStyle: 'italic' }}>点击地点查看详情</div>
          )}
        </div>
      </motion.div>

      {/* Spine */}
      <div style={{ width: 2, flexShrink: 0, display: isMobile ? 'none' : 'block', background: 'linear-gradient(to right, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.4) 100%)' }} />

      {/* Right page — 可视化地图（带退场翻页动画） */}
      <motion.div
        variants={isMobile ? undefined : { exit: { rotateY: -180 } }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        style={{
          flex: '1 1 0', display: isMobile && side !== 'right' ? 'none' : 'flex', flexDirection: 'column',
          background: PAGE_BG, borderRadius: '0 3px 3px 0', boxShadow: 'inset 1px 0 2px rgba(0,0,0,0.3)',
          padding: '18px 20px 10px', transformOrigin: '0% 50%', backfaceVisibility: 'hidden', overflow: 'hidden',
        }}>
        <div style={{ flexShrink: 0, marginBottom: 6 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>地图</h3>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-faded)', letterSpacing: 2 }}>实线=可往返　虚线箭头=单向不可逆</span>
        </div>
        {empty ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-subtle)', fontStyle: 'italic', fontSize: 13 }}>尚无地点</div>
        ) : (
          <MapGraph locations={locations} edges={edges} currentId={currentLocationId} selectedId={selId ?? currentLocationId} onSelect={setSelId} />
        )}
      </motion.div>
    </motion.div>
  );
}
