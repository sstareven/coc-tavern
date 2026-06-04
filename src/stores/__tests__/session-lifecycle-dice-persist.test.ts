import { describe, it, expect, beforeEach } from 'vitest';
import { useDiceStore } from '../useDiceStore';
import type { BookPage, DiceRecord } from '../../types';

// ============================================================
// A1.6 — 会话生命周期 → DiceRecord 扩展字段持久化回归
//
// sessionLifecycle.loadConversation 的检定历史重建路径:
//   pages.flatMap((p, i) => (p.diceResults ?? []).map(r => ({...r, page: r.page ?? i+1}))).reverse()
//   → useDiceStore.setHistory(...)
//
// setHistory 内部 records.slice(0,20) — 整对象保留, 不挑字段, 故 A1.1 新增的
// pushed / luckSpent / pushReason / pushedFrom / growthTickEligible 应自然存活.
// 本测固定该不变量, 防止后续重构(投影/挑字段)悄悄丢字段.
// ============================================================

describe('A1.6 session 加载 → setHistory 保留 DiceRecord 扩展字段', () => {
  beforeEach(() => {
    useDiceStore.setState({
      isOpen: false, history: [], pending: [],
      tens: 0, ones: 0, finalTens: 0, bonusTens: 0, oppTens: 0, oppOnes: 0,
      originalRoll: 0, finalRoll: 0, resultType: null,
      target: 60, bonusDice: 0, sanCheck: false, mode: 'check',
      isProgrammatic: false, programmaticSkill: undefined,
      programmaticContext: undefined, onProgrammaticResolve: undefined,
      isStaged: false, lastRollContext: null,
    } as any);
  });

  it('test 1 — setHistory 整对象保留 pushed/luckSpent/pushReason/pushedFrom/growthTickEligible', () => {
    const records: DiceRecord[] = [
      {
        skill: '侦查', roll: '60', target: '60', type: 'success',
        time: 1, page: 3,
        luckSpent: 5, growthTickEligible: false,
      },
      {
        skill: '图书馆使用', roll: '11', target: '30', type: 'hard-success',
        time: 2, page: 4,
        pushed: true, pushReason: '再翻一遍',
        pushedFrom: { roll: 55, type: 'failure' },
      },
    ];
    useDiceStore.getState().setHistory(records);

    const out = useDiceStore.getState().history;
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      skill: '侦查', luckSpent: 5, growthTickEligible: false,
    });
    expect(out[1]).toMatchObject({
      skill: '图书馆使用', pushed: true, pushReason: '再翻一遍',
      pushedFrom: { roll: 55, type: 'failure' },
    });
  });

  it('test 2 — BookPage.diceResults → setHistory roundtrip 保留新字段 (复刻 loadConversation 重建路径)', () => {
    // Mock 一个含两页 diceResults 的存档, 模拟 sessionLifecycle 的 flatMap 重建
    const pages: BookPage[] = [
      {
        id: 'p1', leftHeader: '', leftContent: '', rightHeader: '', rightContent: '', rightChoices: [],
        diceResults: [
          { skill: '侦查', roll: '42', target: '60', type: 'success', time: 100 }, // 老记录
          { skill: '侦查', roll: '60', target: '60', type: 'success', time: 101, luckSpent: 5, growthTickEligible: false },
        ],
      } as BookPage,
      {
        id: 'p2', leftHeader: '', leftContent: '', rightHeader: '', rightContent: '', rightChoices: [],
        diceResults: [
          { skill: '图书馆使用', roll: '11', target: '30', type: 'hard-success', time: 200,
            pushed: true, pushReason: '再翻一遍', pushedFrom: { roll: 55, type: 'failure' } },
        ],
      } as BookPage,
    ];

    // 复刻 sessionLifecycle loadConversation lines 332-336 的路径:
    const rebuilt = pages
      .flatMap((p, i) => (p.diceResults ?? []).map((r) => ({ ...r, page: r.page ?? i + 1 })))
      .reverse();
    useDiceStore.getState().setHistory(rebuilt);

    const hist = useDiceStore.getState().history;
    expect(hist).toHaveLength(3);
    // newest-first: p2 的推骰记录在最前
    expect(hist[0]).toMatchObject({
      skill: '图书馆使用', pushed: true, pushReason: '再翻一遍',
      pushedFrom: { roll: 55, type: 'failure' },
      page: 2, // 老记录无 page 字段, 由重建路径按 index+1 补
    });
    expect(hist[1]).toMatchObject({ skill: '侦查', luckSpent: 5, growthTickEligible: false, page: 1 });
    expect(hist[2]).toMatchObject({ skill: '侦查', roll: '42', page: 1 });
    // 老记录无新字段
    expect(hist[2].pushed).toBeUndefined();
    expect(hist[2].luckSpent).toBeUndefined();
  });

  it('test 3 — setHistory 同步清空 staging (lastRollContext + isStaged), 避免读档残留', () => {
    useDiceStore.setState({ isStaged: true, lastRollContext: { skill: '残留', target: 60, page: 1, originalRoll: 50, originalResult: 'success', sanCheck: false, mode: 'check', tens: 5, ones: 0, finalTens: 5, bonusTens: 0, oppTens: 0, oppOnes: 0 } } as any);

    useDiceStore.getState().setHistory([]);

    const s = useDiceStore.getState();
    expect(s.isStaged).toBe(false);
    expect(s.lastRollContext).toBeNull();
  });

  it('test 4 — setHistory 在 records>20 时裁到前 20 条, 但裁前的对象保留全字段 (不挑/不丢扩展字段)', () => {
    const records: DiceRecord[] = Array.from({ length: 25 }, (_, i) => ({
      skill: `S${i}`, roll: '00', target: '60', type: 'success', time: i,
      pushed: i === 0 ? true : undefined,
      luckSpent: i === 1 ? 7 : undefined,
    }));
    useDiceStore.getState().setHistory(records);
    const out = useDiceStore.getState().history;
    expect(out).toHaveLength(20);
    // 前两条全字段保留
    expect(out[0].pushed).toBe(true);
    expect(out[1].luckSpent).toBe(7);
  });
});
