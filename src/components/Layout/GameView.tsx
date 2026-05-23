import { TopBar } from './TopBar';
import { InputBar } from './InputBar';

interface Props { onReturnToMenu: () => void }

export function GameView({ onReturnToMenu }: Props) {
  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar onReturnToMenu={onReturnToMenu} />
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ color: 'var(--ink-subtle)', fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: 6 }}>
          深渊档案馆
        </div>
      </main>
      <InputBar />
    </div>
  );
}
