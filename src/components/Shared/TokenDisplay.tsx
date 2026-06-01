import { useGenStatsStore } from '../../stores/useGenStatsStore';
import { useBookStore } from '../../stores/useBookStore';

export function TokenDisplay() {
  const totalTokens = useGenStatsStore((s) => s.totalTokens);
  const promptTokens = useGenStatsStore((s) => s.promptTokens);
  const completionTokens = useGenStatsStore((s) => s.completionTokens);
  const durationMs = useGenStatsStore((s) => s.durationMs);
  const estimated = useGenStatsStore((s) => s.estimated);

  // 尚无本次生成数据（首次进入/读档）时，回退到按当前页字数的粗估
  const pageIndex = useBookStore((s) => s.pageIndex);
  const pages = useBookStore((s) => s.pages);

  let text: string;
  let title: string | undefined;
  if (totalTokens != null) {
    const sec = durationMs != null ? (durationMs / 1000).toFixed(1) : '?';
    text = `${estimated ? '~' : ''}${totalTokens.toLocaleString()} tok · ${sec}s`;
    if (promptTokens != null && completionTokens != null) {
      title = `本次生成${estimated ? '（估算）' : ''}：输入 ${promptTokens.toLocaleString()} · 输出 ${completionTokens.toLocaleString()} tokens`;
    }
  } else {
    const page = pages[pageIndex];
    const len = page ? page.leftContent.length + page.rightContent.length : 0;
    text = `~${Math.max(1, Math.floor(len / 2.5))} tokens`;
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
        pointerEvents: title ? 'auto' : 'none',
      }}
    >
      {text}
    </div>
  );
}
