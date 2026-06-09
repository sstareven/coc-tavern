import { describe, it, expect } from 'vitest';
import { pickNextUnreachedNode } from '../pickNextUnreachedNode';
import type { AnchorNode } from '../../types';

const nodes: AnchorNode[] = [
  { id: 'n1', title: '抵达极地', description: '' },
  { id: 'n2', title: '发现遗骸', description: '' },
  { id: 'n3', title: '城下之诡', description: '' },
];

describe('pickNextUnreachedNode', () => {
  it('summaries 涵盖前 2 节点 title → 返回第 3 节点 title', () => {
    expect(pickNextUnreachedNode(nodes, [
      '调查员抵达极地基地,开始整理装备。',
      '挖出古老遗骸,发现遗骸来自远古文明。',
    ])).toBe('城下之诡');
  });

  it('summaries 全未涵盖任何 title → 返回第 1 节点 title', () => {
    expect(pickNextUnreachedNode(nodes, ['毫无相关的内容'])).toBe('抵达极地');
  });

  it('summaries 涵盖全部节点 title → 返回最后一节点 title(防 undefined)', () => {
    expect(pickNextUnreachedNode(nodes, [
      '抵达极地','发现遗骸','城下之诡里玩家踏入',
    ])).toBe('城下之诡');
  });

  it('nodes 为空 → 返回空串', () => {
    expect(pickNextUnreachedNode([], ['x'])).toBe('');
  });

  it('summaries 涵盖中间节点不涵盖第一节点 → 仍返回第一节点(顺序优先)', () => {
    expect(pickNextUnreachedNode(nodes, ['发现遗骸'])).toBe('抵达极地');
  });
});
