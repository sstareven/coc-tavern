// BUG1: 兴趣/职业加点联动钳 99 单技能上限
// 验证 clampSkillPointAlloc：base + cur + otherAlloc 不可越过 99，且不可超出池剩余。
import { describe, it, expect } from 'vitest';
import { clampSkillPointAlloc } from './coc-rules';

describe('clampSkillPointAlloc — 联动 99 单技能上限', () => {
  it('单池场景：未越上限正常累加', () => {
    // base=5, 无其他池占用, cur=0, delta=10, 池剩余 100
    expect(clampSkillPointAlloc(0, 10, 5, 0, 100)).toBe(10);
  });

  it('单池场景：直接卡到 99-base 不溢出', () => {
    // base=10, 无其他池占用, cur=80, delta=20 → max 89 不到 99
    expect(clampSkillPointAlloc(80, 20, 10, 0, 100)).toBe(89);
  });

  it('单池场景：受池剩余限制', () => {
    // 池剩余只剩 3，无论 delta 多大都不能突破 cur+3
    expect(clampSkillPointAlloc(10, 50, 0, 0, 3)).toBe(13);
  });

  it('联动场景（兴趣加点）：另一池已分配 30，base=10 ⇒ 该池最多 59', () => {
    // adjIntPoint 调用：cur=int 池当前=50, delta=+10, base=10, otherAlloc=occ 池已分 30, remaining=100
    // 99-base-otherAlloc = 99-10-30 = 59. target=60 → 钳到 59.
    expect(clampSkillPointAlloc(50, 10, 10, 30, 100)).toBe(59);
  });

  it('联动场景（职业加点）：另一池已分配 20，base=15 ⇒ 该池最多 64', () => {
    // adjOccPoint 调用：cur=occ 池当前=60, delta=+10, base=15, otherAlloc=int 池已分 20, remaining=100
    // 99-base-otherAlloc = 99-15-20 = 64. target=70 → 钳到 64.
    expect(clampSkillPointAlloc(60, 10, 15, 20, 100)).toBe(64);
  });

  it('联动场景：已经在上限时再 +1 不动', () => {
    // base=20, otherAlloc=40, cur=39 ⇒ base+cur+other = 99 已经满；再 +1 仍 39。
    expect(clampSkillPointAlloc(39, 1, 20, 40, 100)).toBe(39);
  });

  it('减点：不会减到负数', () => {
    expect(clampSkillPointAlloc(0, -5, 10, 0, 100)).toBe(0);
    expect(clampSkillPointAlloc(3, -10, 10, 0, 100)).toBe(0);
  });

  it('减点：可以正常下移', () => {
    expect(clampSkillPointAlloc(20, -5, 10, 30, 100)).toBe(15);
  });

  it('回归：原来报告的 BUG 场景 — 用户先给兴趣加 50，再切换到职业池又加 50，总和应被联动钳住', () => {
    // 假设基础值=5。
    // 第一次：adjIntPoint(cur=0, delta=50, base=5, otherAlloc=0=占职业池, remaining=100) → 50
    expect(clampSkillPointAlloc(0, 50, 5, 0, 100)).toBe(50);
    // 第二次：adjOccPoint(cur=0, delta=50, base=5, otherAlloc=50=已占兴趣池, remaining=100)
    //   修复前的 BUG：返回 50 → 总 = 5+50+50 = 105 越界
    //   修复后：99 - 5 - 50 = 44 → 返回 44，总 = 5+50+44 = 99 ✓
    expect(clampSkillPointAlloc(0, 50, 5, 50, 100)).toBe(44);
  });

  it('OtherAlloc 已经超过 99-base 时返回 0（异常自愈，永不负数）', () => {
    // 99 - 5 - 100 = -6 → max(0, -6) = 0
    expect(clampSkillPointAlloc(0, 50, 5, 100, 100)).toBe(0);
  });
});
