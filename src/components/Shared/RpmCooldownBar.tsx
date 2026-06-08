import { useRpmCooldown } from '../../hooks/useRpmCooldown';
import { useTurnProgressIsRunning } from '../../stores/useTurnProgressStore';

// RPM 冷却条:只在桶满 (used >= limit) 时显示,等最早 timestamp 过期腾出名额。
// 桶有余量时不渲染,推进按钮直接可用 — 跟 rpmAcquire 的真实限流语义一致。
export function RpmCooldownBar() {
  const { cooldownSec, ready } = useRpmCooldown();
  const isRunning = useTurnProgressIsRunning();
  // LLM 跑时让位给 TurnProgressBar,桶有余量时不渲染
  if (isRunning || ready) return null;

  return (
    <div
      style={{
        padding: '6px 24px',
        fontSize: 'calc(12px * var(--system-ratio, 1))',
        fontFamily: 'var(--font-ui)',
        color: 'var(--ink-faded)',
        background: 'rgba(120,120,120,0.08)',
        borderBottom: '1px solid rgba(120,120,120,0.18)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span>RPM 冷却中,{cooldownSec} 秒后可继续推进</span>
      <div
        style={{
          flex: 1,
          height: 3,
          background: 'rgba(120,120,120,0.12)',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            // 60s 总时长,剩余 cooldownSec 秒,已过 (60-cooldown)/60
            width: `${Math.max(0, Math.min(100, ((60 - cooldownSec) / 60) * 100))}%`,
            height: '100%',
            background: 'var(--ink-faded)',
            transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
    </div>
  );
}
