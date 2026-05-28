import type { COC7Characteristic } from '../../../types';
import { sectionTitle, btnBase, inputStyle, thSmall, tdSmall } from '../styles';
import { DB_TABLE } from '../../../sillytavern/coc-data';

interface Props {
  charValues: Record<COC7Characteristic, number>;
  derived: { hpMax: number; sanMax: number; mpMax: number; db: string; build: number };
  luckValue: number | null;
  onRollLuck: () => void;
  onSetLuckValue: (v: number) => void;
}

export function StepDerivedStats({
  charValues,
  derived,
  luckValue,
  onRollLuck,
  onSetLuckValue,
}: Props) {
  const str = charValues.STR ?? 0;
  const siz = charValues.SIZ ?? 0;
  const strPlusSiz = str + siz;

  const stats = [
    { label: 'HP 生命值', value: `${derived.hpMax} / ${derived.hpMax}`, color: 'var(--success)' },
    { label: 'SAN 理智值', value: `${derived.sanMax} / ${derived.sanMax}`, color: 'var(--blood)' },
    { label: 'MP 魔法值', value: `${derived.mpMax} / ${derived.mpMax}`, color: 'var(--gold)' },
    { label: 'LUCK 幸运', value: luckValue != null ? String(luckValue) : '未投掷', color: 'var(--gold-bright)' },
    { label: 'MOV 移动', value: '8', color: 'var(--ink-subtle)' },
    { label: 'DB / Build', value: `${derived.db} / ${derived.build >= 0 ? '+' : ''}${derived.build}`, color: 'var(--ink-subtle)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={sectionTitle}>衍生属性 SECONDARY STATS</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            padding: '10px 12px',
            border: `1px solid ${s.color}22`,
            borderRadius: 4,
            background: 'rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}>
            <div style={{ fontSize: 9, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 2 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Luck roller */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
        border: '1px solid rgba(196,168,85,0.15)',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.1)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
          幸运值 (3D6 x 5):
        </span>
        {luckValue != null ? (
          <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold-bright)' }}>
            {luckValue}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--ink-subtle)' }}>--</span>
        )}
        <button onClick={onRollLuck} style={btnBase}>
          投掷
        </button>
        {luckValue != null && (
          <input
            type="number"
            value={luckValue}
            onChange={(e) => onSetLuckValue(Number(e.target.value) || 0)}
            style={{ ...inputStyle, width: 80, padding: '4px 8px' }}
            min={0}
            max={99}
          />
        )}
      </div>

      {/* DB / Build lookup */}
      <div style={{
        border: '1px solid rgba(196,168,85,0.12)',
        borderRadius: 4,
        overflow: 'hidden',
        background: 'rgba(0,0,0,0.1)',
      }}>
        <div style={{
          padding: '8px 12px',
          background: 'rgba(196,168,85,0.06)',
          fontSize: 11,
          color: 'var(--ink-subtle)',
          fontFamily: 'var(--font-ui)',
          letterSpacing: 2,
        }}>
          DB / Build 对照表 (STR + SIZ = {strPlusSiz})
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
              <th style={{ ...thSmall, textAlign: 'left' }}>STR+SIZ</th>
              <th style={{ ...thSmall, textAlign: 'center' }}>DB</th>
              <th style={{ ...thSmall, textAlign: 'center' }}>Build</th>
            </tr>
          </thead>
          <tbody>
            {DB_TABLE.map((row) => {
              const active = strPlusSiz >= parseInt(row.range.split('\u2013')[0].trim()) &&
                strPlusSiz <= parseInt(row.range.split('\u2013')[1]?.trim() ?? '999');
              return (
                <tr key={row.range} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: active ? 'rgba(196,168,85,0.08)' : 'transparent',
                }}>
                  <td style={{ ...tdSmall, color: active ? 'var(--gold)' : 'var(--text-light)' }}>{row.range}</td>
                  <td style={{ ...tdSmall, textAlign: 'center', color: active ? 'var(--gold)' : 'var(--text-light)' }}>{row.db}</td>
                  <td style={{ ...tdSmall, textAlign: 'center', color: active ? 'var(--gold)' : 'var(--text-light)' }}>{row.build >= 0 ? `+${row.build}` : row.build}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
