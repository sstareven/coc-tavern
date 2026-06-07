import { useEffect, useState } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { switchConversation, deleteConversation, clearAllGameState, cleanupOrphanGameState } from '../../stores/sessionLifecycle';
import { db } from '../../db/database';
import type { ChatSession } from '../../types';

interface Props { onLoad: () => void; onClose: () => void }

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 剧本 id → 显示名（'__free'/找不到/老存档都各有兜底）。 */
function resolveScenarioName(scenarioId: string | undefined, nameById: Record<string, string>): string {
  if (!scenarioId || scenarioId === '__free') return '自由模式';
  const name = nameById[scenarioId];
  if (name) return name;
  // 剧本被删/老存档指空 id — 显示截短 id 而不是空白，保留可调试线索
  return scenarioId.length > 16 ? `${scenarioId.slice(0, 14)}…` : scenarioId;
}

export function LoadGameModal({ onLoad, onClose }: Props) {
  const sessions = useChatStore((s) => s.sessions);
  const deleteSession = useChatStore((s) => s.deleteSession);
  // 订阅 builtins+userScenarios，玩家在另一面板改完剧本名后切回 modal 立即看到新名。
  const builtins = useScenarioStore((s) => s.builtins);
  const userScenarios = useScenarioStore((s) => s.userScenarios);
  const scenarioNameById: Record<string, string> = {};
  for (const d of builtins) scenarioNameById[d.id] = d.meta.name;
  for (const d of userScenarios) scenarioNameById[d.id] = d.meta.name;

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  // 调查员姓名从 charsheets 关系表批量异步拉一次（session blob 只存会话名，不含 sheet）。
  // session.name 由 CharCreator 创建时塞的 sheet.identity.name，但玩家中途改名后不会回写，
  // 这里直接读 charsheets 拿当前真实姓名，"自适应识别" = 不依赖创角时的快照。
  const [namesById, setNamesById] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ids = sessions.map((s) => s.id);
      if (ids.length === 0) {
        if (!cancelled) setNamesById({});
        return;
      }
      const rows = await db.charsheets.bulkGet(ids);
      if (cancelled) return;
      const next: Record<string, string> = {};
      rows.forEach((row, i) => {
        const n = row?.sheet?.identity?.name?.trim();
        if (n) next[ids[i]] = n;
      });
      setNamesById(next);
    })();
    return () => { cancelled = true; };
  }, [sessions]);

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
        className="scenario-editor"
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
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--system-ratio, 1))', color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>读取存档</h3>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid transparent', borderRadius: 3, background: 'transparent',
              color: 'var(--ink-subtle)', fontSize: 'calc(16px * var(--system-ratio, 1))', cursor: 'pointer', fontFamily: 'var(--font-ui)',
              transition: 'var(--transition-smooth)', transform: 'scale(1)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.transform = 'scale(1.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
          >✕</button>
        </div>

        {/* List — flex:1 + minHeight:0 让 overflow:auto 在 maxHeight 80vh 下确实滚动 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-subtle)', fontSize: 'calc(13px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', letterSpacing: 2 }}>
              暂无存档，请开始新游戏
            </div>
          ) : (
            sorted.map((s, i) => (
              <SessionRow
                key={s.id}
                session={s}
                isLatest={i === 0}
                scenarioName={resolveScenarioName(s.scenarioId, scenarioNameById)}
                investigatorName={namesById[s.id]}
                onSelect={() => { cleanupOrphanGameState(); void switchConversation(s.id); onLoad(); }}
                onDelete={() => {
                  const chat = useChatStore.getState();
                  const wasActive = chat.activeId === s.id;
                  const prevScenarioId = wasActive ? chat.sessions.find(c => c.id === s.id)?.scenarioId ?? undefined : undefined;
                  deleteSession(s.id);
                  void deleteConversation(s.id);
                  if (wasActive) clearAllGameState(prevScenarioId);
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SessionRow({ session: s, isLatest, scenarioName, investigatorName, onSelect, onDelete }: {
  session: ChatSession;
  isLatest: boolean;
  scenarioName: string;
  investigatorName?: string;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 第二行元信息段（按存在与否拼接），分隔符 ·；至少日期+页数总在，剧本/调查员可缺。
  const metaParts: string[] = [
    fmtDate(s.updatedAt),
    `${s.pageCount ?? s.pages.length} 页`,
    scenarioName,
  ];
  if (investigatorName) metaParts.push(investigatorName);

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
            fontSize: 'calc(14px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', fontWeight: 600, letterSpacing: 1,
            color: isLatest ? 'var(--gold)' : 'var(--text-light)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{investigatorName || s.name}</span>
          {isLatest && (
            <span style={{
              fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--gold)',
              background: 'rgba(196,168,85,0.12)', padding: '1px 6px', borderRadius: 2,
              letterSpacing: 1, flexShrink: 0,
            }}>最新</span>
          )}
        </div>
        <div style={{
          fontSize: 'calc(10px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)',
          marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {metaParts.join(' · ')}
        </div>
      </div>
      {confirmDelete ? (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onDelete}
            style={{
              padding: '3px 10px', border: '1px solid var(--blood)', borderRadius: 3,
              background: 'rgba(255,82,82,0.12)', color: 'var(--blood)',
              fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', cursor: 'pointer',
              transition: 'var(--transition-smooth)',
            }}
          >确认</button>
          <button
            onClick={() => setConfirmDelete(false)}
            style={{
              padding: '3px 10px', border: '1px solid var(--brass)', borderRadius: 3,
              background: 'transparent', color: 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', cursor: 'pointer',
              transition: 'var(--transition-smooth)',
            }}
          >取消</button>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
          style={{
            background: 'none', border: '1px solid transparent', borderRadius: 3,
            color: 'var(--ink-faded)', fontSize: 'calc(14px * var(--system-ratio, 1))', cursor: 'pointer', padding: '4px 8px',
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
