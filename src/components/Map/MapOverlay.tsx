import { motion } from 'framer-motion';
import { useMapStore } from '../../stores/useMapStore';
import { MapGraph } from './MapGraph';

export function MapOverlay() {
  const locations = useMapStore((s) => s.locations);
  const edges = useMapStore((s) => s.edges);
  const currentLocationId = useMapStore((s) => s.currentLocationId);

  return (
    <motion.div
      initial="enter" animate="visible" exit="exit"
      variants={{ enter: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: 'absolute', inset: 0, zIndex: 10, borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(160deg, #14100b 0%, #0d0a07 100%)',
      }}
    >
      <div style={{ flexShrink: 0, padding: '18px 24px 10px', borderBottom: '1px solid rgba(196,168,85,0.15)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>地图</h3>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-faded)', letterSpacing: 2 }}>LOCATION MAP</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {locations.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-subtle)', fontStyle: 'italic', fontSize: 13 }}>
            尚未探索任何地点……
          </div>
        ) : (
          <MapGraph locations={locations} edges={edges} currentId={currentLocationId} />
        )}
      </div>
    </motion.div>
  );
}
