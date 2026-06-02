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

  it('synthesized 输入：标为推理线索、tier=major', () => {
    useClueStore.getState().addClues([{ name: '推理：教团的真正目标', summary: '诸多线索指向献祭仪式', tags: ['推理'], synthesized: true }]);
    const c = useClueStore.getState().clues[0];
    expect(c.synthesized).toBe(true);
    expect(c.tier).toBe('major');
    expect(c.tags).toContain('推理');
  });

  it('普通线索不带 synthesized 标记', () => {
    useClueStore.getState().addClues([{ name: '血迹', summary: '门后有血迹' }]);
    expect(useClueStore.getState().clues[0].synthesized).toBeUndefined();
  });

  it('synthesized 线索不被既有线索的宽松包含匹配吞并（新增而非合并）', () => {
    const store = useClueStore.getState();
    store.addClues([{ name: '教团', summary: '城里有个教团' }]); // 普通线索
    // 「推理：教团的真正目标」.includes('教团') 会让宽松匹配误判为更新 → 旧 bug 看不到新增
    store.addClues([{ name: '推理：教团的真正目标', summary: '诸多线索指向献祭', synthesized: true, tags: ['推理'] }]);
    const active = useClueStore.getState().clues.filter((c) => c.status !== 'archived');
    expect(active).toHaveLength(2); // 两条独立线索，未被合并
    const syn = active.find((c) => c.name === '推理：教团的真正目标')!;
    expect(syn).toBeDefined();
    expect(syn.synthesized).toBe(true);
    expect(syn.tier).toBe('major');
    expect(active.find((c) => c.name === '教团')!.synthesized).toBeUndefined(); // 原线索未被污染
  });

  it('同名 synthesized 线索再次整合时按精确名合并（不重复堆叠）', () => {
    const store = useClueStore.getState();
    store.addClues([{ name: '推理：真凶', summary: 'v1', synthesized: true, tags: ['推理'] }]);
    store.addClues([{ name: '推理：真凶', summary: 'v2', discoveryNarrative: '补充', synthesized: true, tags: ['推理'] }]);
    const active = useClueStore.getState().clues.filter((c) => c.status !== 'archived');
    expect(active).toHaveLength(1);
    expect(active[0].tier).toBe('major');
  });

  it('consolidateClues 归并：原 active 线索全部归档可回溯，活跃区只剩 1-3 条合成总结', () => {
    const store = useClueStore.getState();
    store.addClues([{ name: 'A', summary: 'a' }, { name: 'B', summary: 'b' }, { name: 'C', summary: 'c' }]);
    store.consolidateClues([{ name: '总结：核心指向', summary: '三条都指向献祭', tags: ['推理'] }]);
    const all = useClueStore.getState().clues;
    const active = all.filter((c) => c.status !== 'archived');
    const archived = all.filter((c) => c.status === 'archived');
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('总结：核心指向');
    expect(active[0].synthesized).toBe(true);
    expect(active[0].tier).toBe('major');
    expect(active[0].tags).toContain('推理');
    expect(archived.map((c) => c.name).sort()).toEqual(['A', 'B', 'C']); // 原线索归档保留可回溯
  });

  it('consolidateClues 连续归并：上轮总结也会被归档，由更新的总结取代', () => {
    const store = useClueStore.getState();
    store.addClues([{ name: 'A', summary: 'a' }, { name: 'B', summary: 'b' }]);
    store.consolidateClues([{ name: '总结一', summary: 's1', tags: ['推理'] }]);
    store.consolidateClues([{ name: '总结二', summary: 's2', tags: ['推理'] }]);
    const active = useClueStore.getState().clues.filter((c) => c.status !== 'archived');
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('总结二');
  });

  it('consolidateClues 带 archiveIds 时只归档指定 id（往返期间新线索不被误档）', () => {
    const store = useClueStore.getState();
    store.addClues([{ name: 'A', summary: 'a' }, { name: 'B', summary: 'b' }]);
    const snapshotIds = useClueStore.getState().clues.map((c) => c.id);
    store.addClues([{ name: 'C', summary: 'c' }]); // 模拟归并往返期间新发现
    store.consolidateClues([{ name: '总结', summary: 's', tags: ['推理'] }], snapshotIds);
    const active = useClueStore.getState().clues.filter((c) => c.status !== 'archived');
    expect(active.map((c) => c.name).sort()).toEqual(['C', '总结']); // C 未被误档
  });
});
