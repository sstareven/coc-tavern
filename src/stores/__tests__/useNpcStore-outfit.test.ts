import { describe, it, expect, beforeEach } from 'vitest';
import { useNpcStore } from '../useNpcStore';
import type { NpcProfile } from '../../types';

function makeNpc(name: string, importance: NpcProfile['importance'] = '重要'): NpcProfile {
  return {
    id: `id-${name}`,
    name,
    identity: '',
    favorability: 0,
    appearance: '',
    personality: '',
    innerThoughts: '',
    memories: [],
    experience: '',
    backstory: '',
    possessions: [],
    isPresent: true,
    locationName: '',
    importance,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('useNpcStore.setProfileOutfitByName', () => {
  beforeEach(() => {
    useNpcStore.getState().clearAll();
  });

  it('按 name 找到对应 profile 设 outfit', () => {
    useNpcStore.getState().replaceAll([makeNpc('埃伦娜')]);
    useNpcStore.getState().setProfileOutfitByName('埃伦娜', '白衬衫沾血');
    const profiles = Object.values(useNpcStore.getState().profiles);
    expect(profiles[0].outfit).toBe('白衬衫沾血');
  });

  it('找不到 name 时静默忽略,不抛错', () => {
    useNpcStore.getState().replaceAll([makeNpc('埃伦娜')]);
    expect(() => useNpcStore.getState().setProfileOutfitByName('不存在', 'x')).not.toThrow();
    const profiles = Object.values(useNpcStore.getState().profiles);
    expect(profiles[0].outfit).toBeUndefined();
  });

  it('空字符串 outfit 视为删除字段', () => {
    useNpcStore.getState().replaceAll([{ ...makeNpc('张三'), outfit: '旧装' }]);
    useNpcStore.getState().setProfileOutfitByName('张三', '');
    const profiles = Object.values(useNpcStore.getState().profiles);
    expect(profiles[0].outfit).toBeUndefined();
  });

  it('clearAll 同步清空 outfit(随 profile 整体清)', () => {
    useNpcStore.getState().replaceAll([{ ...makeNpc('张三'), outfit: 'x' }]);
    useNpcStore.getState().clearAll();
    expect(Object.keys(useNpcStore.getState().profiles)).toHaveLength(0);
  });
});
