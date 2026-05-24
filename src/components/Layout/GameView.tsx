import { useEffect, useState } from 'react';
import { TopBar } from './TopBar';
import { InputBar } from './InputBar';
import { Storybook } from '../Book/Storybook';
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
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <Storybook />
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

      {/* Character Creator */}
      {showCreator && (
        <CharacterCreator onClose={() => setShowCreator(false)} />
      )}
    </div>
  );
}
