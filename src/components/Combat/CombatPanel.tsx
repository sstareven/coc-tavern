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

/** 即时战斗面板（布局 A：敌顶 · 日志中 · 玩家状态条 · 动作底）。右页在战斗中由 Storybook 条件渲染此组件。 */
export function CombatPanel() {
  const encounter = useCombatStore((s) => s.encounter);
  const setEncounter = useCombatStore((s) => s.setEncounter);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; });

  if (!encounter) return null;
  const enc = encounter;
  const player = enc.combatants.find((c) => c.faction === 'player');
  const enemies = enc.combatants.filter((c) => c.faction === 'enemy');
  const allies = enc.combatants.filter((c) => c.faction === 'ally');
  const sheet = useCharSheetStore.getState().sheet;
  const isPlayerTurn = !!player && enc.turnOrder[enc.currentIdx] === player.id && enc.status === 'active';
  const resolving = enc.status === 'resolving';

  const rangedIdx = player ? player.weapons.findIndex((w) => w.ranged) : -1;
  const meleeIdx = player ? player.weapons.findIndex((w) => !w.ranged) : -1;
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
  const doShoot = () => { if (isPlayerTurn && rangedIdx >= 0) setEncounter(playerAttack(enc, rangedIdx)); };
  const doMelee = () => { if (isPlayerTurn) setEncounter(playerAttack(enc, meleeIdx >= 0 ? meleeIdx : 0)); };
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

  const canShoot = isPlayerTurn && rangedIdx >= 0 && (rangedWeapon?.loadedAmmo ?? 0) > 0 && !player?.flags.weaponJammed;
  const canReloadNow = isPlayerTurn && rangedIdx >= 0 && !!rangedWeapon && canReload(rangedWeapon, reserve);
  const jammed = !!player?.flags.weaponJammed;
  const hasFriendly = enc.bystanders.some((b) => b.friendly);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#1a140e', color: '#e0d6b8', fontFamily: 'var(--font-ui)' }}>
      {/* 头：轮次 / 回合者 / 状态 */}
      <div style={{ padding: '8px 12px', color: 'var(--gold)', fontSize: 12, borderBottom: '1px solid #3a2e1c', display: 'flex', justifyContent: 'space-between' }}>
        <span>⚔ 战斗 · 第 {enc.round} 轮</span>
        <span style={{ color: resolving ? 'var(--gold-bright)' : isPlayerTurn ? 'var(--success-bright)' : 'var(--ink-subtle)' }}>
          {resolving ? '结算中…' : isPlayerTurn ? '你的回合' : '对方行动'}
        </span>
      </div>

      {/* 敌人 / 友方 */}
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid #3a2e1c' }}>
        {enemies.map((e) => (
          <CombatantRow key={e.id} c={e} hostile target={enc.playerTargetId === e.id} onClick={() => act(false, () => setTarget(e.id))} />
        ))}
        {allies.map((a) => <CombatantRow key={a.id} c={a} hostile={false} target={false} />)}
      </div>

      {/* 战斗日志（滚动累计）+ 检定记录展开 */}
      <div ref={logRef} className="inv-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px', fontSize: 12, lineHeight: 1.7 }}>
        {enc.log.map((l, i) => (
          <div key={i} style={{ color: l.kind === 'narrative' ? '#8a7a55' : '#cdbf95' }}>
            {l.kind === 'narrative' ? `— ${l.text} —` : `· ${l.text}`}
          </div>
        ))}
        <DiceRecordsExpander records={enc.diceRecords} />
      </div>

      {/* 玩家状态条 */}
      {player && (
        <div style={{ padding: '6px 12px', display: 'flex', gap: 12, fontSize: 11, color: '#b5aa86', borderTop: '1px solid #3a2e1c', flexWrap: 'wrap' }}>
          <span>HP <b style={{ color: 'var(--blood)' }}>{player.hp}/{player.maxHp}</b></span>
          <span>SAN <b style={{ color: 'var(--gold)' }}>{sheet.secondary.san.current}</b></span>
          <span>MP <b>{sheet.secondary.mp.current}</b></span>
          {rangedWeapon && <span>弹药 <b>{rangedWeapon.loadedAmmo ?? 0}/{rangedWeapon.magazine ?? 0}</b>（备 {reserve}）</span>}
          {jammed && <span style={{ color: 'var(--blood)' }}>卡壳</span>}
        </div>
      )}

      {/* 动作按钮 */}
      <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, borderTop: '1px solid #3a2e1c' }}>
        {rangedIdx >= 0 && <ActionBtn label="射击" primary disabled={!canShoot} onClick={() => act(true, doShoot)} />}
        <ActionBtn label="近战" disabled={!isPlayerTurn} onClick={() => act(true, doMelee)} />
        {rangedIdx >= 0 && <ActionBtn label="换弹" disabled={!canReloadNow} onClick={() => act(false, doReload)} />}
        {jammed && <ActionBtn label="排除故障" disabled={!isPlayerTurn} onClick={() => act(false, doClearJam)} />}
        {hasFriendly && <ActionBtn label="呼救" disabled={!isPlayerTurn} onClick={() => act(false, doCallHelp)} />}
        <ActionBtn label="逃跑" disabled={!isPlayerTurn} onClick={() => act(false, doFlee)} />
      </div>
    </div>
  );
}

function CombatantRow({ c, hostile, target, onClick }: { c: Combatant; hostile: boolean; target: boolean; onClick?: () => void }) {
  const down = c.flags.dead || c.flags.unconscious;
  const pct = Math.max(0, Math.round((c.hp / c.maxHp) * 100));
  return (
    <div onClick={down ? undefined : onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 4,
        outline: target ? '1px solid var(--blood)' : 'none',
        opacity: down ? 0.4 : 1, cursor: onClick && !down ? 'pointer' : 'default',
        transition: 'var(--transition-smooth)',
      }}>
      <span style={{ flex: 1, fontSize: 12, color: hostile ? '#e0d6b8' : 'var(--success-bright)' }}>
        {c.name}{target ? ' ▸目标' : ''}{down ? '（倒下）' : ''}{c.flags.dying ? '·濒死' : c.flags.majorWound ? '·重伤' : ''}
      </span>
      <div style={{ width: 70, height: 7, background: '#3a1414', borderRadius: 4 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: hostile ? 'var(--blood)' : 'var(--success)', borderRadius: 4, transition: 'var(--transition-smooth)' }} />
      </div>
      <span style={{ fontSize: 10, color: '#b5aa86', minWidth: 36, textAlign: 'right' }}>{c.hp}/{c.maxHp}</span>
    </div>
  );
}

function ActionBtn({ label, primary, disabled, onClick }: { label: string; primary?: boolean; disabled?: boolean; onClick: () => void }) {
  const color = disabled ? 'var(--ink-faded)' : primary ? 'var(--gold)' : '#e0d6b8';
  const border = disabled ? 'rgba(196,168,85,0.12)' : primary ? 'var(--gold)' : 'rgba(196,168,85,0.3)';
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{
        fontSize: 11, padding: '5px 12px', borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer',
        border: '1px solid ' + border, background: 'transparent', color,
        fontFamily: 'var(--font-body)', transition: 'var(--transition-smooth)', transform: 'scale(1)',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.filter = 'brightness(1.3)'; e.currentTarget.style.transform = 'scale(1.05)'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.94)'; }}
      onMouseUp={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(1.05)'; }}
    >{label}</button>
  );
}

function DiceRecordsExpander({ records }: { records: { skill: string; roll: string; target: string; purpose?: string; page?: number }[] }) {
  const [open, setOpen] = useState(false);
  if (records.length === 0) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ color: '#8a7a55', fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>
        {open ? '▾' : '▸'} 检定记录（{records.length} 条）
      </div>
      {open && (
        <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: '1px solid #3a2e1c' }}>
          {records.map((r, i) => (
            <div key={i} style={{ fontSize: 10.5, color: '#b5aa86', lineHeight: 1.6 }}>
              {r.purpose ? `[${r.purpose}] ` : ''}{r.skill} d100={r.roll}/{r.target}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
