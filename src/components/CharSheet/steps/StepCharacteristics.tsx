import { useEffect, useState } from 'react';
import type { COC7Characteristic } from '../../../types';
import { sectionTitle, plusMinusBtn } from '../styles';
import { CHAR_ORDER, POOL_VALUES } from '../../../sillytavern/coc-data';
import { CHAR_ROLL } from '../../../sillytavern/coc-rules';

interface Props {
  charValues: Record<COC7Characteristic, number>;
  poolMode: boolean;
  poolAssignments: Record<COC7Characteristic, number | null>;
  availablePoolValues: number[];
  onAdjChar: (key: COC7Characteristic, delta: number) => void;
  onRollChar: (key: COC7Characteristic) => void;
  onRandomAll: () => void;
  onPoolAssign: (key: COC7Characteristic, value: number | null) => void;
  onSwapPool: (from: COC7Characteristic, to: COC7Characteristic) => void;
  onResetPool: () => void;
  onRandomizePool: () => void;
  onShufflePool: () => void;
  onSwitchToFreeMode: () => void;
  onSwitchToPoolMode: () => void;
}

// Drag payload: either a die from the tray (carry numeric value) or from a slot (carry source key).
type DragPayload =
  | { source: 'tray'; value: number }
  | { source: 'slot'; key: COC7Characteristic };

// Touch-drag local state: payload + current pointer position for the floating ghost.
interface TouchDragState {
  payload: DragPayload;
  x: number;
  y: number;
}

const DND_MIME = 'application/x-coc-die';

export function StepCharacteristics({
  charValues,
  poolMode,
  poolAssignments,
  availablePoolValues,
  onAdjChar,
  onRollChar,
  onRandomAll,
  onPoolAssign,
  onSwapPool,
  onResetPool,
  onRandomizePool,
  onShufflePool,
  onSwitchToFreeMode,
  onSwitchToPoolMode,
}: Props) {
  // Local drag-UI state ONLY. All allocation state lives in the parent.
  const [dragging, setDragging] = useState(false);
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);
  // Touch/pen pointer-drag state (mobile). Mouse still uses native HTML5 DnD.
  const [touchDrag, setTouchDrag] = useState<TouchDragState | null>(null);

  // ---- Shared drop-resolution helpers (used by BOTH HTML5 DnD and touch path) ----

  // Resolve a drop onto an attribute slot.
  function resolveSlotDrop(targetKey: COC7Characteristic, payload: DragPayload) {
    if (payload.source === 'tray') {
      const occupied = poolAssignments[targetKey];
      if (occupied != null) {
        // Displace the existing die back to the tray first, then assign.
        onPoolAssign(targetKey, null);
      }
      onPoolAssign(targetKey, payload.value);
    } else {
      // slot -> slot: swap (works whether target empty or occupied).
      if (payload.key !== targetKey) {
        onSwapPool(payload.key, targetKey);
      }
    }
  }

  // Resolve a drop onto the tray (returns a slot die to the tray).
  function resolveTrayDrop(payload: DragPayload) {
    if (payload.source === 'slot') {
      onPoolAssign(payload.key, null);
    }
    // tray -> tray is a no-op.
  }

  function readPayload(e: React.DragEvent): DragPayload | null {
    try {
      const raw = e.dataTransfer.getData(DND_MIME);
      if (!raw) return null;
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  }

  function startDrag(e: React.DragEvent, payload: DragPayload) {
    e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  }

  function endDrag() {
    setDragging(false);
    setHoveredTarget(null);
  }

  // HTML5 drop onto an attribute slot.
  function handleSlotDrop(e: React.DragEvent, targetKey: COC7Characteristic) {
    e.preventDefault();
    const payload = readPayload(e);
    setHoveredTarget(null);
    setDragging(false);
    if (!payload) return;
    resolveSlotDrop(targetKey, payload);
  }

  // HTML5 drop onto the tray.
  function handleTrayDrop(e: React.DragEvent) {
    e.preventDefault();
    const payload = readPayload(e);
    setHoveredTarget(null);
    setDragging(false);
    if (!payload) return;
    resolveTrayDrop(payload);
  }

  // ---- Touch / pen pointer-drag (mobile) ----

  // Begin a pointer-drag for touch/pen. Mouse is ignored here (native DnD handles it).
  function startTouchDrag(e: React.PointerEvent, payload: DragPayload) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    e.preventDefault();
    setTouchDrag({ payload, x: e.clientX, y: e.clientY });
    setDragging(true);
  }

  // Resolve the drop target element currently under the pointer.
  function targetKeyAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const slotEl = el.closest('[data-drop-slot]');
    if (slotEl) return slotEl.getAttribute('data-drop-slot');
    const trayEl = el.closest('[data-drop-tray]');
    if (trayEl) return 'tray';
    return null;
  }

  useEffect(() => {
    if (!touchDrag) return;

    function onMove(ev: PointerEvent) {
      const target = targetKeyAt(ev.clientX, ev.clientY);
      setHoveredTarget(target);
      setTouchDrag((prev) => (prev ? { ...prev, x: ev.clientX, y: ev.clientY } : prev));
    }

    function onUp(ev: PointerEvent) {
      const target = targetKeyAt(ev.clientX, ev.clientY);
      // Capture payload before clearing state.
      setTouchDrag((prev) => {
        if (prev) {
          if (target === 'tray') {
            resolveTrayDrop(prev.payload);
          } else if (target) {
            resolveSlotDrop(target as COC7Characteristic, prev.payload);
          }
        }
        return null;
      });
      setHoveredTarget(null);
      setDragging(false);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchDrag !== null]);

  // Shared die token visual.
  function DieToken({
    value,
    onDragStart,
    onPointerDown,
    title,
  }: {
    value: number;
    onDragStart: (e: React.DragEvent) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    title?: string;
  }) {
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={endDrag}
        onPointerDown={onPointerDown}
        title={title}
        style={{
          width: 48,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          background: 'rgba(196,168,85,0.12)',
          border: '1px solid var(--gold)',
          color: 'var(--gold)',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 20,
          cursor: dragging ? 'grabbing' : 'grab',
          boxShadow: '0 2px 6px rgba(0,0,0,0.45), inset 0 0 8px rgba(196,168,85,0.08)',
          userSelect: 'none',
          touchAction: 'none',
          transition: 'var(--transition-smooth)',
          flexShrink: 0,
        }}
      >
        {value}
      </div>
    );
  }

  // Gold action button (shared by 随机 / 随机并填入 / 全随机).
  const goldBtnStyle: React.CSSProperties = {
    padding: '6px 16px',
    border: '1px solid var(--gold)',
    borderRadius: 4,
    background: 'rgba(196,168,85,0.1)',
    color: 'var(--gold)',
    fontFamily: 'var(--font-ui)',
    fontSize: 11,
    cursor: 'pointer',
    letterSpacing: 2,
    transition: 'var(--transition-smooth)',
  };

  const brassBtnStyle: React.CSSProperties = {
    padding: '6px 16px',
    border: '1px solid var(--brass)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--ink-subtle)',
    fontFamily: 'var(--font-ui)',
    fontSize: 11,
    cursor: 'pointer',
    letterSpacing: 2,
    transition: 'var(--transition-smooth)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stable header: title on its own line, controls in a wrapping left-aligned row below.
          Same arrangement in BOTH modes so buttons never jump to the far right. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={sectionTitle}>基础属性 CHARACTERISTICS</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Mode toggle */}
          <div style={{
            display: 'flex', border: '1px solid rgba(196,168,85,0.25)', borderRadius: 4,
            overflow: 'hidden',
          }}>
            <button onClick={onSwitchToPoolMode} style={{
              padding: '5px 12px', border: 'none',
              background: poolMode ? 'rgba(196,168,85,0.18)' : 'transparent',
              color: poolMode ? 'var(--gold)' : 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
              letterSpacing: 1, transition: 'var(--transition-smooth)',
            }}>点数池分配</button>
            <button onClick={onSwitchToFreeMode} style={{
              padding: '5px 12px', border: 'none',
              background: !poolMode ? 'rgba(196,168,85,0.18)' : 'transparent',
              color: !poolMode ? 'var(--gold)' : 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
              letterSpacing: 1, transition: 'var(--transition-smooth)',
            }}>自由调整</button>
          </div>
          {poolMode ? (
            <>
              <button onClick={onResetPool} style={brassBtnStyle}>重置</button>
              <button onClick={onRandomizePool} style={goldBtnStyle}>随机</button>
              <button onClick={onShufflePool} style={goldBtnStyle}>随机并填入</button>
            </>
          ) : (
            <button onClick={onRandomAll} style={goldBtnStyle}>全随机</button>
          )}
        </div>
      </div>

      {poolMode && (
        <div
          data-drop-tray="1"
          onDragOver={(e) => { e.preventDefault(); setHoveredTarget('tray'); }}
          onDragLeave={() => setHoveredTarget((t) => (t === 'tray' ? null : t))}
          onDrop={handleTrayDrop}
          style={{
            padding: '12px 14px',
            border: `1px ${hoveredTarget === 'tray' ? 'solid' : 'dashed'} ${hoveredTarget === 'tray' ? 'var(--gold)' : 'rgba(196,168,85,0.2)'}`,
            borderRadius: 6,
            background: hoveredTarget === 'tray' ? 'rgba(196,168,85,0.1)' : 'rgba(196,168,85,0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            alignItems: 'center',
            minHeight: 64,
            transition: 'var(--transition-smooth)',
          }}
        >
          <span style={{
            color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 1,
            fontSize: 11, textAlign: 'center', alignSelf: 'center',
          }}>
            骰子池:
          </span>
          <div style={{
            display: 'flex', gap: 10, flexWrap: 'wrap',
            justifyContent: 'center', alignItems: 'center', width: '100%',
          }}>
            {availablePoolValues.length > 0 ? availablePoolValues.map((v, i) => (
              <DieToken
                key={i}
                value={v}
                title="拖拽分配到属性"
                onDragStart={(e) => startDrag(e, { source: 'tray', value: v })}
                onPointerDown={(e) => startTouchDrag(e, { source: 'tray', value: v })}
              />
            )) : (
              <span style={{ color: 'var(--success)', fontFamily: 'var(--font-ui)', letterSpacing: 1, fontSize: 11, textAlign: 'center' }}>
                全部已分配
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {CHAR_ORDER.map(({ key, zh }) => {
          const val = charValues[key] || 50;
          const half = Math.floor(val / 2);
          const fifth = Math.floor(val / 5);
          const assignedPool = poolAssignments[key];

          if (poolMode) {
            const isHovered = hoveredTarget === key;
            return (
              <div
                key={key}
                data-drop-slot={key}
                onDragOver={(e) => { e.preventDefault(); setHoveredTarget(key); }}
                onDragLeave={() => setHoveredTarget((t) => (t === key ? null : t))}
                onDrop={(e) => handleSlotDrop(e, key)}
                style={{
                  padding: '10px 12px',
                  border: `1px solid ${isHovered ? 'var(--gold)' : 'rgba(196,168,85,0.15)'}`,
                  borderRadius: 4,
                  background: isHovered ? 'rgba(196,168,85,0.1)' : 'rgba(0,0,0,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  transition: 'var(--transition-smooth)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 600 }}>{zh} ({key})</span>
                  {assignedPool != null && (
                    <button onClick={() => onPoolAssign(key, null)} style={{
                      padding: '2px 8px', border: '1px solid var(--brass)', borderRadius: 3,
                      background: 'transparent', color: 'var(--ink-subtle)',
                      fontFamily: 'var(--font-ui)', fontSize: 9, cursor: 'pointer',
                    }}>清除</button>
                  )}
                </div>
                {assignedPool != null ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <DieToken
                      value={assignedPool}
                      title="拖拽到其他属性或骰子池"
                      onDragStart={(e) => startDrag(e, { source: 'slot', key })}
                      onPointerDown={(e) => startTouchDrag(e, { source: 'slot', key })}
                    />
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>
                      <span>1/2: {half}</span><span>1/5: {fifth}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    minHeight: 56, borderRadius: 6,
                    border: '1px dashed rgba(196,168,85,0.3)',
                    color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)',
                    fontSize: 11, letterSpacing: 1,
                  }}>
                    拖入骰子
                  </div>
                )}
              </div>
            );
          }

          // Free mode
          return (
            <div key={key} style={{ padding: '10px 12px', border: '1px solid rgba(196,168,85,0.15)', borderRadius: 4, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 600 }}>{zh} ({key})</span>
                <button onClick={() => onRollChar(key)} style={{ padding: '2px 8px', border: '1px solid var(--brass)', borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', fontSize: 9, cursor: 'pointer' }}>ROLL</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <button onClick={() => onAdjChar(key, -5)} style={plusMinusBtn}>-5</button>
                <button onClick={() => onAdjChar(key, -1)} style={plusMinusBtn}>-1</button>
                <span style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--text-light)', fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{val}</span>
                <button onClick={() => onAdjChar(key, +1)} style={plusMinusBtn}>+1</button>
                <button onClick={() => onAdjChar(key, +5)} style={plusMinusBtn}>+5</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>
                <span>1/2: {half}</span><span>1/5: {fifth}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating ghost die for touch-drag (follows the pointer). */}
      {touchDrag && (
        <div
          style={{
            position: 'fixed',
            left: touchDrag.x,
            top: touchDrag.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 9999,
            width: 48,
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            background: 'rgba(196,168,85,0.2)',
            border: '1px solid var(--gold)',
            color: 'var(--gold)',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 20,
            boxShadow: '0 4px 14px rgba(0,0,0,0.6), inset 0 0 8px rgba(196,168,85,0.12)',
            opacity: 0.92,
          }}
        >
          {touchDrag.payload.source === 'tray' ? touchDrag.payload.value : (poolAssignments[touchDrag.payload.key] ?? '')}
        </div>
      )}
    </div>
  );
}

// Re-export for use in CharacterCreator
export { CHAR_ROLL, POOL_VALUES };
