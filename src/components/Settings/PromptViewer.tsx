import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { AssembledMessage } from '../../sillytavern/prompt-assembler';

interface Props {
  visible: boolean;
  messages: AssembledMessage[];
  onClose: () => void;
  onSend: (editedMessages: AssembledMessage[]) => void;
}

function estimateTokens(text: string): number {
  // Simple estimation: ~1.5 chars per token for Chinese, ~4 chars for English
  let tokens = 0;
  for (const char of text) {
    if (/[一-鿿]/.test(char)) {
      tokens += 1 / 1.5; // Chinese characters ~1.5 chars per token
    } else {
      tokens += 1 / 4; // Latin chars ~4 per token
    }
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

export function PromptViewer({ visible, messages, onClose, onSend }: Props) {
  const [editable, setEditable] = useState<AssembledMessage[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (visible) {
      // Deep clone so edits don't affect original
      setEditable(messages.map((m) => ({ ...m })));
      setEditingIndex(null);
    }
  }, [visible, messages]);

  const totalTokens = useMemo(() => {
    return editable.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  }, [editable]);

  if (!visible) return null;

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditText(editable[index].content);
  };

  const saveEdit = () => {
    if (editingIndex !== null) {
      setEditable((prev) =>
        prev.map((m, i) => (i === editingIndex ? { ...m, content: editText } : m)),
      );
    }
    setEditingIndex(null);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
  };

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
        className="panel prompt-viewer-panel"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--parchment)',
          color: 'var(--ink)',
          borderRadius: 12,
          padding: 24,
          width: 780,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-ui)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16, flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, color: 'var(--leather)', fontFamily: 'var(--font-display)' }}>
            提示词查看器
          </h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{
              fontSize: 12, color: 'var(--ink-subtle)',
              fontFamily: 'var(--font-mono)',
            }}>
              ~{totalTokens} tokens · {editable.length} 条消息
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', color: 'var(--ink-faded)',
                cursor: 'pointer', fontSize: 20,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages List */}
        <div style={{
          flex: 1, overflowY: 'auto', paddingRight: 4,
          marginBottom: 16,
        }}>
          {editable.map((msg, index) => {
            const isEditing = editingIndex === index;
            const roleColor = ROLE_COLORS[msg.role] ?? 'var(--ink-faded)';
            const roleLabel = ROLE_LABELS[msg.role] ?? msg.role;
            const msgTokens = estimateTokens(msg.content);

            return (
              <div key={index} style={{
                marginBottom: 12, borderRadius: 8, overflow: 'hidden',
                border: isEditing
                  ? `2px solid ${roleColor}`
                  : '1px solid var(--brass)',
              }}>
                {/* Message Header */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 12px',
                  background: roleColor,
                  opacity: 0.85,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontWeight: 'bold', fontSize: 11, color: '#fff',
                      fontFamily: 'var(--font-ui)',
                    }}>
                      {roleLabel}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                      ~{msgTokens} tokens
                    </span>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(index)}
                      style={{
                        background: 'rgba(255,255,255,0.15)',
                        border: 'none', color: '#fff', borderRadius: 4,
                        padding: '2px 10px', cursor: 'pointer', fontSize: 11,
                      }}
                    >
                      编辑
                    </button>
                  )}
                </div>

                {/* Message Content */}
                {isEditing ? (
                  <div style={{ padding: 8 }}>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={Math.max(3, Math.min(15, editText.split('\n').length + 1))}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 4,
                        border: `1px solid ${roleColor}`,
                        fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.6,
                        background: 'var(--parchment-deep)', color: 'var(--ink)',
                        resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button onClick={cancelEdit} style={{
                        background: 'transparent', border: '1px solid var(--ink-faded)',
                        color: 'var(--ink-faded)', borderRadius: 4,
                        padding: '3px 14px', cursor: 'pointer', fontSize: 12,
                      }}>
                        取消
                      </button>
                      <button onClick={saveEdit} style={{
                        background: roleColor, border: 'none', color: '#fff',
                        borderRadius: 4, padding: '3px 14px', cursor: 'pointer', fontSize: 12,
                      }}>
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '10px 14px', fontSize: 13, lineHeight: 1.7,
                    fontFamily: 'var(--font-body)', color: 'var(--ink)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    maxHeight: 200, overflowY: 'auto',
                    background: 'var(--parchment-deep)',
                  }}>
                    {msg.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: '1px solid var(--brass)', paddingTop: 14, flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, color: 'var(--ink-subtle)' }}>
            可在发送前编辑每条消息的内容
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent', color: 'var(--ink-faded)',
                border: '1px solid var(--ink-faded)', borderRadius: 6,
                padding: '8px 24px', cursor: 'pointer', fontSize: 13,
              }}
            >
              取消发送
            </button>
            <button
              onClick={() => onSend(editable)}
              style={{
                background: 'var(--gold)', color: 'var(--abyss)', border: 'none',
                borderRadius: 6, padding: '8px 24px', cursor: 'pointer',
                fontSize: 13, fontWeight: 'bold',
              }}
            >
              确认发送
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
