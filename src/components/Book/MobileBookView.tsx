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
import { MobileTabBar, type MobileTab } from '../Layout/MobileTabBar';
import { StatusBar } from './StatusBar';
import { MobileNoteView } from './MobileNoteView';
import { TocOverlay } from './TocOverlay';

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

  const active: MobileTab | null =
    inventoryOpen ? 'inventory' : charSheetOpen ? 'charsheet' : npcOpen ? 'npc' : mapOpen ? 'map' : showToc ? 'toc' : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
      <MobileTabBar active={active} onTab={onTab} />

      {/* 紧凑状态栏 —— position:relative + z-index 5 形成独立 stacking,确保 ActionSheet 抽屉/遮罩(zIndex 8/9)无法覆盖到它 */}
      <div style={{ position: 'relative', zIndex: 5, flexShrink: 0, padding: '5px 8px', background: '#14100b', borderBottom: '1px solid rgba(196,168,85,0.12)', overflowX: 'auto' }}>
        <StatusBar compact />
      </div>

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
