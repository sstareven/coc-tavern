interface Props { onReturnToMenu: () => void }

export function TopBar({ onReturnToMenu }: Props) {
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
        <span style={{ color: 'var(--ink-subtle)', fontSize: 10, letterSpacing: 2 }}>ABYSSAL ARCHIVE</span>
      </div>
      <nav style={{ display: 'flex', gap: 8 }}>
        <NavButton label="设 置" onClick={() => console.log('settings')} />
        <NavButton label="世 界 书" onClick={() => console.log('worldbook')} />
        <NavButton label="预 设" onClick={() => console.log('presets')} />
        <NavButton label="对 话" onClick={() => console.log('chat')} />
        <NavButton label="菜 单" onClick={onReturnToMenu} />
      </nav>
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
