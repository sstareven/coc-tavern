import { useState, useEffect, useCallback } from 'react';
import { LandingScreen } from './components/Landing/LandingScreen';
import { ChangelogModal } from './components/Landing/ChangelogModal';
import { CharacterCreator } from './components/CharSheet/CharacterCreator';
import { GameView } from './components/Layout/GameView';
import { DicePanel } from './components/Dice/DicePanel';
import { DiceHistory } from './components/Dice/DiceHistory';
import { CharSheetPanel } from './components/CharSheet/CharSheetPanel';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { WorldbookPanel } from './components/Settings/WorldbookPanel';
import { LorebookEditor } from './components/Settings/LorebookEditor';
import { PresetPanel } from './components/Settings/PresetPanel';
import { PresetEditor } from './components/Settings/PresetEditor';
import { ChatlistPanel } from './components/Settings/ChatlistPanel';
import type { ChatPreset } from './types';
import { ExtManager } from './components/Settings/ExtManager';
import { RegexEditor } from './components/Settings/RegexEditor';
import { VariablePanel } from './components/Settings/VariablePanel';
import { DebugLog } from './components/Shared/DebugLog';
import { usePanelStore } from './stores/usePanelStore';
import { initBuiltinCommands } from './sillytavern/slash-commands';

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'creator' | 'game'>('landing');

  useEffect(() => { initBuiltinCommands(); }, []);

  const openPanel = usePanelStore((s) => s.openPanel);
  const closeAll = usePanelStore((s) => s.closeAll);
  const lorebookEditorBookId = usePanelStore((s) => s.lorebookEditorBookId);
  const presetEditorPreset = usePanelStore((s) => s.presetEditorPreset);
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

  return (
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
      <CharSheetPanel />

      {openPanel === 'settings' && (
        <SettingsPanel visible={true} onClose={closeAll} onReturnToMenu={returnToMenu} />
      )}
      {openPanel === 'worldbook' && (
        <WorldbookPanel onClose={closeAll} onEditBook={(bookId: string) => openLorebookEditor(bookId)} />
      )}
      {openPanel === 'preset' && (
        <PresetPanel onClose={closeAll} onEditPreset={(preset) => openPresetEditor(preset)} />
      )}
      {openPanel === 'presetEditor' && presetEditorPreset && (
        <PresetEditor preset={presetEditorPreset} onClose={closeAll} />
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
    </>
  );
}
