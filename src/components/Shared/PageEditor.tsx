import { useState, useEffect } from 'react';
import { useBookStore } from '../../stores/useBookStore';
import { persistActivePages } from '../../stores/sessionLifecycle';

interface Props {
  onClose: () => void;
}

export function PageEditor({ onClose }: Props) {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const updateLeftPage = useBookStore((s) => s.updateLeftPage);

  const page = pages[pageIndex];
  const [title, setTitle] = useState(page?.leftHeader ?? '');
  const [content, setContent] = useState(page?.leftContent ?? '');

  useEffect(() => {
    // eslint-disable react-hooks/set-state-in-effect -- intentional form init pattern
    setTitle(page?.leftHeader ?? '');
    setContent(page?.leftContent ?? '');
    // eslint-enable react-hooks/set-state-in-effect
  }, [pageIndex, page]);

  const handleSave = () => {
    updateLeftPage(pageIndex, title.trim(), content.trim());
    persistActivePages();
    onClose();
  };

  const handleEsc = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 920,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
          border: '1px solid var(--gold)',
          borderRadius: 8,
          padding: '24px 28px',
          minWidth: 420,
          maxWidth: 560,
          width: '90%',
          boxShadow: '0 0 80px rgba(0,0,0,0.6)',
        }}
        onKeyDown={handleEsc}
      >
        {/* Title */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            borderBottom: '1px solid rgba(196,168,85,0.18)',
            paddingBottom: 12,
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              color: 'var(--gold)',
              letterSpacing: 3,
              margin: 0,
            }}
          >
            编辑页面 {pageIndex + 1}
          </h3>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid transparent',
              borderRadius: 3,
              background: 'transparent',
              color: 'var(--ink-subtle)',
              fontSize: 16,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >
            ✕
          </button>
        </div>

        {/* Title input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          <label
            style={{
              fontSize: 10,
              color: 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)',
              letterSpacing: 2,
            }}
          >
            标题
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="页面标题..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--brass)',
              borderRadius: 3,
              background: 'rgba(0,0,0,0.3)',
              color: 'var(--text-light)',
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              outline: 'none',
              caretColor: 'var(--gold)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
        </div>

        {/* Content textarea */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
          <label
            style={{
              fontSize: 10,
              color: 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)',
              letterSpacing: 2,
            }}
          >
            正文
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="左侧页面正文内容..."
            style={{
              width: '100%',
              minHeight: 160,
              padding: '10px 12px',
              border: '1px solid var(--brass)',
              borderRadius: 3,
              background: 'rgba(0,0,0,0.3)',
              color: 'var(--text-light)',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              lineHeight: 1.7,
              outline: 'none',
              caretColor: 'var(--gold)',
              resize: 'vertical',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          style={{
            width: '100%',
            padding: '10px 0',
            border: '1px solid var(--gold)',
            borderRadius: 4,
            background: 'rgba(196,168,85,0.1)',
            color: 'var(--gold)',
            fontFamily: 'var(--font-ui)',
            fontSize: 14,
            letterSpacing: 4,
            cursor: 'pointer',
            transition: 'var(--transition-smooth)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.1)'; }}
        >
          保 存
        </button>
      </div>
    </div>
  );
}
