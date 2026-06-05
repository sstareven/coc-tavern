/**
 * A2 重设 — SanityBubble: 浮在叙事正文中的血色脉冲气泡。
 *
 * 用法 (RightPage/LeftPage 替换 <san id="N"/> 标签时):
 *   <SanityBubble prompt={prompt} />
 *
 * 已点过的气泡(resolved) 渲染为暗淡的小红点(回看仍可见但不能再触发);
 * 未点的 pulse 引玩家注意,点击 → 设置 useSanityPanelStore.activePrompt → 弹 SanityCheckPanel。
 *
 * UI 约束(per CLAUDE.md UI 风格):
 *  - cubic-bezier(0.4, 0, 0.2, 1) 过渡
 *  - hover scale 1.04 / active 0.97
 *  - 无 emoji, 用纯 SVG / CSS 绘
 */

import { useState } from 'react';
import { useSanityBubbleStore } from '../../stores/useSanityBubbleStore';
import { useSanityPanelStore } from '../../stores/useSanityPanelStore';
import type { SanityCheckPrompt } from '../../types';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

export function SanityBubble({ prompt }: { prompt: SanityCheckPrompt }) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const resolved = useSanityBubbleStore((s) => s.resolved.has(prompt.id));

  const onClick = () => {
    if (resolved) return;
    useSanityPanelStore.getState().open(prompt);
  };

  // 已解决: 暗色暗示痕迹 — 仍占位让玩家看到"这里曾有冲击", 但不再可点。
  if (resolved) {
    return (
      <span
        title={`已经历: ${prompt.trigger}`}
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          margin: '0 4px',
          borderRadius: '50%',
          background: 'rgba(80, 18, 18, 0.55)',
          boxShadow: 'inset 0 0 2px rgba(0,0,0,0.6)',
          verticalAlign: 'middle',
        }}
      />
    );
  }

  // 未解决: 血色脉冲, 拉玩家注意。
  const scale = active ? 0.97 : hover ? 1.04 : 1;
  return (
    <>
      <style>{`
        @keyframes san-bubble-pulse {
          0%, 100% {
            box-shadow:
              0 0 0 0 rgba(180, 20, 20, 0.55),
              inset 0 0 4px rgba(255, 80, 80, 0.55);
          }
          50% {
            box-shadow:
              0 0 0 6px rgba(180, 20, 20, 0),
              inset 0 0 7px rgba(255, 120, 120, 0.85);
          }
        }
        @keyframes san-bubble-drip {
          0%, 100% { filter: drop-shadow(0 0 3px rgba(200, 0, 0, 0.6)); }
          50%      { filter: drop-shadow(0 0 8px rgba(255, 50, 50, 0.85)); }
        }
      `}</style>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setActive(false); }}
        onMouseDown={() => setActive(true)}
        onMouseUp={() => setActive(false)}
        title={`理智冲击 — ${prompt.trigger}`}
        aria-label={`理智检定: ${prompt.trigger}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          margin: '0 4px',
          padding: 0,
          border: '1px solid rgba(200, 30, 30, 0.65)',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #c01818 0%, #5a0808 70%, #2a0303 100%)',
          color: '#ffd7d7',
          cursor: 'pointer',
          verticalAlign: 'middle',
          animation: `san-bubble-pulse 1.6s ${EASE} infinite, san-bubble-drip 2.4s ${EASE} infinite`,
          transform: `scale(${scale})`,
          transition: `transform 220ms ${EASE}, border-color 220ms ${EASE}`,
          flexShrink: 0,
        }}
      >
        {/* 内部小眼睛/裂缝标记 — 纯 SVG, 无 emoji */}
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: 'none' }}>
          <path
            d="M5 1.5 L5.7 4.5 L8.5 5 L5.7 5.5 L5 8.5 L4.3 5.5 L1.5 5 L4.3 4.5 Z"
            fill="rgba(255,210,210,0.92)"
            stroke="rgba(60,0,0,0.5)"
            strokeWidth="0.4"
          />
        </svg>
      </button>
    </>
  );
}
