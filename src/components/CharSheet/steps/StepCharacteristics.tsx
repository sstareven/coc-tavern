import type { COC7Characteristic } from '../../../types';
import { DarkSelect } from '../../Shared/DarkSelect';
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
  onSwitchToFreeMode: () => void;
  onSwitchToPoolMode: () => void;
}

export function StepCharacteristics({
  charValues,
  poolMode,
  poolAssignments,
  availablePoolValues,
  onAdjChar,
  onRollChar,
  onRandomAll,
  onPoolAssign,
  onSwitchToFreeMode,
  onSwitchToPoolMode,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={sectionTitle}>基础属性 CHARACTERISTICS</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          {!poolMode && (
            <button onClick={onRandomAll} style={{
              padding: '6px 16px', border: '1px solid var(--gold)', borderRadius: 4,
              background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
              fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer', letterSpacing: 2,
            }}>全随机</button>
          )}
        </div>
      </div>

      {poolMode && (
        <div style={{
          padding: '8px 12px', border: '1px solid rgba(196,168,85,0.12)',
          borderRadius: 4, background: 'rgba(196,168,85,0.04)',
          fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)',
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
            剩余数值:
          </span>
          {availablePoolValues.length > 0 ? availablePoolValues.map((v, i) => (
            <span key={i} style={{
              padding: '2px 8px', border: '1px solid rgba(196,168,85,0.2)',
              borderRadius: 3, color: 'var(--gold)', fontWeight: 600,
            }}>{v}</span>
          )) : (
            <span style={{ color: 'var(--success)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
              全部已分配
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {CHAR_ORDER.map(({ key, zh }) => {
          const val = charValues[key] || 50;
          const half = Math.floor(val / 2);
          const fifth = Math.floor(val / 5);
          const assignedPool = poolAssignments[key];

          if (poolMode) {
            const options = assignedPool != null
              ? [assignedPool, ...availablePoolValues]
              : availablePoolValues;
            return (
              <div key={key} style={{ padding: '10px 12px', border: '1px solid rgba(196,168,85,0.15)', borderRadius: 4, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 600 }}>{zh} ({key})</span>
                  <button onClick={() => onPoolAssign(key, null)} style={{
                    padding: '2px 8px', border: '1px solid var(--brass)', borderRadius: 3,
                    background: 'transparent', color: 'var(--ink-subtle)',
                    fontFamily: 'var(--font-ui)', fontSize: 9, cursor: 'pointer',
                  }}>清除</button>
                </div>
                <DarkSelect
                  value={assignedPool != null ? String(assignedPool) : ''}
                  onChange={(v) => onPoolAssign(key, v ? Number(v) : null)}
                  options={[
                    { value: '', label: '-- 选择数值 --' },
                    ...options.map((v) => ({ value: String(v), label: String(v) })),
                  ]}
                />
                {assignedPool != null && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>
                    <span>1/2: {half}</span><span>1/5: {fifth}</span>
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
    </div>
  );
}

// Re-export for use in CharacterCreator
export { CHAR_ROLL, POOL_VALUES };
