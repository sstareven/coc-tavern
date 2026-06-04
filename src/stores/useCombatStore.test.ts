import { beforeEach, describe, expect, it } from 'vitest';
import { useCombatStore, isOrphanedEncounter } from './useCombatStore';
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

describe('isOrphanedEncounter — 悬空战斗识别（删页/回溯删掉锚定页）', () => {
  it('anchorPageId 不在现存 pages 中 → 孤儿（true）', () => {
    expect(isOrphanedEncounter({ ...enc(), anchorPageId: 'gone' }, ['p1', 'p2'])).toBe(true);
  });

  it('anchorPageId 仍在现存 pages 中 → 非孤儿（false）', () => {
    expect(isOrphanedEncounter({ ...enc(), anchorPageId: 'p2' }, ['p1', 'p2'])).toBe(false);
  });

  it('无 anchorPageId（老存档，按最新页显示）→ 非孤儿', () => {
    expect(isOrphanedEncounter(enc(), ['p1'])).toBe(false);
  });

  it('encounter 为空 → 非孤儿', () => {
    expect(isOrphanedEncounter(null, ['p1'])).toBe(false);
  });

  it('pages 全空（极端：被删光只剩序章重建）+ 有锚定 → 孤儿', () => {
    expect(isOrphanedEncounter({ ...enc(), anchorPageId: 'p1' }, [])).toBe(true);
  });
});
