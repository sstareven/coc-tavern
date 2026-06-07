/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CombatPanel } from '../CombatPanel';
import { useCombatStore } from '../../../stores/useCombatStore';
import { useNpcStore } from '../../../stores/useNpcStore';
import type { Combatant, Encounter, NpcProfile } from '../../../types';

function mkCombatant(id: string, name: string, faction: Combatant['faction']): Combatant {
  return {
    id, name, faction, controlledBy: faction === 'player' ? 'player' : 'ai',
    dex: 50, str: 50, siz: 50, con: 50, mov: 8,
    fighting: 50, dodge: 25, damageBonus: '0',
    hp: 10, maxHp: 10, armor: 0,
    weapons: [{ name: '徒手', skill: 50, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 }],
    flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: false, weaponJammed: false, fled: false },
    roundDefenses: 0,
  };
}

function mkNpc(id: string, name: string, inParty: boolean): NpcProfile {
  return {
    id, name, identity: '', favorability: 0,
    appearance: '', innerThoughts: '', experience: '',
    backstory: '', status: '', possessions: [], memories: [],
    memorySummary: '', skills: {}, characteristics: {},
    isPresent: true, inParty,
    createdAt: Date.now(), updatedAt: Date.now(),
  } as unknown as NpcProfile;
}

describe('CombatPanel — M8 队友过滤', () => {
  beforeEach(() => {
    const player = mkCombatant('player', '调查员', 'player');
    const enemyReal = mkCombatant('enemy-0-邪教徒', '邪教徒', 'enemy');
    // 模拟 LLM 错把队友判进 enemy 阵营的兜底场景（id 形如 npc-<npcId>）
    const enemyWrongParty = mkCombatant('npc-elijah', '以利亚·霍尔姆斯', 'enemy');
    const enc: Encounter = {
      active: true, round: 1, turnOrder: ['player'], currentIdx: 0,
      combatants: [player, enemyReal, enemyWrongParty],
      bystanders: [], playerTargetId: null,
      log: [], diceRecords: [], status: 'active',
    };
    useCombatStore.setState({ encounter: enc, seenLogLen: 0 });
    useNpcStore.setState({
      profiles: {
        elijah: mkNpc('elijah', '以利亚·霍尔姆斯', true),  // 队友
        cultist: mkNpc('cultist', '邪教徒', false),
      },
    });
  });
  afterEach(() => cleanup());

  it('队友(inParty=true)不出现在敌人 CombatantRow 列表', () => {
    render(<CombatPanel />);
    // 队友名不应在战斗面板里出现
    expect(screen.queryByText('以利亚·霍尔姆斯')).toBeNull();
    // 真正的敌人仍应出现
    expect(screen.getByText('邪教徒')).toBeTruthy();
  });
});
