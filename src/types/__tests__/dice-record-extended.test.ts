import { describe, it, expectTypeOf } from 'vitest';
import type { DiceRecord, DiceResultType } from '../../types';

// ============================================================
// A1.1 — DiceRecord 扩展字段（推动检定 / 幸运消耗 / 成长打钩）
// 仅类型级测试：保证扩展字段为 optional，旧记录无需迁移即可继续编译。
// ============================================================
describe('DiceRecord 扩展字段（类型级）', () => {
  it('legacy minimal record 仍可赋值（不必给新字段）', () => {
    const legacy: DiceRecord = {
      skill: '侦查',
      roll: '42',
      target: '60',
      type: 'success',
      time: 1,
    };
    expectTypeOf(legacy).toMatchTypeOf<DiceRecord>();
  });

  it('完整字段记录（含 pushed/luckSpent/pushReason/pushedFrom/growthTickEligible）通过类型检查', () => {
    const full: DiceRecord = {
      skill: '图书馆使用',
      roll: '05',
      target: '50',
      type: 'extreme-success',
      time: 2,
      pushed: true,
      luckSpent: 30,
      pushReason: '玩家声明再翻找一次档案',
      pushedFrom: { roll: 65, type: 'failure' },
      growthTickEligible: true,
    };
    expectTypeOf(full).toMatchTypeOf<DiceRecord>();
    expectTypeOf(full.pushed).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(full.luckSpent).toEqualTypeOf<number | undefined>();
    expectTypeOf(full.pushReason).toEqualTypeOf<string | undefined>();
    expectTypeOf(full.growthTickEligible).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(full.pushedFrom).toEqualTypeOf<{ roll: number; type: DiceResultType } | undefined>();
  });

  it('五个新字段均为 optional（DiceRecord 的必填属性不包含它们）', () => {
    type RequiredKeys = keyof {
      [K in keyof DiceRecord as DiceRecord extends Record<K, unknown> ? K : never]: unknown;
    };
    expectTypeOf<RequiredKeys>().not.toEqualTypeOf<'pushed'>();
    expectTypeOf<RequiredKeys>().not.toEqualTypeOf<'luckSpent'>();
    expectTypeOf<RequiredKeys>().not.toEqualTypeOf<'pushReason'>();
    expectTypeOf<RequiredKeys>().not.toEqualTypeOf<'pushedFrom'>();
    expectTypeOf<RequiredKeys>().not.toEqualTypeOf<'growthTickEligible'>();
  });
});
