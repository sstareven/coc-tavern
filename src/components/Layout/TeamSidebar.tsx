// 队伍侧边栏 — 见 docs/specs/2026-06-06-scenario-section-1-design.md(继 a98cba0 NPC 开局在场)
// 折叠胶囊(左上角) + 点击展开 280px 全高抽屉,显示玩家 + 所有 isPresent NPC
// 队友卡:头像/姓名/职业胶囊/HP+SAN 进度条/手中武器
// 战斗时胶囊变红心跳,队友卡注入"正在做什么"红条
import { useState, useMemo } from 'react';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useNpcStore } from '../../stores/useNpcStore';
import { useCombatStore } from '../../stores/useCombatStore';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { useChatStore } from '../../stores/useChatStore';
import { useStatusToastStore } from '../../stores/useStatusToastStore';
import { parseNpcDerived } from '../../sillytavern/npc-derived';
import { canJoinParty } from '../../scenario/relation-graph';
import { IconClose, IconUserPlus, IconUserMinus } from './TabIcons';
import { groupNpcsByParty } from './team-sidebar-grouping';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { NpcProfile, CharacterSheet, Combatant } from '../../types';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface MemberSnapshot {
  id: string;
  name: string;
  occupation: string;
  hpCurrent: number;
  hpMax: number;
  sanCurrent: number;
  sanMax: number;
  weapon: string;
  isPlayer: boolean;
  combatant?: Combatant; // 战斗中的对应 Combatant(若有)
}

function buildMemberSnapshots(
  sheet: CharacterSheet | undefined,
  npcs: NpcProfile[],
  combatants: Combatant[],
): MemberSnapshot[] {
  const out: MemberSnapshot[] = [];

  // 玩家自己
  if (sheet) {
    const playerCombatant = combatants.find((c) => c.faction === 'player');
    out.push({
      id: '__player__',
      name: sheet.identity?.name?.trim() || '调查员',
      occupation: sheet.identity?.occupation || '自由职业',
      hpCurrent: playerCombatant?.hp ?? sheet.secondary?.hp?.current ?? 0,
      hpMax: playerCombatant?.maxHp ?? sheet.secondary?.hp?.max ?? 0,
      sanCurrent: sheet.secondary?.san?.current ?? 0,
      sanMax: sheet.secondary?.san?.max ?? 0,
      weapon: playerCombatant?.weapons?.[0]?.name || '空手',
      isPlayer: true,
      combatant: playerCombatant,
    });
  }

  // 在场 NPC 队友
  for (const npc of npcs) {
    const derived = parseNpcDerived(npc);
    const ac = combatants.find((c) => c.id === npc.id || c.name === npc.name);
    out.push({
      id: npc.id,
      name: npc.name,
      occupation: npc.identity || '同行',
      hpCurrent: ac?.hp ?? npc.hpCurrent ?? derived.hp ?? 0,
      hpMax: ac?.maxHp ?? derived.hp ?? 0,
      sanCurrent: npc.sanCurrent ?? derived.san ?? 0,
      sanMax: derived.san ?? 0,
      weapon: ac?.weapons?.[0]?.name || npc.possessions?.find((p) => /剑|刀|枪|弓|斧|锤|弹|匕/.test(p)) || '空手',
      isPlayer: false,
      combatant: ac,
    });
  }

  return out;
}

function combatActionDesc(combatant?: Combatant, isCurrent?: boolean): string | null {
  if (!combatant || combatant.flags?.dead || combatant.flags?.unconscious || combatant.flags?.fled) return null;
  if (isCurrent) return '行动中…';
  return '待命';
}

export function TeamSidebar(): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [pillHover, setPillHover] = useState(false);
  const sheet = useCharSheetStore((s) => s.sheet);
  const profiles = useNpcStore((s) => s.profiles);
  const encounter = useCombatStore((s) => s.encounter);
  const isMobile = useIsMobile();

  const grouping = useMemo(
    () => groupNpcsByParty(Object.values(profiles)),
    [profiles],
  );
  const partyNpcs = grouping.party;
  const presentOutsideNpcs = grouping.presentOutside;

  const members = useMemo(
    () => buildMemberSnapshots(sheet, partyNpcs, encounter?.combatants ?? []),
    [sheet, partyNpcs, encounter],
  );

  const joinParty = useNpcStore((s) => s.joinParty);
  const leaveParty = useNpcStore((s) => s.leaveParty);
  const showError = useStatusToastStore((s) => s.showError);

  const scenarioId = useChatStore((s) => s.sessions.find((c) => c.id === s.activeId)?.scenarioId);
  const scenarioDoc = useScenarioStore((s) => (scenarioId ? s.getById(scenarioId) : undefined));

  const handleInvite = (npcId: string) => {
    if (!scenarioDoc) {
      // 自由模式 / 无剧本(__free) — 没关系图可校验,直接放行
      joinParty(npcId);
      return;
    }
    const partyIds = partyNpcs.map((n) => n.id);
    const playerId = '__player__'; // 玩家节点 id 约定;canJoinParty 内部用它对齐 relation-graph
    const check = canJoinParty(scenarioDoc, npcId, partyIds, playerId);
    if (check.ok) {
      joinParty(npcId);
    } else {
      showError(check.reason === 'hostile' ? '与队伍敌对，无法入队' : '与你不熟，无法邀请入队');
    }
  };

  const handleLeave = (npcId: string) => {
    leaveParty(npcId);
  };

  const inCombat = encounter !== null && encounter.status === 'active';
  const currentActorId = inCombat ? encounter.turnOrder[encounter.currentIdx] : null;

  // 仅当队伍只剩玩家 且 也没有在场非队 NPC 时,才完全不渲染——否则玩家就邀请不了
  if (members.length <= 1 && presentOutsideNpcs.length === 0) return null;

  const teamCount = members.length;
  const outsideCount = presentOutsideNpcs.length;
  const pillLabel = inCombat
    ? `战斗 第 ${encounter.round} 回合`
    : outsideCount > 0
      ? `队伍 ${teamCount} · 在场 +${outsideCount}`
      : `队伍 ${teamCount}`;

  return (
    <>
      {/* 折叠胶囊 — 桌面端 fixed 左上 + hover 拉出侧边把手 (缩到只露 40px chip),
       *  手机端 relative 由 GameView 包到 TopBar 下方一行,不缩进 */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setPillHover(false); }}
          onMouseEnter={(e) => {
            setPillHover(true);
            if (!isMobile) e.currentTarget.style.transform = 'translateX(0)';
            e.currentTarget.style.background = 'linear-gradient(180deg, rgba(60,40,20,0.95), rgba(30,20,12,0.98))';
            e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.6)';
          }}
          onMouseLeave={(e) => {
            setPillHover(false);
            if (!isMobile) e.currentTarget.style.transform = 'translateX(calc(-100% + 40px))';
            e.currentTarget.style.background = 'linear-gradient(180deg, rgba(40,28,16,0.92), rgba(20,14,8,0.96))';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.5)';
          }}
          aria-label={`打开队伍侧边栏(${teamCount} 调查员)`}
          style={{
            ...(isMobile
              ? { position: 'relative', flexShrink: 0 }
              : {
                position: 'fixed',
                top: 56, left: 0, zIndex: 50,
                transform: 'translateX(calc(-100% + 40px))',
              }),
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px',
            paddingRight: isMobile ? 14 : 36,
            background: 'linear-gradient(180deg, rgba(40,28,16,0.92), rgba(20,14,8,0.96))',
            border: `1px solid ${inCombat ? 'rgba(139,58,58,0.7)' : 'var(--brass)'}`,
            borderRadius: isMobile ? 18 : '0 18px 18px 0',
            borderLeft: isMobile ? undefined : 'none',
            color: inCombat ? 'rgba(220,150,150,0.95)' : 'var(--gold)',
            fontFamily: 'var(--font-ui)',
            fontSize: 11, letterSpacing: 2,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            transition: `transform 280ms ${EASE}, border-color 200ms ${EASE}, background 200ms ${EASE}, box-shadow 200ms ${EASE}`,
          }}
        >
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            background: 'rgba(196,168,85,0.18)',
            border: `1px solid ${inCombat ? 'rgba(220,150,150,0.7)' : 'var(--gold)'}`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: inCombat ? 'rgba(220,150,150,0.95)' : 'var(--gold)',
            fontFamily: 'var(--font-mono)',
          }}>{teamCount}</span>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: inCombat ? 'var(--blood, #8b3a3a)' : 'var(--success, #5aab7a)',
            boxShadow: inCombat
              ? '0 0 0 0 rgba(139,58,58,0.7)'
              : '0 0 0 0 rgba(90,171,122,0.6)',
            animation: `${inCombat ? 'team-pulse-red' : 'team-pulse-green'} 2s ${EASE} infinite`,
          }} />
          <span>{pillLabel}</span>
          {/* 缩进态识别 chip — 单字「队」让玩家一眼认出; absolute 贴右边缘, hover 拉出后淡出 */}
          {!isMobile && (
            <span style={{
              position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
              width: 22, height: 22, borderRadius: '50%',
              background: inCombat ? 'rgba(139,58,58,0.25)' : 'rgba(196,168,85,0.22)',
              border: `1px solid ${inCombat ? 'rgba(220,150,150,0.7)' : 'var(--gold)'}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontFamily: 'var(--font-display)',
              color: inCombat ? 'rgba(220,150,150,0.95)' : 'var(--gold)',
              letterSpacing: 0, flexShrink: 0,
              opacity: pillHover ? 0 : 1,
              pointerEvents: 'none',
              transition: `opacity 200ms ${EASE}`,
            }}>队</span>
          )}
        </button>
      )}

      {/* 抽屉 — 从左滑出 */}
      <aside
        role="dialog"
        aria-label="队伍侧边栏"
        className="scenario-editor"
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: 'min(280px, 92vw)', height: '100%',
          background: 'linear-gradient(180deg, #2a1f14 0%, #150f08 100%)',
          borderRight: `1px solid ${inCombat ? 'rgba(139,58,58,0.55)' : 'var(--brass)'}`,
          boxShadow: inCombat ? '4px 0 24px rgba(60,0,0,0.5)' : '4px 0 24px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          zIndex: 60,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: `transform 260ms ${EASE}, border-right-color 240ms ${EASE}, box-shadow 240ms ${EASE}`,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <header style={{
          padding: '14px 44px 12px 16px',
          borderBottom: '1px solid rgba(196,168,85,0.2)',
          position: 'relative',
        }}>
          <div style={{
            fontSize: 13, color: inCombat ? 'rgba(220,150,150,0.92)' : 'var(--gold)',
            fontFamily: 'var(--font-ui)', letterSpacing: 3, fontWeight: 600,
          }}>
            {inCombat ? '队伍 · 战斗中' : '队伍'}
          </div>
          <div style={{
            fontSize: 10, color: 'rgba(196,168,85,0.55)',
            fontFamily: 'var(--font-mono)', marginTop: 3,
          }}>
            {inCombat
              ? `第 ${encounter.round} 回合 · 自动行动`
              : `${teamCount} 调查员 在场`}
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="关闭"
            style={{
              position: 'absolute', top: 12, right: 12,
              width: 22, height: 22,
              background: 'transparent',
              border: '1px solid rgba(196,168,85,0.35)',
              borderRadius: '50%',
              color: 'var(--gold)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: `background 180ms ${EASE}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(196,168,85,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <IconClose size={12} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {members.map((m) => {
            const isActor = currentActorId === m.combatant?.id;
            return (
              <MemberCard
                key={m.id}
                member={m}
                isActor={isActor}
                inCombat={inCombat}
                onLeave={!m.isPlayer ? () => handleLeave(m.id) : undefined}
              />
            );
          })}

          {presentOutsideNpcs.length > 0 && (
            <PresentOutsideSection
              npcs={presentOutsideNpcs}
              onInvite={handleInvite}
            />
          )}
        </div>
      </aside>

      {/* 动效 keyframes */}
      <style>{`
        @keyframes team-pulse-green {
          0%   { box-shadow: 0 0 0 0 rgba(90,171,122,0.6); }
          70%  { box-shadow: 0 0 0 6px rgba(90,171,122,0); }
          100% { box-shadow: 0 0 0 0 rgba(90,171,122,0); }
        }
        @keyframes team-pulse-red {
          0%   { box-shadow: 0 0 0 0 rgba(139,58,58,0.7); }
          70%  { box-shadow: 0 0 0 8px rgba(139,58,58,0); }
          100% { box-shadow: 0 0 0 0 rgba(139,58,58,0); }
        }
        @keyframes team-actor-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

function MemberCard({
  member, isActor, inCombat, onLeave,
}: { member: MemberSnapshot; isActor: boolean; inCombat: boolean; onLeave?: () => void }): React.ReactElement {
  const hpRatio = member.hpMax > 0 ? Math.max(0, Math.min(1, member.hpCurrent / member.hpMax)) : 0;
  const sanRatio = member.sanMax > 0 ? Math.max(0, Math.min(1, member.sanCurrent / member.sanMax)) : 0;
  const hpCrit = hpRatio < 0.3;
  const sanLow = sanRatio < 0.6;
  const dead = member.combatant?.flags?.dead;
  const insane = member.sanCurrent <= 0;

  const borderColor = member.isPlayer
    ? 'rgba(196,168,85,0.55)'
    : insane
      ? 'rgba(180,90,180,0.6)'
      : dead
        ? 'rgba(139,58,58,0.5)'
        : 'rgba(196,168,85,0.22)';

  const action = combatActionDesc(member.combatant, isActor);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: 12,
      background: member.isPlayer ? 'rgba(196,168,85,0.08)' : 'rgba(0,0,0,0.28)',
      border: `1px solid ${borderColor}`,
      borderRadius: 3,
      marginBottom: 10,
      opacity: dead ? 0.4 : 1,
      transition: `border-color 200ms ${EASE}, background 200ms ${EASE}, opacity 200ms ${EASE}`,
    }}>
      {/* row 1: 头像 + 姓名 + 职业胶囊 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: member.isPlayer ? 'rgba(232,200,101,0.18)' : 'rgba(196,168,85,0.15)',
          border: `1px solid ${member.isPlayer ? 'var(--gold)' : 'rgba(196,168,85,0.4)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          color: member.isPlayer ? 'var(--gold-bright)' : 'var(--gold)',
          fontSize: 14, fontWeight: 500, flexShrink: 0,
        }}>{member.name.slice(0, 1)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, color: member.isPlayer ? 'var(--gold-bright)' : 'var(--text-light)',
            fontFamily: 'var(--font-ui)', fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {member.name}{member.isPlayer && '(你)'}
          </div>
          <span style={{
            display: 'inline-block', marginTop: 2,
            padding: '1px 7px', fontSize: 9.5, letterSpacing: 1,
            background: 'rgba(196,168,85,0.1)',
            border: '1px solid rgba(196,168,85,0.28)',
            borderRadius: 2,
            color: 'rgba(196,168,85,0.85)',
            fontFamily: 'var(--font-ui)',
          }}>{member.occupation}</span>
        </div>
      </div>

      {/* row 2: HP + SAN 条 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Bar label="HP" current={member.hpCurrent} max={member.hpMax} crit={hpCrit} kind="hp" />
        <Bar label="SAN" current={member.sanCurrent} max={member.sanMax} crit={sanLow} kind="san" />
      </div>

      {/* row 3: 武器 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10.5,
        color: 'rgba(212,196,160,0.7)',
        fontFamily: 'var(--font-mono)',
      }}>
        <span style={{ fontSize: 9, color: 'rgba(196,168,85,0.5)' }}>⚔</span>
        <span style={{ color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>{member.weapon}</span>
      </div>

      {/* 玩家主动请退队按钮(玩家本人不显示;战斗中也不显示防误触) */}
      {onLeave && !inCombat && (
        <LeaveButton onClick={onLeave} />
      )}

      {/* 战斗时显示 "正在做什么" */}
      {inCombat && action && (
        <div style={{
          marginTop: 4,
          padding: '5px 8px',
          background: isActor ? 'rgba(139,58,58,0.16)' : 'rgba(0,0,0,0.2)',
          borderLeft: `2px solid ${isActor ? 'var(--blood, #8b3a3a)' : 'rgba(196,168,85,0.3)'}`,
          borderRadius: 2,
          fontSize: 11, fontFamily: 'var(--font-ui)',
          color: isActor ? 'rgba(255,200,200,0.9)' : 'rgba(212,196,160,0.7)',
          letterSpacing: 0.3,
          display: 'flex', gap: 6, alignItems: 'center',
        }}>
          {isActor && (
            <span style={{
              width: 8, height: 8,
              border: '1.5px solid rgba(255,200,200,0.3)',
              borderTopColor: 'rgba(255,200,200,0.9)',
              borderRadius: '50%',
              animation: `team-actor-spin 1s linear infinite`,
            }} />
          )}
          <span>{action}</span>
        </div>
      )}
    </div>
  );
}

function Bar({
  label, current, max, crit, kind,
}: { label: string; current: number; max: number; crit: boolean; kind: 'hp' | 'san' }): React.ReactElement {
  const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const hpColors = crit
    ? 'linear-gradient(90deg, #650020, #aa0030)'
    : 'linear-gradient(90deg, #8b3a3a, #cc4a4a)';
  const sanColors = crit
    ? 'linear-gradient(90deg, #500050, #800080)'
    : 'linear-gradient(90deg, #5e3a8b, #a05acc)';
  const fill = kind === 'hp' ? hpColors : sanColors;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9, fontFamily: 'var(--font-mono)',
        color: 'rgba(196,168,85,0.55)', letterSpacing: 1,
      }}>
        <span>{label}</span><span>{current}/{max || '-'}</span>
      </div>
      <div style={{
        height: 4, background: 'rgba(0,0,0,0.5)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${ratio * 100}%`,
          borderRadius: 2,
          background: fill,
          transition: `width 320ms ${EASE}`,
        }} />
      </div>
    </div>
  );
}

function PresentOutsideSection({
  npcs, onInvite,
}: { npcs: NpcProfile[]; onInvite: (id: string) => void }): React.ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <section style={{ marginTop: 18 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 8px',
          background: 'transparent',
          border: '1px solid rgba(196,168,85,0.22)',
          borderRadius: 2,
          color: 'rgba(196,168,85,0.85)',
          fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2,
          cursor: 'pointer',
          transition: `background 180ms ${EASE}, border-color 180ms ${EASE}`,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(196,168,85,0.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span>在场非队 · {npcs.length}</span>
        <span style={{ fontSize: 9, opacity: 0.65 }}>{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {npcs.map((n) => (
            <OutsideRow key={n.id} npc={n} onInvite={() => onInvite(n.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function OutsideRow({
  npc, onInvite,
}: { npc: NpcProfile; onInvite: () => void }): React.ReactElement {
  const [hover, setHover] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px',
      background: 'rgba(0,0,0,0.22)',
      border: `1px solid ${hover ? 'rgba(196,168,85,0.5)' : 'rgba(196,168,85,0.18)'}`,
      borderRadius: 3,
      transition: `border-color 200ms ${EASE}, background 200ms ${EASE}`,
    }}
    onMouseEnter={() => setHover(true)}
    onMouseLeave={() => setHover(false)}
    >
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: 'rgba(196,168,85,0.10)',
        border: '1px solid rgba(196,168,85,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(196,168,85,0.85)',
        fontFamily: 'var(--font-display)', fontSize: 12, flexShrink: 0,
      }}>{npc.name.slice(0, 1)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, color: 'var(--text-light)',
          fontFamily: 'var(--font-ui)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{npc.name}</div>
        <div style={{
          fontSize: 10, color: 'rgba(196,168,85,0.6)',
          fontFamily: 'var(--font-mono)', marginTop: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{npc.identity || '在场'}</div>
      </div>
      <InviteButton onClick={onInvite} />
    </div>
  );
}

function InviteButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-label="邀请入队"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 8px',
        background: hover ? 'rgba(196,168,85,0.18)' : 'rgba(196,168,85,0.08)',
        border: '1px solid rgba(196,168,85,0.45)',
        borderRadius: 2,
        color: 'var(--gold)',
        fontFamily: 'var(--font-ui)', fontSize: 10.5, letterSpacing: 1,
        cursor: 'pointer',
        transform: active ? 'scale(0.96)' : hover ? 'scale(1.04)' : 'scale(1)',
        transition: `transform 160ms ${EASE}, background 180ms ${EASE}, border-color 180ms ${EASE}`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
    >
      <IconUserPlus size={12} />
      <span>邀请入队</span>
    </button>
  );
}

function LeaveButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-label="请求退队"
      style={{
        marginTop: 2,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        alignSelf: 'flex-start',
        padding: '3px 7px',
        background: hover ? 'rgba(139,58,58,0.20)' : 'rgba(139,58,58,0.08)',
        border: '1px solid rgba(139,58,58,0.40)',
        borderRadius: 2,
        color: 'rgba(220,160,160,0.9)',
        fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: 1,
        cursor: 'pointer',
        transform: active ? 'scale(0.96)' : hover ? 'scale(1.04)' : 'scale(1)',
        transition: `transform 160ms ${EASE}, background 180ms ${EASE}, border-color 180ms ${EASE}`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
    >
      <IconUserMinus size={11} />
      <span>请求退队</span>
    </button>
  );
}
