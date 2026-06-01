import { describe, it, expect, beforeEach } from 'vitest';
import { useNpcStore } from './useNpcStore';

function reset() { useNpcStore.getState().clearAll(); }

describe('useNpcStore.applyUpdates', () => {
  beforeEach(reset);

  it('首次出现创建 NPC（默认在场、好感度0）', () => {
    useNpcStore.getState().applyUpdates([{ name: '老约翰', identity: '看门人', appearance: '佝偻', personality: '多疑' }]);
    const present = useNpcStore.getState().getPresent();
    expect(present).toHaveLength(1);
    expect(present[0].name).toBe('老约翰');
    expect(present[0].identity).toBe('看门人');
    expect(present[0].favorability).toBe(0);
    expect(present[0].isPresent).toBe(true);
  });

  it('同名更新而非重复创建；favorabilityDelta 累加并夹紧', () => {
    useNpcStore.getState().applyUpdates([{ name: '老约翰', identity: '看门人' }]);
    useNpcStore.getState().applyUpdates([{ name: '老约翰', favorabilityDelta: 40 }]);
    useNpcStore.getState().applyUpdates([{ name: '老约翰', favorabilityDelta: 80 }]);
    const all = Object.values(useNpcStore.getState().profiles);
    expect(all).toHaveLength(1);
    expect(all[0].favorability).toBe(100); // 40+80=120 → 夹到 100
  });

  it('addMemory 追加记忆；isPresent=false 移到离场', () => {
    useNpcStore.getState().applyUpdates([{ name: '老约翰', addMemory: '盘问了调查员' }]);
    useNpcStore.getState().applyUpdates([{ name: '老约翰', addMemory: '收下了贿赂', isPresent: false }]);
    expect(useNpcStore.getState().getPresent()).toHaveLength(0);
    const absent = useNpcStore.getState().getAbsent();
    expect(absent).toHaveLength(1);
    expect(absent[0].memories).toEqual(['盘问了调查员', '收下了贿赂']);
  });

  it('buildContextInjection 只含在场 NPC', () => {
    useNpcStore.getState().applyUpdates([
      { name: '在场甲', identity: '医生', isPresent: true },
      { name: '离场乙', identity: '记者', isPresent: false },
    ]);
    const ctx = useNpcStore.getState().buildContextInjection();
    expect(ctx).toContain('在场甲');
    expect(ctx).not.toContain('离场乙');
  });
});
