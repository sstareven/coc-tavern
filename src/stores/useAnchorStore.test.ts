import { beforeEach, describe, expect, it } from 'vitest';
import { useAnchorStore } from './useAnchorStore';
import type { PlotAnchors } from '../types';

const sample: PlotAnchors = {
  nodes: [
    { id: 'n1', title: '接受邀约', description: '调查员接下极地探险的委托' },
    { id: 'n2', title: '抵达极地死城', description: '穿越冰原，抵达远古者死城' },
  ],
  constraints: ['暗线威胁必在极地爆发', '核心场景在极地，不在出发港'],
  threatDependencies: ['探险队的补给与船只', '唤醒仪式所需的化石样本'],
};

describe('useAnchorStore', () => {
  beforeEach(() => useAnchorStore.getState().clearAll());

  it('setAnchors 幂等：已有节点时第二次写入被忽略', () => {
    useAnchorStore.getState().setAnchors(sample);
    useAnchorStore.getState().setAnchors({ nodes: [{ id: 'x', title: 'X', description: 'x' }], constraints: [], threatDependencies: [] });
    expect(useAnchorStore.getState().anchors.nodes).toHaveLength(2);
    expect(useAnchorStore.getState().anchors.nodes[0].id).toBe('n1');
  });

  it('clearAll 清空、replaceAll 整体替换（读档）', () => {
    useAnchorStore.getState().setAnchors(sample);
    useAnchorStore.getState().clearAll();
    expect(useAnchorStore.getState().anchors.nodes).toHaveLength(0);
    useAnchorStore.getState().replaceAll(sample);
    expect(useAnchorStore.getState().anchors.constraints).toHaveLength(2);
  });

  it('buildContextInjection：无节点返回空串', () => {
    expect(useAnchorStore.getState().buildContextInjection(['某事件'])).toBe('');
  });

  it('buildContextInjection：含节点/约束/依赖/事件时间线/关键指令', () => {
    useAnchorStore.getState().setAnchors(sample);
    const txt = useAnchorStore.getState().buildContextInjection(['玩家在港口登船', '航行中遭遇风暴']);
    expect(txt).toContain('抵达极地死城');
    expect(txt).toContain('暗线威胁必在极地爆发');
    expect(txt).toContain('唤醒仪式所需的化石样本');
    expect(txt).toContain('航行中遭遇风暴');
    expect(txt).toContain('开放式胜利');
    expect(txt).toContain('绝不重复');
  });
});
