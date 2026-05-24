import { useState } from 'react';
import { PageEditor } from './PageEditor';

interface Props {
  onDeletePage: () => void;
  onToggleDebug: () => void;
}

export function BookUtils({ onDeletePage, onToggleDebug }: Props) {
  const [showEditor, setShowEditor] = useState(false);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: -28,
          right: 0,
          display: 'flex',
          gap: 4,
          zIndex: 10,
        }}
      >
        {/* Edit button */}
        <button
          onClick={() => setShowEditor(true)}
          title="编辑页面"
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--gold)';
            e.currentTarget.style.borderColor = 'var(--gold)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--ink-subtle)';
            e.currentTarget.style.borderColor = 'rgba(196,168,85,0.15)';
          }}
        >
          &#9998;
        </button>

        {/* Delete button */}
        <button
          onClick={onDeletePage}
          title="删除页面"
          style={{ ...buttonStyle, fontSize: 10 }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--blood)';
            e.currentTarget.style.borderColor = 'var(--blood)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--ink-subtle)';
            e.currentTarget.style.borderColor = 'rgba(196,168,85,0.15)';
          }}
        >
          &#10005;
        </button>

        {/* Debug button */}
        <button
          onClick={onToggleDebug}
          title="调试日志"
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--gold)';
            e.currentTarget.style.borderColor = 'var(--gold)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--ink-subtle)';
            e.currentTarget.style.borderColor = 'rgba(196,168,85,0.15)';
          }}
        >
          &#9881;
        </button>
      </div>

      {/* Page editor modal */}
      {showEditor && <PageEditor onClose={() => setShowEditor(false)} />}
    </>
  );
}

const buttonStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid rgba(196,168,85,0.15)',
  borderRadius: 3,
  background: 'rgba(13,10,7,0.7)',
  color: 'var(--ink-subtle)',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  padding: 0,
  transition: 'var(--transition-smooth)',
};
