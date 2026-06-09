// 端到端集成测试 — 拯救路径完整链路
// 覆盖 spec §6: unlock → 里程碑×N → progress=100 → globalStatus 锁定 + 其他路径冻结 + statData/store 双向一致
// 走 hydrateFromStatData 路径模拟 LLM 主回执 JSONPatch 写 statData 后 megaagent dispatch 末尾的反向回灌。
import { describe, it, expect, beforeEach } from 'vitest';
import { useRescueStore } from '../stores/useRescueStore';
import { useVariableStore } from '../stores/useVariableStore';
import { useDarkThreadStore } from '../stores/useDarkThreadStore';
import { setTreePath } from '../sillytavern/mvu-var-access';
import type { RescueEnding } from '../types/scenario';

const ENDINGS: RescueEnding[] = [
  {
    id: 'seal',
    name: '封印古神',
    description: '把祂封回深渊',
    unlockHint: '集齐三块封印符',
    milestones: [
      { id: 's1', name: '取得第一块符', delta: 30 },
      { id: 's2', name: '取得第二块符', delta: 30 },
      { id: 's3', name: '取得第三块符', delta: 40 },
    ],
  },
  {
    id: 'dispel',
    name: '驱散邪教',
    description: '瓦解教团',
    unlockHint: '揭穿教主',
    milestones: [
      { id: 'd1', name: '拿到名册', delta: 50 },
      { id: 'd2', name: '当众揭穿', delta: 50 },
    ],
  },
  {
    id: 'escape',
    name: '带走幸存者',
    description: '撤离小镇',
    unlockHint: '与教士达成协议',
    milestones: [
      { id: 'e1', name: '联系神父', delta: 50 },
      { id: 'e2', name: '上车撤离', delta: 50 },
    ],
  },
];

function reset() {
  useRescueStore.getState().clear();
  useDarkThreadStore.getState().clearAll();
  useVariableStore.setState({ statData: {}, variables: {} } as never);
}

/** 模拟 LLM 写 statData 的 JSONPatch:走 setTreePath 直接改 useVariableStore.statData。 */
function llmWriteStatData(updates: Array<{ path: string; value: unknown }>) {
  const tree = structuredClone(useVariableStore.getState().statData) as Record<string, unknown>;
  for (const u of updates) setTreePath(tree, u.path, u.value);
  useVariableStore.getState().setStatData(tree);
}

describe('rescue-flow integration · 完整链路', () => {
  beforeEach(reset);

  it('剧本激活 → 默认潜伏态 + 镜像写 statData seed', () => {
    useRescueStore.getState().initFromScenario(ENDINGS);
    const s = useRescueStore.getState();
    expect(s.paths).toHaveLength(3);
    expect(s.globalStatus).toBe('潜伏');
    expect(s.winningEndingId).toBeNull();

    const tree = useVariableStore.getState().statData as Record<string, unknown>;
    const rescue = (tree['剧情'] as Record<string, unknown>)['救援'] as Record<string, unknown>;
    expect(rescue['全局状态']).toBe('潜伏');
    expect((rescue['路径'] as Record<string, unknown>)['封印古神']).toBeDefined();
  });

  it('LLM 解锁单路径 → globalStatus 升「对峙」(经 hydrateFromStatData)', () => {
    useRescueStore.getState().initFromScenario(ENDINGS);
    llmWriteStatData([
      { path: '剧情.救援.全局状态', value: '对峙' },
      { path: '剧情.救援.路径.封印古神.已解锁', value: true },
    ]);
    useRescueStore.getState().hydrateFromStatData(useVariableStore.getState().statData);
    const s = useRescueStore.getState();
    expect(s.globalStatus).toBe('对峙');
    expect(s.paths.find((p) => p.endingId === 'seal')?.unlocked).toBe(true);
    expect(s.paths.find((p) => p.endingId === 'dispel')?.unlocked).toBe(false);
  });

  it('LLM 推进多个里程碑 → 进度累加 + 已达里程碑列表同步', () => {
    useRescueStore.getState().initFromScenario(ENDINGS);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().advanceMilestone('seal', 's1', '在祭坛找到日轮符');
    useRescueStore.getState().advanceMilestone('seal', 's2', '从牧师手里讨来月辉符');
    const seal = useRescueStore.getState().paths.find((p) => p.endingId === 'seal')!;
    expect(seal.progress).toBe(60);
    expect(seal.achievedMilestoneIds).toEqual(['s1', 's2']);

    const tree = useVariableStore.getState().statData as Record<string, unknown>;
    const sealStat = (((tree['剧情'] as Record<string, unknown>)['救援'] as Record<string, unknown>)['路径'] as Record<string, Record<string, unknown>>)['封印古神'];
    expect(sealStat['进度']).toBe(60);
    expect(sealStat['已达里程碑']).toEqual(['s1', 's2']);
  });

  it('某路径满 100 → 自动锁定 + 其他路径冻结(无视后续 advance)', () => {
    useRescueStore.getState().initFromScenario(ENDINGS);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().unlockPath('dispel');

    // seal 推满 100
    useRescueStore.getState().advanceMilestone('seal', 's1');
    useRescueStore.getState().advanceMilestone('seal', 's2');
    useRescueStore.getState().advanceMilestone('seal', 's3');

    const s = useRescueStore.getState();
    expect(s.globalStatus).toBe('锁定');
    expect(s.winningEndingId).toBe('seal');

    // 锁定后 dispel 继续推 — 应被冻结
    useRescueStore.getState().advanceMilestone('dispel', 'd1', '试图继续');
    useRescueStore.getState().applyDelta('dispel', 30);
    const dispel = useRescueStore.getState().paths.find((p) => p.endingId === 'dispel')!;
    expect(dispel.progress).toBe(0);
    expect(dispel.achievedMilestoneIds).toEqual([]);

    // statData 镜像反映
    const tree = useVariableStore.getState().statData as Record<string, unknown>;
    const rescue = (tree['剧情'] as Record<string, unknown>)['救援'] as Record<string, unknown>;
    expect(rescue['全局状态']).toBe('锁定');
    expect(rescue['胜出路径']).toBe('封印古神');
  });

  it('LLM 写 statData 显示胜出 → hydrateFromStatData 自动 lockOutcome(spec §1.2)', () => {
    useRescueStore.getState().initFromScenario(ENDINGS);
    // 模拟 LLM 主回执 JSONPatch:同回合一次性写 解锁/进度满/胜出
    llmWriteStatData([
      { path: '剧情.救援.全局状态', value: '锁定' },
      { path: '剧情.救援.胜出路径', value: '驱散邪教' },
      { path: '剧情.救援.路径.驱散邪教.已解锁', value: true },
      { path: '剧情.救援.路径.驱散邪教.进度', value: 100 },
      { path: '剧情.救援.路径.驱散邪教.已达里程碑', value: ['d1', 'd2'] },
    ]);
    useRescueStore.getState().hydrateFromStatData(useVariableStore.getState().statData);
    const s = useRescueStore.getState();
    expect(s.globalStatus).toBe('锁定');
    expect(s.winningEndingId).toBe('dispel');
    expect(s.paths.find((p) => p.endingId === 'dispel')?.progress).toBe(100);
  });

  it('锁定后 hydrateFromStatData 不被回退(LLM 再写 statData 也不降级)', () => {
    useRescueStore.getState().initFromScenario(ENDINGS);
    useRescueStore.getState().lockOutcome('seal');

    llmWriteStatData([
      { path: '剧情.救援.全局状态', value: '对峙' },
      { path: '剧情.救援.胜出路径', value: '' },
    ]);
    useRescueStore.getState().hydrateFromStatData(useVariableStore.getState().statData);
    const s = useRescueStore.getState();
    expect(s.globalStatus).toBe('锁定');
    expect(s.winningEndingId).toBe('seal');
  });

  it('buildContextInjection 在暗线 progress>=75 时含赛跑提示', () => {
    useRescueStore.getState().initFromScenario(ENDINGS);
    useRescueStore.getState().unlockPath('seal');
    useDarkThreadStore.getState().addEntry({ progress: 85, threatLevel: '紧迫', details: '邪典异响', foreshadowing: '' });
    const inj = useRescueStore.getState().buildContextInjection();
    expect(inj).toContain('赛跑提示');
    expect(inj).toContain('85');
  });

  it('快照往返:toSnapshot → clear → init → hydrateFromSnapshot 完整还原', () => {
    useRescueStore.getState().initFromScenario(ENDINGS);
    useRescueStore.getState().unlockPath('seal');
    useRescueStore.getState().advanceMilestone('seal', 's1', '取得日轮符');
    useRescueStore.getState().unlockPath('dispel');
    useRescueStore.getState().advanceMilestone('dispel', 'd1');

    const snap = useRescueStore.getState().toSnapshot();
    expect(snap.globalStatus).toBe('对峙');
    expect(snap.paths.find((p) => p.endingId === 'seal')?.progress).toBe(30);
    expect(snap.paths.find((p) => p.endingId === 'dispel')?.progress).toBe(50);

    // 清后重新激活同一剧本,然后 hydrate
    useRescueStore.getState().clear();
    useRescueStore.getState().initFromScenario(ENDINGS);
    useRescueStore.getState().hydrateFromSnapshot(snap);

    const s = useRescueStore.getState();
    expect(s.globalStatus).toBe('对峙');
    expect(s.paths.find((p) => p.endingId === 'seal')?.unlocked).toBe(true);
    expect(s.paths.find((p) => p.endingId === 'seal')?.progress).toBe(30);
    expect(s.paths.find((p) => p.endingId === 'seal')?.lastNarration).toBe('取得日轮符');
    expect(s.paths.find((p) => p.endingId === 'dispel')?.progress).toBe(50);
  });
});
