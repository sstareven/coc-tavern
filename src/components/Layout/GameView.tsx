import { useEffect, useState } from 'react';
import { TopBar } from './TopBar';
import { InputBar } from './InputBar';
import { Storybook } from '../Book/Storybook';
import { StatusBar } from '../Book/StatusBar';
import { DicePanel } from '../Dice/DicePanel';
import { DiceHistory } from '../Dice/DiceHistory';
import { CharSheetPanel } from '../CharSheet/CharSheetPanel';
import { CharacterCreator } from '../CharSheet/CharacterCreator';
import { SettingsPanel } from '../Settings/SettingsPanel';
import { WorldbookPanel } from '../Settings/WorldbookPanel';
import { LorebookEditor } from '../Settings/LorebookEditor';
import { PresetPanel } from '../Settings/PresetPanel';
import { PresetEditor } from '../Settings/PresetEditor';
import { ChatlistPanel } from '../Settings/ChatlistPanel';
import { ExtManager } from '../Settings/ExtManager';
import { RegexEditor } from '../Settings/RegexEditor';
import { usePanelStore } from '../../stores/usePanelStore';

interface Props { onReturnToMenu: () => void }

export function GameView({ onReturnToMenu }: Props) {
  const openPanel = usePanelStore((s) => s.openPanel);
  const closeAll = usePanelStore((s) => s.closeAll);
  const lorebookEditorBookId = usePanelStore((s) => s.lorebookEditorBookId);
  const presetEditorPresetId = usePanelStore((s) => s.presetEditorPresetId);
  const openLorebookEditor = usePanelStore((s) => s.openLorebookEditor);
  const openPresetEditor = usePanelStore((s) => s.openPresetEditor);

  const [showCreator, setShowCreator] = useState(false);

  // Esc key to close all panels
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeAll]);

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar onReturnToMenu={onReturnToMenu} onCreateCharacter={() => setShowCreator(true)} />

      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        padding: '12px 0',
      }}>
        {/* Status bar above book */}
        <StatusBar />

        <Storybook />

        {/* Desk surface below book */}
        <div style={{
          width: '78%',
          maxWidth: 900,
          height: 28,
          flexShrink: 0,
          marginTop: -8,
          borderRadius: 4,
          background: 'linear-gradient(180deg, rgba(61,43,19,0.55) 0%, rgba(42,31,20,0.35) 40%, rgba(13,10,7,0.6) 100%)',
          border: '1px solid rgba(61,43,19,0.4)',
          borderTop: 'none',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 2px 6px rgba(196,168,85,0.04)',
        }} />
      </main>

      <InputBar />

      {/* Dice Panel — self-managed via useDiceStore */}
      <DicePanel />

      {/* Character sheet — self-managed via useCharSheetStore */}
      <CharSheetPanel />

      {/* Panel layer — managed by usePanelStore */}
      {openPanel === 'settings' && (
        <SettingsPanel
          visible={true}
          onClose={closeAll}
          onReturnToMenu={onReturnToMenu}
        />
      )}

      {openPanel === 'worldbook' && (
        <WorldbookPanel
          onClose={closeAll}
          onEditBook={(bookId: string) => openLorebookEditor(bookId)}
        />
      )}

      {openPanel === 'preset' && (
        <PresetPanel
          onClose={closeAll}
          onEditPreset={(id: string) => openPresetEditor(id)}
        />
      )}

      {openPanel === 'presetEditor' && presetEditorPresetId && (
        <PresetEditor presetId={presetEditorPresetId} onClose={closeAll} />
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

      <RegexEditor />

      {/* Character Creator */}
      {showCreator && (
        <CharacterCreator onComplete={() => setShowCreator(false)} onClose={() => setShowCreator(false)} />
      )}
    </div>
  );
}
