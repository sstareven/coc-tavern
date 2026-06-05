import { describe, it, expect } from 'vitest';
import { buildLogsSection } from './cache-copy-format';
import type { LogRecord } from '../../utils/console-capture';
import type { BookPage } from '../../types';

const mkPage = (id: string, header: string): BookPage => ({
  id, leftHeader: header, leftContent: '', rightHeader: '', rightContent: '',
} as BookPage);

const mkLog = (pageIndex: number, ts: number, msg: string): LogRecord => ({
  id: pageIndex * 100 + ts, sessionId: 's1', pageIndex, ts, level: 'log', message: msg,
});

describe('cache-copy-format: buildLogsSection', () => {
  it('空日志 → 空段(不留 header)', () => {
    expect(buildLogsSection([], [], 0, 0)).toEqual([]);
  });

  it('按页倒序、同页保持原顺序', () => {
    const logs = [
      mkLog(2, 200, '[cache-diag] p2-a'),
      mkLog(1, 100, '[cache-diag] p1-a'),
      mkLog(1, 150, '[cache-diag] p1-b'),
    ];
    const out = buildLogsSection(
      logs,
      [mkPage('p1', '第一页'), mkPage('p2', '第二页')],
      0, 0,
    );
    const joined = out.join('\n');
    expect(joined).toContain('— 第 2 页 · 第二页 —');
    expect(joined).toContain('— 第 1 页 · 第一页 —');
    expect(joined.indexOf('第 2 页')).toBeLessThan(joined.indexOf('第 1 页'));
    expect(joined.indexOf('p1-a')).toBeLessThan(joined.indexOf('p1-b'));
  });

  it('omittedPages > 0 时插入省略提示', () => {
    const logs = [mkLog(3, 100, '[x] m')];
    const pages: BookPage[] = [
      mkPage('p1', 'A'), mkPage('p2', 'B'), mkPage('p3', 'C'),
    ];
    const out = buildLogsSection(logs, pages, 2, 5);
    expect(out.some((l) => l.includes('省略更早 2 页 / 5 条'))).toBe(true);
  });

  it('多行 message 原样保留缩进', () => {
    const logs = [mkLog(1, 1000, '[cache-diag] head\n  body1\n  body2')];
    const out = buildLogsSection(logs, [mkPage('p1', 'A')], 0, 0);
    const joined = out.join('\n');
    expect(joined).toContain('[cache-diag] head');
    expect(joined).toContain('  body1');
    expect(joined).toContain('  body2');
  });

  it('页缺 leftHeader 时只写"第 N 页"', () => {
    const logs = [mkLog(1, 100, '[x] hi')];
    const out = buildLogsSection(logs, [mkPage('p1', '')], 0, 0);
    expect(out.some((l) => l === '— 第 1 页 —')).toBe(true);
  });
});
