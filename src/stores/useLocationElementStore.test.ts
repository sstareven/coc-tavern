import { describe, it, expect, beforeEach } from 'vitest';
import { useLocationElementStore } from './useLocationElementStore';
import type { LocationElement } from '../types';

describe('地点元素 store', () => {
  beforeEach(() => { useLocationElementStore.getState().clearAll(); });

  it('applyExtracted 按 (locationName,name) 去重 upsert：两次只留一条且 description 被更新', () => {
    const store = useLocationElementStore.getState();
    store.applyExtracted([{ locationName: '书房', name: '壁炉', category: '陈设', description: '冷却的壁炉' }]);
    store.applyExtracted([{ locationName: '书房', name: '壁炉', category: '机关', description: '壁炉后藏有暗格' }]);
    const els = useLocationElementStore.getState().elements;
    expect(els).toHaveLength(1);
    expect(els[0].description).toBe('壁炉后藏有暗格');
    expect(els[0].category).toBe('机关');
  });

  it('upsert 时新值为空不覆盖既有 description/category', () => {
    const store = useLocationElementStore.getState();
    store.applyExtracted([{ locationName: '书房', name: '壁炉', category: '陈设', description: '冷却的壁炉' }]);
    store.applyExtracted([{ locationName: '书房', name: '壁炉', category: '陈设', description: '   ' }]);
    const el = useLocationElementStore.getState().elements[0];
    expect(el.description).toBe('冷却的壁炉');
  });

  it('不同地点的同名元素互不覆盖', () => {
    const store = useLocationElementStore.getState();
    store.applyExtracted([{ locationName: '书房', name: '油灯', category: '陈设', description: '书房的油灯' }]);
    store.applyExtracted([{ locationName: '地窖', name: '油灯', category: '陈设', description: '地窖的油灯' }]);
    const els = useLocationElementStore.getState().elements;
    expect(els).toHaveLength(2);
    expect(els.find((e) => e.locationName === '书房')!.description).toBe('书房的油灯');
    expect(els.find((e) => e.locationName === '地窖')!.description).toBe('地窖的油灯');
  });

  it('getByLocation 精确匹配', () => {
    const store = useLocationElementStore.getState();
    store.applyExtracted([
      { locationName: '书房', name: '壁炉', category: '陈设', description: 'd1' },
      { locationName: '地窖', name: '木桶', category: '容器', description: 'd2' },
    ]);
    const res = store.getByLocation('书房');
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('壁炉');
  });

  it('getByLocation 无精确匹配时宽松 includes 兜底（双向）', () => {
    const store = useLocationElementStore.getState();
    store.applyExtracted([{ locationName: '阿卡姆图书馆', name: '禁书', category: '容器', description: 'd' }]);
    // 查询名是已存名的子串
    expect(store.getByLocation('阿卡姆')).toHaveLength(1);
    // 查询名包含已存名
    store.applyExtracted([{ locationName: '塔', name: '钟', category: '陈设', description: 'd' }]);
    expect(store.getByLocation('钟塔顶层')).toHaveLength(1);
  });

  it('buildContextInjection 空地点返回空串', () => {
    expect(useLocationElementStore.getState().buildContextInjection('不存在的地点')).toBe('');
  });

  it('buildContextInjection 有元素时含地点名/元素名/类型/描述', () => {
    const store = useLocationElementStore.getState();
    store.applyExtracted([{ locationName: '书房', name: '壁炉', category: '机关', description: '后藏暗格' }]);
    const inj = store.buildContextInjection('书房');
    expect(inj).toContain('当前地点「书房」的已知元素');
    expect(inj).toContain('- 壁炉（机关）：后藏暗格');
  });

  it('replaceAll 整体替换', () => {
    const store = useLocationElementStore.getState();
    store.applyExtracted([{ locationName: '书房', name: '壁炉', category: '陈设', description: 'd' }]);
    const next: LocationElement[] = [
      { id: 'x1', locationName: '地窖', name: '木桶', category: '容器', description: 'dd', createdAt: 1 },
    ];
    store.replaceAll(next);
    const els = useLocationElementStore.getState().elements;
    expect(els).toHaveLength(1);
    expect(els[0].id).toBe('x1');
  });

  it('clearAll 清空', () => {
    const store = useLocationElementStore.getState();
    store.applyExtracted([{ locationName: '书房', name: '壁炉', category: '陈设', description: 'd' }]);
    store.clearAll();
    expect(useLocationElementStore.getState().elements).toHaveLength(0);
  });

  it('consolidateLocation 用归纳结果替换该地点元素、保留其它地点', () => {
    const store = useLocationElementStore.getState();
    store.applyExtracted([
      { locationName: '书房', name: '壁炉', category: '陈设', description: 'a' },
      { locationName: '书房', name: '书架', category: '陈设', description: 'b' },
      { locationName: '书房', name: '地毯', category: '陈设', description: 'c' },
      { locationName: '地窖', name: '木桶', category: '容器', description: 'd' },
    ]);
    store.consolidateLocation('书房', [
      { locationName: '书房', name: '陈旧家具群', category: '陈设', description: '壁炉、书架与地毯，皆蒙尘' },
    ]);
    const all = useLocationElementStore.getState();
    expect(all.getByLocation('书房')).toHaveLength(1);
    expect(all.getByLocation('书房')[0].name).toBe('陈旧家具群');
    // 其它地点不受影响
    expect(all.getByLocation('地窖')).toHaveLength(1);
    expect(all.getByLocation('地窖')[0].name).toBe('木桶');
  });
});
