import { useSettingsStore } from '../stores/useSettingsStore';
import { sfxPageFlip, sfxSuccess, sfxFailure, sfxCritSuccess, sfxCritFailure } from '../audio/sfx';

export function useAudio() {
  const enabled = useSettingsStore((s) => s.soundEnabled);
  return {
    playFlip: () => { if (enabled) sfxPageFlip(); },
    playSuccess: () => { if (enabled) sfxSuccess(); },
    playFailure: () => { if (enabled) sfxFailure(); },
    playCritSuccess: () => { if (enabled) sfxCritSuccess(); },
    playCritFailure: () => { if (enabled) sfxCritFailure(); },
  };
}
