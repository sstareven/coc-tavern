import { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePanelStore } from '../../stores/usePanelStore';
import { useIsMobile } from '../../hooks/useIsMobile';

interface Props { onReturnToMenu: () => void }

export function TopBar({ onReturnToMenu }: Props) {
  const openPanel = usePanelStore((s) => s.open);
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', height: 48, flexShrink: 0,
      background: 'rgba(13,10,7,0.85)', backdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(196,168,85,0.15)',
      fontFamily: 'var(--font-ui)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        color: 'var(--gold)', fontSize: 13, letterSpacing: 3,
      }}>
        <span style={{ fontSize: 14 }}>&#9733;</span>
        <span style={{ fontFamily: 'var(--font-display)' }}>深渊档案馆</span>
        {!isMobile && (
          <span style={{ color: 'var(--ink-subtle)', fontSize: 10, letterSpacing: 2 }}>ABYSSAL ARCHIVE</span>
        )}
      </div>
      {isMobile ? (
        <>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="菜单"
            style={{ background: 'transparent', border: '1px solid var(--brass)', color: 'var(--gold)',
              borderRadius: 4, padding: '6px 12px', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}
          >☰</button>
          {menuOpen && createPortal(
            <div style={{
              position: 'fixed', inset: 0, zIndex: 2000,
              background: 'rgba(8,6,4,0.98)', backdropFilter: 'blur(4px)',
              display: 'flex', flexDirection: 'column', padding: '22px 20px',
              fontFamily: 'var(--font-ui)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <span style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 18, letterSpacing: 4 }}>菜 单</span>
                <button onClick={() => setMenuOpen(false)} aria-label="关闭"
                  style={{ background: 'transparent', border: '1px solid var(--brass)', color: 'var(--gold)',
                    borderRadius: 4, width: 36, height: 36, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
                >✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <FullMenuItem label="设 置" onClick={() => { setMenuOpen(false); openPanel('settings'); }} />
                <FullMenuItem label="世 界 书" onClick={() => { setMenuOpen(false); openPanel('worldbook'); }} />
                <FullMenuItem label="预 设" onClick={() => { setMenuOpen(false); openPanel('preset'); }} />
                <FullMenuItem label="功 能" onClick={() => { setMenuOpen(false); openPanel('presetSwitch'); }} />
                <FullMenuItem label="对 话" onClick={() => { setMenuOpen(false); openPanel('chatlist'); }} />
                <FullMenuItem label="返回主菜单" onClick={() => { setMenuOpen(false); onReturnToMenu(); }} />
              </div>
              <div style={{ flex: 1 }} />
              <FullMenuItem label="← 返回书本" accent onClick={() => setMenuOpen(false)} />
            </div>,
            document.body,
          )}
        </>
      ) : (
        <nav style={{ display: 'flex', gap: 8 }}>
          <NavButton label="设 置" onClick={() => openPanel('settings')} />
          <NavButton label="世 界 书" onClick={() => openPanel('worldbook')} />
          <NavButton label="预 设" onClick={() => openPanel('preset')} />
          <NavButton label="功 能" onClick={() => openPanel('presetSwitch')} />
          <NavButton label="对 话" onClick={() => openPanel('chatlist')} />
          <NavButton label="菜 单" onClick={onReturnToMenu} />
        </nav>
      )}
    </header>
  );
}

function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', border: '1px solid transparent',
      background: 'transparent', color: 'var(--ink-subtle)',
      fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2,
      borderRadius: 3, cursor: 'pointer', transition: 'var(--transition-smooth)',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
    >
      {label}
    </button>
  );
}

/** 手机全屏菜单的大号可点按钮。 */
function FullMenuItem({ label, onClick, accent }: { label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '16px 18px', textAlign: 'left',
      border: `1px solid ${accent ? 'var(--gold)' : 'var(--brass)'}`,
      borderRadius: 8,
      background: accent ? 'rgba(196,168,85,0.12)' : 'rgba(196,168,85,0.04)',
      color: accent ? 'var(--gold)' : 'var(--parchment)',
      fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: 2,
      cursor: 'pointer', transition: 'transform 0.15s cubic-bezier(0.4,0,0.2,1), background 0.2s cubic-bezier(0.4,0,0.2,1)',
    }}
      onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; e.currentTarget.style.background = 'rgba(196,168,85,0.2)'; }}
      onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = accent ? 'rgba(196,168,85,0.12)' : 'rgba(196,168,85,0.04)'; }}
    >
      {label}
    </button>
  );
}
