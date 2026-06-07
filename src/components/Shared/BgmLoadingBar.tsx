// src/components/Shared/BgmLoadingBar.tsx —— BGM 缓冲进度条(纯展示)
// 视觉:窄条(3px) + 羊皮纸底 + 暗金渐变填充 + 右侧「BGM 缓冲 N%」文字。
// 容器定位由调用方负责(组件内不写 fixed/absolute),完成后整体 600ms 淡出。
import { useEffect, useState } from 'react';

interface Props {
  /** 0-1 缓冲进度。 */
  progress: number;
  /** 外部控制显隐(通常 progress<1 时 true,已加载完则 false)。 */
  visible: boolean;
}

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

export function BgmLoadingBar({ progress, visible }: Props) {
  // mounted 用于淡出动画结束后真正卸载,避免淡出未完就 display:none 闪烁。
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) { setMounted(true); return; }
    const t = window.setTimeout(() => setMounted(false), 650);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!mounted) return null;

  const pct = Math.max(0, Math.min(1, progress));

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '0 14px',
        opacity: visible ? 1 : 0,
        transition: `opacity 600ms ${EASE}`,
        pointerEvents: 'none',
      }}
    >
      {/* 槽轨 */}
      <div
        style={{
          position: 'relative', flex: 1, height: 3,
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 2, overflow: 'hidden',
        }}
      >
        {/* 已加载段:暗金渐变 */}
        <div
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct * 100}%`,
            background: 'linear-gradient(90deg, rgba(196,168,85,0.55), var(--gold))',
            boxShadow: '0 0 6px rgba(196,168,85,0.35)',
            transition: `width 0.3s ${EASE}`,
          }}
        />
      </div>

      {/* 文字 —— 不显示百分比避免「必须等到 100% 才能玩」的误导,只标识 BGM 在后台缓冲。 */}
      <span
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 'calc(10px * var(--system-ratio, 1))',
          color: 'var(--ink-subtle)',
          letterSpacing: 1,
          whiteSpace: 'nowrap',
          minWidth: 84, textAlign: 'right',
          opacity: 0.7,
        }}
      >
        BGM 缓冲中
      </span>
    </div>
  );
}
