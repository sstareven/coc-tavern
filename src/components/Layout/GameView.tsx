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
import { VariablePanel } from '../Settings/VariablePanel';
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

        {/* Desk surface — slightly larger than the book, book rests on it */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          width: '100%',
          padding: '8px 0',
        }}>
          {/* Desk table surface */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(92vw, 960px)',
            height: 'min(65vh, 600px)',
            borderRadius: 16,
            background: `
              url("data:image/svg+xml,%3Csvg width='400' height='400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence baseFrequency='0.65 0.15' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.12'/%3E%3C/svg%3E"),
              linear-gradient(178deg,
                #4a3020 0%,
                #3d2818 15%,
                #352218 35%,
                #3a2416 55%,
                #2e1d10 75%,
                #25180c 100%
              ),
              repeating-linear-gradient(2deg, transparent, transparent 5px, rgba(0,0,0,0.03) 5px, rgba(0,0,0,0.03) 6px),
              repeating-linear-gradient(88deg, transparent, transparent 3px, rgba(255,255,255,0.015) 3px, rgba(255,255,255,0.015) 4px)
            `,
            backgroundBlendMode: 'normal, normal, multiply, overlay',
            border: '2px solid rgba(100,70,40,0.3)',
            borderRadius: 14,
            boxShadow: `
              inset 0 2px 3px rgba(255,255,255,0.04),
              inset 0 -3px 10px rgba(0,0,0,0.45),
              0 2px 0 rgba(120,80,40,0.08),
              0 0 50px rgba(0,0,0,0.55),
              0 20px 60px rgba(0,0,0,0.4)
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

      <VariablePanel
        visible={openPanel === 'variable'}
        onClose={closeAll}
      />

      {/* Character Creator */}
      {showCreator && (
        <CharacterCreator onComplete={() => setShowCreator(false)} onClose={() => setShowCreator(false)} />
      )}
    </div>
  );
}
