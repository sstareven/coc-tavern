import { useState } from 'react';
import { useCharSheetStore } from '../../stores/useCharSheetStore';

export function SkillsTable() {
  const skills = useCharSheetStore((s) => s.sheet.skills);
  const [collapsed, setCollapsed] = useState(false);
  const entries = Object.entries(skills);

  return (
    <div
      style={{
        border: '1px solid rgba(196,168,85,0.12)',
        borderRadius: 4,
        overflow: 'hidden',
        background: 'rgba(0,0,0,0.1)',
      }}
    >
      {/* Collapsible header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          border: 'none',
          borderBottom: collapsed ? 'none' : '1px solid rgba(196,168,85,0.1)',
          background: 'rgba(196,168,85,0.06)',
          color: 'var(--gold)',
          fontFamily: 'var(--font-ui)',
          fontSize: 13,
          letterSpacing: 2,
          cursor: 'pointer',
          transition: 'var(--transition-smooth)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(196,168,85,0.12)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(196,168,85,0.06)';
        }}
      >
        <span>已习得技能 ({entries.length}项)</span>
        <span
          style={{
            fontSize: 10,
            color: 'var(--ink-subtle)',
            transition: 'transform 0.3s',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </span>
      </button>

      {!collapsed && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-ui)' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
              <th style={thStyle}>技能名称</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>基础值</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>当前值</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>半值/五值</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, skill]) => {
              const half = Math.floor(skill.current / 2);
              const fifth = Math.floor(skill.current / 5);
              return (
                <tr key={name} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={tdStyle}>{name}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>
                    {skill.base}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 700 }}>
                    {skill.current}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-subtle)' }}>
                    {half} / {fifth}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '7px 10px',
  textAlign: 'left',
  fontSize: 10,
  color: 'var(--ink-subtle)',
  letterSpacing: 1,
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
  borderBottom: '1px solid rgba(196,168,85,0.1)',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 12,
  color: 'var(--text-light)',
  letterSpacing: 1,
};
