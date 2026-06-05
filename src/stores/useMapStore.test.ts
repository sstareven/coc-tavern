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

describe('useMapStore.removeEdgesByName', () => {
  beforeEach(reset);

  it('按名删边，无视方向', () => {
    useMapStore.getState().applyUpdates({ newEdges: [
      { from: '镇口', to: '码头区', type: 'bidirectional' },
      { from: '镇口', to: '小径入口', type: 'bidirectional' },
    ] });
    // 用反向名字也能命中删除
    useMapStore.getState().removeEdgesByName([{ from: '码头区', to: '镇口' }]);
    const s = useMapStore.getState();
    expect(s.edges).toHaveLength(1);
    expect(s.locations).toHaveLength(3); // 只删边不删点
  });

  it('端点名不存在则不动', () => {
    useMapStore.getState().applyUpdates({ newEdges: [{ from: '甲', to: '乙', type: 'bidirectional' }] });
    useMapStore.getState().removeEdgesByName([{ from: '甲', to: '丙' }]);
    expect(useMapStore.getState().edges).toHaveLength(1);
  });
});

describe('useMapStore.mergeLocations', () => {
  beforeEach(reset);

  // 注：用带「·」的真实风格名，避免 findLocByName 的 includes 在建点时就把两者并掉
  //（「码头区」.includes(「码头」) 会误并，而「印斯茅斯·码头区」与「印斯茅斯码头」互不包含，能共存）。
  it('合并重复地点：重挂连线、删别名节点、补描述', () => {
    useMapStore.getState().applyUpdates({
      newLocations: [
        { name: '印斯茅斯·码头区', description: '沿海岸延伸的码头区域' },
        { name: '印斯茅斯码头' }, // 空描述的重复别名
      ],
      newEdges: [
        { from: '主街', to: '印斯茅斯码头', type: 'bidirectional' }, // 连在别名上
        { from: '镇口', to: '印斯茅斯·码头区', type: 'bidirectional' },
      ],
    });
    useMapStore.getState().mergeLocations('印斯茅斯·码头区', ['印斯茅斯码头']);
    const s = useMapStore.getState();
    // 别名节点已删（主街/镇口/印斯茅斯·码头区 = 3）
    expect(s.locations.map((l) => l.name).sort()).toEqual(['主街', '印斯茅斯·码头区', '镇口'].sort());
    // 主街—别名 的边已重挂到 canonical，主街仍与码头区相连
    const canon = s.locations.find((l) => l.name === '印斯茅斯·码头区')!;
    const main = s.locations.find((l) => l.name === '主街')!;
    expect(s.edges.some((e) =>
      (e.fromId === main.id && e.toId === canon.id) || (e.fromId === canon.id && e.toId === main.id))).toBe(true);
  });

  it('合并后重复边去重 + current 改指 canonical', () => {
    useMapStore.getState().applyUpdates({
      newLocations: [{ name: '印斯茅斯·码头区', description: 'x' }, { name: '印斯茅斯码头' }],
      newEdges: [
        { from: '镇口', to: '印斯茅斯·码头区', type: 'bidirectional' },
        { from: '镇口', to: '印斯茅斯码头', type: 'bidirectional' }, // 合并后与上一条重复
      ],
      current: '印斯茅斯码头', // 当前指向别名
    });
    useMapStore.getState().mergeLocations('印斯茅斯·码头区', ['印斯茅斯码头']);
    const s = useMapStore.getState();
    expect(s.edges).toHaveLength(1); // 镇口—码头区 去重为一条
    expect(s.locations.find((l) => l.id === s.currentLocationId)?.name).toBe('印斯茅斯·码头区');
  });
});

describe('BUG3 — 地点描述兜底', () => {
  beforeEach(reset);

  it('setCurrentByName 在节点不存在时不建空描述节点', () => {
    // 模拟 useChatPipeline 的兜底逻辑：sceneLoc 未在 mapUpdates 中，只调用 setCurrentByName。
    useMapStore.getState().setCurrentByName('未存在的客厅');
    const s = useMapStore.getState();
    expect(s.locations).toHaveLength(0);              // 不创建节点
    expect(s.currentLocationId).toBeNull();           // 无现存节点 → current 保持 null
  });

  it('setCurrentByName 在节点已存在时正常切换', () => {
    useMapStore.getState().applyUpdates({ newLocations: [{ name: '客厅', description: '吊灯摇晃' }] });
    useMapStore.getState().setCurrentByName('客厅');
    const s = useMapStore.getState();
    expect(s.locations).toHaveLength(1);
    expect(s.currentLocationId).toBe(s.locations[0].id);
  });

  it('applyUpdates 的 newLocations 带描述时覆盖现有空描述节点', () => {
    // 第一回合：先建空描述节点（模拟早期 LLM 只给了名字）
    useMapStore.getState().applyUpdates({ newLocations: [{ name: '书房' }] });
    expect(useMapStore.getState().locations[0].description).toBe('');
    // 第二回合：LLM 终于给出描述，applyUpdates 必须刷新进去
    useMapStore.getState().applyUpdates({ newLocations: [{ name: '书房', description: '书架上落满灰尘' }] });
    const s = useMapStore.getState();
    expect(s.locations).toHaveLength(1);
    expect(s.locations[0].description).toBe('书架上落满灰尘');
  });

  it('applyUpdates 后续描述无条件覆盖更新（不止首次写入）', () => {
    // 第一次：给描述 A
    useMapStore.getState().applyUpdates({ newLocations: [{ name: '阁楼', description: '陈旧的木板地' }] });
    // 第二次：LLM 提供更丰富的描述，应当被采纳（BUG3 修复前 ensureLoc 不会更新非空描述）
    useMapStore.getState().applyUpdates({ newLocations: [{ name: '阁楼', description: '陈旧的木板地，散落着泛黄的家书' }] });
    const s = useMapStore.getState();
    expect(s.locations[0].description).toBe('陈旧的木板地，散落着泛黄的家书');
  });

  it('newLocations 不带描述时不抹掉已有描述', () => {
    // 已有描述
    useMapStore.getState().applyUpdates({ newLocations: [{ name: '客厅', description: '陈旧的沙发' }] });
    // 后续无描述的同名条目不应抹掉
    useMapStore.getState().applyUpdates({ newLocations: [{ name: '客厅' }] });
    expect(useMapStore.getState().locations[0].description).toBe('陈旧的沙发');
  });
});
