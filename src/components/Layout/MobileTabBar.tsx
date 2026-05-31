// src/components/Layout/MobileTabBar.tsx
import { IconInventory, IconCharSheet, IconToc, IconDice } from './TabIcons';

export type MobileTab = 'inventory' | 'charsheet' | 'toc' | 'dice';

interface Props {
  active: MobileTab | null;            // 当前打开的覆盖层（dice 无持续态，可不高亮）
  onTab: (tab: MobileTab) => void;
}

const TABS: Array<{ key: MobileTab; label: string; Icon: (p: { size?: number }) => React.ReactElement }> = [
  { key: 'inventory', label: '库存', Icon: IconInventory },
  { key: 'charsheet', label: '角色卡', Icon: IconCharSheet },
  { key: 'toc', label: '目录', Icon: IconToc },
  { key: 'dice', label: '骰子', Icon: IconDice },
];

export function MobileTabBar({ active, onTab }: Props) {
  return (
    <nav style={{
      display: 'flex', flexShrink: 0, height: 46,
      background: 'rgba(13,10,7,0.55)',
      borderBottom: '1px solid rgba(196,168,85,0.15)',
    }}>
      {TABS.map(({ key, label, Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onTab(key)}
            aria-pressed={isActive}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              background: isActive ? 'rgba(196,168,85,0.10)' : 'transparent',
              border: 'none',
              borderRight: '1px solid rgba(61,43,19,0.5)',
              boxShadow: isActive ? 'inset 0 -2px 0 var(--gold)' : 'none',
              color: isActive ? 'var(--gold)' : 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1,
              cursor: 'pointer', transition: 'color 0.35s cubic-bezier(0.4,0,0.2,1), background 0.35s cubic-bezier(0.4,0,0.2,1)',
            }}
            onTouchStart={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.18)'; }}
            onTouchEnd={(e) => { e.currentTarget.style.background = isActive ? 'rgba(196,168,85,0.10)' : 'transparent'; }}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
