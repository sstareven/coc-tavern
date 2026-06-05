import { useState } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import { switchConversation, deleteConversation, clearAllGameState, startNewConversation } from '../../stores/sessionLifecycle';
import { closeBtnStyle } from '../../styles/panelStyles';

interface Props {
  onClose: () => void;
}

export function ChatlistPanel({ onClose }: Props) {
  const sessions = useChatStore((s) => s.sessions);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const activeId = useChatStore((s) => s.activeId);

  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim() || `对话 ${sessions.length + 1}`;
    // 经权威入口创建：先清空所有按会话隔离的内存态再建会话，杜绝旧局状态泄漏进新会话。
    startNewConversation(name);
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
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--system-ratio, 1))', color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>
            对话管理 / SESSIONS
          </h3>
          <button onClick={onClose} style={closeBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >✕</button>
        </div>

        {/* Create new */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input name="chatlist-new-name" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="对话名称..."
            style={{
              flex: 1, padding: '8px 12px', border: '1px solid var(--brass)', borderRadius: 3,
              background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
              fontFamily: 'var(--font-ui)', fontSize: 'calc(12px * var(--system-ratio, 1))', outline: 'none', caretColor: 'var(--gold)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
          <button onClick={handleCreate} style={{
            padding: '8px 16px', border: '1px solid var(--gold)', borderRadius: 3,
            background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
            fontFamily: 'var(--font-ui)', fontSize: 'calc(12px * var(--system-ratio, 1))', letterSpacing: 2, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>
            + 新建
          </button>
        </div>

        {/* Session list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'var(--ink-faded) transparent' }}>
          {sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-subtle)', fontSize: 'calc(13px * var(--system-ratio, 1))', letterSpacing: 2 }}>
              暂无对话记录
            </div>
          ) : (
            sessions.map((sess) => (
              <SessionItem key={sess.id} sess={sess} isActive={activeId === sess.id}
                onSelect={() => { void switchConversation(sess.id); onClose(); }}
                onDelete={() => { const wasActive = activeId === sess.id; deleteSession(sess.id); void deleteConversation(sess.id); if (wasActive) clearAllGameState(); }} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SessionItem({ sess, isActive, onSelect, onDelete }: {
  sess: { id: string; name: string; messages: unknown[]; pages: unknown[]; pageCount?: number; updatedAt: number };
  isActive: boolean; onSelect: () => void; onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', border: isActive ? '1px solid var(--gold)' : '1px solid rgba(196,168,85,0.1)',
        borderRadius: 4, cursor: 'pointer',
        background: isActive ? 'rgba(196,168,85,0.08)' : 'rgba(0,0,0,0.12)',
        transition: 'var(--transition-smooth)', transform: 'translateX(0)',
      }}
      onClick={onSelect}
      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(196,168,85,0.05)'; e.currentTarget.style.borderColor = 'var(--brass)'; } e.currentTarget.style.transform = 'translateX(4px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'rgba(196,168,85,0.08)' : 'rgba(0,0,0,0.12)'; e.currentTarget.style.borderColor = isActive ? 'var(--gold)' : 'rgba(196,168,85,0.1)'; e.currentTarget.style.transform = 'translateX(0)'; setConfirmDelete(false); }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'calc(13px * var(--system-ratio, 1))', color: isActive ? 'var(--gold)' : 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
            {sess.name}
          </span>
          {isActive && (
            <span style={{ fontSize: 'calc(8px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--gold)', background: 'rgba(196,168,85,0.12)', padding: '1px 6px', borderRadius: 2, letterSpacing: 1 }}>当前</span>
          )}
        </div>
        <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>
          {sess.pageCount ?? sess.pages.length} 页 · {new Date(sess.updatedAt).toLocaleDateString('zh-CN')}
        </span>
      </div>
      {!isActive && (confirmDelete ? (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={onDelete} style={{
            padding: '3px 10px', border: '1px solid var(--blood)', borderRadius: 3,
            background: 'rgba(255,82,82,0.12)', color: 'var(--blood)',
            fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', cursor: 'pointer',
            transition: 'var(--transition-smooth)',
          }}>确认</button>
          <button onClick={() => setConfirmDelete(false)} style={{
            padding: '3px 10px', border: '1px solid var(--brass)', borderRadius: 3,
            background: 'transparent', color: 'var(--ink-subtle)',
            fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', cursor: 'pointer',
            transition: 'var(--transition-smooth)',
          }}>取消</button>
        </div>
      ) : (
        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }} style={{
          padding: '4px 10px', border: '1px solid rgba(139,58,58,0.2)', borderRadius: 3,
          background: 'transparent', color: 'var(--blood)', fontFamily: 'var(--font-ui)',
          fontSize: 'calc(10px * var(--system-ratio, 1))', letterSpacing: 1, cursor: 'pointer',
          transition: 'var(--transition-smooth)', transform: 'scale(1)',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.borderColor = 'var(--blood)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(139,58,58,0.2)'; }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
        >删除</button>
      ))}
    </div>
  );
}

