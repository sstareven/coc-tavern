import { useState } from 'react';
import { LandingScreen } from './components/Landing/LandingScreen';
import { ChangelogModal } from './components/Landing/ChangelogModal';
import { GameView } from './components/Layout/GameView';

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'game'>('landing');
  return (
    <>
      {screen === 'landing' ? (
        <LandingScreen onStart={() => setScreen('game')} />
      ) : (
        <GameView onReturnToMenu={() => setScreen('landing')} />
      )}
      <ChangelogModal />
    </>
  );
}
