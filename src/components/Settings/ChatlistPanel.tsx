import { useState } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import { closeBtnStyle } from '../../styles/panelStyles';

interface Props {
  onClose: () => void;
}

export function ChatlistPanel({ onClose }: Props) {
  const sessions = useChatStore((s) => s.sessions);
  const createSession = useChatStore((s) => s.createSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const setActive = useChatStore((s) => s.setActive);
  const activeId = useChatStore((s) => s.activeId);

  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim() || `对话 ${sessions.length + 1}`;
    createSession(name);
    setNewName('');
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        border: '1px solid var(--gold)', borderRadius: 8,
        padding: '24px 28px', minWidth: 480, maxWidth: 600, width: '90%',
        boxShadow: '0 0 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12,
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>
            对话管理 / SESSIONS
          </h3>
          <button onClick={onClose} style={closeBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >✕</button>
        </div>

        {/* Create new */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="对话名称..."
            style={{
              flex: 1, padding: '8px 12px', border: '1px solid var(--brass)', borderRadius: 3,
              background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
              fontFamily: 'var(--font-ui)', fontSize: 12, outline: 'none', caretColor: 'var(--gold)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
          <button onClick={handleCreate} style={{
            padding: '8px 16px', border: '1px solid var(--gold)', borderRadius: 3,
            background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
            fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 2, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>
            + 新建
          </button>
        </div>

        {/* Session list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'var(--ink-faded) transparent' }}>
          {sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-subtle)', fontSize: 13, letterSpacing: 2 }}>
              暂无对话记录
            </div>
          ) : (
            sessions.map((sess) => {
              const isActive = activeId === sess.id;
              return (
              <div
                key={sess.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', border: isActive ? '1px solid var(--gold)' : '1px solid rgba(196,168,85,0.1)',
                  borderRadius: 4, cursor: 'pointer',
                  background: isActive ? 'rgba(196,168,85,0.08)' : 'rgba(0,0,0,0.12)',
                  transition: 'var(--transition-smooth)', transform: 'translateX(0)',
                }}
                onClick={() => { setActive(sess.id); onClose(); }}
                onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(196,168,85,0.05)'; e.currentTarget.style.borderColor = 'var(--brass)'; } e.currentTarget.style.transform = 'translateX(4px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'rgba(196,168,85,0.08)' : 'rgba(0,0,0,0.12)'; e.currentTarget.style.borderColor = isActive ? 'var(--gold)' : 'rgba(196,168,85,0.1)'; e.currentTarget.style.transform = 'translateX(0)'; }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: isActive ? 'var(--gold)' : 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
                      {sess.name}
                    </span>
                    {isActive && (
                      <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--gold)', background: 'rgba(196,168,85,0.12)', padding: '1px 6px', borderRadius: 2, letterSpacing: 1 }}>当前</span>
                    )}
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>
                    {sess.messages.length} 条消息 · {new Date(sess.updatedAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
                {!isActive && (
                <button onClick={(e) => { e.stopPropagation(); deleteSession(sess.id); }} style={{
                  padding: '4px 10px', border: '1px solid rgba(139,58,58,0.2)', borderRadius: 3,
                  background: 'transparent', color: 'var(--blood)', fontFamily: 'var(--font-ui)',
                  fontSize: 10, letterSpacing: 1, cursor: 'pointer',
                  transition: 'var(--transition-smooth)', transform: 'scale(1)',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.borderColor = 'var(--blood)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(139,58,58,0.2)'; }}
                  onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
                  onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
                >
                  删除
                </button>
                )}
              </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

