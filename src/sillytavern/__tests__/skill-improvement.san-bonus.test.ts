import { describe, it, expect } from 'vitest';
import {
  buildDevelopmentRows,
  buildDevelopmentOps,
  crossed90Threshold,
} from '../skill-improvement';

// ============================================================
// A3.5 — 跨越 90% 时一次性 +2D6 SAN 奖励的精确语义。
// ----------------------------------------------------------
// 行覆盖（A3.4 已含一些跨越测试，这里聚焦：non-cross / cross / exact-90 / max-cap-and-still-cross）
// ============================================================

describe('A3.5 — 跨越 90% 才给 SAN bonus', () => {
  it('未跨越的行：sanBonus 字段缺失（不是 0）', () => {
    const skills = { 侦查: { current: 40, ticked: true } };
    const rows = buildDevelopmentRows(skills, () => 0.5);
    expect(rows[0].crossed90).toBe(false);
    expect(rows[0].sanBonus).toBeUndefined();
  });

  it('未提升但 before≥90 的行：不发 SAN（before=before）', () => {
    // current=95, rng=()=>0.05 → d100=6, 不提升, after=before=95；before已≥90 → crossed=false
    const skills = { 神秘学: { current: 95, ticked: true } };
    const rows = buildDevelopmentRows(skills, () => 0.05);
    expect(rows[0].improved).toBe(false);
    expect(rows[0].crossed90).toBe(false);
    expect(rows[0].sanBonus).toBeUndefined();
  });

  it('跨越 90% 的行：sanBonus 来自 roll2d6，跟在 d100/d10 之后消费 rng', () => {
    // before=88, d100=99 (rng=0.985), d10=5 (rng=0.45) → after=93 cross
    //  2d6: rng=0.4 → 4 ; rng=0.6 → 5（注意 floor(0.6*6)+1 = 4？ → floor(3.6)+1 = 4）
    // floor(0.6*6) = floor(3.6) = 3 ; +1 = 4. 所以 sanBonus = 4+4 = 8 (?) — 实际计算
    // floor(0.4*6) = floor(2.4) = 2 ; +1 = 3
    // floor(0.6*6) = 3 ; +1 = 4
    // sanBonus = 3+4 = 7
    const seq = [0.985, 0.45, 0.4, 0.6];
    let i = 0;
    const skills = { 神秘学: { current: 88, ticked: true } };
    const rows = buildDevelopmentRows(skills, () => seq[i++]);
    expect(rows[0].crossed90).toBe(true);
    expect(rows[0].sanBonus).toBe(7);
  });

  it('恰好 89→90 边界跨越：发 SAN', () => {
    // before=89, d100=100 (rng=0.999), d10=1 (rng=0.05) → after=90 cross
    // 2d6: 0.0 → 1+1=2
    const seq = [0.999, 0.05, 0.0, 0.0];
    let i = 0;
    const skills = { 历史: { current: 89, ticked: true } };
    const rows = buildDevelopmentRows(skills, () => seq[i++]);
    expect(rows[0].before).toBe(89);
    expect(rows[0].after).toBe(90);
    expect(rows[0].crossed90).toBe(true);
    expect(rows[0].sanBonus).toBe(2);
  });

  it('crossed90Threshold 跨越判定独立可测', () => {
    expect(crossed90Threshold(89, 90)).toBe(true);
    expect(crossed90Threshold(85, 91)).toBe(true);
    expect(crossed90Threshold(90, 95)).toBe(false);
    expect(crossed90Threshold(95, 99)).toBe(false);
    expect(crossed90Threshold(40, 50)).toBe(false);
  });

  it('buildDevelopmentOps：crossed 行恰好一条 delta /调查员/理智值/当前', () => {
    const rows = [
      { name: '神秘学', before: 88, after: 93, d100: 99, d10: 5, improved: true, crossed90: true, sanBonus: 7 },
      { name: '侦查', before: 40, after: 46, d100: 51, d10: 6, improved: true, crossed90: false },
    ];
    const ops = buildDevelopmentOps(rows);
    const sanOps = ops.filter((o) => o.path === '/调查员/理智值/当前');
    expect(sanOps).toHaveLength(1);
    expect(sanOps[0]).toEqual({ op: 'delta', path: '/调查员/理智值/当前', value: 7 });
  });

  it('多技能同时跨越 90% → 多条 SAN delta（每跨越一项发一条）', () => {
    const rows = [
      { name: '神秘学', before: 88, after: 93, d100: 99, d10: 5, improved: true, crossed90: true, sanBonus: 5 },
      { name: '历史', before: 89, after: 90, d100: 100, d10: 1, improved: true, crossed90: true, sanBonus: 8 },
    ];
    const ops = buildDevelopmentOps(rows);
    const sanOps = ops.filter((o) => o.path === '/调查员/理智值/当前');
    expect(sanOps).toHaveLength(2);
    expect(sanOps.map((o) => o.value)).toEqual([5, 8]);
  });

  it('sanBonus=0 边界（理论不会，2d6 最小=2）：仍 ops 含 delta(>0)；写 0 时跳过', () => {
    // 直接构造 sanBonus=0 行，验证 buildDevelopmentOps 不发 SAN delta（防呆）。
    const rows = [
      { name: '神秘学', before: 88, after: 90, d100: 99, d10: 2, improved: true, crossed90: true, sanBonus: 0 as any },
    ];
    const ops = buildDevelopmentOps(rows);
    const sanOps = ops.filter((o) => o.path === '/调查员/理智值/当前');
    expect(sanOps).toHaveLength(0);
  });
});
