import { describe, it, expect } from 'vitest';
import { combinePoolToText, pickNextHost, deriveWsUrl, type PendingInput, type OnlineUser } from './protocol';

const inp = (userId: string, userName: string, content: string, submittedAt: number): PendingInput => ({ userId, userName, content, submittedAt });
const usr = (id: string, joinOrder: number, isHost = false): OnlineUser => ({ id, name: id, isHost, joinOrder });

describe('combinePoolToText', () => {
  it('按提交时间升序合并为 [名字]: 行动，空行分隔', () => {
    const out = combinePoolToText([
      inp('b', '乙', '后退', 200),
      inp('a', '甲', '前进', 100),
    ]);
    expect(out).toBe('[甲]: 前进\n\n[乙]: 后退');
  });

  it('同刻按 userId 稳定排序', () => {
    const out = combinePoolToText([
      inp('z', 'Z', '二', 100),
      inp('a', 'A', '一', 100),
    ]);
    expect(out).toBe('[A]: 一\n\n[Z]: 二');
  });

  it('跳过空白内容', () => {
    expect(combinePoolToText([inp('a', '甲', '   ', 1), inp('b', '乙', '做事', 2)])).toBe('[乙]: 做事');
  });

  it('空池返回空串', () => {
    expect(combinePoolToText([])).toBe('');
  });

  it('用户名缺失回退匿名', () => {
    expect(combinePoolToText([inp('a', '', '行动', 1)])).toBe('[匿名]: 行动');
  });
});

describe('pickNextHost', () => {
  it('取 joinOrder 最小者', () => {
    expect(pickNextHost([usr('a', 3), usr('b', 1), usr('c', 2)])?.id).toBe('b');
  });
  it('joinOrder 相同按 id 稳定', () => {
    expect(pickNextHost([usr('z', 1), usr('a', 1)])?.id).toBe('a');
  });
  it('空房间返回 null', () => {
    expect(pickNextHost([])).toBeNull();
  });
});

describe('deriveWsUrl', () => {
  it('https → wss，挂房间路径', () => {
    expect(deriveWsUrl('https://x.com', 'r1')).toBe('wss://x.com/ws/room/r1');
  });
  it('http → ws，去尾斜杠', () => {
    expect(deriveWsUrl('http://x.com/', 'r2')).toBe('ws://x.com/ws/room/r2');
  });
});
