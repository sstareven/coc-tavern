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

// 模块级 close 栈:多层 ModalShell 同开时,ESC 只触发栈顶最深一层。
// 不用 document 单 listener 一刀切是为了保留 React 组件局部生命周期。
const modalCloseStack: Array<() => void> = [];

export function ModalShell({ open, onClose, zIndex = 1000, children, ariaLabel }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    modalCloseStack.push(onClose);
    const handleKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return;
      // 只有栈顶最深 modal 响应,嵌套时一次 ESC 只关一层
      if (modalCloseStack[modalCloseStack.length - 1] !== onClose) return;
      ev.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const idx = modalCloseStack.lastIndexOf(onClose);
      if (idx >= 0) modalCloseStack.splice(idx, 1);
    };
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
