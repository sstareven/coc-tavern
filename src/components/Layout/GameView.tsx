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
        padding: '12px 24px 24px',
      }}>
        {/* Status bar above book */}
        <StatusBar />

        {/* Desk surface — large table that the book rests on */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          width: '100%',
        }}>
          {/* Desk table surface */}
          <div style={{
            position: 'absolute',
            inset: '8px 0 0 0',
            borderRadius: 12,
            background: `
              linear-gradient(175deg,
                rgba(61,43,19,0.7) 0%,
                rgba(51,35,15,0.65) 20%,
                rgba(42,28,12,0.7) 50%,
                rgba(35,22,10,0.75) 100%
              ),
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 30px,
                rgba(255,255,255,0.008) 30px,
                rgba(255,255,255,0.008) 31px
              ),
              repeating-linear-gradient(
                0deg,
                transparent,
                transparent 80px,
                rgba(0,0,0,0.04) 80px,
                rgba(0,0,0,0.04) 81px
              )
            `,
            border: '1px solid rgba(80,55,30,0.35)',
            boxShadow: `
              inset 0 2px 0 rgba(255,255,255,0.03),
              inset 0 -2px 8px rgba(0,0,0,0.4),
              0 0 60px rgba(0,0,0,0.5)
            `,
          }} />

          {/* Book resting on desk */}
          <Storybook />
        </div>
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
