// src/components/Book/MobileBookView.tsx
import { AnimatePresence } from 'framer-motion';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useBookStore } from '../../stores/useBookStore';
import { InventoryOverlay } from '../Inventory/InventoryPanel';
import { CharSheetOverlay } from '../CharSheet/CharSheetOverlay';
import { NpcOverlay } from '../NPC/NpcOverlay';
import { useNpcStore } from '../../stores/useNpcStore';
import { MapOverlay } from '../Map/MapOverlay';
import { useMapStore } from '../../stores/useMapStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useReadingModeStore } from '../../stores/useReadingModeStore';
import { MobileTabBar, type MobileTab } from '../Layout/MobileTabBar';
import { StatusBar } from './StatusBar';
import { MobileNoteView } from './MobileNoteView';
import { TocOverlay } from './TocOverlay';
import { IconChevronDown } from '../Layout/TabIcons';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  showToc: boolean;
  selectedToc: number;
  onTocSelect: (i: number) => void;
  onTab: (tab: MobileTab) => void;
}

export function MobileBookView({ showToc, selectedToc, onTocSelect, onTab }: Props) {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const inventoryOpen = useInventoryStore((s) => s.isOpen);
  const charSheetOpen = useCharSheetStore((s) => s.isOpen);
  const npcOpen = useNpcStore((s) => s.isOpen);
  const mapOpen = useMapStore((s) => s.isOpen);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const immersive = useReadingModeStore((s) => s.immersive);
  const topCollapsed = useReadingModeStore((s) => s.topCollapsed);
  const toggleTopCollapsed = useReadingModeStore((s) => s.toggleTopCollapsed);

  const active: MobileTab | null =
    inventoryOpen ? 'inventory' : charSheetOpen ? 'charsheet' : npcOpen ? 'npc' : mapOpen ? 'map' : showToc ? 'toc' : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
      {/* 沉浸模式同时把顶部 tab 条藏起,顶端只剩页面卷轴。 */}
      {!immersive && <MobileTabBar active={active} onTab={onTab} />}

      {/* 紧凑状态栏 — 沉浸时藏掉,顶部折叠时收高度+淡出,留 MobileTabBar 导航和折叠按钮可见 */}
      {!immersive && (
        <div style={{
          position: 'relative', zIndex: 5, flexShrink: 0,
          padding: topCollapsed ? '0 8px' : '3px 8px',
          maxHeight: topCollapsed ? 0 : 80,
          opacity: topCollapsed ? 0 : 1,
          overflow: 'hidden',
          background: '#14100b',
          borderBottom: topCollapsed ? 'none' : '1px solid rgba(196,168,85,0.12)',
          transition: `max-height 220ms ${EASE}, opacity 200ms ${EASE}, padding 200ms ${EASE}, border-color 200ms ${EASE}`,
        }}>
          <StatusBar compact />
        </div>
      )}

      {/* 折叠按钮 — 沉浸模式时也藏(整个顶部都没了, 没必要再点); 永远水平居中, v 收起态 / ^ 展开态 */}
      {!immersive && (
        <button
          type="button"
          onClick={toggleTopCollapsed}
          aria-label={topCollapsed ? '展开顶部信息' : '收起顶部信息'}
          title={topCollapsed ? '展开顶部信息' : '收起顶部信息'}
          style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: 18,
            background: '#14100b',
            border: 'none',
            borderBottom: '1px solid rgba(196,168,85,0.12)',
            color: 'var(--gold)',
            cursor: 'pointer',
            padding: 0,
            transition: `background 180ms ${EASE}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#14100b'; }}
        >
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            // 展开态(topCollapsed=false): ^ 收起方向; 折叠态(topCollapsed=true): v 展开方向
            transform: topCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: `transform 220ms ${EASE}`,
          }}>
            <IconChevronDown size={12} />
          </span>
        </button>
      )}

      {/* 便条 + 覆盖层 的定位根。ActionSheet 已挪到 InputBar footer 内,这里只剩 NoteView + 各 overlay。 */}
      <div data-night={darkMode ? 'on' : undefined} style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <MobileNoteView />

        <AnimatePresence>{inventoryOpen && <InventoryOverlay />}</AnimatePresence>
        <AnimatePresence>{charSheetOpen && <CharSheetOverlay />}</AnimatePresence>
        <AnimatePresence>{npcOpen && <NpcOverlay />}</AnimatePresence>
        <AnimatePresence>{mapOpen && <MapOverlay />}</AnimatePresence>
        <AnimatePresence>
          {showToc && (
            <TocOverlay pages={pages} pageIndex={pageIndex} selectedToc={selectedToc} onSelect={onTocSelect} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
