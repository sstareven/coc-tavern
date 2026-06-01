import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useOnlineStore } from '../../stores/useOnlineStore';
import { RoomApiService, type RoomInfo } from '../../online/online-client';
import { buildCombinedProposalText } from '../../stores/useOnlineStore';

interface Props {
  onClose: () => void;
}

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

const input: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)', border: '1px solid var(--brass)', borderRadius: 4,
  color: 'var(--text-light)', padding: '7px 10px', fontFamily: 'var(--font-ui)', fontSize: 13, outline: 'none', flex: 1, minWidth: 0,
};
const btn: React.CSSProperties = {
  background: 'rgba(196,168,85,0.12)', border: '1px solid var(--gold)', borderRadius: 4,
  color: 'var(--gold)', padding: '7px 14px', fontFamily: 'var(--font-ui)', fontSize: 13, cursor: 'pointer',
  transition: `transform .16s ${EASE}, background .16s ${EASE}, filter .16s ${EASE}`,
};
const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--gold)', letterSpacing: 2, margin: '14px 0 8px',
};

/** 给按钮加 hover 增亮放大 / active 按压反馈（遵循项目动效规范）。 */
const hoverProps = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.filter = 'brightness(1.18)'; e.currentTarget.style.transform = 'scale(1.04)'; },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; },
  onMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(0.96)'; },
  onMouseUp: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(1.04)'; },
};

export function MultiplayerPanel({ onClose }: Props) {
  const s = useOnlineStore();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [roomName, setRoomName] = useState('');
  const [roomPwd, setRoomPwd] = useState('');
  const [roomMax, setRoomMax] = useState(8);
  const [joinPwd, setJoinPwd] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [proposal, setProposal] = useState('');

  const refreshRooms = async () => {
    setLoadingRooms(true); setErr('');
    try { setRooms(await RoomApiService.fetchRooms(s.serverUrl)); }
    catch (e) { setErr(`获取房间列表失败：${e instanceof Error ? e.message : e}`); }
    finally { setLoadingRooms(false); }
  };

  useEffect(() => { if (!s.isConnected) void refreshRooms(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const guardName = (): boolean => {
    if (!(s.userName || '').trim()) { setErr('请先填写用户名'); return false; }
    return true;
  };

  const doCreate = async () => {
    if (!guardName() || !roomName.trim()) { if (!roomName.trim()) setErr('请填写房间名'); return; }
    setBusy(true); setErr('');
    try { await s.createRoom(roomName.trim(), roomPwd, roomMax); }
    catch (e) { setErr(`创建失败：${e instanceof Error ? e.message : e}`); }
    finally { setBusy(false); }
  };

  const doJoin = async (roomId: string) => {
    if (!guardName()) return;
    setBusy(true); setErr('');
    try { await s.joinRoom(roomId, joinPwd); }
    catch (e) { setErr(`加入失败：${e instanceof Error ? e.message : e}`); }
    finally { setBusy(false); }
  };

  const poolList = Object.values(s.pendingInputs);
  const players = s.users;

  const hostSendRound = () => {
    const text = buildCombinedProposalText();
    if (!text.trim()) { setErr('输入池为空，无可发送内容'); return; }
    document.dispatchEvent(new CustomEvent('mp-host-send', { detail: { text } }));
    s.clearPool();
  };

  return (
    <div className="panel-overlay" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 920, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)', border: '1px solid var(--gold)', borderRadius: 8, padding: '24px 28px', width: 540, maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 80px rgba(0,0,0,0.6)', fontFamily: 'var(--font-ui)', overflow: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>🌐 联机（房主镜像）</h3>
          <button onClick={onClose} style={{ ...btn, padding: '4px 10px', fontSize: 16 }} {...hoverProps}>✕</button>
        </div>

        {/* 状态行 */}
        <div style={{ fontSize: 12, color: s.isConnected ? 'var(--success)' : 'var(--ink-subtle)', marginBottom: 8 }}>
          {s.isConnected ? `● 已连接 · ${s.isHost ? '房主' : '客户端'} · 房间 ${s.currentRoomId}` : `○ ${s.statusText}`}
        </div>
        {err && <div style={{ fontSize: 12, color: 'var(--blood)', marginBottom: 8 }}>{err}</div>}

        {/* 身份/服务器 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <input style={input} placeholder="用户名" value={s.userName} onChange={(e) => s.setUserName(e.target.value)} disabled={s.isConnected} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <input style={input} placeholder="中继服务器地址" value={s.serverUrl} onChange={(e) => s.setServerUrl(e.target.value)} disabled={s.isConnected} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-subtle)', marginBottom: 4 }}>
          提示：复用公共中继时，故事正文与状态会经过第三方服务器转发，请勿用于敏感内容。
        </div>

        {!s.isConnected ? (
          <>
            {/* 创建房间 */}
            <div style={sectionTitle}>创建房间</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input style={input} placeholder="房间名" value={roomName} maxLength={15} onChange={(e) => setRoomName(e.target.value)} />
              <input style={{ ...input, flex: '0 0 110px' }} placeholder="密码(可空)" value={roomPwd} onChange={(e) => setRoomPwd(e.target.value)} />
              <input style={{ ...input, flex: '0 0 64px' }} type="number" min={2} max={20} value={roomMax} onChange={(e) => setRoomMax(parseInt(e.target.value) || 8)} />
            </div>
            <button style={{ ...btn, width: '100%' }} disabled={busy} onClick={doCreate} {...hoverProps}>{busy ? '处理中…' : '创建并加入（成为房主）'}</button>

            {/* 房间列表 */}
            <div style={{ ...sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>在线房间</span>
              <button style={{ ...btn, padding: '3px 10px', fontSize: 11 }} disabled={loadingRooms} onClick={refreshRooms} {...hoverProps}>{loadingRooms ? '…' : '刷新'}</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
              {rooms.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-subtle)', textAlign: 'center', padding: 16 }}>{loadingRooms ? '加载中…' : '暂无房间'}</div>}
              {rooms.map((r) => (
                <div key={r.id} onClick={() => setSelectedRoom(r.id)}
                  style={{ border: `1px solid ${selectedRoom === r.id ? 'var(--gold)' : 'var(--brass)'}`, borderRadius: 4, padding: '8px 10px', cursor: 'pointer', background: selectedRoom === r.id ? 'rgba(196,168,85,0.1)' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-light)' }}>
                    <span>{r.name} {r.hasPassword ? '🔒' : ''}</span>
                    <span style={{ color: 'var(--ink-subtle)', fontSize: 12 }}>👥 {r.currentUsers ?? 0}/{r.maxUsers ?? '-'}</span>
                  </div>
                  {selectedRoom === r.id && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                      <input style={{ ...input, flex: 1 }} placeholder="密码(可空)" value={joinPwd} onChange={(e) => setJoinPwd(e.target.value)} />
                      <button style={{ ...btn, flex: '0 0 auto' }} disabled={busy} onClick={() => doJoin(r.id)} {...hoverProps}>加入</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* 成员 */}
            <div style={sectionTitle}>成员（{players.length}）</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {players.map((u) => (
                <span key={u.id} style={{ border: '1px solid var(--brass)', borderRadius: 999, padding: '3px 10px', fontSize: 12, color: u.isHost ? 'var(--gold)' : 'var(--text-light)' }}>
                  {u.isHost ? '👑 ' : ''}{u.name}
                </span>
              ))}
            </div>

            {/* 输入池 */}
            <div style={sectionTitle}>本轮输入池（{poolList.length}）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto', border: '1px solid var(--brass)', borderRadius: 4, padding: 8 }}>
              {poolList.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-subtle)', textAlign: 'center' }}>暂无提议</div>}
              {poolList.map((p) => (
                <div key={p.userId} style={{ fontSize: 12, color: 'var(--text-light)' }}>
                  <span style={{ color: 'var(--gold)' }}>{p.userName}:</span> {p.content.slice(0, 80)}{p.content.length > 80 ? '…' : ''}
                </div>
              ))}
            </div>

            {/* 提议输入（房主与客户端都可提交；房主也可直接在书本里玩） */}
            <div style={sectionTitle}>提交本轮提议</div>
            <textarea style={{ ...input, minHeight: 60, resize: 'vertical', width: '100%' }} placeholder="输入你这一轮想做的行动…" value={proposal} onChange={(e) => setProposal(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button style={{ ...btn, flex: 1 }} disabled={!proposal.trim()} onClick={() => { s.submitProposal(proposal); setProposal(''); }} {...hoverProps}>提交提议</button>
              <button style={{ ...btn, flex: '0 0 auto' }} onClick={() => s.revokeProposal()} {...hoverProps}>撤回</button>
            </div>

            {/* 房主控制 */}
            {s.isHost && (
              <>
                <div style={sectionTitle}>房主控制</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...btn, flex: 1, background: 'rgba(196,168,85,0.2)' }} disabled={poolList.length === 0} onClick={hostSendRound} {...hoverProps}>发送本轮（合并生成）</button>
                  <button style={{ ...btn, flex: '0 0 auto' }} disabled={poolList.length === 0} onClick={() => s.clearPool()} {...hoverProps}>重置池</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-subtle)', marginTop: 4 }}>「发送本轮」会把输入池合并为一段行动、用你本地的 AI 生成新页，并广播给全员镜像。</div>
              </>
            )}

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button style={{ ...btn, color: 'var(--blood)', borderColor: 'var(--blood)' }} onClick={() => s.disconnect()} {...hoverProps}>断开连接</button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
