import { useEffect, useRef, useState } from 'react';
import { useCombatStore } from '../../stores/useCombatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { useChatStore } from '../../stores/useChatStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { saveConversation } from '../../stores/sessionLifecycle';
import { canReload } from '../../sillytavern/combat-engine';
import {
  playerAttack, playerReload, playerClearJam, playerCallForHelp, playerFlee,
} from '../../sillytavern/combat-controller';
import { sfxClick, sfxClickPrimary } from '../../audio/sfx';
import type { Combatant } from '../../types';

const FAINT = 'rgba(var(--ink-faded-rgb),0.25)';
const FAINTER = 'rgba(var(--ink-faded-rgb),0.15)';

/** 即时战斗面板（贴合右页书页·羊皮纸风。布局A：敌顶 · 日志中 · 玩家状态条 · 动作底）。 */
export function CombatPanel() {
  const encounter = useCombatStore((s) => s.encounter);
  const setEncounter = useCombatStore((s) => s.setEncounter);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; });

  // 骰子动画：每当战斗检定记录新增，为【玩家】那条主检定派发 dice-roll-animate(inputText:''→只演出不提交)，
  // 让玩家清楚看见每次投掷。其余(敌方/对抗)靠日志明细 + 检定记录展开呈现。
  const lastDiceCount = useRef(0);
  useEffect(() => {
    const recs = encounter?.diceRecords ?? [];
    if (recs.length > lastDiceCount.current) {
      const pname = encounter?.combatants.find((c) => c.faction === 'player')?.name;
      const fresh = recs.slice(lastDiceCount.current);
      const r = (pname ? fresh.find((x) => x.skill.startsWith(pname)) : undefined) ?? fresh[0];
      if (r) {
        document.dispatchEvent(new CustomEvent('dice-roll-animate', {
          detail: { skillName: r.purpose ?? r.skill, target: Number(r.target) || 0, roll: Number(r.roll) || 0, resultType: r.type, inputText: '' },
        }));
      }
    }
    lastDiceCount.current = recs.length;
  }, [encounter?.diceRecords, encounter?.combatants]);

  if (!encounter) return null;
  const enc = encounter;
  const player = enc.combatants.find((c) => c.faction === 'player');
  const enemies = enc.combatants.filter((c) => c.faction === 'enemy');
  const allies = enc.combatants.filter((c) => c.faction === 'ally');
  const sheet = useCharSheetStore.getState().sheet;
  const isPlayerTurn = !!player && enc.turnOrder[enc.currentIdx] === player.id && enc.status === 'active';
  const resolving = enc.status === 'resolving';

  const rangedIdx = player ? player.weapons.findIndex((w) => w.ranged) : -1;
  const rangedWeapon = rangedIdx >= 0 ? player!.weapons[rangedIdx] : undefined;
  const reserve = rangedWeapon?.ammoItemName
    ? (useInventoryStore.getState().findItem(rangedWeapon.ammoItemName)?.quantity ?? 0)
    : 0;

  const persist = () => { const id = useChatStore.getState().activeId; if (id) void saveConversation(id); };
  const act = (primary: boolean, run: () => void) => {
    if (soundEnabled) { try { (primary ? sfxClickPrimary : sfxClick)(); } catch { /* audio 不可用 */ } }
    run();
    persist();
  };

  const setTarget = (id: string) => setEncounter({ ...enc, playerTargetId: id });
  const doReload = () => {
    if (!isPlayerTurn || rangedIdx < 0) return;
    const { encounter: next, consumed } = playerReload(enc, rangedIdx, reserve);
    if (consumed > 0 && rangedWeapon?.ammoItemName) {
      useInventoryStore.getState().applyChanges([{ action: 'update', name: rangedWeapon.ammoItemName, quantity: -consumed }]);
    }
    setEncounter(next);
  };
  const doClearJam = () => { if (isPlayerTurn && rangedIdx >= 0) setEncounter(playerClearJam(enc, rangedIdx)); };
  const doCallHelp = () => {
    const friendly = enc.bystanders.find((b) => b.friendly);
    if (isPlayerTurn && friendly) setEncounter(playerCallForHelp(enc, friendly.id));
  };
  const doFlee = () => { if (isPlayerTurn) setEncounter(playerFlee(enc)); };
  // 用某件【特定武器】发起攻击（按随身武器逐个出按钮）。
  const attackWith = (idx: number) => { if (isPlayerTurn) setEncounter(playerAttack(enc, idx)); };
  const weaponUsable = (w: { ranged: boolean; loadedAmmo?: number }) => isPlayerTurn && (!w.ranged || ((w.loadedAmmo ?? 0) > 0 && !player?.flags.weaponJammed));

  const canReloadNow = isPlayerTurn && rangedIdx >= 0 && !!rangedWeapon && canReload(rangedWeapon, reserve);
  const jammed = !!player?.flags.weaponJammed;
  const hasFriendly = enc.bystanders.some((b) => b.friendly);

  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
      padding: '24px 0 16px', boxSizing: 'border-box',
      background: 'linear-gradient(225deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
      borderTopRightRadius: 4, borderBottomRightRadius: 4,
      color: 'var(--ink)', fontFamily: 'var(--font-body)',
    }}>
      {/* 头：标题 / 轮次 / 回合者 —— 书页式标题栏（分隔线跨满整页宽） */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
        fontFamily: 'var(--font-display)', letterSpacing: 2, flexShrink: 0,
        borderBottom: `1px solid ${FAINT}`, padding: '0 24px 10px', marginBottom: 12,
      }}>
        <span style={{ fontSize: 17, color: 'var(--ink)' }}>战斗 · 第 {enc.round} 轮</span>
        <span style={{ fontSize: 12, letterSpacing: 1, color: resolving ? 'var(--gold)' : isPlayerTurn ? 'var(--success)' : 'var(--ink-subtle)' }}>
          {resolving ? '结算中…' : isPlayerTurn ? '你的回合' : '对方行动'}
        </span>
      </div>

      {/* 敌人 / 友方 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, padding: '0 24px 10px', borderBottom: `1px solid ${FAINTER}` }}>
        {enemies.map((e) => (
          <CombatantRow key={e.id} c={e} hostile target={enc.playerTargetId === e.id} onClick={() => act(false, () => setTarget(e.id))} />
        ))}
        {allies.map((a) => <CombatantRow key={a.id} c={a} hostile={false} target={false} />)}
      </div>

      {/* 战斗日志（滚动累计）+ 检定记录展开 */}
      <div ref={logRef} className="rp-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 20px 10px 24px', fontSize: 14, lineHeight: 1.75, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)' }}>
        {enc.log.map((l, i) => (
          <TypewriterLine key={i} text={l.kind === 'narrative' ? `— ${l.text} —` : `· ${l.text}`} narrative={l.kind === 'narrative'} />
        ))}
        <DiceRecordsExpander records={enc.diceRecords} />
      </div>

      {/* 玩家状态条 */}
      {player && (
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', borderTop: `1px solid ${FAINTER}`, padding: '8px 24px 0', flexWrap: 'wrap', flexShrink: 0 }}>
          <span>HP <b style={{ color: 'var(--blood)' }}>{player.hp}/{player.maxHp}</b></span>
          <span>SAN <b style={{ color: 'var(--ink)' }}>{sheet.secondary.san.current}</b></span>
          <span>MP <b style={{ color: 'var(--ink)' }}>{sheet.secondary.mp.current}</b></span>
          {rangedWeapon && <span>弹药 <b style={{ color: 'var(--ink)' }}>{rangedWeapon.loadedAmmo ?? 0}/{rangedWeapon.magazine ?? 0}</b>（备 {reserve}）</span>}
          {jammed && <span style={{ color: 'var(--blood)' }}>卡壳</span>}
        </div>
      )}

      {/* 动作按钮：按随身武器逐个出攻击按钮（点哪个用哪个武器打）+ 换弹/排障/呼救/逃跑 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, borderTop: `1px solid ${FAINTER}`, padding: '10px 24px 0', marginTop: 8, flexShrink: 0 }}>
        {player?.weapons.map((w, i) => (
          <ActionBtn key={i} label={w.name} primary disabled={!weaponUsable(w)}
            title={`${w.ranged ? '射击' : '近战'} · 伤害 ${w.damage}${w.ranged ? `（弹 ${w.loadedAmmo ?? 0}/${w.magazine ?? 0}）` : ''} · 命中 ${w.skill}`}
            onClick={() => act(true, () => attackWith(i))} />
        ))}
        {rangedIdx >= 0 && <ActionBtn label="换弹" disabled={!canReloadNow} onClick={() => act(false, doReload)} />}
        {jammed && <ActionBtn label="排除故障" disabled={!isPlayerTurn} onClick={() => act(false, doClearJam)} />}
        {hasFriendly && <ActionBtn label="呼救" disabled={!isPlayerTurn} onClick={() => act(false, doCallHelp)} />}
        <ActionBtn label="逃跑" disabled={!isPlayerTurn} onClick={() => act(false, doFlee)} />
      </div>
    </div>
  );
}

function TypewriterLine({ text, narrative }: { text: string; narrative: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => { i += 2; setN(i); if (i >= text.length) clearInterval(id); }, 20);
    return () => clearInterval(id);
  }, [text]);
  return (
    <div style={{ color: narrative ? 'var(--ink-subtle)' : 'var(--ink)', fontStyle: narrative ? 'italic' : 'normal', marginBottom: 2 }}>
      {text.slice(0, n)}
    </div>
  );
}

function CombatantRow({ c, hostile, target, onClick }: { c: Combatant; hostile: boolean; target: boolean; onClick?: () => void }) {
  const fled = c.flags.fled;
  const down = c.flags.dead || c.flags.unconscious || fled;
  const stateLabel = fled ? '（脱离）' : (c.flags.dead || c.flags.unconscious) ? '（倒下）' : c.flags.dying ? '·濒死' : c.flags.majorWound ? '·重伤' : '';
  const pct = Math.max(0, Math.round((c.hp / c.maxHp) * 100));
  return (
    <div onClick={down ? undefined : onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4,
        border: target ? '1px solid var(--blood)' : '1px solid rgba(var(--ink-faded-rgb),0.18)',
        background: target ? 'rgba(176,58,46,0.06)' : 'rgba(0,0,0,0.02)',
        opacity: down ? 0.45 : 1, cursor: onClick && !down ? 'pointer' : 'default',
        transition: 'var(--transition-smooth)', fontFamily: 'var(--font-ui)',
      }}>
      <span style={{ flex: 1, fontSize: 13, color: hostile ? 'var(--ink)' : 'var(--success)' }}>
        {c.name}{target && !down ? ' ▸目标' : ''}{stateLabel}
      </span>
      <div style={{ width: 72, height: 7, background: 'rgba(0,0,0,0.1)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: hostile ? 'var(--blood)' : 'var(--success)', transition: 'var(--transition-smooth)' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-faded)', minWidth: 36, textAlign: 'right' }}>{c.hp}/{c.maxHp}</span>
    </div>
  );
}

function ActionBtn({ label, primary, disabled, title, onClick }: { label: string; primary?: boolean; disabled?: boolean; title?: string; onClick: () => void }) {
  const color = disabled ? 'var(--ink-faded)' : primary ? 'var(--gold)' : 'var(--ink)';
  const border = disabled ? 'rgba(var(--ink-faded-rgb),0.2)' : primary ? 'var(--brass)' : 'rgba(var(--ink-faded-rgb),0.4)';
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} title={title}
      style={{
        fontSize: 12, padding: '6px 14px', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
        border: '1px solid ' + border, background: disabled ? 'transparent' : 'rgba(196,168,85,0.08)', color,
        fontFamily: 'var(--font-ui)', letterSpacing: 1, transition: 'var(--transition-smooth)', transform: 'scale(1)',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = 'rgba(196,168,85,0.2)'; e.currentTarget.style.transform = 'scale(1.05)'; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; } e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.94)'; }}
      onMouseUp={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(1.05)'; }}
    >{label}</button>
  );
}

function DiceRecordsExpander({ records }: { records: { skill: string; roll: string; target: string; purpose?: string; page?: number }[] }) {
  const [open, setOpen] = useState(false);
  if (records.length === 0) return null;
  return (
    <div style={{ marginTop: 8, fontFamily: 'var(--font-ui)' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ color: 'var(--ink-subtle)', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
        {open ? '▾' : '▸'} 检定记录（{records.length} 条）
      </div>
      {open && (
        <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: `2px solid ${FAINTER}` }}>
          {records.map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--ink-faded)', lineHeight: 1.7 }}>
              {r.purpose ? `[${r.purpose}] ` : ''}{r.skill} d100={r.roll}/{r.target}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
