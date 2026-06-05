// 纯逻辑：缓存面板复制文本里【F12 项目日志段】的拼装。
// 不引 React 依赖,便于 unit test。其余诊断段/排错段保留在 CacheStatsPanel.tsx,
// 因为本任务仅新增日志段,旧函数无意改动范围。
import type { BookPage } from '../../types';
import type { LogRecord } from '../../utils/console-capture';

export function buildLogsSection(
  logs: LogRecord[],
  pages: BookPage[],
  omittedPages: number,
  omittedRecords: number,
): string[] {
  if (logs.length === 0) return [];
  const lines: string[] = [];
  lines.push('=== F12 项目日志（按页分组，仅最近 10 页） ===');
  lines.push('');
  if (omittedPages > 0) {
    lines.push(`（省略更早 ${omittedPages} 页 / ${omittedRecords} 条）`);
    lines.push('');
  }
  // 按 pageIndex 分组（保持 logs 已有的倒序）
  const groups = new Map<number, LogRecord[]>();
  for (const r of logs) {
    let g = groups.get(r.pageIndex);
    if (!g) { g = []; groups.set(r.pageIndex, g); }
    g.push(r);
  }
  const sortedPages = [...groups.keys()].sort((a, b) => b - a);
  for (const pi of sortedPages) {
    const pageLabel = pages[pi - 1]?.leftHeader || '';
    lines.push(pageLabel ? `— 第 ${pi} 页 · ${pageLabel} —` : `— 第 ${pi} 页 —`);
    for (const r of groups.get(pi)!) {
      const ts = formatTime(r.ts);
      // 多行 message：第一行带时间戳,后续行原样保留
      const [first, ...rest] = r.message.split('\n');
      lines.push(`[${ts}] ${first}`);
      for (const line of rest) lines.push(line);
    }
    lines.push('');
  }
  return lines;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
