/**
 * A2.7 — deriveStateChips 纯函数测试。覆盖姿态/三态疯狂/状态条件的 chip 生成与顺序。
 */
import { describe, it, expect } from 'vitest';
import { deriveStateChips } from '../state-chips-data';

describe('deriveStateChips', () => {
  it('空 input(无姿态、无条件、无疯狂) → 空数组', () => {
    const chips = deriveStateChips({ posture: '', conditions: [] });
    expect(chips).toEqual([]);
  });

  it('posture="站立" 不出 chip;非"站立"的姿态(如"伏地")才出', () => {
    expect(deriveStateChips({ posture: '站立', conditions: [] })).toEqual([]);
    const chips = deriveStateChips({ posture: '伏地', conditions: [] });
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ key: 'posture', label: '伏地', color: 'var(--gold-bright)' });
  });

  it('三态疯狂各自出对应颜色的 chip', () => {
    const ti = deriveStateChips({
      posture: '站立', conditions: [],
      temporaryInsanity: { active: true },
    });
    expect(ti.find((c) => c.key === 'ti')).toMatchObject({ label: '临时疯狂', color: 'var(--blood)' });

    const ii = deriveStateChips({
      posture: '站立', conditions: [],
      indefiniteInsanity: { active: true },
    });
    expect(ii.find((c) => c.key === 'ii')).toMatchObject({ label: '不定性疯狂', color: '#a978d6' });

    const pi = deriveStateChips({
      posture: '站立', conditions: [],
      permanentInsanity: true,
    });
    expect(pi.find((c) => c.key === 'pi')).toMatchObject({ label: '永久疯狂', color: '#7a1f1f' });
  });

  it('active=false / undefined / permanentInsanity=false 都不出 chip', () => {
    const out = deriveStateChips({
      posture: '站立', conditions: [],
      temporaryInsanity: { active: false },
      indefiniteInsanity: undefined,
      permanentInsanity: false,
    });
    expect(out).toEqual([]);
  });

  it('状态条件按 severity 着色,缺失/未识别走 moderate 兜底', () => {
    const chips = deriveStateChips({
      posture: '站立',
      conditions: [
        { name: '骨折', severity: 'severe', description: '右臂骨折' },
        { name: '迷茫', severity: 'unknown', description: '失神' },
      ],
    });
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ key: 'c0', label: '骨折', color: '#d88a4a', title: '右臂骨折' });
    expect(chips[1]).toMatchObject({ key: 'c1', label: '迷茫', color: 'var(--gold)' });
  });

  it('chip 输出顺序固定:posture → ti → ii → pi → conditions', () => {
    const chips = deriveStateChips({
      posture: '伏地',
      conditions: [{ name: '中毒', severity: 'critical', description: '剧毒' }],
      temporaryInsanity: { active: true },
      indefiniteInsanity: { active: true },
      permanentInsanity: true,
    });
    expect(chips.map((c) => c.key)).toEqual(['posture', 'ti', 'ii', 'pi', 'c0']);
  });
});
