import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { estimateTokens, computeBreakdown } from '../../sillytavern/token-counter';

const MODEL_LIMITS: Record<string, number> = {
  'deepseek-v4-pro': 131072,
  'deepseek-chat': 65536,
  'gpt-4o': 128000,
  'gpt-4-turbo': 128000,
  'claude-3-opus': 200000,
  'claude-sonnet-4-6': 200000,
  default: 65536,
};

interface Props {
  visible: boolean;
  onClose: () => void;
  contextBreakdown?: {
    systemPrompt: string;
    loreEntryContents: string[];
    formatInstruction: string;
    chatHistoryMessages: string[];
    userMessage: string;
  };
  model?: string;
}

export function TokenCounter({ visible, onClose, contextBreakdown, model }: Props) {
  const [manualText, setManualText] = useState('');
  const [manualTokens, setManualTokens] = useState(0);

  const limit = MODEL_LIMITS[model ?? ''] ?? MODEL_LIMITS.default;

  const breakdown = contextBreakdown
    ? computeBreakdown(
        contextBreakdown.systemPrompt,
        contextBreakdown.loreEntryContents,
        contextBreakdown.formatInstruction,
        contextBreakdown.chatHistoryMessages,
        contextBreakdown.userMessage,
      )
    : null;

  const handleManualCount = useCallback(() => {
    setManualTokens(estimateTokens(manualText));
  }, [manualText]);

  if (!visible) return null;

  const barColor = (used: number) => {
    const ratio = used / limit;
    if (ratio > 0.9) return 'var(--blood)';
    if (ratio > 0.7) return 'var(--gold)';
    return 'var(--success)';
  };

  return (
    <div className="panel-overlay" onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 920,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
          border: '1px solid var(--gold)', borderRadius: 8,
          padding: '24px 28px', minWidth: 480, maxWidth: 600, width: '90%',
          boxShadow: '0 0 80px rgba(0,0,0,0.6)',
          fontFamily: 'var(--font-ui)',
        }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12,
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--system-ratio, 1))', color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>
            Token 计数器
          </h3>
          <button onClick={onClose} style={closeBtn}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >✕</button>
        </div>

        {/* Context Breakdown */}
        {breakdown && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>
              当前上下文用量
            </div>

            {/* Total bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 'calc(11px * var(--system-ratio, 1))' }}>
                <span style={{ color: 'var(--text-light)' }}>
                  总计 <strong style={{ color: barColor(breakdown.total), fontFamily: 'var(--font-mono)', fontSize: 'calc(15px * var(--system-ratio, 1))' }}>{breakdown.total}</strong>
                </span>
                <span style={{ color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', fontSize: 'calc(10px * var(--system-ratio, 1))' }}>
                  / {limit.toLocaleString()} ({(breakdown.total / limit * 100).toFixed(1)}%)
                </span>
              </div>
              <div style={{
                height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.3)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${Math.min(100, breakdown.total / limit * 100)}%`,
                  background: barColor(breakdown.total),
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>

            {/* Breakdown rows */}
            {[
              { label: '系统提示', value: breakdown.systemPrompt },
              { label: '世界书条目', value: breakdown.loreEntries },
              { label: '格式指令', value: breakdown.formatInstruction },
              { label: '对话历史', value: breakdown.chatHistory },
              { label: '用户输入', value: breakdown.userMessage },
            ].map((row) => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.02)',
                fontSize: 'calc(11px * var(--system-ratio, 1))',
              }}>
                <span style={{ color: 'var(--ink-subtle)' }}>{row.label}</span>
                <span style={{ color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
                  {row.value.toLocaleString()} tokens
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Manual count */}
        <div>
          <div style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>
            手动计数
          </div>
          <textarea
            name="token-counter-manual"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="粘贴文本以计算 token 数量..."
            rows={5}
            style={{
              width: '100%', padding: '10px', borderRadius: 4,
              border: '1px solid var(--brass)', background: 'rgba(0,0,0,0.3)',
              color: 'var(--text-light)', fontFamily: 'var(--font-body)',
              fontSize: 'calc(12px * var(--system-ratio, 1))', lineHeight: 1.6, outline: 'none', resize: 'vertical',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
              {manualTokens > 0 ? <><strong style={{ color: 'var(--gold)', fontSize: 'calc(15px * var(--system-ratio, 1))' }}>{manualTokens}</strong> tokens</> : ''}
            </span>
            <button onClick={handleManualCount}
              style={{
                padding: '5px 16px', border: '1px solid var(--brass)', borderRadius: 3,
                background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)',
                fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio, 1))', cursor: 'pointer',
                transition: 'var(--transition-smooth)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.35)'; e.currentTarget.style.filter = 'brightness(1.12)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              计数
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const closeBtn: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: 3, background: 'transparent',
  color: 'var(--ink-subtle)', fontSize: 'calc(16px * var(--system-ratio, 1))', cursor: 'pointer', fontFamily: 'var(--font-ui)',
  transition: 'var(--transition-smooth)',
};
