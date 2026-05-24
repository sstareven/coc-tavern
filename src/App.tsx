import { useState } from 'react';
import { LandingScreen } from './components/Landing/LandingScreen';
import { ChangelogModal } from './components/Landing/ChangelogModal';
import { CharacterCreator } from './components/CharSheet/CharacterCreator';
import { GameView } from './components/Layout/GameView';

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'creator' | 'game'>('landing');
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
        <GameView onReturnToMenu={() => setScreen('landing')} />
      )}
      <ChangelogModal />
    </>
  );
}
