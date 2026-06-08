import { useTurnProgress } from '../../stores/useTurnProgressStore';

// 回合进度条:仅在 isRunning 时挂载,避免空状态留占位
export function TurnProgressBar() {
  const { current, total, label, subLabel, isRunning } = useTurnProgress();
  if (!isRunning) return null;

  const pct = total > 0 ? (current / total) * 100 : 0;
  const text = label || '正在生成';

  return (
    <div
      style={{
        padding: '6px 24px',
        fontSize: 'calc(12px * var(--system-ratio, 1))',
        fontFamily: 'var(--font-ui)',
        color: 'var(--gold)',
        background: 'rgba(196,168,85,0.08)',
        borderBottom: '1px solid rgba(196,168,85,0.18)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span>
        {text} ({current}/{total})
        {subLabel && (
          <span style={{ fontSize: '0.85em', opacity: 0.7, marginLeft: 6 }}>
            {subLabel}
          </span>
        )}
      </span>
      <div
        style={{
          flex: 1,
          height: 3,
          background: 'rgba(196,168,85,0.12)',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--gold)',
            // 动效统一用 cubic-bezier,见 MEMORY feedback_animation_bezier
            transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
    </div>
  );
}
