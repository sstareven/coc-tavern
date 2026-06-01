import { useGenStatsStore } from '../../stores/useGenStatsStore';

export function TokenDisplay() {
  const totalTokens = useGenStatsStore((s) => s.totalTokens);
  const promptTokens = useGenStatsStore((s) => s.promptTokens);
  const completionTokens = useGenStatsStore((s) => s.completionTokens);
  const durationMs = useGenStatsStore((s) => s.durationMs);
  const estimated = useGenStatsStore((s) => s.estimated);

  let text: string;
  let title: string;
  if (totalTokens != null) {
    const sec = durationMs != null ? (durationMs / 1000).toFixed(1) : '?';
    const tilde = estimated ? '~' : '';
    text = (promptTokens != null && completionTokens != null)
      ? `${tilde}↑${promptTokens.toLocaleString()} ↓${completionTokens.toLocaleString()} · ${sec}s`
      : `${tilde}${totalTokens.toLocaleString()} tok · ${sec}s`;
    title = `本次生成${estimated ? '（估算）' : ''}：输入 ${promptTokens?.toLocaleString() ?? '—'} · 输出 ${completionTokens?.toLocaleString() ?? '—'} · 合计 ${totalTokens.toLocaleString()} tokens · 耗时 ${sec}s`;
  } else {
    // 本会话尚未生成（首次进入/读档）——用占位，待首次生成后显示真实 ↑/↓/耗时
    text = '↑— ↓— · —';
    title = '本会话尚未生成，数值将在下一次生成后显示';
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
