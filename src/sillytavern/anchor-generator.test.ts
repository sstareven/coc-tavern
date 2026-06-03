import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAnchors } from './anchor-generator';

function mockChatResponse(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }], usage: {} }) };
}

afterEach(() => vi.unstubAllGlobals());

describe('generateAnchors', () => {
  it('解析合法 JSON → PlotAnchors（补全 node id）', async () => {
    const json = JSON.stringify({
      nodes: [{ title: '接受邀约', description: '接下委托' }, { title: '抵达极地', description: '到达死城' }],
      constraints: ['威胁在极地爆发'],
      threatDependencies: ['船只补给'],
    });
    vi.stubGlobal('fetch', vi.fn(async () => mockChatResponse(json)));
    const r = await generateAnchors('开场', '坏结局', [{ title: '真相', secret: 's' }], 'http://x', 'k', 'm');
    expect(r).not.toBeNull();
    expect(r!.nodes).toHaveLength(2);
    expect(r!.nodes[0].id).toBeTruthy();
    expect(r!.constraints).toContain('威胁在极地爆发');
    expect(r!.threatDependencies).toContain('船只补给');
  });

  it('无效内容且重试用尽 → 返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockChatResponse('这不是JSON')));
    const r = await generateAnchors('开场', '坏结局', [], 'http://x', 'k', 'm', undefined, 0.9, 20000, 2);
    expect(r).toBeNull();
  });
});
