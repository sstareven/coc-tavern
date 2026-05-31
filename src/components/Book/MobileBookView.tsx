// src/components/Book/MobileBookView.tsx
import { AnimatePresence } from 'framer-motion';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useBookStore } from '../../stores/useBookStore';
import { InventoryOverlay } from '../Inventory/InventoryPanel';
import { CharSheetOverlay } from '../CharSheet/CharSheetOverlay';
import { MobileTabBar, type MobileTab } from '../Layout/MobileTabBar';
import { StatusBar } from './StatusBar';
import { MobileNoteView } from './MobileNoteView';
import { ActionSheet } from './ActionSheet';
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

  const active: MobileTab | null =
    inventoryOpen ? 'inventory' : charSheetOpen ? 'charsheet' : showToc ? 'toc' : null;
  const anyOverlay = inventoryOpen || charSheetOpen || showToc;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
      <MobileTabBar active={active} onTab={onTab} />

      {/* 紧凑状态栏 */}
      <div style={{ flexShrink: 0, padding: '4px 8px', borderBottom: '1px solid rgba(196,168,85,0.12)', overflowX: 'auto' }}>
        <StatusBar compact />
      </div>

      {/* 便条 + 覆盖层 的定位根 */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <MobileNoteView />
        {!anyOverlay && <ActionSheet />}

        <AnimatePresence>{inventoryOpen && <InventoryOverlay />}</AnimatePresence>
        <AnimatePresence>{charSheetOpen && <CharSheetOverlay />}</AnimatePresence>
        <AnimatePresence>
          {showToc && (
            <TocOverlay pages={pages} pageIndex={pageIndex} selectedToc={selectedToc} onSelect={onTocSelect} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
