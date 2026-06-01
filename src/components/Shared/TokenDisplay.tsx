import { useBookStore } from '../../stores/useBookStore';

export function TokenDisplay() {
  const pageIndex = useBookStore((s) => s.pageIndex);
  const pages = useBookStore((s) => s.pages);
  const stats = pages[pageIndex]?.genStats;

  let text: string;
  let title: string;
  if (stats) {
    const { totalTokens, promptTokens, completionTokens, durationMs, estimated } = stats;
    const sec = (durationMs / 1000).toFixed(1);
    const tilde = estimated ? '~' : '';
    text = (promptTokens != null && completionTokens != null)
      ? `${tilde}↑${promptTokens.toLocaleString()} ↓${completionTokens.toLocaleString()} · ${sec}s`
      : `${tilde}${totalTokens.toLocaleString()} tok · ${sec}s`;
    title = `本页生成${estimated ? '（估算）' : ''}：输入 ${promptTokens?.toLocaleString() ?? '—'} · 输出 ${completionTokens?.toLocaleString() ?? '—'} · 合计 ${totalTokens.toLocaleString()} tokens · 耗时 ${sec}s`;
  } else {
    // 本页无生成记录（序章/老存档/未经本版本生成）
    text = '↑— ↓— · —';
    title = '本页无生成记录';
  }

  return (
    <div
      title={title}
      style={{
        position: 'absolute',
        bottom: 8,
        right: 12,
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--ink-faded)',
        letterSpacing: 0.5,
        opacity: 0.5,
        pointerEvents: 'auto',
      }}
    >
      {text}
    </div>
  );
}
