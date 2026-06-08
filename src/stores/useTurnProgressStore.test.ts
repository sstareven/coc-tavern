import { describe, it, expect, beforeEach } from 'vitest';
import { useTurnProgressStore, type Stage } from './useTurnProgressStore';

// 派生逻辑就地复刻 — store 内部用 useShallow 包成 hook,纯函数测试用 inline 重算更省事
function derive(stages: Stage[]) {
  const total = stages.filter((x) => x.status !== 'skipped').length;
  const done = stages.filter((x) => x.status === 'done').length;
  const running = stages.find((x) => x.status === 'running');
  return {
    current: done + (running ? 1 : 0),
    total,
    label: running?.label ?? '',
    subLabel: running?.subLabel,
    isRunning: stages.some((x) => x.status === 'queued' || x.status === 'running'),
  };
}

beforeEach(() => {
  useTurnProgressStore.setState({ stages: [] });
});

describe('useTurnProgressStore', () => {
  describe('beginTurn', () => {
    it('清空旧 stages 并塞入新的,全部 queued', () => {
      useTurnProgressStore.setState({
        stages: [{ id: 'stale', label: 'stale', status: 'done' }],
      });
      useTurnProgressStore.getState().beginTurn([
        { id: 'main', label: '主叙事' },
        { id: 'mvu', label: 'MVU 综合' },
        { id: 'finalize', label: '收尾' },
      ]);
      const stages = useTurnProgressStore.getState().stages;
      expect(stages).toHaveLength(3);
      expect(stages.map((s) => s.id)).toEqual(['main', 'mvu', 'finalize']);
      expect(stages.every((s) => s.status === 'queued')).toBe(true);
    });
  });

  describe('状态流转', () => {
    it('start 把 queued 推到 running', () => {
      useTurnProgressStore.getState().beginTurn([{ id: 'a', label: 'A' }]);
      useTurnProgressStore.getState().start('a');
      expect(useTurnProgressStore.getState().stages[0].status).toBe('running');
    });

    it('finish 把 running 推到 done', () => {
      useTurnProgressStore.getState().beginTurn([{ id: 'a', label: 'A' }]);
      useTurnProgressStore.getState().start('a');
      useTurnProgressStore.getState().finish('a');
      expect(useTurnProgressStore.getState().stages[0].status).toBe('done');
    });

    it('skip 标记为 skipped', () => {
      useTurnProgressStore.getState().beginTurn([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ]);
      useTurnProgressStore.getState().skip('b');
      expect(useTurnProgressStore.getState().stages[1].status).toBe('skipped');
    });
  });

  describe('enqueueAfter', () => {
    it('在指定 id 之后插入', () => {
      useTurnProgressStore.getState().beginTurn([
        { id: 'main', label: '主' },
        { id: 'mvu', label: 'MVU' },
        { id: 'finalize', label: '收尾' },
      ]);
      useTurnProgressStore.getState().enqueueAfter('mvu', { id: 'rewrite', label: '重纠' });
      const ids = useTurnProgressStore.getState().stages.map((s) => s.id);
      expect(ids).toEqual(['main', 'mvu', 'rewrite', 'finalize']);
      const inserted = useTurnProgressStore.getState().stages.find((s) => s.id === 'rewrite');
      expect(inserted?.status).toBe('queued');
    });

    it('找不到 afterId 时追加到末尾', () => {
      useTurnProgressStore.getState().beginTurn([
        { id: 'main', label: '主' },
        { id: 'finalize', label: '收尾' },
      ]);
      useTurnProgressStore.getState().enqueueAfter('nonexistent', { id: 'extra', label: '额外' });
      const ids = useTurnProgressStore.getState().stages.map((s) => s.id);
      expect(ids).toEqual(['main', 'finalize', 'extra']);
    });
  });

  describe('派生计算', () => {
    it('初始空队列:current=0 total=0 isRunning=false label=空', () => {
      const r = derive(useTurnProgressStore.getState().stages);
      expect(r).toEqual({ current: 0, total: 0, label: '', subLabel: undefined, isRunning: false });
    });

    it('全 queued:current=0 total=N isRunning=true label=空', () => {
      useTurnProgressStore.getState().beginTurn([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ]);
      const r = derive(useTurnProgressStore.getState().stages);
      expect(r.current).toBe(0);
      expect(r.total).toBe(2);
      expect(r.isRunning).toBe(true);
      expect(r.label).toBe('');
    });

    it('1 running + 1 queued:current=1 label=running 的 label', () => {
      useTurnProgressStore.getState().beginTurn([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ]);
      useTurnProgressStore.getState().start('a');
      const r = derive(useTurnProgressStore.getState().stages);
      expect(r.current).toBe(1);
      expect(r.total).toBe(2);
      expect(r.label).toBe('A');
      expect(r.isRunning).toBe(true);
    });

    it('1 done + 1 running:current=2', () => {
      useTurnProgressStore.getState().beginTurn([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ]);
      useTurnProgressStore.getState().start('a');
      useTurnProgressStore.getState().finish('a');
      useTurnProgressStore.getState().start('b');
      const r = derive(useTurnProgressStore.getState().stages);
      expect(r.current).toBe(2);
      expect(r.total).toBe(2);
      expect(r.label).toBe('B');
    });

    it('全 done:isRunning=false current=total', () => {
      useTurnProgressStore.getState().beginTurn([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ]);
      useTurnProgressStore.getState().start('a');
      useTurnProgressStore.getState().finish('a');
      useTurnProgressStore.getState().start('b');
      useTurnProgressStore.getState().finish('b');
      const r = derive(useTurnProgressStore.getState().stages);
      expect(r.isRunning).toBe(false);
      expect(r.current).toBe(2);
      expect(r.total).toBe(2);
    });

    it('subLabel 跟随 running 返回', () => {
      useTurnProgressStore.getState().beginTurn([{ id: 'a', label: 'A' }]);
      useTurnProgressStore.getState().start('a');
      useTurnProgressStore.getState().setSubLabel('a', '排队中 1/3');
      const r = derive(useTurnProgressStore.getState().stages);
      expect(r.subLabel).toBe('排队中 1/3');
    });
  });

  describe('endTurn', () => {
    it('清空 stages,派生全部归零', () => {
      useTurnProgressStore.getState().beginTurn([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ]);
      useTurnProgressStore.getState().start('a');
      useTurnProgressStore.getState().endTurn();
      const stages = useTurnProgressStore.getState().stages;
      expect(stages).toEqual([]);
      const r = derive(stages);
      expect(r.isRunning).toBe(false);
      expect(r.current).toBe(0);
      expect(r.total).toBe(0);
    });
  });

  describe('skipped 不计入 total', () => {
    it('3 stage 中 1 skipped:total=2', () => {
      useTurnProgressStore.getState().beginTurn([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ]);
      useTurnProgressStore.getState().skip('b');
      useTurnProgressStore.getState().start('a');
      useTurnProgressStore.getState().finish('a');
      useTurnProgressStore.getState().start('c');
      const r = derive(useTurnProgressStore.getState().stages);
      expect(r.total).toBe(2);
      expect(r.current).toBe(2);
      expect(r.label).toBe('C');
    });
  });

  describe('setSubLabel', () => {
    it('写入字符串', () => {
      useTurnProgressStore.getState().beginTurn([{ id: 'a', label: 'A' }]);
      useTurnProgressStore.getState().setSubLabel('a', 'RPM 等待 2s');
      expect(useTurnProgressStore.getState().stages[0].subLabel).toBe('RPM 等待 2s');
    });

    it('传 undefined 清空', () => {
      useTurnProgressStore.getState().beginTurn([{ id: 'a', label: 'A' }]);
      useTurnProgressStore.getState().setSubLabel('a', '排队中');
      useTurnProgressStore.getState().setSubLabel('a', undefined);
      expect(useTurnProgressStore.getState().stages[0].subLabel).toBeUndefined();
    });
  });
});
