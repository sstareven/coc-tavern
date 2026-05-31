import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { usePromptViewerStore } from '../../stores/usePromptViewerStore';
import { useIsMobile } from '../../hooks/useIsMobile';

function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    tokens += /[一-鿿]/.test(char) ? 1 / 1.5 : 1 / 4;
  }
  return Math.round(tokens);
}

const ROLE_COLORS: Record<string, string> = {
  system: '#3a6b5a',
  user: '#8b6b3a',
  assistant: '#4a3a8b',
};

const ROLE_LABELS: Record<string, string> = {
  system: '系统',
  user: '玩家',
  assistant: 'AI',
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PromptViewer({ visible, onClose }: Props) {
  const isMobile = useIsMobile();
  const { messages, model, presetName, updatedAt } = usePromptViewerStore();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const totalTokens = useMemo(() => {
    return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  }, [messages]);

  const toggleExpand = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(messages.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  const handleRefresh = () => {
    document.dispatchEvent(new CustomEvent('trigger-mock-generate'));
  };

  if (!visible) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 920,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
          border: '1px solid var(--gold)', borderRadius: 8,
          padding: 24, width: 780, maxWidth: '100vw', maxHeight: '90vh',
          ...(isMobile ? { width: '100vw', height: '100dvh', maxHeight: '100dvh', borderRadius: 0, border: 'none', padding: 16 } : {}),
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font-ui)',
          boxShadow: '0 0 80px rgba(0,0,0,0.6)',
        }}
      >
        <style>{`
          .pv-scroll::-webkit-scrollbar{width:5px}
          .pv-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.15);border-radius:3px}
          .pv-scroll::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}
          .pv-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}
        `}</style>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 12, flexShrink: 0, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12,
        }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: 3 }}>
              提示词查看器
            </h3>
            <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 10, color: 'var(--ink-subtle)' }}>
              <span>模型: {model || '—'}</span>
              <span>预设: {presetName || '—'}</span>
              {updatedAt > 0 && (
                <span>更新于: {new Date(updatedAt).toLocaleTimeString()}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, color: 'var(--ink-subtle)',
              fontFamily: 'var(--font-mono)',
            }}>
              ~{totalTokens}t · {messages.length}条
            </span>
            <button onClick={expandAll} style={headerBtn}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            >展开全部</button>
            <button onClick={collapseAll} style={headerBtn}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            >收起全部</button>
            <button onClick={handleRefresh} title="刷新" style={headerBtn}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            >↻ 刷新</button>
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none', color: 'var(--ink-subtle)',
              cursor: 'pointer', fontSize: 18, marginLeft: 4,
            }}>✕</button>
          </div>
        </div>

        {/* Messages List */}
        <div className="pv-scroll" style={{
          flex: 1, overflowY: 'auto', paddingRight: 4,
          scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)',
        }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-faded)', fontSize: 12 }}>
              暂无提示词数据。请先输入文字并发送，或点击刷新按钮。
            </div>
          ) : (
            messages.map((msg, index) => {
              const roleColor = ROLE_COLORS[msg.role] ?? 'var(--ink-faded)';
              const roleLabel = ROLE_LABELS[msg.role] ?? msg.role;
              const msgTokens = estimateTokens(msg.content);
              const isExpanded = expanded.has(index);
              const hasContent = msg.content.length > 0;

              return (
                <div key={index} style={{
                  marginBottom: 6, borderRadius: 4, overflow: 'hidden',
                  border: '1px solid rgba(196,168,85,0.10)',
                }}>
                  {/* Message Header */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '5px 10px', cursor: 'pointer',
                    background: roleColor + '18',
                    borderLeft: `3px solid ${roleColor}`,
                  }} onClick={() => toggleExpand(index)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontWeight: 'bold', fontSize: 10, color: roleColor,
                        fontFamily: 'var(--font-ui)', letterSpacing: 1,
                      }}>
                        {roleLabel}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--ink-subtle)' }}>
                        ~{msgTokens}t
                      </span>
                    </div>
                    <span style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>
                      {isExpanded ? '▲ 收起' : '▼ 展开'}
                    </span>
                  </div>

                  {/* Message Content */}
                  {isExpanded && (
                    <div style={{
                      padding: '8px 12px', fontSize: 11, lineHeight: 1.6,
                      fontFamily: 'var(--font-mono)', color: 'var(--text-light)',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      background: 'rgba(0,0,0,0.15)',
                      maxHeight: 260, overflowY: 'auto',
                      scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)',
                    }}>
                      {hasContent ? msg.content : '(空)'}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--brass)', borderRadius: 3,
  color: 'var(--ink-subtle)', cursor: 'pointer', fontSize: 10,
  padding: '3px 10px', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
};
