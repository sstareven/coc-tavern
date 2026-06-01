import { describe, it, expect, beforeEach } from 'vitest';
import { useMapStore } from './useMapStore';

function reset() { useMapStore.getState().clearAll(); }

describe('useMapStore.applyUpdates', () => {
  beforeEach(reset);

  it('新地点登记 + 设置当前位置', () => {
    useMapStore.getState().applyUpdates({ current: '旧宅大厅', newLocations: [{ name: '旧宅大厅', description: '阴森的门厅' }] });
    const s = useMapStore.getState();
    expect(s.locations).toHaveLength(1);
    expect(s.locations[0].name).toBe('旧宅大厅');
    expect(s.currentLocationId).toBe(s.locations[0].id);
  });

  it('连线自动补建缺失端点 + 双向去重', () => {
    useMapStore.getState().applyUpdates({ newEdges: [{ from: '门廊', to: '大厅', type: 'bidirectional' }] });
    // 反向同型边视为重复
    useMapStore.getState().applyUpdates({ newEdges: [{ from: '大厅', to: '门廊', type: 'bidirectional' }] });
    const s = useMapStore.getState();
    expect(s.locations).toHaveLength(2);
    expect(s.edges).toHaveLength(1);
  });

  it('oneway 边方向敏感（A→B 与 B→A 不视为重复）', () => {
    useMapStore.getState().applyUpdates({ newEdges: [{ from: '崖顶', to: '湖底', type: 'oneway' }] });
    useMapStore.getState().applyUpdates({ newEdges: [{ from: '湖底', to: '崖顶', type: 'oneway' }] });
    expect(useMapStore.getState().edges).toHaveLength(2);
  });

  it('setCurrentByName 按名匹配高亮', () => {
    useMapStore.getState().applyUpdates({ newLocations: [{ name: '书房' }, { name: '地窖' }] });
    useMapStore.getState().setCurrentByName('地窖');
    const s = useMapStore.getState();
    expect(s.locations.find((l) => l.id === s.currentLocationId)?.name).toBe('地窖');
  });
});
