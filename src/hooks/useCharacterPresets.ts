import { useState, useCallback } from 'react';

export interface CharacterPresetData {
  name: string;
  player: string;
  occupation: string;
  customOccupation: string;
  age: number;
  sex: string;
  residence: string;
  birthplace: string;
  charValues: Record<string, number>;
  luckValue: number | null;
  creditRating: number;
  occSkills: string[];
  occPoints: Record<string, number>;
  interestSkills: string[];
  interestPoints: Record<string, number>;
  description: string;
  beliefs: string;
  significantPeople: string;
  meaningfulLocations: string;
  treasuredPossessions: string;
  traits: string;
  injuries: string;
  phobias: string;
}

interface CharacterPreset {
  name: string;
  data: CharacterPresetData;
}

const STORAGE_KEY = 'coc_char_presets';

export function useCharacterPresets() {
  const [presets, setPresets] = useState<CharacterPreset[]>(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
    catch { return []; }
  });

  const savePreset = useCallback((data: CharacterPresetData): boolean => {
    const name = (typeof prompt === 'function' ? prompt('请输入预设名称:') : '')?.trim();
    if (!name) return false;
    const filtered = presets.filter(p => p.name !== name);
    const next = [...filtered, { name, data }].slice(-10);
    setPresets(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota exceeded */ }
    return true;
  }, [presets]);

  const deletePreset = useCallback((name: string) => {
    const next = presets.filter(p => p.name !== name);
    setPresets(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota exceeded */ }
  }, [presets]);

  return { presets, savePreset, deletePreset };
}
