import { describe, it, expect, beforeEach } from 'vitest';
import { useAnchorStore } from '../useAnchorStore';
import type { PlotAnchors } from '../../types';

describe('useAnchorStore.buildContextInjection — 8 节文案', () => {
  beforeEach(() => {
    useAnchorStore.getState().clearAll();
  });

  it('全字段齐全 + 有 recentSummaries + lastCausalEcho 时,8 节都出现且顺序正确', () => {
    const a: PlotAnchors = {
      nodes: [
        { id: 'n1', title: '抵达极地', description: '到达基地。' },
        { id: 'n2', title: '发现遗骸', description: '挖出化石。' },
      ],
      constraints: ['仅能徒步'],
      threatDependencies: ['仪式材料'],
      theme: '在不可名状面前,选择尊严。',
      worldFacts: ['极地有遗迹', '基地有渊源'],
      characterArcs: [
        { name: '调查员', from: '天真助理', to: '清醒报信者' },
        { name: '埃伦娜', from: '冷静学者', mid: '动摇', to: '殉道者' },
      ],
      causalLinks: [
        { fromNodeId: 'n1', toNodeId: 'n2', hookHint: '翻读队长遗物' },
      ],
    };
    useAnchorStore.getState().replaceAll(a);
    useAnchorStore.getState().setLastCausalEcho('上回合调查员翻箱 → 本回合可推动【发现遗骸】');

    const txt = useAnchorStore.getState().buildContextInjection(['到了基地','整理装备']);

    expect(txt).toMatch(/本局主题/);
    expect(txt).toMatch(/在不可名状面前,选择尊严。/);
    expect(txt).toMatch(/必经骨架节点/);
    expect(txt).toMatch(/抵达极地/);
    expect(txt).toMatch(/↓ 翻读队长遗物/);
    expect(txt).toMatch(/角色弧目标/);
    expect(txt).toMatch(/调查员:天真助理 → 清醒报信者/);
    expect(txt).toMatch(/埃伦娜:冷静学者 → 殉道者/);
    expect(txt).toMatch(/中段:动摇/);
    expect(txt).toMatch(/已发生事件时间线/);
    expect(txt).toMatch(/全局硬约束/);
    expect(txt).toMatch(/KP 视角世界硬事实/);
    expect(txt).toMatch(/极地有遗迹/);
    expect(txt).toMatch(/上回合因果回响/);
    expect(txt).toMatch(/上回合调查员翻箱/);
    expect(txt).toMatch(/威胁达成坏结局所依赖之物/);
  });

  it('字段缺失整节静默降级,不产生空标题行', () => {
    const a: PlotAnchors = {
      nodes: [{ id: 'n1', title: 'X', description: 'd' }],
      constraints: [],
      threatDependencies: [],
      // 不传 theme/worldFacts/characterArcs/causalLinks
    };
    useAnchorStore.getState().replaceAll(a);
    const txt = useAnchorStore.getState().buildContextInjection([]);

    expect(txt).not.toMatch(/本局主题/);
    expect(txt).not.toMatch(/角色弧目标/);
    expect(txt).not.toMatch(/KP 视角世界硬事实/);
    expect(txt).not.toMatch(/上回合因果回响/);
    expect(txt).not.toMatch(/全局硬约束/);
    expect(txt).not.toMatch(/威胁达成坏结局/);
    expect(txt).not.toMatch(/已发生事件时间线/);
    // 但必经骨架节点 + 推进要求恒出
    expect(txt).toMatch(/必经骨架节点/);
    expect(txt).toMatch(/推进要求/);
  });

  it('nodes 空时返回空串', () => {
    expect(useAnchorStore.getState().buildContextInjection(['x'])).toBe('');
  });
});
