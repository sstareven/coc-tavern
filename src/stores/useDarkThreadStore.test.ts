import { describe, it, expect, beforeEach } from 'vitest';
import { useDarkThreadStore } from './useDarkThreadStore';

describe('暗线注入 + 坏结局', () => {
  beforeEach(() => useDarkThreadStore.getState().clearAll());

  it('无暗线条目且无坏结局时注入为空', () => {
    expect(useDarkThreadStore.getState().buildContextInjection()).toBe('');
  });

  it('设置坏结局后即注入「暗线终点」，即便尚无暗线条目', () => {
    useDarkThreadStore.getState().setBadEnding({ description: '镇民尽数化为深潜者', createdAt: 1 });
    const inj = useDarkThreadStore.getState().buildContextInjection();
    expect(inj).toContain('暗线档案');
    expect(inj).toContain('镇民尽数化为深潜者');
    expect(inj).toContain('守秘人');
  });

  it('暗线条目与坏结局同时注入', () => {
    useDarkThreadStore.getState().setBadEnding({ description: '仪式完成', createdAt: 1 });
    useDarkThreadStore.getState().addEntry({ progress: 60, threatLevel: '紧迫', details: '教团集结', foreshadowing: '钟声' });
    const inj = useDarkThreadStore.getState().buildContextInjection();
    expect(inj).toContain('仪式完成');
    expect(inj).toContain('60/100');
    expect(inj).toContain('教团集结');
  });

  it('clearAll 同时清空暗线条目与坏结局', () => {
    useDarkThreadStore.getState().setBadEnding({ description: 'x', createdAt: 1 });
    useDarkThreadStore.getState().addEntry({ progress: 10, threatLevel: '潜伏', details: 'd', foreshadowing: '' });
    useDarkThreadStore.getState().clearAll();
    expect(useDarkThreadStore.getState().badEnding).toBeNull();
    expect(useDarkThreadStore.getState().entries).toHaveLength(0);
    expect(useDarkThreadStore.getState().buildContextInjection()).toBe('');
  });
});
