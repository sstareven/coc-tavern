import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useChaseStore } from '../../stores/useChaseStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useChatStore } from '../../stores/useChatStore';
import { saveConversation } from '../../stores/sessionLifecycle';
import { playerChaseAction } from '../../sillytavern/chase-controller';
import { getGap, SPRINT_CON_INTERVAL } from '../../sillytavern/chase-engine';
import { sfxClick, sfxClickPrimary } from '../../audio/sfx';
import { DiceRecordsExpander } from '../Combat/CombatPanel';
import { CombatDiceRoll, type DiceToss } from '../Combat/CombatDiceRoll';
import type { Chase } from '../../types';

const FAINT = 'rgba(var(--ink-faded-rgb),0.25)';
const FAINTER = 'rgba(var(--ink-faded-rgb),0.15)';

// ── Location chain visualization ─────────────────────────────

function LocationChain({ chase }: { chase: Chase }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const player = chase.participants.find((p) => p.controlledBy === 'player');

  // Auto-scroll to keep the player visible
  useEffect(() => {
    if (!scrollRef.current || !player) return;
    const el = scrollRef.current;
    const nodeW = 64; // approximate per-location width including gap
    const targetX = player.position * nodeW - el.clientWidth / 2 + nodeW / 2;
    el.scrollTo({ left: Math.max(0, targetX), behavior: 'smooth' });
  }, [player?.position, chase.locations.length]);

  // Build a set of positions occupied by each role
  const pursuerPositions = new Map<number, string[]>();
  const quarryPositions = new Map<number, string[]>();
  for (const p of chase.participants) {
    if (p.flags.caught || p.flags.escaped || p.flags.exhausted) continue;
    const map = p.role === 'pursuer' ? pursuerPositions : quarryPositions;
    if (!map.has(p.position)) map.set(p.position, []);
    map.get(p.position)!.push(p.name);
  }

  return (
    <div ref={scrollRef} className="rp-scroll" style={{
      display: 'flex', alignItems: 'center', gap: 0, padding: '8px 20px',
      overflowX: 'auto', overflowY: 'hidden', flexShrink: 0,
      scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)',
    }}>
      {chase.locations.map((loc, i) => {
        const pursuers = pursuerPositions.get(i);
        const quarries = quarryPositions.get(i);
        const isPlayerHere = player?.position === i;
        const hasHazard = !!loc.hazard;
        const hasBarrier = !!loc.barrier;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {/* Connector line between locations */}
            {i > 0 && (
              <div style={{
                width: 18, height: 2,
                background: `repeating-linear-gradient(to right, var(--brass) 0px, var(--brass) 4px, transparent 4px, transparent 8px)`,
                opacity: 0.5,
              }} />
            )}
            {/* Location node */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              position: 'relative', minWidth: 40,
            }}>
              {/* Pursuer markers above */}
              {pursuers && (
                <div style={{
                  fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--blood)',
                  fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', letterSpacing: 0.5,
                  maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis',
                }} title={pursuers.join(', ')}>
                  {pursuers.length === 1 ? pursuers[0] : `${pursuers.length} 人`}
                </div>
              )}
              {!pursuers && <div style={{ height: 'calc(9px * var(--system-ratio, 1))' }} />}

              {/* The dot / node */}
              <div style={{
                width: isPlayerHere ? 14 : 10,
                height: isPlayerHere ? 14 : 10,
                borderRadius: '50%',
                border: `2px solid ${isPlayerHere ? 'var(--gold)' : hasHazard ? 'var(--blood)' : hasBarrier ? 'var(--brass)' : FAINT}`,
                background: isPlayerHere ? 'rgba(196,168,85,0.35)' : hasHazard ? 'rgba(176,58,46,0.12)' : 'rgba(0,0,0,0.04)',
                transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                boxShadow: isPlayerHere ? '0 0 8px rgba(196,168,85,0.5)' : 'none',
              }} title={`${loc.name}${hasHazard ? ' (危险)' : ''}${hasBarrier ? ' (路障)' : ''}`} />

              {/* Quarry markers below */}
              {quarries && (
                <div style={{
                  fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-subtle)',
                  fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', letterSpacing: 0.5,
                  maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis',
                  fontStyle: 'italic',
                }} title={quarries.join(', ')}>
                  {quarries.length === 1 ? quarries[0] : `${quarries.length} 人`}
                </div>
              )}
              {!quarries && <div style={{ height: 'calc(9px * var(--system-ratio, 1))' }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Typewriter line (simplified from CombatPanel) ────────────

function TypewriterLine({ text, narrative, dim, onDone }: { text: string; narrative: boolean; dim?: boolean; onDone?: () => void }) {
  const [n, setN] = useState(0);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });
  useEffect(() => {
    let i = 0;
    setN(0);
    const id = setInterval(() => {
      i += 2; setN(i);
      if (i >= text.length) { clearInterval(id); doneRef.current?.(); }
    }, 20);
    return () => clearInterval(id);
  }, [text]);
  return (
    <div style={{
      color: dim ? 'var(--ink-faded)' : narrative ? 'var(--ink-subtle)' : 'var(--ink)',
      fontStyle: narrative ? 'italic' : 'normal',
      fontSize: dim ? 'calc(11.5px * var(--system-ratio, 1))' : undefined, opacity: dim ? 0.78 : 1,
      marginBottom: dim ? 1 : 2,
    }}>
      {text.slice(0, n)}
    </div>
  );
}

// ── Action button (mirrors CombatPanel's ActionBtn) ──────────

function ActionBtn({ label, primary, disabled, title, onClick }: { label: string; primary?: boolean; disabled?: boolean; title?: string; onClick: () => void }) {
  const color = disabled ? 'var(--ink-faded)' : primary ? 'var(--gold)' : 'var(--ink)';
  const border = disabled ? 'rgba(var(--ink-faded-rgb),0.2)' : primary ? 'var(--brass)' : 'rgba(var(--ink-faded-rgb),0.4)';
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} title={title}
      style={{
        fontSize: 'calc(12px * var(--system-ratio, 1))', padding: '6px 14px', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
        border: '1px solid ' + border, background: disabled ? 'transparent' : 'rgba(196,168,85,0.08)', color,
        fontFamily: 'var(--font-ui)', letterSpacing: 1, transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)', transform: 'scale(1)',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = 'rgba(196,168,85,0.2)'; e.currentTarget.style.transform = 'scale(1.05)'; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; } e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.94)'; }}
      onMouseUp={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(1.05)'; }}
    >{label}</button>
  );
}

// ── Main ChasePanel ──────────────────────────────────────────

export function ChasePanel() {
  const chase = useChaseStore((s) => s.chase);
  const setChase = useChaseStore((s) => s.setChase);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Log reveal system (same pattern as CombatPanel)
  const [revealed, setRevealed] = useState(0);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [revealed]);
  const [tosses, setTosses] = useState<DiceToss[] | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const revealedRef = useRef(0);
  const logLenRef = useRef(0);
  const runningRef = useRef(false);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setRevealedBoth = (n: number) => { revealedRef.current = n; setRevealed(n); useChaseStore.getState().markSeen(n); };

  const advance = () => {
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
    const log = useChaseStore.getState().chase?.log ?? [];
    const n = revealedRef.current;
    if (n >= log.length) { runningRef.current = false; setTosses(null); return; }
    runningRef.current = true;
    setRevealedBoth(n + 1);
  };

  const onTossComplete = () => {
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
    setTosses(null);
    setRevealedBoth(revealedRef.current + 1);
  };

  useEffect(() => {
    if (!chase) { logLenRef.current = 0; runningRef.current = false; setTosses(null); return; }
    const logLen = chase.log.length;
    if (logLenRef.current === 0) {
      const seen = Math.min(useChaseStore.getState().seenLogLen, logLen);
      if (seen > 0) { setRevealedBoth(seen); }
      logLenRef.current = seen;
    }
    if (logLen < logLenRef.current) {
      setRevealedBoth(logLen); setTosses(null); runningRef.current = false;
    } else if (logLen > logLenRef.current && !runningRef.current) {
      advance();
    }
    logLenRef.current = logLen;
  }, [chase?.log, chase]);

  if (!chase) return null;
  const ch = chase;
  const player = ch.participants.find((p) => p.controlledBy === 'player');
  const currentId = ch.turnOrder[ch.currentIdx];
  const isPlayerTurn = !!player && currentId === player.id && ch.status === 'active';
  const resolving = ch.status === 'resolving';
  const animating = tosses !== null || revealed < ch.log.length;
  const canAct = isPlayerTurn && !animating;

  const gap = getGap(ch);

  const persist = () => { const id = useChatStore.getState().activeId; if (id) void saveConversation(id); };
  const act = (primary: boolean, run: () => void) => {
    if (soundEnabled) { try { (primary ? sfxClickPrimary : sfxClick)(); } catch { /* audio not available */ } }
    run();
    persist();
  };

  const doAction = (action: 'move' | 'sprint' | 'barricade' | 'attack') => {
    if (!canAct) return;
    const next = playerChaseAction(ch, action);
    setChase(next);
  };

  // Sprint disabled if already at max sprints or CON too low for check
  const sprintDisabled = !canAct || !player || player.sprintCount >= SPRINT_CON_INTERVAL;

  // Attack only when gap === 0 (adjacent)
  const attackDisabled = !canAct || gap > 0;

  // Status flags
  const playerFlags: string[] = [];
  if (player?.flags.fallen) playerFlags.push('倒地');
  if (player?.flags.trapped) playerFlags.push('受困');
  if (player?.flags.exhausted) playerFlags.push('力竭');

  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
      padding: '24px 0 16px', boxSizing: 'border-box', position: 'relative',
      background: 'linear-gradient(225deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
      borderTopRightRadius: 4, borderBottomRightRadius: 4,
      color: 'var(--ink)', fontFamily: 'var(--font-body)',
    }}>
      {/* Header: title / round / gap */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
        fontFamily: 'var(--font-display)', letterSpacing: 2, flexShrink: 0,
        borderBottom: `1px solid ${FAINT}`, padding: '0 24px 10px', marginBottom: 0,
      }}>
        <span style={{ fontSize: 'calc(17px * var(--system-ratio, 1))', color: 'var(--ink)' }}>
          追逐 · 第 {ch.round} 轮
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 'calc(12px * var(--system-ratio, 1))', letterSpacing: 1, color: 'var(--ink-subtle)' }}>
            距离 {gap} 地点
          </span>
          <span style={{
            fontSize: 'calc(12px * var(--system-ratio, 1))', letterSpacing: 1,
            color: resolving ? 'var(--gold)' : isPlayerTurn ? 'var(--success)' : 'var(--ink-subtle)',
          }}>
            {resolving ? '结算中...' : isPlayerTurn ? '你的回合' : '对方行动'}
          </span>
        </div>
      </div>

      {/* Location chain visualization */}
      <div style={{ borderBottom: `1px solid ${FAINTER}` }}>
        <LocationChain chase={ch} />
      </div>

      {/* Chase log (scrolling area) */}
      <div ref={logRef} className="rp-scroll" style={{
        flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 20px 10px 24px',
        fontSize: 'calc(14px * var(--system-ratio, 1))', lineHeight: 1.75,
        scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)',
      }}>
        {ch.log.slice(0, revealed).map((l, i) => (
          <TypewriterLine key={i} text={l.kind === 'narrative' ? `— ${l.text} —` : `· ${l.text}`} narrative={l.kind === 'narrative'}
            onDone={i === revealed - 1 ? advance : undefined} />
        ))}
        <DiceRecordsExpander records={ch.diceRecords} />
      </div>

      {/* Player status bar */}
      {player && (
        <div style={{
          display: 'flex', gap: 14, fontSize: 'calc(12px * var(--system-ratio, 1))',
          color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)',
          borderTop: `1px solid ${FAINTER}`, padding: '8px 24px 0',
          flexWrap: 'wrap', flexShrink: 0,
        }}>
          <span>MOV <b style={{ color: 'var(--ink)' }}>{player.mov}</b></span>
          <span>CON <b style={{ color: 'var(--ink)' }}>{player.con}</b></span>
          <span>冲刺 <b style={{ color: player.sprintCount >= SPRINT_CON_INTERVAL - 1 ? 'var(--blood)' : 'var(--ink)' }}>{player.sprintCount}/{SPRINT_CON_INTERVAL}</b></span>
          <span>角色 <b style={{ color: player.role === 'pursuer' ? 'var(--blood)' : 'var(--gold)' }}>{player.role === 'pursuer' ? '追赶者' : '逃跑者'}</b></span>
          {playerFlags.map((f) => <span key={f} style={{ color: 'var(--blood)' }}>{f}</span>)}
        </div>
      )}

      {/* Action bar */}
      {resolving ? (
        <div style={{ display: 'flex', justifyContent: 'center', borderTop: `1px solid ${FAINTER}`, padding: '12px 24px 2px', marginTop: 8, flexShrink: 0 }}>
          <button
            onClick={() => {
              if (advancing) return;
              setAdvancing(true);
              if (soundEnabled) { try { sfxClickPrimary(); } catch { /* audio not available */ } }
              document.dispatchEvent(new Event('chase-advance'));
            }}
            disabled={advancing}
            style={{
              fontSize: 'calc(14px * var(--system-ratio, 1))', fontFamily: 'var(--font-display)', letterSpacing: 3,
              padding: '9px 28px', borderRadius: 5, cursor: advancing ? 'wait' : 'pointer',
              border: '1px solid var(--brass)', background: advancing ? 'rgba(196,168,85,0.12)' : 'rgba(196,168,85,0.16)',
              color: 'var(--gold)', transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)', transform: 'scale(1)',
              boxShadow: '0 2px 14px rgba(196,168,85,0.18)',
            }}
            onMouseEnter={(e) => { if (!advancing) { e.currentTarget.style.background = 'rgba(196,168,85,0.28)'; e.currentTarget.style.transform = 'scale(1.04)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = advancing ? 'rgba(196,168,85,0.12)' : 'rgba(196,168,85,0.16)'; e.currentTarget.style.transform = 'scale(1)'; }}
          >{advancing ? '推进中...' : '推进剧情 ▶'}</button>
        </div>
      ) : (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'flex-end',
          borderTop: `1px solid ${FAINTER}`, padding: '10px 24px 0', marginTop: 8, flexShrink: 0,
        }}>
          <ActionBtn label="移动" primary disabled={!canAct} title="向前移动 1 地点（基于 MOV 差额可能额外移动）" onClick={() => act(true, () => doAction('move'))} />
          <ActionBtn label="冲刺" disabled={sprintDisabled} title={`消耗体力加速移动，需要 CON 检定（已冲刺 ${player?.sprintCount ?? 0}/${SPRINT_CON_INTERVAL} 次）`} onClick={() => act(true, () => doAction('sprint'))} />
          <ActionBtn label="设障" disabled={!canAct} title="在当前位置设置路障，阻碍追赶者" onClick={() => act(false, () => doAction('barricade'))} />
          <ActionBtn label="攻击" disabled={attackDisabled} title={gap > 0 ? '距离太远，无法攻击（需要相邻）' : '攻击相邻的目标'} onClick={() => act(true, () => doAction('attack'))} />
        </div>
      )}

      {/* Dice animation overlay */}
      <AnimatePresence>
        {tosses && <CombatDiceRoll key="chase-dice" tosses={tosses} soundOn={soundEnabled} onComplete={onTossComplete} />}
      </AnimatePresence>
    </div>
  );
}
