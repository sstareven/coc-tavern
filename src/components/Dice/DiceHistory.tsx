import { useState } from 'react';
import { useDiceStore } from '../../stores/useDiceStore';
import type { DiceRecord, DiceResultType } from '../../types';

const resultLabel: Record<DiceResultType, string> = {
  'crit-success': '大成功',
  'extreme-success': '极难成功',
  'hard-success': '困难成功',
  success: '成功',
  failure: '失败',
  'crit-failure': '大失败',
};

const rowColor: Record<DiceResultType, { bg: string; border: string }> = {
  'crit-success': { bg: 'rgba(196,168,85,0.12)', border: 'var(--gold-bright)' },
  'extreme-success': { bg: 'rgba(196,168,85,0.06)', border: 'var(--gold)' },
  'hard-success': { bg: 'rgba(90,171,122,0.08)', border: 'var(--success-bright)' },
  success: { bg: 'rgba(58,107,90,0.06)', border: 'var(--success)' },
  failure: { bg: 'rgba(139,58,58,0.06)', border: 'var(--blood)' },
  'crit-failure': { bg: 'rgba(204,51,51,0.1)', border: 'var(--blood-bright)' },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
void formatTime;

export function DiceHistory({ onClose }: { onClose: () => void }) {
  const history = useDiceStore((s) => s.history);  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const handleClose = () => {
    setVisible(false);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 850,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
          border: '1px solid var(--gold)',
          borderRadius: 8,
          padding: '24px 28px',
          minWidth: 500,
          maxWidth: 640,
          width: '90%',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 0 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            borderBottom: '1px solid rgba(196,168,85,0.18)',
            paddingBottom: 10,
            flexShrink: 0,
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'calc(18px * var(--system-ratio, 1))',
              color: 'var(--gold)',
              letterSpacing: 4,
              margin: 0,
            }}
          >
            检定记录 / ROLL HISTORY
          </h3>
          <button
            onClick={handleClose}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid transparent',
              borderRadius: 3,
              background: 'transparent',
              color: 'var(--ink-subtle)',
              fontSize: 'calc(16px * var(--system-ratio, 1))',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--gold)';
              e.currentTarget.style.borderColor = 'var(--brass)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--ink-subtle)';
              e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            ✕
          </button>
        </div>

        {/* Table */}
        <div style={{ overflowY: 'auto', flex: 1, scrollbarWidth: 'thin', scrollbarColor: 'var(--ink-faded) transparent' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-ui)' }}>
            <thead>
              <tr
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  background: 'var(--leather)',
                }}
              >
                {['检定项目', '掷出', '目标', '结果', '页码'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: 'calc(11px * var(--system-ratio, 1))',
                      color: 'var(--ink-subtle)',
                      letterSpacing: 2,
                      borderBottom: '1px solid rgba(196,168,85,0.18)',
                      fontFamily: 'var(--font-ui)',
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: '40px 0',
                      textAlign: 'center',
                      color: 'var(--ink-subtle)',
                      fontSize: 'calc(13px * var(--system-ratio, 1))',
                      letterSpacing: 2,
                    }}
                  >
                    暂无检定记录
                  </td>
                </tr>
              ) : (
                history.map((rec: DiceRecord, i: number) => {
                  // 防御：未知/缺失 type(如历史脏数据)不得让整面板崩成空白——回落中性配色与原文标签。
                  const colors = rowColor[rec.type] ?? { bg: 'transparent', border: 'var(--ink-faded)' };
                  const label = rec.kind === 'poly' ? `${rec.roll} 点` : (resultLabel[rec.type] ?? String(rec.type ?? '—'));
                  return (
                    <tr
                      key={`${rec.time}-${i}`}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        background: colors.bg,
                      }}
                    >
                      <td
                        style={{
                          padding: '9px 12px',
                          fontSize: 'calc(12px * var(--system-ratio, 1))',
                          color: 'var(--text-light)',
                          letterSpacing: 1,
                          borderLeft: `3px solid ${colors.border}`,
                        }}
                      >
                        {rec.skill}
                      </td>
                      <td
                        style={{
                          padding: '9px 12px',
                          fontSize: 'calc(14px * var(--system-ratio, 1))',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--gold)',
                          fontWeight: 700,
                        }}
                      >
                        {rec.roll}
                      </td>
                      <td
                        style={{
                          padding: '9px 12px',
                          fontSize: 'calc(12px * var(--system-ratio, 1))',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-light)',
                        }}
                      >
                        {rec.target}
                      </td>
                      <td
                        style={{
                          padding: '9px 12px',
                          fontSize: 'calc(11px * var(--system-ratio, 1))',
                          fontWeight: 600,
                          color: colors.border,
                          letterSpacing: 1,
                        }}
                      >
                        {rec.kind === 'poly' ? `${rec.roll} 点` : label}
                      </td>
                      <td
                        style={{
                          padding: '9px 12px',
                          fontSize: 'calc(11px * var(--system-ratio, 1))',
                          color: 'var(--ink-subtle)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {rec.page ? `第${rec.page}页` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
