// builtin-scenarios 守卫:8 个内置剧本都必须通过 isValidScenarioDoc + 满足结构不变量
// (role 字段合法 / prologueSeed 足够长 / entry id 唯一)
import { describe, it, expect } from 'vitest';
import { BUILTIN_SCENARIOS } from '../builtin-scenarios';
import { isValidScenarioDoc } from '../../types/scenario';

describe('BUILTIN_SCENARIOS 守卫', () => {
  it.each(BUILTIN_SCENARIOS.map((s) => [s.id, s] as const))(
    '[%s] 通过 isValidScenarioDoc 严格校验',
    (_id, scn) => {
      expect(isValidScenarioDoc(scn)).toBe(true);
    },
  );

  it.each(BUILTIN_SCENARIOS.map((s) => [s.id, s] as const))(
    '[%s] characters 若有则 role 字段属于三档之一',
    (_id, scn) => {
      // 设计: 默认 optional(玩家可越界扮演);protagonist 是推荐;locked_npc 是反派/序章死者等剧本钉死
      for (const c of scn.characters) {
        expect(['protagonist', 'optional', 'locked_npc']).toContain(c.role);
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
