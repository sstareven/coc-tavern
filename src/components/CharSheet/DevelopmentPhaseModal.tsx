import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useVariableStore } from '../../stores/useVariableStore';
import {
  buildDevelopmentRows,
  buildDevelopmentOps,
  type DevPhaseRow,
  type RNG,
} from '../../sillytavern/skill-improvement';

// ============================================================
// A3.4 — 发展阶段对话框
// ----------------------------------------------------------
// 打开时一次性掷骰生成 Row[]；玩家审阅；点提交后落入 useVariableStore.applyCorrectiveOps。
// 跨越 90% 的行 (A3.5) 旁附浮动 +SAN chip，提示玩家本次额外获得了 2D6 SAN。
// ============================================================

interface Props {
  open: boolean;
  onClose: () => void;
  /** 测试可注入；缺省走 Math.random。 */
  rng?: RNG;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1200,
  background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(6px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
  border: '1px solid var(--brass)',
  borderRadius: 8,
  padding: '28px 32px',
  width: 'min(560px, 92vw)',
  maxHeight: '86vh',
  display: 'flex', flexDirection: 'column',
  boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
  fontFamily: 'var(--font-ui)',
};

const headerStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'calc(18px * var(--system-ratio, 1))',
  color: 'var(--gold)',
  letterSpacing: 4,
  marginBottom: 4,
};

const subHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 8,
  color: 'var(--ink-faded)',
  letterSpacing: 2,
  marginBottom: 16,
};

const colHeaderStyle: React.CSSProperties = {
  fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)', letterSpacing: 1,
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.4fr 0.6fr 0.6fr 0.7fr 0.6fr',
  alignItems: 'center',
  padding: '7px 0',
  borderBottom: '1px solid rgba(196,168,85,0.10)',
  position: 'relative',
};

const btnStyle: React.CSSProperties = {
  padding: '8px 28px',
  border: '1px solid var(--brass)',
  borderRadius: 4,
  background: 'rgba(196,168,85,0.10)',
  color: 'var(--text-light)',
  fontSize: 'calc(12px * var(--system-ratio, 1))',
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
  letterSpacing: 1,
};

export function DevelopmentPhaseModal({ open, onClose, rng }: Props) {
  const sheet = useCharSheetStore((s) => s.sheet);
  const applyCorrectiveOps = useVariableStore((s) => s.applyCorrectiveOps);
  const [submitted, setSubmitted] = useState(false);

  // 打开时一次性掷骰：依赖 open 触发重算；关闭后切换 submitted 复位以备下次开启。
  const rows: DevPhaseRow[] = useMemo(() => {
    if (!open) return [];
    return buildDevelopmentRows(sheet.skills, rng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const onSubmit = () => {
    if (submitted) return;
    const ops = buildDevelopmentOps(rows);
    if (ops.length > 0) applyCorrectiveOps(ops);
    setSubmitted(true);
    onClose();
    setSubmitted(false);
  };

  const totalImproved = rows.filter((r) => r.improved).length;
  const totalSanBonus = rows.reduce((acc, r) => acc + (r.sanBonus ?? 0), 0);

  return (
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-label="发展阶段">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>本章结算 · 发展阶段</div>
        <div style={subHeaderStyle}>DEVELOPMENT PHASE · SKILL IMPROVEMENT</div>

        {rows.length === 0 ? (
          <div style={{
            padding: '36px 0', textAlign: 'center', fontSize: 'calc(12px * var(--system-ratio, 1))',
            fontFamily: 'var(--font-body)', color: 'var(--ink-faded)', fontStyle: 'italic',
          }}>
            本章未触发任何技能成长检定
          </div>
        ) : (
          <>
            {/* 列头 */}
            <div style={{ ...rowStyle, borderBottom: '1px solid rgba(196,168,85,0.25)', paddingBottom: 4 }}>
              <span style={colHeaderStyle}>技能</span>
              <span style={{ ...colHeaderStyle, textAlign: 'center' }}>D100</span>
              <span style={{ ...colHeaderStyle, textAlign: 'center' }}>+D10</span>
              <span style={{ ...colHeaderStyle, textAlign: 'center' }}>变化</span>
              <span style={{ ...colHeaderStyle, textAlign: 'right' }}>结果</span>
            </div>

            <div className="inv-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, marginBottom: 16 }}>
              {rows.map((r) => (
                <div key={r.name} style={rowStyle}>
                  <span style={{ fontSize: 'calc(12px * var(--system-ratio, 1))', color: 'var(--text-light)', fontFamily: 'var(--font-body)' }}>
                    {r.name}
                  </span>
                  <span style={{ textAlign: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>
                    {r.d100}
                  </span>
                  <span style={{
                    textAlign: 'center', fontSize: 11, fontFamily: 'var(--font-mono)',
                    color: r.improved ? 'var(--gold)' : 'var(--ink-faded)',
                  }}>
                    {r.improved ? `+${r.d10}` : '—'}
                  </span>
                  <span style={{
                    textAlign: 'center', fontSize: 11, fontFamily: 'var(--font-mono)',
                    color: r.improved ? 'var(--gold)' : 'var(--ink-faded)',
                  }}>
                    {r.before} → {r.after}
                  </span>
                  <span style={{
                    textAlign: 'right', fontSize: 11, fontFamily: 'var(--font-ui)',
                    color: r.improved ? '#88c070' : 'var(--ink-subtle)', letterSpacing: 1,
                  }}>
                    {r.improved ? '提升' : '未变'}
                  </span>

                  {/* A3.5 浮动 +SAN chip：仅跨越 90% 的行显示 */}
                  <AnimatePresence>
                    {r.crossed90 && r.sanBonus !== undefined && (
                      <motion.span
                        initial={{ opacity: 0, x: 14, scale: 0.7 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1], delay: 0.18 }}
                        style={{
                          position: 'absolute',
                          right: -10, top: '50%', transform: 'translateY(-50%)',
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                          color: '#88c0c0',
                          background: 'rgba(136,192,192,0.12)',
                          border: '1px solid #88c0c0',
                          letterSpacing: 1,
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                        }}
                        title={`跨越 90%！获得 +${r.sanBonus} SAN`}
                      >
                        +{r.sanBonus} SAN
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            <div style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)',
              letterSpacing: 1, marginBottom: 12,
            }}>
              本次发展：{totalImproved} 项提升 · 跨越 90% 获得 {totalSanBonus} 点理智
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            style={{ ...btnStyle, background: 'transparent' }}
            onClick={onClose}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
          >
            取消
          </button>
          <button
            type="button"
            style={btnStyle}
            onClick={onSubmit}
            disabled={submitted}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.22)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.10)'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
          >
            提交结算
          </button>
        </div>
      </motion.div>
    </div>
  );
}
