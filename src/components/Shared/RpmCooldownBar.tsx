import { useRpmCooldown } from '../../hooks/useRpmCooldown';
import { useTurnProgressIsRunning } from '../../stores/useTurnProgressStore';

// RPM 冷却条:LLM 调用全部结束后,等 60s 滑动窗口里最早 timestamp 过期才解锁选项
export function RpmCooldownBar() {
  const { cooldownSec, ready } = useRpmCooldown();
  const isRunning = useTurnProgressIsRunning();
  // LLM 跑时让位给 TurnProgressBar,桶已空时不渲染
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
