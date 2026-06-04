import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCombatStore } from '../../stores/useCombatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { useChatStore } from '../../stores/useChatStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { saveConversation } from '../../stores/sessionLifecycle';
import { canReload } from '../../sillytavern/combat-engine';
import {
  playerAttack, playerReload, playerClearJam, playerCallForHelp, playerFlee, playerManeuver,
} from '../../sillytavern/combat-controller';
import { sfxClick, sfxClickPrimary } from '../../audio/sfx';
import { CombatDiceRoll, type DiceToss } from './CombatDiceRoll';
import type { Combatant, ManeuverKind, DiceResultType, CombatRollViz } from '../../types';

const FAINT = 'rgba(var(--ink-faded-rgb),0.25)';
const FAINTER = 'rgba(var(--ink-faded-rgb),0.15)';

/** 成功等级 → 骰子配色（与全屏 DiceAnimation 一致）。 */
const DICE_COLORS: Record<DiceResultType, string> = {
  'crit-success': '#69f0ae', 'extreme-success': '#00e676', 'hard-success': '#4fc3f7',
  'success': '#69f0ae', 'failure': '#ff5252', 'crit-failure': '#d50000',
};
const colorFor = (t: DiceResultType): string => DICE_COLORS[t] ?? '#999';

/** 把一行日志携带的 rolls(检定→伤害)转成动画用 toss(每个 viz=一次同投)。 */
function buildTossesFromViz(rolls: CombatRollViz[]): DiceToss[] {
  return rolls.map((rv) => ({
    title: rv.title ?? (rv.damage ? '伤害' : '检定'),
    dice: rv.dice.map((d) => ({ value: d.value, faces: d.faces, color: rv.damage ? '#ff7043' : colorFor(d.type ?? 'success'), caption: d.caption })),
    total: rv.total,
  }));
}

/** 战技目录（COC7e 6.3）：体格对抗，攻方胜施加倒地/缴械效果，不直接致伤。 */
const MANEUVERS: { kind: ManeuverKind; label: string; title: string }[] = [
  { kind: 'grapple', label: '擒抱', title: '体格对抗·格斗 vs 闪避/反击 → 压制目标(倒地)' },
  { kind: 'disarm', label: '缴械', title: '体格对抗 → 打落目标武器(暂不可用)' },
  { kind: 'shove', label: '推倒', title: '体格对抗 → 将目标推倒在地' },
  { kind: 'knockout', label: '击晕', title: '体格对抗 → 将目标击晕瘫倒' },
];

/** 即时战斗面板（贴合右页书页·羊皮纸风。布局A：敌顶 · 日志中 · 玩家状态条 · 动作底）。 */
export function CombatPanel() {
  const encounter = useCombatStore((s) => s.encounter);
  const setEncounter = useCombatStore((s) => s.setEncounter);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; });

  // 骰子与文字【交替】揭示 + 掉血延后：逐行处理日志——该行若带 rolls 则先把骰子滚完(检定→伤害)，
  // 伤害骰滚定(onTossComplete)才把该目标的【显示血量】降到新值(血条随 CSS 过渡掉血)，随后打字显示该行，再推进下一行。
  const [revealed, setRevealed] = useState(0);
  const [tosses, setTosses] = useState<DiceToss[] | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [displayHp, setDisplayHp] = useState<Record<string, number>>({});
  const [activeActorId, setActiveActorId] = useState<string | null>(null); // 「轮到谁」高亮的 combatant
  const revealedRef = useRef(0);
  const logLenRef = useRef(0);
  const runningRef = useRef(false);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seedHp = (cs: { id: string; hp: number }[]) => setDisplayHp(Object.fromEntries(cs.map((c) => [c.id, c.hp])));
  const setRevealedBoth = (n: number) => { revealedRef.current = n; setRevealed(n); useCombatStore.getState().markSeen(n); };
  const advance = () => {
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
    const log = useCombatStore.getState().encounter?.log ?? [];
    const n = revealedRef.current;
    if (n >= log.length) { runningRef.current = false; setTosses(null); setActiveActorId(null); return; }
    runningRef.current = true;
    const rolls = log[n].rolls;
    const actor = rolls?.map((rv) => rv.actor).find(Boolean);
    if (actor) setActiveActorId(actor);                         // 检定行带行动者 → 更新高亮
    else if (!rolls?.length) setActiveActorId(null);            // 纯叙事行 → 清除高亮(结果行无 actor 则沿用)
    if (rolls && rolls.length) {
      setTosses(buildTossesFromViz(rolls));
      safetyRef.current = setTimeout(() => { setTosses(null); applyHpAndReveal(); }, 8000); // 兜底防卡
    } else {
      setRevealedBoth(n + 1); // 该行打完 → onDone 调 advance
    }
  };
  // 伤害骰滚定 → 该目标显示血量降到新值，再揭示该行
  const applyHpAndReveal = () => {
    const entry = useCombatStore.getState().encounter?.log[revealedRef.current];
    const hpv = entry?.rolls?.find((rv) => rv.hp)?.hp;
    if (hpv) setDisplayHp((prev) => ({ ...prev, [hpv.id]: hpv.to }));
    setRevealedBoth(revealedRef.current + 1);
  };
  const onTossComplete = () => {
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
    setTosses(null);
    applyHpAndReveal();
  };
  useEffect(() => {
    if (!encounter) { logLenRef.current = 0; runningRef.current = false; setTosses(null); setDisplayHp({}); setActiveActorId(null); return; }
    const logLen = encounter.log.length;
    if (logLenRef.current === 0) {
      seedHp(encounter.combatants); // 进场/读档：显示血量种子=当前各人血量
      // 已看过的行(读档恢复/翻页重挂载)瞬显不重播；未看过的(新开战的开场等)走下面 advance 逐条骰子+打字演出
      const seen = Math.min(useCombatStore.getState().seenLogLen, logLen);
      if (seen > 0) { setRevealedBoth(seen); }
      logLenRef.current = seen;
    }
    if (logLen < logLenRef.current) {
      setRevealedBoth(logLen); setTosses(null); runningRef.current = false; seedHp(encounter.combatants); // 清场/回退 → 同步真实
    } else if (logLen > logLenRef.current && !runningRef.current) {
      advance(); // 有新行且链空闲 → 启动交替揭示(链由 onTossComplete/onDone 自持)
    }
    logLenRef.current = logLen;
  }, [encounter?.log, encounter]);

  if (!encounter) return null;
  const enc = encounter;
  const player = enc.combatants.find((c) => c.faction === 'player');
  const enemies = enc.combatants.filter((c) => c.faction === 'enemy');
  const allies = enc.combatants.filter((c) => c.faction === 'ally');
  const sheet = useCharSheetStore.getState().sheet;
  const isPlayerTurn = !!player && enc.turnOrder[enc.currentIdx] === player.id && enc.status === 'active';
  const resolving = enc.status === 'resolving';
  // 「忙线」: 骰子动画在播 / 日志未追平 → 锁所有玩家动作按钮。
  // 否则在 AI 动画中连点"攻击"会触发 playerAttack→advanceUntilPlayerOrEnd 把后续 AI 一次推完,
  // 表现为"我点攻击,屏幕在给对方投骰",回合彻底乱轴。
  const animating = tosses !== null || revealed < enc.log.length;
  const canAct = isPlayerTurn && !animating;

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
  /** 结束测试战斗：手动清场（测试战斗不推进正文，由玩家点按关闭，面板不自动消失）。 */
  const endTest = () => { useCombatStore.getState().clearCombat(); persist(); };
  const doReload = () => {
    if (!canAct || rangedIdx < 0) return;
    const { encounter: next, consumed } = playerReload(enc, rangedIdx, reserve);
    if (consumed > 0 && rangedWeapon?.ammoItemName) {
      useInventoryStore.getState().applyChanges([{ action: 'update', name: rangedWeapon.ammoItemName, quantity: -consumed }]);
    }
    setEncounter(next);
  };
  const doClearJam = () => { if (canAct && rangedIdx >= 0) setEncounter(playerClearJam(enc, rangedIdx)); };
  const doCallHelp = () => {
    const friendly = enc.bystanders.find((b) => b.friendly);
    if (canAct && friendly) setEncounter(playerCallForHelp(enc, friendly.id));
  };
  const doFlee = () => { if (canAct) setEncounter(playerFlee(enc)); };
  // 用某件【特定武器】发起攻击（按随身武器逐个出按钮）。
  const attackWith = (idx: number) => { if (canAct) setEncounter(playerAttack(enc, idx)); };
  // 战技（COC7e 6.3）：体格对抗，攻方胜施加 prone/缴械效果。
  const doManeuver = (kind: ManeuverKind) => { if (canAct) setEncounter(playerManeuver(enc, kind)); };
  const weaponUsable = (w: { ranged: boolean; loadedAmmo?: number }) => canAct && (!w.ranged || ((w.loadedAmmo ?? 0) > 0 && !player?.flags.weaponJammed));

  const canReloadNow = canAct && rangedIdx >= 0 && !!rangedWeapon && canReload(rangedWeapon, reserve);
  const jammed = !!player?.flags.weaponJammed;
  const hasFriendly = enc.bystanders.some((b) => b.friendly);

  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
      padding: '24px 0 16px', boxSizing: 'border-box', position: 'relative',
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
          <CombatantRow key={e.id} c={e} hp={displayHp[e.id] ?? e.hp} hostile target={enc.playerTargetId === e.id} active={activeActorId === e.id} onClick={() => act(false, () => setTarget(e.id))} />
        ))}
        {allies.map((a) => <CombatantRow key={a.id} c={a} hp={displayHp[a.id] ?? a.hp} hostile={false} target={false} active={activeActorId === a.id} />)}
      </div>

      {/* 战斗日志（滚动累计）+ 检定记录展开 */}
      <div ref={logRef} className="rp-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 20px 10px 24px', fontSize: 14, lineHeight: 1.75, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)' }}>
        {enc.log.slice(0, revealed).map((l, i) => (
          <TypewriterLine key={i} text={l.kind === 'narrative' ? `— ${l.text} —` : `· ${l.text}`} narrative={l.kind === 'narrative'}
            dim={!!l.rolls?.length && l.rolls.every((rv) => !rv.damage)}
            onDone={i === revealed - 1 ? advance : undefined} />
        ))}
        <DiceRecordsExpander records={enc.diceRecords} />
      </div>

      {/* 玩家状态条 */}
      {player && (
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', borderTop: `1px solid ${FAINTER}`, padding: '8px 24px 0', flexWrap: 'wrap', flexShrink: 0 }}>
          <span>HP <b style={{ color: 'var(--blood)' }}>{displayHp[player.id] ?? player.hp}/{player.maxHp}</b></span>
          <span>SAN <b style={{ color: 'var(--ink)' }}>{sheet.secondary.san.current}</b></span>
          <span>MP <b style={{ color: 'var(--ink)' }}>{sheet.secondary.mp.current}</b></span>
          {rangedWeapon && <span>弹药 <b style={{ color: 'var(--ink)' }}>{rangedWeapon.loadedAmmo ?? 0}/{rangedWeapon.magazine ?? 0}</b>（备 {reserve}）</span>}
          {jammed && <span style={{ color: 'var(--blood)' }}>卡壳</span>}
          {player.flags.prone && <span style={{ color: 'var(--blood)' }}>倒地</span>}
          {player.flags.majorWound && <span style={{ color: 'var(--blood)' }}>重伤</span>}
        </div>
      )}

      {/* 动作栏：测试战斗结束=「结束测试」(手动关闭)；真实战斗结束=「推进剧情」；战斗中=攻击/战技/…(测试战斗附带「结束测试」) */}
      {resolving && enc.test ? (
        <div style={{ display: 'flex', justifyContent: 'center', borderTop: `1px solid ${FAINTER}`, padding: '12px 24px 2px', marginTop: 8, flexShrink: 0 }}>
          <ActionBtn label="结束测试 ✕" primary onClick={() => act(true, endTest)} />
        </div>
      ) : resolving && !enc.test ? (
        <div style={{ display: 'flex', justifyContent: 'center', borderTop: `1px solid ${FAINTER}`, padding: '12px 24px 2px', marginTop: 8, flexShrink: 0 }}>
          <button
            onClick={() => { if (advancing) return; setAdvancing(true); if (soundEnabled) { try { sfxClickPrimary(); } catch { /* audio 不可用 */ } } document.dispatchEvent(new Event('combat-advance')); }}
            disabled={advancing}
            style={{
              fontSize: 14, fontFamily: 'var(--font-display)', letterSpacing: 3,
              padding: '9px 28px', borderRadius: 5, cursor: advancing ? 'wait' : 'pointer',
              border: '1px solid var(--brass)', background: advancing ? 'rgba(196,168,85,0.12)' : 'rgba(196,168,85,0.16)',
              color: 'var(--gold)', transition: 'var(--transition-smooth)', transform: 'scale(1)',
              boxShadow: '0 2px 14px rgba(196,168,85,0.18)',
            }}
            onMouseEnter={(e) => { if (!advancing) { e.currentTarget.style.background = 'rgba(196,168,85,0.28)'; e.currentTarget.style.transform = 'scale(1.04)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = advancing ? 'rgba(196,168,85,0.12)' : 'rgba(196,168,85,0.16)'; e.currentTarget.style.transform = 'scale(1)'; }}
          >{advancing ? '推进中…' : '推进剧情 ▶'}</button>
        </div>
      ) : (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'flex-end', borderTop: `1px solid ${FAINTER}`, padding: '10px 24px 0', marginTop: 8, flexShrink: 0 }}>
        <ExpandUpMenu
          label="攻击" primary
          disabled={!player?.weapons.some((w) => weaponUsable(w))}
          options={(player?.weapons ?? []).map((w, i) => ({
            label: w.name,
            disabled: !weaponUsable(w),
            title: `${w.ranged ? '射击' : '近战'} · 伤害 ${w.damage}${w.ranged ? `（弹 ${w.loadedAmmo ?? 0}/${w.magazine ?? 0}）` : ''} · 命中 ${w.skill}`,
            onClick: () => act(true, () => attackWith(i)),
          }))}
        />
        <ExpandUpMenu
          label="战技"
          disabled={!canAct}
          options={MANEUVERS.map((m) => ({ label: m.label, title: m.title, onClick: () => act(true, () => doManeuver(m.kind)) }))}
        />
        {rangedIdx >= 0 && <ActionBtn label="换弹" disabled={!canReloadNow} onClick={() => act(false, doReload)} />}
        {jammed && <ActionBtn label="排除故障" disabled={!canAct} onClick={() => act(false, doClearJam)} />}
        {hasFriendly && <ActionBtn label="呼救" disabled={!canAct} onClick={() => act(false, doCallHelp)} />}
        <ActionBtn label="逃跑" disabled={!canAct} onClick={() => act(false, doFlee)} />
        {enc.test && <ActionBtn label="结束测试" onClick={() => act(false, endTest)} />}
      </div>
      )}

      {/* 书页内滚骰动画覆盖层（玩家攻击/战技：攻击+闪避同投 → 命中再投伤害骰） */}
      <AnimatePresence>
        {tosses && <CombatDiceRoll key="combat-dice" tosses={tosses} soundOn={soundEnabled} onComplete={onTossComplete} />}
      </AnimatePresence>
    </div>
  );
}

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
      fontSize: dim ? 11.5 : undefined, opacity: dim ? 0.78 : 1,
      marginBottom: dim ? 1 : 2,
    }}>
      {text.slice(0, n)}
    </div>
  );
}

function CombatantRow({ c, hp, hostile, target, active, onClick }: { c: Combatant; hp?: number; hostile: boolean; target: boolean; active?: boolean; onClick?: () => void }) {
  const fled = c.flags.fled;
  const down = c.flags.dead || c.flags.unconscious || fled;
  const stateLabel = fled ? '（脱离）' : (c.flags.dead || c.flags.unconscious) ? '（倒下）' : c.flags.dying ? '·濒死' : c.flags.majorWound ? '·重伤' : '';
  const shownHp = hp ?? c.hp; // 显示血量(掉血延后到伤害骰滚定)
  const pct = Math.max(0, Math.round((shownHp / c.maxHp) * 100));
  return (
    <div onClick={down ? undefined : onClick}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4,
        border: active ? '1px solid var(--gold)' : target ? '1px solid var(--blood)' : '1px solid rgba(var(--ink-faded-rgb),0.18)',
        background: active ? 'rgba(196,168,85,0.12)' : target ? 'rgba(176,58,46,0.06)' : 'rgba(0,0,0,0.02)',
        boxShadow: active ? '0 0 0 1px var(--gold), 0 0 12px rgba(196,168,85,0.45)' : 'none',
        opacity: down ? 0.45 : 1, cursor: onClick && !down ? 'pointer' : 'default',
        transition: 'var(--transition-smooth)', fontFamily: 'var(--font-ui)',
      }}>
      {active && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: [0, -3, 0] }}
          transition={{ x: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.2 } }}
          style={{ position: 'absolute', left: -16, color: 'var(--gold)', fontSize: 13, fontWeight: 700 }}
        >▶</motion.span>
      )}
      <span style={{ flex: 1, fontSize: 13, color: hostile ? 'var(--ink)' : 'var(--success)' }}>
        {c.name}{target && !down ? ' ▸目标' : ''}{stateLabel}
      </span>
      {active && <span style={{ fontSize: 9, color: 'var(--gold)', border: '1px solid rgba(196,168,85,0.6)', borderRadius: 8, padding: '0 6px', flexShrink: 0, letterSpacing: 1 }}>行动中</span>}
      {!down && (c.flags.prone || c.flags.weaponJammed) && (
        <span style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
          {c.flags.prone && <StatusChip label="倒地" />}
          {c.flags.weaponJammed && <StatusChip label="已缴械" />}
        </span>
      )}
      <div style={{ width: 72, height: 7, background: 'rgba(0,0,0,0.1)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: hostile ? 'var(--blood)' : 'var(--success)', transition: 'var(--transition-smooth)' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-faded)', minWidth: 36, textAlign: 'right' }}>{shownHp}/{c.maxHp}</span>
    </div>
  );
}

/** 战斗状态小标签（倒地/已缴械等，血红描边）。 */
function StatusChip({ label }: { label: string }) {
  return (
    <span style={{ fontSize: 9, fontFamily: 'var(--font-ui)', color: 'var(--blood)', border: '1px solid rgba(176,58,46,0.45)', background: 'rgba(176,58,46,0.06)', borderRadius: 8, padding: '0 6px', whiteSpace: 'nowrap', lineHeight: 1.6 }}>{label}</span>
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

/** 向上展开的动作菜单：按钮点击在其【上方】浮出选项列（攻击=武器列表 / 战技=战技列表）。点选项即执行并收起。 */
function ExpandUpMenu({ label, primary, disabled, options }: {
  label: string; primary?: boolean; disabled?: boolean;
  options: { label: string; title?: string; disabled?: boolean; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <ActionBtn label={`${label} ${open ? '▾' : '▴'}`} primary={primary} disabled={disabled} onClick={() => setOpen((o) => !o)} />
      <AnimatePresence>
        {open && !disabled && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              style={{
                position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 41,
                display: 'flex', flexDirection: 'column', gap: 5, padding: 6, minWidth: 132,
                background: 'var(--parchment)', border: '1px solid var(--brass)', borderRadius: 5,
                boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
              }}
            >
              {options.map((o, i) => (
                <ActionBtn key={i} label={o.label} title={o.title} disabled={o.disabled}
                  onClick={() => { o.onClick(); setOpen(false); }} />
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
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
              {r.purpose === '伤害'
                ? `[伤害] ${r.skill.split('·')[0]} ${r.target}=${r.roll}`
                : `${r.purpose ? `[${r.purpose}] ` : ''}${r.skill} d100=${r.roll}/${r.target}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
