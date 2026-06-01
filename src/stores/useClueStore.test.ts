import { describe, it, expect, beforeEach } from 'vitest';
import { useClueStore } from './useClueStore';

describe('线索演化与注入', () => {
  beforeEach(() => { useClueStore.getState().clearAll(); });

  it('普通新增的线索默认 active', () => {
    useClueStore.getState().addClues([{ name: '血迹', summary: '门后有血迹' }]);
    const c = useClueStore.getState().clues[0];
    expect(c.status === 'archived').toBe(false);
    expect(c.tier).toBe('normal');
  });

  it('evolvesFrom 归档旧线索并上位新线索（major+链接）', () => {
    const store = useClueStore.getState();
    store.addClues([{ name: '模糊的脚印', summary: '走廊有脚印' }]);
    store.addClues([{ name: '凶手的足迹', summary: '脚印指向地窖', evolvesFrom: '模糊的脚印' }]);
    const clues = useClueStore.getState().clues;
    const oldC = clues.find((c) => c.name === '模糊的脚印')!;
    const newC = clues.find((c) => c.name === '凶手的足迹')!;
    expect(oldC.status).toBe('archived');
    expect(oldC.evolvedIntoId).toBe(newC.id);
    expect(newC.status).toBe('active');
    expect(newC.tier).toBe('major');
    expect(newC.evolvedFrom).toBe(oldC.id);
  });

  it('evolvesFrom 找不到旧线索时退化为普通新增', () => {
    useClueStore.getState().addClues([{ name: '新线索', summary: 'x', evolvesFrom: '不存在的线索' }]);
    const c = useClueStore.getState().clues[0];
    expect(c.status).toBe('active');
    expect(c.evolvedFrom).toBeUndefined();
  });

  it('注入仅含 active 线索；major 加★', () => {
    const store = useClueStore.getState();
    store.addClues([{ name: 'A', summary: 'aa' }]);
    store.addClues([{ name: 'B', summary: 'bb', evolvesFrom: 'A' }]);
    const inj = store.buildContextInjection();
    expect(inj).toContain('★B：bb');
    expect(inj).not.toContain('A：aa');
  });

  it('active 线索超过上限时截断并标注', () => {
    const store = useClueStore.getState();
    // 用等长零填充名（线索01..线索18）：彼此互不为子串，避免 findActiveByName 模糊匹配误并
    for (let i = 1; i <= 18; i++) store.addClues([{ name: `线索${String(i).padStart(2, '0')}`, summary: `s${i}` }]);
    const inj = store.buildContextInjection();
    expect(inj).toContain('线索18：s18');
    expect(inj).toContain('更早线索见线索库');
    expect(inj).not.toContain('线索01：s1');
  });

  it('缺 status 的老数据按 active 处理（迁移）', () => {
    useClueStore.getState().replaceAll([
      { id: 'x', name: '旧档线索', summary: 's', discoveryNarrative: '', acquiredAt: 1 },
    ]);
    expect(useClueStore.getState().buildContextInjection()).toContain('旧档线索：s');
  });
});
