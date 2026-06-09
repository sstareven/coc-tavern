import { memo } from 'react';
import type React from 'react';
import { IconClose } from '../../Layout/TabIcons';

// chip 单元:独立 memo 子组件,避免同列其他 chip onChange identity 变化触发整行重渲。
// BadEndingsTab / DarkTimelineTab 共用。
export const RemovableChip = memo(
  function RemovableChip({ value, onRemove }: { value: string; onRemove: () => void }): React.ReactElement {
    return (
      <span
        style={{
          padding: '2px 8px',
          fontSize: 11,
          background: 'rgba(196,168,85,0.12)',
          border: '1px solid rgba(196,168,85,0.4)',
          color: 'var(--gold)',
          borderRadius: 2,
          fontFamily: 'var(--font-ui)',
          letterSpacing: 1,
          display: 'inline-flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        {value}
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--gold)',
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
          }}
          aria-label="移除"
        >
          <IconClose size={12} />
        </button>
      </span>
    );
  },
  (prev, next) => prev.value === next.value,
);
