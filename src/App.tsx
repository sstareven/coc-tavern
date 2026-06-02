import { useState, useEffect, useCallback } from 'react';
import { ErrorBoundary } from './components/Shared/ErrorBoundary';
import { LandingScreen } from './components/Landing/LandingScreen';
import { ChangelogModal } from './components/Landing/ChangelogModal';
import { CharacterCreator } from './components/CharSheet/CharacterCreator';
import { GameView } from './components/Layout/GameView';
import { DicePanel } from './components/Dice/DicePanel';
import { DiceHistory } from './components/Dice/DiceHistory';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { WorldbookPanel } from './components/Settings/WorldbookPanel';
import { LorebookEditor } from './components/Settings/LorebookEditor';
import { PresetPanel } from './components/Settings/PresetPanel';
import { PresetEditor } from './components/Settings/PresetEditor';
import { ChatlistPanel } from './components/Settings/ChatlistPanel';
import { ExtManager } from './components/Settings/ExtManager';
import { RegexEditor } from './components/Settings/RegexEditor';
import { VariablePanel } from './components/Settings/VariablePanel';
import { DebugLog } from './components/Shared/DebugLog';
import { DebugConsole } from './components/Shared/DebugConsole';
import { ErrorModal } from './components/Shared/ErrorModal';
import { StatusToast } from './components/Shared/StatusToast';
import { usePanelStore } from './stores/usePanelStore';
import { initBuiltinCommands } from './sillytavern/slash-commands';
import { initKvCache } from './db/kv';
import { migrateFromLocalStorage } from './db/migrations';
import { db, V2_UPGRADE_FAILED } from './db/database';
import { loadConversation } from './stores/sessionLifecycle';
import { useChatStore } from './stores/useChatStore';
import { useBookStore } from './stores/useBookStore';

export function App() {
  const [screen, setScreen] = useState<'landing' | 'creator' | 'game'>('landing');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initBuiltinCommands();
    (async () => {
      await initKvCache();
      // 一次性 localStorage → Dexie 迁移（幂等）。Dexie v2 .upgrade() 在 db 打开时自动运行。
      await migrateFromLocalStorage();
      // 触碰 db 确保 v2 升级已执行；若升级失败标志已写入则告警（降级路径尽力而为）。
      try {
        await db.open();
        const failed = await db.kvStore.get(V2_UPGRADE_FAILED);
        if (failed?.value === 'true') {
          console.warn('[DB] v2 迁移曾失败，部分历史存档可能未完全迁移到关系表。');
        }
      } catch (err) {
        console.error('[DB] 打开数据库失败：', err);
      }
      // 启动恢复活跃会话的完整状态（pages + gameState 各域）自关系表。
      const activeId = useChatStore.getState().activeId;
      if (activeId) {
        try {
          await loadConversation(activeId);
        } catch (err) {
          console.error('[DB] 启动恢复会话失败：', err);
        }
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const toGame = () => setScreen('game');
    const toMenu = () => setScreen('landing');
    document.addEventListener('debug-enter-game', toGame);
    document.addEventListener('debug-return-menu', toMenu);
    return () => { document.removeEventListener('debug-enter-game', toGame); document.removeEventListener('debug-return-menu', toMenu); };
  }, []);

  // 切回前台时补齐被后台 rAF 暂停而卡住的翻页：浏览器在后台标签页暂停 requestAnimationFrame，
  // 翻页动画无法走到完成帧，导致 pageIndex 不前进、画面停在上一页、isFlipping 卡死，须点击才恢复。
  // 监听 visibilitychange，在重新可见且仍处于翻页中时强制结算，立即提交到目标页。
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && useBookStore.getState().isFlipping) {
        useBookStore.getState().settleFlip();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const openPanel = usePanelStore((s) => s.openPanel);
  const closeAll = usePanelStore((s) => s.closeAll);
  const lorebookEditorBookId = usePanelStore((s) => s.lorebookEditorBookId);
  const presetEditorPreset = usePanelStore((s) => s.presetEditorPreset);
  const presetEditorOnSave = usePanelStore((s) => s.presetEditorOnSave);
  const openLorebookEditor = usePanelStore((s) => s.openLorebookEditor);
  const openPresetEditor = usePanelStore((s) => s.openPresetEditor);

  const returnToMenu = useCallback(() => setScreen('landing'), []);

  // Esc key to close all panels
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeAll]);

  if (!ready) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 40%, var(--abyss) 0%, var(--void) 100%)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '2px solid rgba(196,168,85,0.15)', borderTopColor: 'var(--gold)',
          animation: 'spin 0.9s linear infinite',
        }} />
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <>
      {screen === 'landing' && (
        <LandingScreen
          onStart={() => setScreen('creator')}
          onLoadGame={() => setScreen('game')}
        />
      )}
      {screen === 'creator' && (
        <CharacterCreator onComplete={() => setScreen('game')} onClose={() => setScreen('landing')} />
      )}
      {screen === 'game' && (
        <GameView onReturnToMenu={returnToMenu} />
      )}
      <ChangelogModal />

      {/* ── Global overlay panels — always mounted, self-managed via stores ── */}
      <DicePanel />

      {openPanel === 'settings' && (
        <SettingsPanel visible={true} onClose={closeAll} onReturnToMenu={returnToMenu} />
      )}
      {openPanel === 'worldbook' && (
        <WorldbookPanel onClose={closeAll} onEditBook={(bookId: string) => openLorebookEditor(bookId)} />
      )}
      {openPanel === 'preset' && (
        <PresetPanel onClose={closeAll} onEditPreset={(preset, onSave) => openPresetEditor(preset, onSave)} />
      )}
      {openPanel === 'presetEditor' && presetEditorPreset && (
        <PresetEditor preset={presetEditorPreset} onClose={closeAll} onSave={presetEditorOnSave ?? (() => {})} />
      )}
      {openPanel === 'chatlist' && (
        <ChatlistPanel onClose={closeAll} />
      )}
      {openPanel === 'lorebookEditor' && lorebookEditorBookId && (
        <LorebookEditor bookId={lorebookEditorBookId} onClose={closeAll} />
      )}
      {openPanel === 'extManager' && (
        <ExtManager onClose={closeAll} />
      )}
      {openPanel === 'diceHistory' && (
        <DiceHistory onClose={closeAll} />
      )}
      {openPanel === 'variable' && (
        <VariablePanel visible={true} onClose={closeAll} />
      )}

      <RegexEditor />
      <DebugLog />
      <DebugConsole />
      <ErrorModal />
      <StatusToast />
    </>
    </ErrorBoundary>
  );
}
