import { beforeEach, describe, expect, it } from 'vitest';
import { useCombatStore } from './useCombatStore';
import type { Encounter } from '../types';

const enc = (): Encounter => ({
  active: true, round: 1, turnOrder: ['p', 'e'], currentIdx: 0,
  combatants: [], bystanders: [], playerTargetId: 'e',
  log: [], diceRecords: [], status: 'active',
});

describe('useCombatStore', () => {
  beforeEach(() => useCombatStore.getState().clearAll());

  it('start 进战、setEncounter 写回、clearCombat 脱战置空', () => {
    useCombatStore.getState().start(enc());
    expect(useCombatStore.getState().encounter?.round).toBe(1);
    useCombatStore.getState().setEncounter({ ...enc(), round: 3 });
    expect(useCombatStore.getState().encounter?.round).toBe(3);
    useCombatStore.getState().clearCombat();
    expect(useCombatStore.getState().encounter).toBeNull();
  });

  it('replaceAll 读档恢复 / clearAll 隔离清空', () => {
    useCombatStore.getState().replaceAll(enc());
    expect(useCombatStore.getState().encounter?.active).toBe(true);
    useCombatStore.getState().replaceAll(null);
    expect(useCombatStore.getState().encounter).toBeNull();
    useCombatStore.getState().start(enc());
    useCombatStore.getState().clearAll();
    expect(useCombatStore.getState().encounter).toBeNull();
  });
});
