import { describe, it, expect } from 'vitest';
import type { DiceRecord } from '../../../types';

// ============================================================
// A1.6 — DiceRecordsExpander 徽章渲染条件
//
// node env 无 jsdom, 不能 render DiceRecordsExpander DOM. 故抽象出渲染该徽章的
// 「pure 判定」: 一条 record 应不应该带 [推] / [幸-N] 徽章.
//
// 同步 CombatPanel.tsx 里 DiceRecordsExpander 的 inline 判定:
//   - pushed === true → 显示 [推]
//   - typeof luckSpent === 'number' && luckSpent > 0 → 显示 [幸-N]
//
// 同时验证类型上 pushed/luckSpent 都是 optional——老记录(无这俩字段)不会触发徽章.
// ============================================================

function shouldShowPushBadge(r: Pick<DiceRecord, 'pushed'>): boolean {
  return r.pushed === true;
}

function shouldShowLuckBadge(r: Pick<DiceRecord, 'luckSpent'>): boolean {
  return typeof r.luckSpent === 'number' && r.luckSpent > 0;
}

function luckBadgeText(r: Pick<DiceRecord, 'luckSpent'>): string {
  return shouldShowLuckBadge(r) ? `幸-${r.luckSpent}` : '';
}

describe('A1.6 DiceRecordsExpander 徽章判定', () => {
  it('test 1 — pushed=true 的 record 触发 [推] 徽章', () => {
    const r: DiceRecord = {
      skill: '图书馆使用', roll: '11', target: '30', type: 'hard-success',
      time: Date.now(), pushed: true, pushReason: '再翻一遍',
      pushedFrom: { roll: 55, type: 'failure' },
    };
    expect(shouldShowPushBadge(r)).toBe(true);
    expect(shouldShowLuckBadge(r)).toBe(false); // 没有 luckSpent
  });

  it('test 2 — luckSpent>0 的 record 触发 [幸-N] 徽章, N 与 luckSpent 一致', () => {
    const r: DiceRecord = {
      skill: '侦查', roll: '60', target: '60', type: 'success',
      time: Date.now(), luckSpent: 5, growthTickEligible: false,
    };
    expect(shouldShowLuckBadge(r)).toBe(true);
    expect(luckBadgeText(r)).toBe('幸-5');
    expect(shouldShowPushBadge(r)).toBe(false);
  });

  it('test 3 — 老 record (无 pushed/luckSpent) 不触发任何徽章', () => {
    const r: DiceRecord = {
      skill: '侦查', roll: '42', target: '60', type: 'success',
      time: Date.now(),
    };
    expect(shouldShowPushBadge(r)).toBe(false);
    expect(shouldShowLuckBadge(r)).toBe(false);
  });

  it('test 4 — luckSpent=0 不触发 [幸-N] (与 commitWithLuck(0) 短路一致, 不污染视觉)', () => {
    const r: DiceRecord = {
      skill: '侦查', roll: '50', target: '60', type: 'success',
      time: Date.now(), luckSpent: 0,
    };
    expect(shouldShowLuckBadge(r)).toBe(false);
  });
});
