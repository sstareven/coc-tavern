import { describe, it, expect } from 'vitest';
import { parsePrologueResponse } from '../prologue-megaagent';

describe('parsePrologueResponse — 新字段', () => {
  it('解析 theme/worldFacts/characterArcs/causalLinks(fromTitle 反查 id)', () => {
    const raw = {
      badEnding: { description: '极地崩塌,全员葬身。' },
      pillars: [{ title: '柱1', secret: '秘1' }],
      anchors: {
        nodes: [
          { title: '抵达极地', description: '调查员到达基地。' },
          { title: '发现遗骸', description: '挖出古老化石。' },
          { title: '城下之诡', description: '深入冰下城市。' },
        ],
        constraints: ['仅能徒步'],
        threatDependencies: ['仪式材料'],
        theme: '人面对不可名状之物时,付出湛然依是选择。',
        worldFacts: ['极地有古老遗迹', '社区有三代旧怨', '某 NPC 与基地有渊源'],
        characterArcs: [
          { name: '调查员', from: '天真助理', to: '清醒的报信者' },
          { name: '埃伦娜·武', from: '冷静学者', mid: '动摇', to: '殉道者' },
        ],
        causalLinks: [
          { fromTitle: '抵达极地', toTitle: '发现遗骸', hookHint: '调查员翻读队长遗物' },
          { fromTitle: '发现遗骸', toTitle: '城下之诡', hookHint: '冰隙裂开露出阶梯' },
          { fromTitle: '不存在的节点', toTitle: '城下之诡', hookHint: '应被丢弃' },
        ],
      },
    };
    const result = parsePrologueResponse(raw);
    expect(result.anchors).not.toBeNull();
    const a = result.anchors!;
    expect(a.theme).toBe('人面对不可名状之物时,付出湛然依是选择。');
    expect(a.worldFacts).toEqual(['极地有古老遗迹', '社区有三代旧怨', '某 NPC 与基地有渊源']);
    expect(a.characterArcs).toEqual([
      { name: '调查员', from: '天真助理', to: '清醒的报信者' },
      { name: '埃伦娜·武', from: '冷静学者', mid: '动摇', to: '殉道者' },
    ]);
    expect(a.causalLinks).toHaveLength(2);
    expect(a.causalLinks![0].fromNodeId).toBe(a.nodes[0].id);
    expect(a.causalLinks![0].toNodeId).toBe(a.nodes[1].id);
    expect(a.causalLinks![0].hookHint).toBe('调查员翻读队长遗物');
  });

  it('新字段全缺时不报错,旧三段仍正常落地', () => {
    const raw = {
      badEnding: { description: '坏结局' },
      pillars: [{ title: 't', secret: 's' }],
      anchors: {
        nodes: [{ title: 'n1', description: 'd1' }],
        constraints: [],
        threatDependencies: [],
      },
    };
    const result = parsePrologueResponse(raw);
    expect(result.anchors).not.toBeNull();
    expect(result.anchors!.theme).toBeUndefined();
    expect(result.anchors!.worldFacts).toBeUndefined();
    expect(result.anchors!.characterArcs).toBeUndefined();
    expect(result.anchors!.causalLinks).toBeUndefined();
  });

  it('worldFacts 上限 6 条、theme 超 50 字截断', () => {
    const raw = {
      badEnding: { description: 'x' },
      pillars: [{ title: 't', secret: 's' }],
      anchors: {
        nodes: [{ title: 'n1', description: 'd1' }],
        constraints: [],
        threatDependencies: [],
        theme: 'a'.repeat(80),
        worldFacts: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'],
      },
    };
    const result = parsePrologueResponse(raw);
    expect(result.anchors!.theme!.length).toBe(50);
    expect(result.anchors!.worldFacts).toHaveLength(6);
  });
});
