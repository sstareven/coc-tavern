import { useState } from 'react';
import { PageEditor } from './PageEditor';

interface Props {
  onDeletePage: () => void;
  /** 本页加入/装备、删除时将一并撤销的物品名（用于确认弹窗提示）。 */
  affectedItems?: string[];
}

export function BookUtils({ onDeletePage, affectedItems = [] }: Props) {
  const [showEditor, setShowEditor] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
          onClick={() => setConfirmDelete(true)}
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

      </div>

      {/* Page editor modal */}
      {showEditor && <PageEditor onClose={() => setShowEditor(false)} />}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <DeleteConfirm
          affectedItems={affectedItems}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); onDeletePage(); }}
        />
      )}
    </>
  );
}

function DeleteConfirm({ affectedItems, onConfirm, onCancel }: {
  affectedItems: string[]; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 940,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        border: '1px solid var(--blood)', borderRadius: 8,
        padding: '22px 26px', minWidth: 360, maxWidth: 460, width: '90%',
        boxShadow: '0 0 80px rgba(0,0,0,0.6)',
      }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--blood)', letterSpacing: 3, margin: '0 0 12px' }}>
          删除本页及之后？
        </h3>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-light)', lineHeight: 1.7, margin: 0 }}>
          为保持剧情连续，本页及其之后的所有页面将一并永久删除，且无法恢复。
          {affectedItems.length > 0 && (
            <>
              <br />这些页加入的物品也将一并移除：
              <span style={{ color: 'var(--gold)' }}>{affectedItems.join('、')}</span>。
            </>
          )}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 16px', border: '1px solid var(--brass)', borderRadius: 4,
              background: 'transparent', color: 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)', fontSize: 12, cursor: 'pointer',
              transition: 'var(--transition-smooth)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
          >取消</button>
          <button
            onClick={onConfirm}
            style={{
              padding: '6px 16px', border: '1px solid var(--blood)', borderRadius: 4,
              background: 'rgba(255,82,82,0.12)', color: 'var(--blood)',
              fontFamily: 'var(--font-ui)', fontSize: 12, cursor: 'pointer',
              transition: 'var(--transition-smooth)', transform: 'scale(1)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,82,82,0.22)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,82,82,0.12)'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.95)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
          >确认删除</button>
        </div>
      </div>
    </div>
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
