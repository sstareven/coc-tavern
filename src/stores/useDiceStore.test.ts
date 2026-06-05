import { describe, it, expect, beforeEach } from 'vitest';
import { useDiceStore } from './useDiceStore';
import { useBookStore } from './useBookStore';
import type { DiceRecord } from '../types';

function rec(over: Partial<DiceRecord> = {}): DiceRecord {
  return { skill: '侦查', roll: '42', target: '60', type: 'success', time: 1, ...over };
}

describe('useDiceStore 暂存检定记录（剧情真正推进后才入 history）', () => {
  beforeEach(() => {
    useDiceStore.setState({ history: [], pending: [] });
  });

  it('stashRecord 不立即进 history（选项推进前不记录）', () => {
    useDiceStore.getState().stashRecord(rec());
    expect(useDiceStore.getState().history).toEqual([]);
    expect(useDiceStore.getState().pending.map((r) => r.skill)).toEqual(['侦查']);
  });

  it('commitPending 把暂存记录 flush 进 history 并清空 pending', () => {
    useDiceStore.getState().stashRecord(rec({ skill: '侦查', time: 1 }));
    useDiceStore.getState().commitPending();
    const s = useDiceStore.getState();
    expect(s.history.map((r) => r.skill)).toEqual(['侦查']);
    expect(s.pending).toEqual([]);
  });

  it('clearPending 丢弃暂存且不影响已有 history', () => {
    useDiceStore.getState().addRecord(rec({ skill: '旧记录', time: 0 }));
    useDiceStore.getState().stashRecord(rec({ skill: '待提交', time: 1 }));
    useDiceStore.getState().clearPending();
    const s = useDiceStore.getState();
    expect(s.pending).toEqual([]);
    expect(s.history.map((r) => r.skill)).toEqual(['旧记录']);
  });

  it('改点选项（clear→stash→commit）只记最后一次掷骰', () => {
    const d = useDiceStore.getState();
    d.stashRecord(rec({ skill: '选项A', time: 1 }));
    d.clearPending();                  // 改点别的选项，输入框被覆盖，旧暂存作废
    d.stashRecord(rec({ skill: '选项B', time: 2 }));
    d.commitPending();                 // 剧情真正推进
    expect(useDiceStore.getState().history.map((r) => r.skill)).toEqual(['选项B']);
  });

  it('commitPending 后本回合记录排在 history 最前（最新在前）', () => {
    const d = useDiceStore.getState();
    d.addRecord(rec({ skill: '更早', time: 0 }));
    d.stashRecord(rec({ skill: '本回合', time: 1 }));
    d.commitPending();
    expect(useDiceStore.getState().history.map((r) => r.skill)).toEqual(['本回合', '更早']);
  });

  it('commitPending 改写 record.page 为当前页号(修 Bug #3:检定记录页码与书页号对齐)', () => {
    // 模拟: stashRecord 时是第 3 页(pageIndex=2),提交后新页是第 4 页(pageIndex=3)
    useBookStore.setState({ pageIndex: 2 });
    useDiceStore.getState().stashRecord(rec({ skill: '听力', page: 3 }));
    // useChatPipeline 在 appendPage 之后调 commitPending,此刻 pageIndex 已变为新页
    useBookStore.setState({ pageIndex: 3 });
    useDiceStore.getState().commitPending();
    // record 应被改写成新页号 4 (pageIndex+1),而非 stash 时的 3
    expect(useDiceStore.getState().history[0].page).toBe(4);
  });

  it('commitPending 即使 pending 里多条 record page 不一,也统一改写为当前页号', () => {
    useDiceStore.getState().stashRecord(rec({ skill: 'A', page: 5, time: 1 }));
    useDiceStore.getState().stashRecord(rec({ skill: 'B', page: 99, time: 2 }));
    useBookStore.setState({ pageIndex: 9 });
    useDiceStore.getState().commitPending();
    const hist = useDiceStore.getState().history;
    expect(hist.map((r) => r.page)).toEqual([10, 10]); // 都改成 pageIndex+1=10
  });

  it('未 commit 时（提交失败/未提交）暂存不会进 history', () => {
    useDiceStore.getState().stashRecord(rec({ skill: '没提交', time: 1 }));
    // 不调 commitPending —— 模拟用户没推进剧情
    expect(useDiceStore.getState().history).toEqual([]);
  });
});
