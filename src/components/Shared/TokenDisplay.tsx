import { useEffect, useRef, useState } from 'react';
import { useBookStore } from '../../stores/useBookStore';

/** 老虎机式翻滚数字：值变化时从当前显示值缓动滚到目标值（首次从 0 滚入）。 */
function RollingNumber({ value, duration = 650 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const cur = Math.round(from + (to - from) * eased);
      setDisplay(cur);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setDisplay(to);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <>{display.toLocaleString()}</>;
}

export function TokenDisplay() {
  const pageIndex = useBookStore((s) => s.pageIndex);
  const pages = useBookStore((s) => s.pages);
  const stats = pages[pageIndex]?.genStats;

  // 本页无生成记录（序章/老存档/未经本版本生成）——直接不显示，不留占位符
  if (!stats) return null;

  const { totalTokens, promptTokens, completionTokens, durationMs, estimated, subCalls } = stats;
  const sec = (durationMs / 1000).toFixed(1);
  const tilde = estimated ? '~' : '';
  const hasSplit = promptTokens != null && completionTokens != null;
  // 本页累计 LLM 请求数 = 1 主回合 + 所有子调用。
  // RPM = 请求数 × 60 / 耗时秒数 —— 真正的 "Requests Per Minute" 频率值。
  // 实时算 subCalls.length + 1, 子调用 fire-and-forget 追加 subCalls 时,
  // useBookStore 订阅会响应式更新显示。
  const reqCount = 1 + (subCalls?.length ?? 0);
  const durationSec = durationMs > 0 ? durationMs / 1000 : 1; // 防 0 除
  const rpm = (reqCount * 60) / durationSec;
  const rpmTail = ` · ${rpm.toFixed(1)}RPM`;
  const subCallLabels = (subCalls ?? []).map((s) => s.label).join(' / ');
  const title = `本页生成${estimated ? '（估算）' : ''}：输入 ${promptTokens?.toLocaleString() ?? '—'} · 输出 ${completionTokens?.toLocaleString() ?? '—'} · 合计 ${totalTokens.toLocaleString()} tokens · 耗时 ${sec}s · 共 ${reqCount} 次 LLM 调用${subCallLabels ? `(主回合 + ${subCallLabels})` : '(主回合)'} → ${rpm.toFixed(2)} RPM`;

  return (
    <div
      title={title}
      style={{
        position: 'absolute',
        bottom: 8,
        right: 12,
        fontFamily: 'var(--font-mono)',
        fontSize: 'calc(9px * var(--system-ratio, 1))',
        color: 'var(--ink-faded)',
        letterSpacing: 0.5,
        opacity: 0.5,
        pointerEvents: 'auto',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {tilde}
      {hasSplit ? (
        <>↑<RollingNumber value={promptTokens!} /> ↓<RollingNumber value={completionTokens!} /></>
      ) : (
        <><RollingNumber value={totalTokens} /> tok</>
      )}
      {' · '}{sec}s{rpmTail}
    </div>
  );
}
