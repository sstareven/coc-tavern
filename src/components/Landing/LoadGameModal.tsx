import { useState } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import { restoreSessionGameState, clearAllGameState, cleanupOrphanGameState } from '../../stores/sessionLifecycle';
import type { ChatSession } from '../../types';

interface Props { onLoad: () => void; onClose: () => void }

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LoadGameModal({ onLoad, onClose }: Props) {
  const sessions = useChatStore((s) => s.sessions);
  const setActive = useChatStore((s) => s.setActive);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 800,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480, maxWidth: '92vw', maxHeight: '80vh',
          background: 'linear-gradient(180deg, rgba(26,20,14,0.98) 0%, rgba(18,14,10,0.98) 100%)',
          border: '1px solid rgba(196,168,85,0.2)',
          borderRadius: 6, boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid rgba(196,168,85,0.15)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>读取存档</h3>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid transparent', borderRadius: 3, background: 'transparent',
              color: 'var(--ink-subtle)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-ui)',
              transition: 'var(--transition-smooth)', transform: 'scale(1)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.transform = 'scale(1.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
          >✕</button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)' }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-subtle)', fontSize: 13, fontFamily: 'var(--font-ui)', letterSpacing: 2 }}>
              暂无存档，请开始新游戏
            </div>
          ) : (
            sorted.map((s, i) => <SessionRow key={s.id} session={s} isLatest={i === 0} onSelect={() => { cleanupOrphanGameState(); setActive(s.id); restoreSessionGameState(s.id); onLoad(); }} onDelete={() => { deleteSession(s.id); clearAllGameState(); }} />)
          )}
        </div>
      </div>
    </div>
  );
}

function SessionRow({ session: s, isLatest, onSelect, onDelete }: {
  session: ChatSession; isLatest: boolean; onSelect: () => void; onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', cursor: 'pointer',
        borderBottom: '1px solid rgba(196,168,85,0.04)',
        background: isLatest ? 'rgba(196,168,85,0.06)' : 'transparent',
        transition: 'var(--transition-smooth)', transform: 'translateX(0)',
      }}
      onMouseEnter={(e) => { if (!isLatest) e.currentTarget.style.background = 'rgba(196,168,85,0.04)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isLatest ? 'rgba(196,168,85,0.06)' : 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; setConfirmDelete(false); }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 14, fontFamily: 'var(--font-ui)', fontWeight: 600, letterSpacing: 1,
            color: isLatest ? 'var(--gold)' : 'var(--text-light)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{s.name}</span>
          {isLatest && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--gold)',
              background: 'rgba(196,168,85,0.12)', padding: '1px 6px', borderRadius: 2,
              letterSpacing: 1, flexShrink: 0,
            }}>最新</span>
          )}
        </div>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)', marginTop: 4 }}>
          {fmtDate(s.updatedAt)} · {s.messages.length} 条消息
        </div>
      </div>
      {confirmDelete ? (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onDelete}
            style={{
              padding: '3px 10px', border: '1px solid var(--blood)', borderRadius: 3,
              background: 'rgba(255,82,82,0.12)', color: 'var(--blood)',
              fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
              transition: 'var(--transition-smooth)',
            }}
          >确认</button>
          <button
            onClick={() => setConfirmDelete(false)}
            style={{
              padding: '3px 10px', border: '1px solid var(--brass)', borderRadius: 3,
              background: 'transparent', color: 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
              transition: 'var(--transition-smooth)',
            }}
          >取消</button>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
          style={{
            background: 'none', border: '1px solid transparent', borderRadius: 3,
            color: 'var(--ink-faded)', fontSize: 14, cursor: 'pointer', padding: '4px 8px',
            fontFamily: 'var(--font-ui)', flexShrink: 0, marginLeft: 12,
            transition: 'var(--transition-smooth)', transform: 'scale(1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--blood)'; e.currentTarget.style.borderColor = 'rgba(255,82,82,0.2)'; e.currentTarget.style.transform = 'scale(1.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-faded)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
          title="删除存档"
        >✕</button>
      )}
    </div>
  );
}
