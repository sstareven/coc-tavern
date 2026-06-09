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

  const active: MobileTab | null =
    inventoryOpen ? 'inventory' : charSheetOpen ? 'charsheet' : npcOpen ? 'npc' : mapOpen ? 'map' : showToc ? 'toc' : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
      {/* 沉浸模式同时把顶部 tab 条藏起,顶端只剩页面卷轴。 */}
      {!immersive && <MobileTabBar active={active} onTab={onTab} />}

      {/* 紧凑状态栏 —— 沉浸时藏掉,让阅读区拿回这块约 30px 的高度。 */}
      {!immersive && (
        <div style={{ position: 'relative', zIndex: 5, flexShrink: 0, padding: '3px 8px', background: '#14100b', borderBottom: '1px solid rgba(196,168,85,0.12)' }}>
          <StatusBar compact />
        </div>
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
