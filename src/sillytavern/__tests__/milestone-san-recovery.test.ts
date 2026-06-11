/**
 * C2 — milestone-san-recovery 单元测试
 *
 * 覆盖:
 *  - 纯函数 detectNewlyReachedNodes: 节点覆盖检测
 *  - 纯函数 rollMilestoneSanRecovery: 1D6 掷骰 + cap
 *  - evaluator 集成: 通过 useAnchorStore/useBookStore 驱动完整链路
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectNewlyReachedNodes,
  rollMilestoneSanRecovery,
} from '../milestone-san-engine';
import {
  milestoneSanEvaluator,
  _resetMilestoneSanCacheForTest,
} from '../milestone-san-evaluator';
import {
  clearEvaluatorsForTest,
  registerEvaluator,
  runPostSettleEvaluators,
  type EvaluatorContext,
} from '../post-settle-evaluators';
import { useCharSheetStore, migrateSheet } from '../../stores/useCharSheetStore';
import { useVariableStore } from '../../stores/useVariableStore';
import { useAnchorStore } from '../../stores/useAnchorStore';
import { useBookStore } from '../../stores/useBookStore';
import { useNarrationStore } from '../../stores/useNarrationStore';
import type { AnchorNode, CharacterSheet } from '../../types';

// ── 工具函数 ──

function baseSheet(over: Partial<CharacterSheet> = {}): CharacterSheet {
  return migrateSheet({
    identity: { name: '田中', occupation: '记者', age: 30, gender: '男', birthplace: '', residence: '', id: '' },
    characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 70, EDU: 50 },
    secondary: {
      hp: { current: 12, max: 12 }, san: { current: 50, max: 80 }, mp: { current: 10, max: 10 },
      luck: 50, mov: 8, db: '0', build: 0,
    },
    dailySanLoss: 0,
    ...over,
  });
}

function ctx(over: Partial<EvaluatorContext> = {}): EvaluatorContext {
  return {
    sheet: useCharSheetStore.getState().sheet,
    statData: useVariableStore.getState().statData,
    patchReport: { applied: 0, failed: [] },
    applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    ...over,
  };
}

const NODES: AnchorNode[] = [
  { id: 'n1', title: '抵达极地死城', description: '调查员到达极地入口' },
  { id: 'n2', title: '发现古代壁画', description: '在废墟深处找到壁画' },
  { id: 'n3', title: '封印邪神', description: '完成最终封印仪式' },
];

// ── setup ──

beforeEach(() => {
  clearEvaluatorsForTest();
  _resetMilestoneSanCacheForTest();
  useVariableStore.getState().clearAll();
  useCharSheetStore.getState().setSheet(baseSheet());
  useAnchorStore.getState().clearAll();
  useBookStore.getState().setPages([]);
  useNarrationStore.getState().clearPending();
});

// ══════════════════════════════════════════════
//  detectNewlyReachedNodes 纯函数
// ══════════════════════════════════════════════

describe('detectNewlyReachedNodes', () => {
  it('summaries 涵盖节点 title → 返回该节点 id', () => {
    const ids = detectNewlyReachedNodes(
      NODES,
      ['调查员一行人终于抵达极地死城，寒风呼啸。'],
      new Set(),
    );
    expect(ids).toEqual(['n1']);
  });

  it('多个节点同时覆盖 → 全部返回', () => {
    const ids = detectNewlyReachedNodes(
      NODES,
      ['抵达极地死城后，发现古代壁画上有奇异符文。'],
      new Set(),
    );
    expect(ids).toEqual(['n1', 'n2']);
  });

  it('已奖励节点不重复返回', () => {
    const ids = detectNewlyReachedNodes(
      NODES,
      ['抵达极地死城后，发现古代壁画上有奇异符文。'],
      new Set(['n1']),
    );
    expect(ids).toEqual(['n2']);
  });

  it('summaries 不含任何节点 title → 空', () => {
    const ids = detectNewlyReachedNodes(
      NODES,
      ['调查员在酒吧喝了一杯咖啡。'],
      new Set(),
    );
    expect(ids).toEqual([]);
  });

  it('nodes 空 → 空', () => {
    expect(detectNewlyReachedNodes([], ['some summary'], new Set())).toEqual([]);
  });

  it('summaries 空 → 空', () => {
    expect(detectNewlyReachedNodes(NODES, [], new Set())).toEqual([]);
  });
});

// ══════════════════════════════════════════════
//  rollMilestoneSanRecovery 纯函数
// ══════════════════════════════════════════════

describe('rollMilestoneSanRecovery', () => {
  it('正常掷骰恢复 1D6', () => {
    // rng returns 0.5 → Math.floor(0.5*6)+1 = 4
    const r = rollMilestoneSanRecovery('n1', 50, 80, () => 0.5);
    expect(r.roll).toBe(4);
    expect(r.recovered).toBe(4);
    expect(r.nodeId).toBe('n1');
  });

  it('SAN cap: 恢复不超过 sanMax - currentSan', () => {
    // rng returns 0.99 → Math.floor(0.99*6)+1 = 6, but only 2 room
    const r = rollMilestoneSanRecovery('n2', 78, 80, () => 0.99);
    expect(r.roll).toBe(6);
    expect(r.recovered).toBe(2); // min(6, 80-78)
  });

  it('SAN 已满 → recovered=0, roll=0', () => {
    const r = rollMilestoneSanRecovery('n1', 80, 80);
    expect(r.recovered).toBe(0);
    expect(r.roll).toBe(0);
  });

  it('1D6 最小值=1', () => {
    const r = rollMilestoneSanRecovery('n1', 50, 80, () => 0);
    expect(r.roll).toBe(1);
    expect(r.recovered).toBe(1);
  });

  it('1D6 最大值=6', () => {
    const r = rollMilestoneSanRecovery('n1', 50, 80, () => 0.999);
    expect(r.roll).toBe(6);
    expect(r.recovered).toBe(6);
  });
});

// ══════════════════════════════════════════════
//  milestoneSanEvaluator 集成
// ══════════════════════════════════════════════

describe('milestoneSanEvaluator — 集成', () => {
  it('节点被 summaries 覆盖 → SAN 恢复 + 旁白通知', () => {
    // 设 anchor nodes
    useAnchorStore.getState().replaceAll({
      nodes: NODES,
      constraints: [],
      threatDependencies: [],
    });
    // 设 pages with summaries covering node n1
    useBookStore.getState().setPages([
      {
        leftHeader: '', leftContent: '', leftPage: '', rightPage: '',
        rightHeader: '', rightContent: '', rightChoices: [],
        summary: '调查员一行抵达极地死城，目睹了残垣断壁。',
      } as any,
    ]);

    const sanBefore = useCharSheetStore.getState().sheet.secondary.san.current;
    expect(sanBefore).toBe(50);

    milestoneSanEvaluator(ctx());

    const sanAfter = useCharSheetStore.getState().sheet.secondary.san.current;
    expect(sanAfter).toBeGreaterThan(sanBefore);
    expect(sanAfter).toBeLessThanOrEqual(sanBefore + 6); // 1D6
    expect(sanAfter).toBeLessThanOrEqual(80); // sanMax

    // 旁白
    const pending = useNarrationStore.getState().pending;
    expect(pending.length).toBe(1);
    expect(pending[0]).toContain('抵达极地死城');
    expect(pending[0]).toContain('理智');
  });

  it('无节点完成 → 无恢复、无旁白', () => {
    useAnchorStore.getState().replaceAll({
      nodes: NODES,
      constraints: [],
      threatDependencies: [],
    });
    useBookStore.getState().setPages([
      {
        leftHeader: '', leftContent: '', leftPage: '', rightPage: '',
        rightHeader: '', rightContent: '', rightChoices: [],
        summary: '调查员在酒吧点了一杯啤酒。',
      } as any,
    ]);

    milestoneSanEvaluator(ctx());

    expect(useCharSheetStore.getState().sheet.secondary.san.current).toBe(50);
    expect(useNarrationStore.getState().pending).toEqual([]);
  });

  it('同一节点不重复奖励(幂等)', () => {
    useAnchorStore.getState().replaceAll({
      nodes: NODES,
      constraints: [],
      threatDependencies: [],
    });
    useBookStore.getState().setPages([
      {
        leftHeader: '', leftContent: '', leftPage: '', rightPage: '',
        rightHeader: '', rightContent: '', rightChoices: [],
        summary: '抵达极地死城后探索废墟。',
      } as any,
    ]);

    milestoneSanEvaluator(ctx());
    const sanAfterFirst = useCharSheetStore.getState().sheet.secondary.san.current;

    // 第二次调用: 同一 summary, 不应再加 SAN
    milestoneSanEvaluator(ctx());
    expect(useCharSheetStore.getState().sheet.secondary.san.current).toBe(sanAfterFirst);
    // 旁白也只有一条
    expect(useNarrationStore.getState().pending.length).toBe(1);
  });

  it('SAN 已满 → 标记已奖励但不加 SAN、不发旁白', () => {
    useCharSheetStore.getState().setSheet(baseSheet({
      secondary: {
        hp: { current: 12, max: 12 }, san: { current: 80, max: 80 }, mp: { current: 10, max: 10 },
        luck: 50, mov: 8, db: '0', build: 0,
      },
    }));
    useAnchorStore.getState().replaceAll({
      nodes: NODES,
      constraints: [],
      threatDependencies: [],
    });
    useBookStore.getState().setPages([
      {
        leftHeader: '', leftContent: '', leftPage: '', rightPage: '',
        rightHeader: '', rightContent: '', rightChoices: [],
        summary: '抵达极地死城。',
      } as any,
    ]);

    milestoneSanEvaluator(ctx());

    expect(useCharSheetStore.getState().sheet.secondary.san.current).toBe(80);
    expect(useNarrationStore.getState().pending).toEqual([]);
  });

  it('anchor nodes 为空 → 立即返回', () => {
    milestoneSanEvaluator(ctx());
    expect(useCharSheetStore.getState().sheet.secondary.san.current).toBe(50);
  });

  it('通过 runPostSettleEvaluators 注册流跑通', () => {
    registerEvaluator('milestone-san', milestoneSanEvaluator);
    useAnchorStore.getState().replaceAll({
      nodes: NODES,
      constraints: [],
      threatDependencies: [],
    });
    useBookStore.getState().setPages([
      {
        leftHeader: '', leftContent: '', leftPage: '', rightPage: '',
        rightHeader: '', rightContent: '', rightChoices: [],
        summary: '发现古代壁画上的铭文。',
      } as any,
    ]);

    runPostSettleEvaluators({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport: { applied: 0, failed: [] },
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });

    expect(useCharSheetStore.getState().sheet.secondary.san.current).toBeGreaterThan(50);
  });

  it('SAN 恢复受 sanMax cap', () => {
    // SAN 76/80 → room=4, 即使 roll=6 也只恢复 4
    useCharSheetStore.getState().setSheet(baseSheet({
      secondary: {
        hp: { current: 12, max: 12 }, san: { current: 76, max: 80 }, mp: { current: 10, max: 10 },
        luck: 50, mov: 8, db: '0', build: 0,
      },
    }));
    useAnchorStore.getState().replaceAll({
      nodes: NODES,
      constraints: [],
      threatDependencies: [],
    });
    useBookStore.getState().setPages([
      {
        leftHeader: '', leftContent: '', leftPage: '', rightPage: '',
        rightHeader: '', rightContent: '', rightChoices: [],
        summary: '封印邪神的仪式终于完成了。',
      } as any,
    ]);

    milestoneSanEvaluator(ctx());

    const sanAfter = useCharSheetStore.getState().sheet.secondary.san.current;
    expect(sanAfter).toBeLessThanOrEqual(80);
    expect(sanAfter).toBeGreaterThan(76);
  });

  it('_resetMilestoneSanCacheForTest 清空后允许重新奖励', () => {
    useAnchorStore.getState().replaceAll({
      nodes: NODES,
      constraints: [],
      threatDependencies: [],
    });
    useBookStore.getState().setPages([
      {
        leftHeader: '', leftContent: '', leftPage: '', rightPage: '',
        rightHeader: '', rightContent: '', rightChoices: [],
        summary: '抵达极地死城。',
      } as any,
    ]);

    milestoneSanEvaluator(ctx());
    const sanAfterFirst = useCharSheetStore.getState().sheet.secondary.san.current;

    // 清缓存
    _resetMilestoneSanCacheForTest();
    useNarrationStore.getState().clearPending();

    // 重新运行 — 应该再次奖励
    milestoneSanEvaluator(ctx());
    const sanAfterSecond = useCharSheetStore.getState().sheet.secondary.san.current;
    expect(sanAfterSecond).toBeGreaterThan(sanAfterFirst);
  });
});
