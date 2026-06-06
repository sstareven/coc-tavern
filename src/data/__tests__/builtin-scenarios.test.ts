// builtin-scenarios 守卫:8 个内置剧本都必须通过 isValidScenarioDoc + 满足结构不变量
// (有 protagonist_candidate / prologueSeed 足够长 / entry id 唯一)
import { describe, it, expect } from 'vitest';
import { BUILTIN_SCENARIOS, FREE_EXPLORATION_SCENARIO } from '../builtin-scenarios';
import { isValidScenarioDoc } from '../../types/scenario';

describe('BUILTIN_SCENARIOS 守卫', () => {
  it.each(BUILTIN_SCENARIOS.map((s) => [s.id, s] as const))(
    '[%s] 通过 isValidScenarioDoc 严格校验',
    (_id, scn) => {
      expect(isValidScenarioDoc(scn)).toBe(true);
    },
  );

  it.each(BUILTIN_SCENARIOS.map((s) => [s.id, s] as const))(
    '[%s] characters 若有则 role 字段合法(允许 0 个 protagonist_candidate — 玩家可走 newChar)',
    (_id, scn) => {
      // 设计: 剧本里的角色默认全是 NPC 配角,玩家自己建调查员去玩(newChar 模式)。
      // preset 模式(玩家扮演剧本里某角色)需要 protagonist_candidate,但不强制每个剧本都提供。
      for (const c of scn.characters) {
        expect(['protagonist_candidate', 'npc_only']).toContain(c.role);
      }
    },
  );

  it.each(BUILTIN_SCENARIOS.map((s) => [s.id, s] as const))(
    '[%s] prologueSeed 长度 > 50(避免空种子让 LLM 干跑)',
    (_id, scn) => {
      expect(scn.prologueSeed.length).toBeGreaterThan(50);
    },
  );

  it.each(BUILTIN_SCENARIOS.map((s) => [s.id, s] as const))(
    '[%s] entries id 全局唯一',
    (_id, scn) => {
      const ids = scn.entries.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );
});
