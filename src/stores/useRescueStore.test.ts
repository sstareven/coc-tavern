import { describe, it, expect, beforeEach } from 'vitest';
import { useRescueStore } from './useRescueStore';
import { useVariableStore } from './useVariableStore';
import { useDarkThreadStore } from './useDarkThreadStore';
import type { RescueEnding } from '../types/scenario';

function reset() {
  useRescueStore.getState().clear();
  useDarkThreadStore.getState().clearAll();
  useVariableStore.setState({ statData: {}, variables: {} } as never);
}

const SAMPLE: RescueEnding[] = [
  {
    id: 'seal',
    name: '封印古神',
    description: '把祂封回深渊',
    unlockHint: '集齐三块封印符',
    milestones: [
      { id: 's1', name: '取得第一块符', delta: 25 },
      { id: 's2', name: '取得第二块符', delta: 25 },
      { id: 's3', name: '取得第三块符', delta: 25 },
      { id: 's4', name: '完成封印仪式', delta: 25 },
    ],
  },
  {
    id: 'dispel',
    name: '驱散邪教',
    description: '瓦解教团',
    unlockHint: '揭穿教主真面目',
    milestones: [
      { id: 'd1', name: '拿到名册', delta: 50 },
      { id: 'd2', name: '当众揭穿', delta: 50 },
    ],
  },
];

function getRescuePathTree(): Record<string, Record<string, unknown>> {
  const tree = useVariableStore.getState().statData as Record<string, unknown>;
  return (((tree['剧情'] as Record<string, unknown>)['救援'] as Record<string, unknown>)['路径']) as Record<string, Record<string, unknown>>;
}

function getRescueRoot(): Record<string, unknown> {
  const tree = useVariableStore.getState().statData as Record<string, unknown>;
  return (tree['剧情'] as Record<string, unknown>)['救援'] as Record<string, unknown>;
}

describe('useRescueStore - initFromScenario', () => {
  beforeEach(reset);

  it('初始 paths 为空、globalStatus 为「潜伏」、winningEndingId 为 null', () => {
    const s = useRescueStore.getState();
    expect(s.paths).toEqual([]);
    expect(s.globalStatus).toBe('潜伏');
    expect(s.winningEndingId).toBeNull();
  });

  it('initFromScenario 按 endings 顺序建出 paths', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    const s = useRescueStore.getState();
    expect(s.paths).toHaveLength(2);
    expect(s.paths[0]).toMatchObject({ endingId: 'seal', unlocked: false, progress: 0, achievedMilestoneIds: [] });
    expect(s.paths[1].endingId).toBe('dispel');
  });

  it('initFromScenario 写镜像到 statData「剧情.救援」', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    const rescue = getRescueRoot();
    expect(rescue['全局状态']).toBe('潜伏');
    expect(rescue['胜出路径']).toBe('');
    const paths = getRescuePathTree();
    expect(paths['封印古神']['已解锁']).toBe(false);
    expect(paths['封印古神']['进度']).toBe(0);
    expect(paths['驱散邪教']).toBeDefined();
  });

  it('二次调用覆盖旧 paths', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().initFromScenario([SAMPLE[0]]);
    expect(useRescueStore.getState().paths).toHaveLength(1);
    expect(useRescueStore.getState().paths[0].endingId).toBe('seal');
  });
});

describe('useRescueStore - unlockPath', () => {
  beforeEach(reset);

  it('unlockPath 把目标 unlocked=true 并把 globalStatus 升为「对峙」', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    const s = useRescueStore.getState();
    expect(s.paths.find((p) => p.endingId === 'seal')?.unlocked).toBe(true);
    expect(s.paths.find((p) => p.endingId === 'dispel')?.unlocked).toBe(false);
    expect(s.globalStatus).toBe('对峙');
  });

  it('锁定后 unlockPath 不降级 globalStatus', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.setState({ globalStatus: '锁定', winningEndingId: 'seal' });
    useRescueStore.getState().unlockPath('dispel');
    expect(useRescueStore.getState().globalStatus).toBe('锁定');
  });

  it('未知 endingId no-op', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('not-exist');
    expect(useRescueStore.getState().globalStatus).toBe('潜伏');
  });

  it('unlockPath 镜像同步 statData', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    const paths = getRescuePathTree();
    expect(paths['封印古神']['已解锁']).toBe(true);
    expect(getRescueRoot()['全局状态']).toBe('对峙');
  });
});

describe('useRescueStore - advanceMilestone', () => {
  beforeEach(reset);

  it('按 milestone.delta 推进 progress 并入 achievedMilestoneIds', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().advanceMilestone('seal', 's1', '玩家拿到第一块符');
    const p = useRescueStore.getState().paths.find((x) => x.endingId === 'seal')!;
    expect(p.achievedMilestoneIds).toEqual(['s1']);
    expect(p.progress).toBe(25);
    expect(p.lastNarration).toBe('玩家拿到第一块符');
  });

  it('同 milestoneId 重复触发幂等(不累加 progress)', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().advanceMilestone('seal', 's1');
    useRescueStore.getState().advanceMilestone('seal', 's1');
    useRescueStore.getState().advanceMilestone('seal', 's1');
    const p = useRescueStore.getState().paths.find((x) => x.endingId === 'seal')!;
    expect(p.achievedMilestoneIds).toEqual(['s1']);
    expect(p.progress).toBe(25);
  });

  it('未知 milestoneId no-op', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().advanceMilestone('seal', 'unknown');
    const p = useRescueStore.getState().paths.find((x) => x.endingId === 'seal')!;
    expect(p.progress).toBe(0);
  });

  it('镜像「已达里程碑/进度/最近」同步 statData', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().advanceMilestone('seal', 's1', '取符叙述');
    const seal = getRescuePathTree()['封印古神'];
    expect(seal['已达里程碑']).toEqual(['s1']);
    expect(seal['进度']).toBe(25);
    expect(seal['最近']).toBe('取符叙述');
  });
});

describe('useRescueStore - applyDelta', () => {
  beforeEach(reset);

  it('正值加 progress', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().applyDelta('seal', 15);
    expect(useRescueStore.getState().paths.find((p) => p.endingId === 'seal')!.progress).toBe(15);
  });

  it('负值减 progress 下界 0', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().applyDelta('seal', 30);
    useRescueStore.getState().applyDelta('seal', -50);
    expect(useRescueStore.getState().paths.find((p) => p.endingId === 'seal')!.progress).toBe(0);
  });

  it('超 100 饱和', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().applyDelta('seal', 250);
    const s = useRescueStore.getState();
    expect(s.paths.find((p) => p.endingId === 'seal')!.progress).toBe(100);
    // applyDelta 满 100 也自动锁定(与 advanceMilestone 一致)
    expect(s.globalStatus).toBe('锁定');
  });

  it('未知 endingId no-op', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().applyDelta('not-exist', 30);
    expect(useRescueStore.getState().paths.find((p) => p.endingId === 'seal')!.progress).toBe(0);
  });
});

describe('useRescueStore - lockOutcome', () => {
  beforeEach(reset);

  it('显式 lockOutcome: globalStatus → 锁定 + winningEndingId 填值', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().lockOutcome('seal');
    const s = useRescueStore.getState();
    expect(s.globalStatus).toBe('锁定');
    expect(s.winningEndingId).toBe('seal');
  });

  it('锁定后其他路径被冻结', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().unlockPath('dispel');
    useRescueStore.getState().lockOutcome('seal');
    useRescueStore.getState().advanceMilestone('dispel', 'd1', '试图');
    useRescueStore.getState().applyDelta('dispel', 30);
    const dispel = useRescueStore.getState().paths.find((p) => p.endingId === 'dispel')!;
    expect(dispel.progress).toBe(0);
    expect(dispel.achievedMilestoneIds).toEqual([]);
  });

  it('advanceMilestone 让 progress 满 100 自动 lockOutcome', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('dispel');
    useRescueStore.getState().advanceMilestone('dispel', 'd1');
    useRescueStore.getState().advanceMilestone('dispel', 'd2');
    expect(useRescueStore.getState().globalStatus).toBe('锁定');
    expect(useRescueStore.getState().winningEndingId).toBe('dispel');
  });

  it('镜像「全局状态」=「锁定」与「胜出路径」=ending.name', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().lockOutcome('seal');
    expect(getRescueRoot()['全局状态']).toBe('锁定');
    expect(getRescueRoot()['胜出路径']).toBe('封印古神');
  });

  it('未知 endingId no-op', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().lockOutcome('not-exist');
    expect(useRescueStore.getState().globalStatus).toBe('潜伏');
    expect(useRescueStore.getState().winningEndingId).toBeNull();
  });
});

describe('useRescueStore - buildContextInjection', () => {
  beforeEach(reset);

  it('paths 为空时空字符串', () => {
    expect(useRescueStore.getState().buildContextInjection()).toBe('');
  });

  it('潜伏期含 unlockHint', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    const inj = useRescueStore.getState().buildContextInjection();
    expect(inj).toContain('拯救路径状态');
    expect(inj).toContain('潜伏');
    expect(inj).toContain('封印古神');
    expect(inj).toContain('集齐三块封印符');
  });

  it('对峙期含路径进度', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().advanceMilestone('seal', 's1', '取得日轮纹符');
    const inj = useRescueStore.getState().buildContextInjection();
    expect(inj).toContain('对峙');
    expect(inj).toContain('25/100');
    expect(inj).toContain('取得日轮纹符');
  });

  it('锁定期只显示胜出路径 + 结局描述', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().lockOutcome('seal');
    const inj = useRescueStore.getState().buildContextInjection();
    expect(inj).toContain('锁定');
    expect(inj).toContain('封印古神');
    expect(inj).toContain('把祂封回深渊');
    expect(inj).not.toContain('驱散邪教');
  });

  it('暗线 progress >= 75 时含赛跑提示', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useDarkThreadStore.getState().addEntry({ progress: 80, threatLevel: '紧迫', details: 'd', foreshadowing: '' });
    const inj = useRescueStore.getState().buildContextInjection();
    expect(inj).toContain('赛跑提示');
    expect(inj).toContain('80/100');
  });
});

describe('useRescueStore - snapshot 往返', () => {
  beforeEach(reset);

  it('toSnapshot 输出三字段', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().advanceMilestone('seal', 's1', '取符');
    const snap = useRescueStore.getState().toSnapshot();
    expect(snap.globalStatus).toBe('对峙');
    expect(snap.winningEndingId).toBeNull();
    expect(snap.paths.find((p) => p.endingId === 'seal')?.progress).toBe(25);
  });

  it('hydrateFromSnapshot 完整还原', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().advanceMilestone('seal', 's1', '取符');
    const snap = useRescueStore.getState().toSnapshot();
    useRescueStore.getState().clear();
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().hydrateFromSnapshot(snap);
    const s = useRescueStore.getState();
    expect(s.globalStatus).toBe('对峙');
    expect(s.paths.find((p) => p.endingId === 'seal')?.progress).toBe(25);
    expect(s.paths.find((p) => p.endingId === 'seal')?.lastNarration).toBe('取符');
  });

  it('hydrateFromSnapshot(null) 恢复初始', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().hydrateFromSnapshot(null);
    const s = useRescueStore.getState();
    expect(s.paths).toEqual([]);
    expect(s.globalStatus).toBe('潜伏');
    expect(s.winningEndingId).toBeNull();
  });
});

describe('useRescueStore - hydrateFromStatData', () => {
  beforeEach(reset);

  it('从 statData 读回路径状态', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    const stat: Record<string, unknown> = {
      剧情: {
        救援: {
          全局状态: '对峙',
          胜出路径: '',
          路径: {
            封印古神: { 已解锁: true, 进度: 50, 已达里程碑: ['s1', 's2'], 最近: '完成第二符' },
            驱散邪教: { 已解锁: false, 进度: 0, 已达里程碑: [], 最近: '' },
          },
        },
      },
    };
    useRescueStore.getState().hydrateFromStatData(stat);
    const s = useRescueStore.getState();
    expect(s.globalStatus).toBe('对峙');
    const seal = s.paths.find((p) => p.endingId === 'seal')!;
    expect(seal.unlocked).toBe(true);
    expect(seal.progress).toBe(50);
    expect(seal.achievedMilestoneIds).toEqual(['s1', 's2']);
    expect(seal.lastNarration).toBe('完成第二符');
  });

  it('胜出路径已填时自动 lockOutcome(spec §1.2)', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    const stat: Record<string, unknown> = {
      剧情: {
        救援: {
          全局状态: '对峙',
          胜出路径: '封印古神',
          路径: { 封印古神: { 已解锁: true, 进度: 100, 已达里程碑: ['s1'], 最近: '' } },
        },
      },
    };
    useRescueStore.getState().hydrateFromStatData(stat);
    expect(useRescueStore.getState().globalStatus).toBe('锁定');
    expect(useRescueStore.getState().winningEndingId).toBe('seal');
  });

  it('已锁定不被回退覆盖', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().lockOutcome('seal');
    const stat: Record<string, unknown> = {
      剧情: { 救援: { 全局状态: '对峙', 胜出路径: '', 路径: {} } },
    };
    useRescueStore.getState().hydrateFromStatData(stat);
    expect(useRescueStore.getState().globalStatus).toBe('锁定');
    expect(useRescueStore.getState().winningEndingId).toBe('seal');
  });

  it('幂等', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    const stat: Record<string, unknown> = {
      剧情: {
        救援: {
          全局状态: '对峙',
          胜出路径: '',
          路径: { 封印古神: { 已解锁: true, 进度: 25, 已达里程碑: ['s1'], 最近: '取符' } },
        },
      },
    };
    useRescueStore.getState().hydrateFromStatData(stat);
    const a = useRescueStore.getState().toSnapshot();
    useRescueStore.getState().hydrateFromStatData(stat);
    const b = useRescueStore.getState().toSnapshot();
    expect(b).toEqual(a);
  });
});

describe('useRescueStore - clear', () => {
  beforeEach(reset);

  it('clear 全清', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().lockOutcome('seal');
    useRescueStore.getState().clear();
    const s = useRescueStore.getState();
    expect(s.paths).toEqual([]);
    expect(s.globalStatus).toBe('潜伏');
    expect(s.winningEndingId).toBeNull();
  });

  it('clear 后 buildContextInjection 返回空', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().clear();
    expect(useRescueStore.getState().buildContextInjection()).toBe('');
  });

  it('clear 后旧 endingsByIdCache 不残留(advanceMilestone 找不到旧 ms)', () => {
    useRescueStore.getState().initFromScenario(SAMPLE);
    useRescueStore.getState().clear();
    useRescueStore.getState().initFromScenario([
      { id: 'new', name: '新结局', description: 'x', unlockHint: 'y', milestones: [{ id: 'n1', name: 'n1', delta: 100 }] },
    ]);
    useRescueStore.getState().unlockPath('new');
    useRescueStore.getState().advanceMilestone('new', 's1'); // 旧 id, no-op
    const p = useRescueStore.getState().paths.find((x) => x.endingId === 'new')!;
    expect(p.achievedMilestoneIds).toEqual([]);
    expect(p.progress).toBe(0);
  });
});
