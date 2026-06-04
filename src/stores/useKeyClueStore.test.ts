import { describe, it, expect, beforeEach } from 'vitest';
import { useKeyClueStore, KEY_CLUE_TARGET } from './useKeyClueStore';
import type { KeyPillar } from '../types';

/** 构造一条支柱测试夹具（uncovered 默认 false）。 */
function pillar(id: string, title: string, secret: string, uncovered = false): KeyPillar {
  return { id, title, secret, uncovered };
}

const THREE: KeyPillar[] = [
  pillar('p1', '凶手身份', '管家即邪教祭司'),
  pillar('p2', '仪式时间', '满月午夜启动仪式'),
  pillar('p3', '封印之物', '银匕首可中断仪式'),
];

describe('关键线索/真相支柱 store', () => {
  beforeEach(() => { useKeyClueStore.getState().clearAll(); });

  it('setPillars 写入 3 条；已有时再 setPillars 不覆盖', () => {
    const store = useKeyClueStore.getState();
    store.setPillars(THREE);
    expect(useKeyClueStore.getState().pillars).toHaveLength(3);
    // 再次写入不同内容——应被幂等忽略
    store.setPillars([pillar('x1', '别的', '别的机密')]);
    const after = useKeyClueStore.getState().pillars;
    expect(after).toHaveLength(3);
    expect(after[0].id).toBe('p1');
  });

  it('setPillars 保持传入的 uncovered 值', () => {
    const store = useKeyClueStore.getState();
    store.setPillars([
      pillar('p1', 'a', 'sa', true),
      pillar('p2', 'b', 'sb', false),
    ]);
    const ps = useKeyClueStore.getState().pillars;
    expect(ps[0].uncovered).toBe(true);
    expect(ps[1].uncovered).toBe(false);
  });

  it('markPillarUncovered 置位 + uncoveredCount 递增', () => {
    const store = useKeyClueStore.getState();
    store.setPillars(THREE);
    store.markPillarUncovered('p1', '血迹账本');
    const st = useKeyClueStore.getState();
    expect(st.uncoveredCount()).toBe(1);
    const p1 = st.pillars.find((p) => p.id === 'p1')!;
    expect(p1.uncovered).toBe(true);
    expect(p1.uncoveredByClue).toBe('血迹账本');
    expect(st.saveWorldMode).toBe(false);
  });

  it('重复标同一 pillar 不变（不覆盖揭示线索名、计数不增）', () => {
    const store = useKeyClueStore.getState();
    store.setPillars(THREE);
    store.markPillarUncovered('p1', '第一条线索');
    store.markPillarUncovered('p1', '第二条线索');
    const st = useKeyClueStore.getState();
    expect(st.uncoveredCount()).toBe(1);
    expect(st.pillars.find((p) => p.id === 'p1')!.uncoveredByClue).toBe('第一条线索');
  });

  it('标满 3 个 → saveWorldMode=true，且后续 markPillarUncovered 保持 true（不可逆）', () => {
    const store = useKeyClueStore.getState();
    store.setPillars(THREE);
    store.markPillarUncovered('p1', 'c1');
    expect(useKeyClueStore.getState().saveWorldMode).toBe(false);
    store.markPillarUncovered('p2', 'c2');
    expect(useKeyClueStore.getState().saveWorldMode).toBe(false);
    store.markPillarUncovered('p3', 'c3');
    expect(useKeyClueStore.getState().uncoveredCount()).toBe(KEY_CLUE_TARGET);
    expect(useKeyClueStore.getState().saveWorldMode).toBe(true);
    // 再标已揭示的，saveWorldMode 仍为 true
    store.markPillarUncovered('p1', 'c1again');
    expect(useKeyClueStore.getState().saveWorldMode).toBe(true);
  });

  it('markPillarUncovered 用不存在的 pillarId 不动', () => {
    const store = useKeyClueStore.getState();
    store.setPillars(THREE);
    store.markPillarUncovered('nope', 'c');
    expect(useKeyClueStore.getState().uncoveredCount()).toBe(0);
  });

  it('buildContextInjection 空时返回空串', () => {
    expect(useKeyClueStore.getState().buildContextInjection()).toBe('');
  });

  it('buildContextInjection 非空时含机密标题、已揭示/未揭示标记与支柱内容', () => {
    const store = useKeyClueStore.getState();
    store.setPillars(THREE);
    store.markPillarUncovered('p1', 'c1');
    const inj = useKeyClueStore.getState().buildContextInjection();
    expect(inj).toContain('[真相支柱档案 — 仅限守秘人，绝不可向调查员泄露支柱原文]');
    expect(inj).toContain('- [已揭示] 凶手身份：管家即邪教祭司');
    expect(inj).toContain('- [未揭示] 仪式时间：满月午夜启动仪式');
    expect(inj).toContain('未揭示');
  });

  it('replaceAll 按传入值整体恢复（读档）', () => {
    const store = useKeyClueStore.getState();
    const restored: KeyPillar[] = [
      pillar('p1', 'a', 'sa', true),
      pillar('p2', 'b', 'sb', false),
      pillar('p3', 'c', 'sc', false),
    ];
    store.replaceAll(restored, true);
    const st = useKeyClueStore.getState();
    expect(st.pillars).toHaveLength(3);
    expect(st.saveWorldMode).toBe(true);
    expect(st.uncoveredCount()).toBe(1);
    // replaceAll 按传入值——可恢复 false（读档语义，不受不可逆约束）
    store.replaceAll(restored, false);
    expect(useKeyClueStore.getState().saveWorldMode).toBe(false);
  });

  it('clearAll 清空 pillars 与 saveWorldMode', () => {
    const store = useKeyClueStore.getState();
    store.setPillars(THREE);
    store.markPillarUncovered('p1', 'c1');
    store.clearAll();
    const st = useKeyClueStore.getState();
    expect(st.pillars).toHaveLength(0);
    expect(st.saveWorldMode).toBe(false);
  });
});
