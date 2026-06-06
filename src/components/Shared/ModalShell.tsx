// ModalShell — 通用模态外壳:role="dialog" + aria-modal + ESC 关闭 + 焦点陷阱 + 焦点恢复
// 仅提供 a11y 骨架与遮罩,不规定内层布局(交给调用方)。
import { useEffect, useRef, type ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Props {
  open: boolean;
  onClose: () => void;
  zIndex?: number;
  children: ReactNode;
  ariaLabel: string;
}

export function ModalShell({ open, onClose, zIndex = 1000, children, ariaLabel }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        style={{ outline: 'none', maxWidth: '100%', maxHeight: '100%' }}
      >
        {children}
      </div>
    </div>
  );
}
