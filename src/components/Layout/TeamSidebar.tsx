// 队伍侧边栏 — 见 docs/specs/2026-06-06-scenario-section-1-design.md(继 a98cba0 NPC 开局在场)
// 折叠胶囊(左上角) + 点击展开 280px 全高抽屉,显示玩家 + 所有 isPresent NPC
// 队友卡:头像/姓名/职业胶囊/HP+SAN 进度条/手中武器
// 战斗时胶囊变红心跳,队友卡注入"正在做什么"红条
import { useState, useMemo } from 'react';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useNpcStore } from '../../stores/useNpcStore';
import { useCombatStore } from '../../stores/useCombatStore';
import { parseNpcDerived } from '../../sillytavern/npc-derived';
import { IconClose } from './TabIcons';
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
  const sheet = useCharSheetStore((s) => s.sheet);
  const profiles = useNpcStore((s) => s.profiles);
  const encounter = useCombatStore((s) => s.encounter);

  const presentNpcs = useMemo(
    () => Object.values(profiles).filter((n) => n.isPresent).sort((a, b) => a.name.localeCompare(b.name)),
    [profiles],
  );

  const members = useMemo(
    () => buildMemberSnapshots(sheet, presentNpcs, encounter?.combatants ?? []),
    [sheet, presentNpcs, encounter],
  );

  const inCombat = encounter !== null && encounter.status === 'active';
  const currentActorId = inCombat ? encounter.turnOrder[encounter.currentIdx] : null;

  // 队伍只剩玩家(无 NPC 同行)就不渲染胶囊
  if (members.length <= 1) return null;

  const teamCount = members.length;
  const pillLabel = inCombat ? `战斗 第 ${encounter.round} 回合` : `队伍 ${teamCount}`;

  return (
    <>
      {/* 折叠胶囊 — 左上角 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={`打开队伍侧边栏(${teamCount} 调查员)`}
          style={{
            position: 'fixed',
            top: 56, left: 14, zIndex: 50,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px',
            background: 'linear-gradient(180deg, rgba(40,28,16,0.92), rgba(20,14,8,0.96))',
            border: `1px solid ${inCombat ? 'rgba(139,58,58,0.7)' : 'var(--brass)'}`,
            borderRadius: 18,
            color: inCombat ? 'rgba(220,150,150,0.95)' : 'var(--gold)',
            fontFamily: 'var(--font-ui)',
            fontSize: 11, letterSpacing: 2,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            transition: `transform 180ms ${EASE}, border-color 200ms ${EASE}, background 200ms ${EASE}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.background = 'linear-gradient(180deg, rgba(60,40,20,0.95), rgba(30,20,12,0.98))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.background = 'linear-gradient(180deg, rgba(40,28,16,0.92), rgba(20,14,8,0.96))';
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
              />
            );
          })}
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
  member, isActor, inCombat,
}: { member: MemberSnapshot; isActor: boolean; inCombat: boolean }): React.ReactElement {
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
