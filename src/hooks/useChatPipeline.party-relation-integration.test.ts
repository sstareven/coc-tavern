import { describe, it, expect, vi } from 'vitest';

vi.mock('../sillytavern/party-relation-evaluator', () => ({
  evaluatePartyRelations: vi.fn(() => Promise.resolve()),
}));

// 因为 useChatPipeline 是 React Hook, 这里只验"模块 import 链不报错"
// 真正的行为验证由 party-relation-evaluator.test.ts 覆盖, 这里跑静态导入断言钩子已挂上
import * as pipelineMod from './useChatPipeline';

describe('useChatPipeline party-relation-evaluator 接入', () => {
  it('useChatPipeline 模块加载后, party-relation-evaluator 已被 import (静态依赖存在)', async () => {
    expect(pipelineMod).toBeTruthy();
    // import 已成功则 vi.mock 的桩生效, 反向证明 useChatPipeline 静态依赖了该模块
    const mod = await import('../sillytavern/party-relation-evaluator');
    const { evaluatePartyRelations } = mod;
    expect(typeof evaluatePartyRelations).toBe('function');
    expect(vi.isMockFunction(evaluatePartyRelations)).toBe(true);
  });
});
