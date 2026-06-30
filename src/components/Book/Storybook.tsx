import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useBookStore } from '../../stores/useBookStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { InventoryOverlay } from '../Inventory/InventoryPanel';
import { useClueStore } from '../../stores/useClueStore';
import { useDiceStore } from '../../stores/useDiceStore';
import { useDarkThreadStore } from '../../stores/useDarkThreadStore';
import { useRescueStore } from '../../stores/useRescueStore';
import { CharSheetOverlay } from '../CharSheet/CharSheetOverlay';
import { triggerImageGenForPage } from '../../api/image-gen-trigger';
import { NpcOverlay } from '../NPC/NpcOverlay';
import { useNpcStore } from '../../stores/useNpcStore';
import { useNpcMemoryStore } from '../../stores/useNpcMemoryStore';
import { useWorldMemoryStore } from '../../stores/useWorldMemoryStore';
import { MapOverlay } from '../Map/MapOverlay';
import { useMapStore } from '../../stores/useMapStore';
import { useStreamingPrintStore } from '../../stores/useStreamingPrintStore';
import { useLocationElementStore } from '../../stores/useLocationElementStore';
import { useKeyClueStore } from '../../stores/useKeyClueStore';
import { useCombatStore } from '../../stores/useCombatStore';
import { useChaseStore } from '../../stores/useChaseStore';
import { usePanelStore } from '../../stores/usePanelStore';
import { useChatStore } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { persistActiveGameState } from '../../stores/sessionLifecycle';
import { usePageFlip } from '../../hooks/usePageFlip';
import { LeftPage } from './LeftPage';
import { RightPage } from './RightPage';
import { useSanityBubbleStore } from '../../stores/useSanityBubbleStore';
import { CombatPanel } from '../Combat/CombatPanel';
import { ChasePanel } from '../Chase/ChasePanel';
import { TocOverlay } from './TocOverlay';
import { PageNav } from './PageNav';
import { CSSFlipPage, FadingPage, AppearPage } from './PageFlip3D';
import { BookUtils } from '../Shared/BookUtils';
import { TokenDisplay } from '../Shared/TokenDisplay';
import { sfxPageFlip } from '../../audio/sfx';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobileBookView } from './MobileBookView';
import type { MobileTab } from '../Layout/MobileTabBar';

export function Storybook() {
  const pages = useBookStore((s) => s.pages);
  const [showToc, setShowToc] = useState(false);
  const [selectedToc, setSelectedToc] = useState(-1);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const isFlipping = useBookStore((s) => s.isFlipping);
  const flipProgress = useBookStore((s) => s.flipProgress);
  const direction = useBookStore((s) => s.flipDirection);
  const streamingPlaceholderIdx = useBookStore((s) => s.streamingPlaceholderIdx);
  const isStreamingPrintRaw = useStreamingPrintStore((s) => s.isStreamingPrint);
  // 仅在当前页是流式占位页时, 才把 isStreamingPrint 传给 LeftPage/RightPage.
  // 否则玩家流式期间翻回旧页, 旧页的 leftContent 会被流式 segments 覆盖显示空白(bug #4).
  const isStreamingPrint = isStreamingPrintRaw && streamingPlaceholderIdx !== null && pageIndex === streamingPlaceholderIdx;
  const streamingLeftSegments = useStreamingPrintStore((s) => s.leftSegments);
  const streamingLeftHeader = useStreamingPrintStore((s) => s.leftHeaderText);
  const streamingRightSegments = useStreamingPrintStore((s) => s.rightSegments);
  const streamingRightHeader = useStreamingPrintStore((s) => s.rightHeaderText);
  const streamingSummary = useStreamingPrintStore((s) => s.summarySegments);
  const streamingChoices = useStreamingPrintStore((s) => s.choices);
  const encounter = useCombatStore((s) => s.encounter);
  const chase = useChaseStore((s) => s.chase);
  const { flipForward, flipBackward, canGoNext, canGoPrev } = usePageFlip();
  const darkMode = useSettingsStore((s) => s.darkMode);
  const bookZoom = useSettingsStore((s) => s.bookZoom) ?? 1;
  const inventoryOpen = useInventoryStore((s) => s.isOpen);
  const charSheetOpen = useCharSheetStore((s) => s.isOpen);
  const npcOpen = useNpcStore((s) => s.isOpen);
  const mapOpen = useMapStore((s) => s.isOpen);
  const deletePageStore = useBookStore((s) => s.deletePage);
  const isMobile = useIsMobile();
  const activeConvId = useChatStore((s) => s.activeId);

  // 切换/读取会话时收起目录浮层（库存/角色卡由 clearAllGameState 负责关闭）。
  useEffect(() => {
    setShowToc(false);
    setSelectedToc(-1);
  }, [activeConvId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inventoryOpen) useInventoryStore.getState().close();
        if (charSheetOpen) useCharSheetStore.getState().close();
        if (npcOpen) useNpcStore.getState().close();
        if (mapOpen) useMapStore.getState().close();
        if (showToc) { setShowToc(false); setSelectedToc(-1); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [inventoryOpen, charSheetOpen, npcOpen, mapOpen, showToc]);

  const page = pages[pageIndex];

  // A2 重设: 当前页 SAN 气泡 id 喂进 useSanityBubbleStore.pending — 决定本页选项是否被阻塞。
  // 仅最新页(玩家正待选择的页)的气泡才阻塞选项; 翻回老页面看到的气泡只是已解决态视觉。
  // ⚠ 必须在所有早返之前调用（React Hooks 规则: 不可在条件后才调）。!page guard 移进 hook 内部。
  useSanityBubbleEffect(page?.sanityCheckPrompts, !!page && pageIndex === pages.length - 1);

  if (!page) return null;

  // 战斗面板只在「战斗所属页」显示：翻去别页见正常左右页，翻回战斗页才显示面板。
  // 老存档/在途战斗无 anchorPageId 时回退为「在最新页显示」，不破坏在途战斗。
  const inCombat = !!encounter && (
    encounter.anchorPageId
      ? page.id === encounter.anchorPageId
      : pageIndex === pages.length - 1
  );

  // 追逐面板只在「追逐所属页」显示——与战斗面板同逻辑。
  const inChase = !inCombat && !!chase && (
    chase.anchorPageId
      ? page.id === chase.anchorPageId
      : pageIndex === pages.length - 1
  );

  const closeOtherOverlays = (keep?: 'inventory' | 'charsheet' | 'npc' | 'map' | 'toc') => {
    // 若本次切换会关掉某个正打开的浮层，播一次翻页音效（与「返回」一致，配合右页退场动画）。
    const willClose =
      (keep !== 'inventory' && inventoryOpen) ||
      (keep !== 'charsheet' && charSheetOpen) ||
      (keep !== 'npc' && npcOpen) ||
      (keep !== 'map' && mapOpen) ||
      (keep !== 'toc' && showToc);
    if (willClose) { try { sfxPageFlip(); } catch { /* audio not available */ } }
    if (keep !== 'inventory') useInventoryStore.getState().close();
    if (keep !== 'charsheet') useCharSheetStore.getState().close();
    if (keep !== 'npc') useNpcStore.getState().close();
    if (keep !== 'map') useMapStore.getState().close();
    if (keep !== 'toc' && showToc) { setShowToc(false); setSelectedToc(-1); }
  };

  // 已有浮层打开时再切到另一个浮层：跳过书本装饰翻页（否则会多播一次"左页翻页"，体验割裂）。
  const anyOverlayOpen = inventoryOpen || charSheetOpen || npcOpen || mapOpen || showToc;
  const flipIfFromBook = () => { if (!anyOverlayOpen) useBookStore.getState().decorativeFlip('backward', 800); };

  const handleMobileTab = (tab: MobileTab) => {
    if (tab === 'inventory') {
      if (inventoryOpen) { useInventoryStore.getState().close(); return; }
      closeOtherOverlays('inventory');
      useInventoryStore.getState().toggle();
    } else if (tab === 'charsheet') {
      if (charSheetOpen) { useCharSheetStore.getState().close(); return; }
      closeOtherOverlays('charsheet');
      useCharSheetStore.getState().toggle();
    } else if (tab === 'npc') {
      if (npcOpen) { useNpcStore.getState().close(); return; }
      closeOtherOverlays('npc');
      useNpcStore.getState().toggle();
    } else if (tab === 'map') {
      if (mapOpen) { useMapStore.getState().close(); return; }
      closeOtherOverlays('map');
      useMapStore.getState().toggle();
    } else if (tab === 'toc') {
      if (showToc) {
        if (selectedToc >= 0) useBookStore.getState().goToPage(selectedToc);
        setSelectedToc(-1); setShowToc(false); return;
      }
      closeOtherOverlays('toc');
      setShowToc(true);
    } else if (tab === 'dice') {
      closeOtherOverlays();
      usePanelStore.getState().open('diceHistory');
    }
  };

  if (isMobile) {
    return (
      <MobileBookView
        showToc={showToc}
        selectedToc={selectedToc}
        onTocSelect={(i) => setSelectedToc(selectedToc === i ? -1 : i)}
        onTab={handleMobileTab}
      />
    );
  }

  // Debug: log right page data source
  if (page.rightHeader === '行动' && page.rightContent === '接下来你打算怎么做？') {
    console.warn('[Storybook] 第' + pageIndex + '页右页使用默认值 — 可能JSON解析失败或字段缺失', page);
  }

  // 删除会级联清除本页至最新页，确认弹窗中提示这些页加入的全部物品
  const affectedItems = pages
    .slice(pageIndex)
    .flatMap((p) => p.inventoryChanges ?? [])
    .filter((c) => c.action === 'add' || (c.action === 'update' && (c.quantity ?? 0) > 0))
    .map((c) => c.name)
    .filter((n): n is string => Boolean(n));

  const deletePage = () => {
    // 级联删除本页至最新页，然后以「剩余页面」为单源真理，清空并重放重建
    // 物品 / 线索 / NPC / 地图——确保这些派生状态随删页彻底回溯（不残留幽灵数据）。
    deletePageStore(pageIndex);
    const remaining = useBookStore.getState().pages;

    useInventoryStore.getState().clearAll();
    useClueStore.getState().clearAll();
    useNpcStore.getState().clearAll();
    useMapStore.getState().clearAll();
    useLocationElementStore.getState().clearAll();
    useDarkThreadStore.getState().clearAll();
    useKeyClueStore.getState().clearAll();

    for (const p of remaining) {
      if (p.inventoryChanges?.length) useInventoryStore.getState().applyChanges(p.inventoryChanges);
      if (p.clues?.length) useClueStore.getState().addClues(p.clues);
      if (p.npcUpdates?.length) useNpcStore.getState().applyUpdates(p.npcUpdates);
      if (p.mapUpdates) useMapStore.getState().applyUpdates(p.mapUpdates);
      if (p.locationElements?.length) useLocationElementStore.getState().applyExtracted(p.locationElements);
      if (p.darkThread?.development) {
        useDarkThreadStore.getState().addEntry({
          progress: p.darkThread.progress,
          threatLevel: p.darkThread.threatLevel,
          details: p.darkThread.development,
          foreshadowing: p.darkThread.foreshadowing,
        });
      }
    }

    // 人物状态回溯：恢复到剩余最后一页的角色卡快照（HP/SAN/MP/姿态/状态/技能）。
    // 老存档页面无快照则不动角色卡，避免误清。
    const lastSnap = [...remaining].reverse().find((p) => p.sheetSnapshot)?.sheetSnapshot;
    if (lastSnap) useCharSheetStore.getState().setSheet(lastSnap);

    // NPC 名册回溯：优先用剩余末页的整页快照（含战斗结算的昏迷/死亡等，比 npcUpdates 重放更可靠）；
    // 老存档无快照则保留上面的「clearAll + 重放 npcUpdates」兜底。
    const lastNpcSnap = [...remaining].reverse().find((p) => p.npcSnapshot)?.npcSnapshot;
    if (lastNpcSnap) useNpcStore.getState().replaceAll(Object.values(lastNpcSnap));

    // Agent Memory(2026-06-10) 回溯：与 sheet/npc 同模式。开关关闭过的会话无快照 → 不动 store。
    const lastNpcMemSnap = [...remaining].reverse().find((p) => p.npcMemorySnapshot)?.npcMemorySnapshot;
    if (lastNpcMemSnap) useNpcMemoryStore.getState().replaceAll(lastNpcMemSnap);
    const lastWorldMemSnap = [...remaining].reverse().find((p) => p.worldMemorySnapshot)?.worldMemorySnapshot;
    if (lastWorldMemSnap) useWorldMemoryStore.getState().replace(lastWorldMemSnap);

    // 检定记录回溯：从剩余页面的 diceResults 重建（newest-first），并补上页码。
    useDiceStore.getState().setHistory(
      remaining.flatMap((p, i) => (p.diceResults ?? []).map((r) => ({ ...r, page: r.page ?? i + 1 }))).reverse(),
    );

    // 拯救路径回溯:与 sheet/npc 同模式,从剩余末页含 rescue 快照的页 hydrate;
    // 老存档无快照则保持 clear() 后空态(globalStatus='潜伏' RescueBar 不渲染)。
    useRescueStore.getState().clear();
    const lastRescueSnap = [...remaining].reverse().find((p) => p.rescue)?.rescue;
    if (lastRescueSnap) useRescueStore.getState().hydrateFromSnapshot(lastRescueSnap);

    // 删页后清理孤立的战斗/追逐：锚定页已被级联删除 → 面板不可见却堵死入口，与读档自愈同理。
    {
      const remainingIds = remaining.map((p) => p.id ?? '');
      const enc = useCombatStore.getState().encounter;
      if (enc?.anchorPageId && !remainingIds.includes(enc.anchorPageId)) {
        useCombatStore.getState().clearCombat();
      }
      const ch = useChaseStore.getState().chase;
      if (ch?.anchorPageId && !remainingIds.includes(ch.anchorPageId)) {
        useChaseStore.getState().clearChase();
      }
    }

    persistActiveGameState();
  };

  // --- paper-style bookmark tab ---
  const bookmarkTab: React.CSSProperties = {
    width: 130,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 14,
    fontFamily: '"PingFang SC", "DengXian", "Noto Serif SC", var(--font-ui), sans-serif',
    fontSize: 'calc(11px * var(--text-ratio, 1))',
    letterSpacing: 1.5,
    color: 'var(--book-ink)',
    background: `
      linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-edge) 50%, var(--book-page-mid) 100%)
    `,
    borderTop: '1px solid rgba(139,100,60,0.2)',
    borderRight: '1px solid rgba(139,100,60,0.2)',
    borderBottom: '1px solid rgba(139,100,60,0.2)',
    borderLeft: 'none',
    borderRadius: '2px 6px 6px 2px',
    cursor: 'pointer',
    boxShadow: `
      1px 2px 4px rgba(0,0,0,0.12),
      inset 0 1px 0 rgba(255,255,255,0.3)
    `,
    transition: 'all 0.25s ease',
    position: 'relative' as const,
  };

  const tocTabActive: React.CSSProperties = {
    ...bookmarkTab,
    color: 'var(--gold)',
    background: 'linear-gradient(175deg, #1a1510 0%, #0e0c08 50%, #1a1510 100%)',
    borderTop: '1px solid rgba(196,168,85,0.3)',
    borderRight: '1px solid rgba(196,168,85,0.3)',
    borderBottom: '1px solid rgba(196,168,85,0.3)',
    borderLeft: 'none',
    boxShadow: '1px 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(196,168,85,0.1)',
    paddingLeft: 18,
  };

  return (
    <div
      data-night={darkMode ? 'on' : undefined}
      style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      padding: `0 ${Math.max(10, 40 / bookZoom)}px`,
    }}>
      <style>{`
        .lp-scroll::-webkit-scrollbar,.rp-scroll::-webkit-scrollbar,.inv-scroll::-webkit-scrollbar{width:5px}
        .lp-scroll::-webkit-scrollbar-track,.rp-scroll::-webkit-scrollbar-track,.inv-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.06);border-radius:3px}
        .lp-scroll::-webkit-scrollbar-thumb,.rp-scroll::-webkit-scrollbar-thumb,.inv-scroll::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}
        .lp-scroll::-webkit-scrollbar-thumb:hover,.rp-scroll::-webkit-scrollbar-thumb:hover,.inv-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}
      `}</style>
      {/* Relative container wrapping book + utils + bookmarks */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 880 * bookZoom,
        height: '100%',
      }}>
        {/* BookUtils — outside the book at top-right */}
        <BookUtils onDeletePage={deletePage} affectedItems={affectedItems} />

        {/* Book container — perspective for 3D page flip */}
        <div style={{
          position: 'relative',
          zIndex: 3,
          display: 'flex',
          width: '100%',
          height: '100%',
          perspective: '1400px',
          perspectiveOrigin: 'center center',
          borderRadius: 4,
          background: 'linear-gradient(180deg, rgba(42,31,20,0.95) 0%, rgba(32,24,16,0.98) 100%)',
          boxShadow: [
            // Main floating shadow
            '0 4px 24px rgba(0,0,0,0.5)',
            '0 1px 4px rgba(0,0,0,0.3)',
            'inset 0 0 0 1px rgba(196,168,85,0.08)',
            // Left cover edge — dark leather thickness
            '-8px 0 12px -4px rgba(0,0,0,0.6)',
            // Right page stack edge — paper-toned
            '6px 0 10px -2px rgba(180,164,130,0.15)',
          ].join(', '),
        }}>
          {/* Book thickness — left cover edge pseudo-element effect */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 14,
            background: 'linear-gradient(to right, rgba(20,14,8,0.55) 0%, rgba(40,28,16,0.3) 40%, transparent 100%)',
            borderRadius: '4px 0 0 4px',
            pointerEvents: 'none',
            zIndex: 1,
          }} />

          {/* Book thickness — right page stack edge */}
          <div style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 14,
            background: 'linear-gradient(to left, rgba(180,164,130,0.18) 0%, rgba(212,196,160,0.06) 40%, transparent 100%)',
            borderRadius: '0 4px 4px 0',
            pointerEvents: 'none',
            zIndex: 1,
          }} />

          {/* Book thickness — bottom page stack with line texture */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 14,
            right: 14,
            height: 18,
            background: [
              'linear-gradient(to top, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.12) 30%, transparent 100%)',
              'repeating-linear-gradient(to top, rgba(180,164,130,0.06) 0px, rgba(180,164,130,0.06) 1px, transparent 1px, transparent 3px)',
            ].join(', '),
            borderRadius: '0 0 4px 4px',
            pointerEvents: 'none',
            zIndex: 0,
          }} />

          {/* Top shadow */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 14,
            right: 14,
            height: 8,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, transparent 100%)',
            pointerEvents: 'none',
            zIndex: 1,
          }} />

          {/* [A] 左页 */}
          <div style={{
            flex: '1 1 0', display: 'flex', position: 'relative', minHeight: 0, minWidth: 0,
            background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
            borderRadius: '3px 0 0 3px',
          }}>
            {isFlipping ? (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex' }}>
                {direction === 'backward' ? (
                  /* [A] flips to the right — rotating + fading out */
                  <CSSFlipPage progress={flipProgress} direction="backward">
                    <LeftPage header={page.leftHeader} content={page.leftContent} pageNum={page.leftPage} summary={page.summary} diceResults={page.diceResults} sanityCheckPrompts={page.sanityCheckPrompts} imageUrl={page.imageUrl} imagePageId={page.id} imageGenStatus={page.imageGenStatus} imageGenAt={page.imageGenAt} onRegenerateImage={() => { void triggerImageGenForPage({ pageIdx: pageIndex, source: 'manual' }); }} />
                  </CSSFlipPage>
                ) : (
                  /* Forward: [A] stays static, text fades out gradually */
                  <FadingPage progress={flipProgress}>
                    <LeftPage header={page.leftHeader} content={page.leftContent} pageNum={page.leftPage} summary={page.summary} diceResults={page.diceResults} sanityCheckPrompts={page.sanityCheckPrompts} imageUrl={page.imageUrl} imagePageId={page.id} imageGenStatus={page.imageGenStatus} imageGenAt={page.imageGenAt} onRegenerateImage={() => { void triggerImageGenForPage({ pageIdx: pageIndex, source: 'manual' }); }} />
                  </FadingPage>
                )}
              </div>
            ) : (
              <AppearPage pageIndex={pageIndex}>
                <LeftPage header={page.leftHeader} content={page.leftContent} pageNum={page.leftPage} summary={page.summary} diceResults={page.diceResults} sanityCheckPrompts={page.sanityCheckPrompts} imageUrl={page.imageUrl} imagePageId={page.id} imageGenStatus={page.imageGenStatus} imageGenAt={page.imageGenAt} onRegenerateImage={() => { void triggerImageGenForPage({ pageIdx: pageIndex, source: 'manual' }); }} isStreamingPrint={isStreamingPrint} streamingSegments={streamingLeftSegments} streamingHeader={streamingLeftHeader} streamingSummary={streamingSummary} />
              </AppearPage>
            )}
          </div>

          {/* [C] 书脊 */}
          <div style={{
            width: 2, flexShrink: 0,
            background: 'linear-gradient(to right, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.03) 50%, rgba(0,0,0,0.06) 100%)',
          }} />

          {/* [B] 右页 */}
          <div style={{
            flex: '1 1 0', display: 'flex', position: 'relative', minHeight: 0, minWidth: 0,
            background: 'linear-gradient(225deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
            borderRadius: '0 3px 3px 0',
          }}>
            {isFlipping ? (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex' }}>
                {direction === 'forward' ? (
                  /* [B] flips to the left — rotating + fading out */
                  <CSSFlipPage progress={flipProgress} direction="forward">
                    <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} rewrite={page.rewrite} inventoryChanges={page.inventoryChanges} sanityCheckPrompts={page.sanityCheckPrompts} narration={page.narration} />
                  </CSSFlipPage>
                ) : (
                  /* Backward: [B] stays static, text fades out gradually */
                  <FadingPage progress={flipProgress}>
                    <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} rewrite={page.rewrite} inventoryChanges={page.inventoryChanges} sanityCheckPrompts={page.sanityCheckPrompts} narration={page.narration} />
                  </FadingPage>
                )}
              </div>
            ) : inCombat ? (
              /* 战斗中：右页变即时战斗面板（CombatPanel 自带 flex:1 填满右页；脱战后 clearCombat 自动回正常右页） */
              <CombatPanel />
            ) : inChase ? (
              /* 追逐中：右页变追逐面板（与战斗面板同模式） */
              <ChasePanel />
            ) : (
              <AppearPage pageIndex={pageIndex}>
                <RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} rewrite={page.rewrite} inventoryChanges={page.inventoryChanges} sanityCheckPrompts={page.sanityCheckPrompts} narration={page.narration} isStreamingPrint={isStreamingPrint} streamingHeader={streamingRightHeader} streamingSegments={streamingRightSegments} streamingChoices={streamingChoices} />
              </AppearPage>
            )}
          </div>

          {/* TokenDisplay — inside book at bottom-right */}
          <TokenDisplay />

          {/* Table of Contents overlay */}
          <AnimatePresence>
            {showToc && (
              <TocOverlay pages={pages} pageIndex={pageIndex} selectedToc={selectedToc} onSelect={setSelectedToc} />
            )}
          </AnimatePresence>

          {/* Inventory overlay — book-page style */}
          <AnimatePresence>
            {inventoryOpen && <InventoryOverlay />}
          </AnimatePresence>

          {/* Investigator record overlay — book-page style */}
          <AnimatePresence>
            {charSheetOpen && <CharSheetOverlay />}
          </AnimatePresence>

          {/* NPC overlay — book-page style */}
          <AnimatePresence>
            {npcOpen && <NpcOverlay />}
          </AnimatePresence>

          {/* Map overlay */}
          <AnimatePresence>
            {mapOpen && <MapOverlay />}
          </AnimatePresence>

          {/* Navigation arrows — hidden when an overlay is open */}
          <div style={{
            opacity: showToc || inventoryOpen || charSheetOpen || npcOpen || mapOpen ? 0 : 1, pointerEvents: showToc || inventoryOpen || charSheetOpen || npcOpen || mapOpen ? 'none' : 'auto',
            transition: 'opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>
            <PageNav
              onFlipForward={flipForward}
              onFlipBackward={flipBackward}
              canGoNext={canGoNext}
              canGoPrev={canGoPrev}
            />
          </div>
        </div>

        {/* Bookmark tabs — positioned on the LEFT, tucked under book edge */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: '4%',
          transform: 'translateX(-100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 2,
        }}>
          {/* Tab 0: 物品/线索 → inventory overlay */}
          <button
            onClick={() => {
              if (inventoryOpen) {
                try { sfxPageFlip(); } catch { /* audio not available */ }
                useInventoryStore.getState().close();
                return;
              }
              closeOtherOverlays('inventory');
              flipIfFromBook();
              useInventoryStore.getState().toggle();
            }}
            style={inventoryOpen ? tocTabActive : bookmarkTab}
            onMouseEnter={(e) => {
              if (!inventoryOpen) {
                e.currentTarget.style.color = 'var(--blood)';
                e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-mid) 50%, var(--book-page-hi) 100%)';
                e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)';
                e.currentTarget.style.paddingLeft = '18px';
              }
            }}
            onMouseLeave={(e) => {
              if (!inventoryOpen) {
                e.currentTarget.style.color = 'var(--book-ink)';
                e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-edge) 50%, var(--book-page-mid) 100%)';
                e.currentTarget.style.boxShadow = '1px 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)';
                e.currentTarget.style.paddingLeft = '14px';
              }
            }}
          >
            <span style={{ marginRight: 6, fontSize: 'calc(10px * var(--text-ratio, 1))', opacity: 0.5 }}>{inventoryOpen ? '◁' : '◆'}</span>
            {inventoryOpen ? '返回' : '物品/线索'}
          </button>

          {/* Tab 1: 调查员记录 → character sheet overlay */}
          <button
            onClick={() => {
              if (charSheetOpen) {
                try { sfxPageFlip(); } catch { /* audio not available */ }
                useCharSheetStore.getState().close();
                return;
              }
              closeOtherOverlays('charsheet');
              flipIfFromBook();
              useCharSheetStore.getState().toggle();
            }}
            style={charSheetOpen ? tocTabActive : bookmarkTab}
            onMouseEnter={(e) => {
              if (!charSheetOpen) {
                e.currentTarget.style.color = 'var(--blood)';
                e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-mid) 50%, var(--book-page-hi) 100%)';
                e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)';
                e.currentTarget.style.paddingLeft = '18px';
              }
            }}
            onMouseLeave={(e) => {
              if (!charSheetOpen) {
                e.currentTarget.style.color = 'var(--book-ink)';
                e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-edge) 50%, var(--book-page-mid) 100%)';
                e.currentTarget.style.boxShadow = '1px 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)';
                e.currentTarget.style.paddingLeft = '14px';
              }
            }}
          >
            <span style={{ marginRight: 6, fontSize: 'calc(10px * var(--text-ratio, 1))', opacity: 0.5 }}>{charSheetOpen ? '◁' : '✦'}</span>
            {charSheetOpen ? '返回' : '调查员记录'}
          </button>

          {/* Tab: NPC → npc overlay */}
          <button
            onClick={() => {
              if (npcOpen) {
                try { sfxPageFlip(); } catch { /* audio not available */ }
                useNpcStore.getState().close();
                return;
              }
              closeOtherOverlays('npc');
              flipIfFromBook();
              useNpcStore.getState().toggle();
            }}
            style={npcOpen ? tocTabActive : bookmarkTab}
            onMouseEnter={(e) => {
              if (!npcOpen) {
                e.currentTarget.style.color = 'var(--blood)';
                e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-mid) 50%, var(--book-page-hi) 100%)';
                e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)';
                e.currentTarget.style.paddingLeft = '18px';
              }
            }}
            onMouseLeave={(e) => {
              if (!npcOpen) {
                e.currentTarget.style.color = 'var(--book-ink)';
                e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-edge) 50%, var(--book-page-mid) 100%)';
                e.currentTarget.style.boxShadow = '1px 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)';
                e.currentTarget.style.paddingLeft = '14px';
              }
            }}
          >
            <span style={{ marginRight: 6, fontSize: 'calc(10px * var(--text-ratio, 1))', opacity: 0.5 }}>{npcOpen ? '◁' : '◉'}</span>
            {npcOpen ? '返回' : '人物名册'}
          </button>

          {/* Tab: 地图 → map overlay */}
          <button
            onClick={() => {
              if (mapOpen) {
                try { sfxPageFlip(); } catch { /* audio not available */ }
                useMapStore.getState().close();
                return;
              }
              closeOtherOverlays('map');
              flipIfFromBook();
              useMapStore.getState().toggle();
            }}
            style={mapOpen ? tocTabActive : bookmarkTab}
            onMouseEnter={(e) => {
              if (!mapOpen) {
                e.currentTarget.style.color = 'var(--blood)';
                e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-mid) 50%, var(--book-page-hi) 100%)';
                e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)';
                e.currentTarget.style.paddingLeft = '18px';
              }
            }}
            onMouseLeave={(e) => {
              if (!mapOpen) {
                e.currentTarget.style.color = 'var(--book-ink)';
                e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-edge) 50%, var(--book-page-mid) 100%)';
                e.currentTarget.style.boxShadow = '1px 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)';
                e.currentTarget.style.paddingLeft = '14px';
              }
            }}
          >
            <span style={{ marginRight: 6, fontSize: 'calc(10px * var(--text-ratio, 1))', opacity: 0.5 }}>{mapOpen ? '◁' : '✛'}</span>
            {mapOpen ? '返回' : '地图'}
          </button>

          {/* Tab 2: 目录 → table of contents overlay */}
          <button
            onClick={() => {
              if (showToc) {
                if (selectedToc >= 0) useBookStore.getState().goToPage(selectedToc);
                setSelectedToc(-1);
                try { sfxPageFlip(); } catch { /* audio not available */ }
                setShowToc(false);
                return;
              }
              closeOtherOverlays('toc');
              flipIfFromBook();
              setShowToc(true);
            }}
            style={showToc ? tocTabActive : bookmarkTab}
            onMouseEnter={(e) => {
              if (!showToc) {
                e.currentTarget.style.color = 'var(--blood)';
                e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-mid) 50%, var(--book-page-hi) 100%)';
                e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)';
                e.currentTarget.style.paddingLeft = '18px';
              }
            }}
            onMouseLeave={(e) => {
              if (!showToc) {
                e.currentTarget.style.color = 'var(--book-ink)';
                e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-edge) 50%, var(--book-page-mid) 100%)';
                e.currentTarget.style.boxShadow = '1px 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)';
                e.currentTarget.style.paddingLeft = '14px';
              }
            }}
          >
            <span style={{ marginRight: 6, fontSize: 'calc(10px * var(--text-ratio, 1))', opacity: 0.5 }}>{showToc ? '◁' : '☰'}</span>
            {showToc ? '返回' : '目录'}
          </button>

          {/* Tab 3: 检定记录 → dice history */}
          <button
            onClick={() => { closeOtherOverlays(); usePanelStore.getState().open('diceHistory'); }}
            style={bookmarkTab}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--blood)';
              e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-mid) 50%, var(--book-page-hi) 100%)';
              e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)';
              e.currentTarget.style.paddingLeft = '18px';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--book-ink)';
              e.currentTarget.style.background = 'linear-gradient(175deg, var(--book-page-hi) 0%, var(--book-page-edge) 50%, var(--book-page-mid) 100%)';
              e.currentTarget.style.boxShadow = '1px 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)';
              e.currentTarget.style.paddingLeft = '14px';
            }}
          >
            <span style={{ marginRight: 6, fontSize: 'calc(10px * var(--text-ratio, 1))', opacity: 0.5 }}>◈</span>
            检定记录
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A2 重设: 把当前页 sanityCheckPrompts 的 id 同步进 useSanityBubbleStore.pending。
 * 仅当 isLatestPage=true 时喂进 — 翻历史页时不阻塞,因为玩家本就在回看。
 * 当切到其他页 / 卸载, 把 pending 清空(气泡块已经历过, 不需要再阻塞)。
 */
function useSanityBubbleEffect(prompts: import('../../types').SanityCheckPrompt[] | undefined, isLatestPage: boolean) {
  useEffect(() => {
    if (!isLatestPage) {
      useSanityBubbleStore.getState().setPending([]);
      return;
    }
    const ids = (prompts ?? []).map((p) => p.id);
    // loadPage 原子化「reset resolved + setPending(ids)」——每次新页生成 / 切回最新页都重置,
    // 防止上页 resolved={p1} 让新页同 id (p1/p2/p3 是模板常用 id) 被 SanityBubble 误判为
    // 已触发的灰圆点、点不开 / 不掉 SAN (2026-06-05 用户复现的延伸场景)。
    useSanityBubbleStore.getState().loadPage(ids);
    return () => {
      // 离开最新页 → 清空 pending(不影响 resolved 集合)
      useSanityBubbleStore.getState().setPending([]);
    };
  }, [prompts, isLatestPage]);
}
