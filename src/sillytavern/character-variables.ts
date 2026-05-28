import { useCharSheetStore } from '../stores/useCharSheetStore';

export function buildCharacterVariables(): Record<string, string> {
  const sheet = useCharSheetStore.getState().sheet;
  const chars = Object.entries(sheet.characteristics)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return {
    charName: sheet.identity.name,
    charOccupation: sheet.identity.occupation,
    charAge: String(sheet.identity.age),
    charGender: sheet.identity.gender,
    charCharacteristics: chars,
    charHP: `${sheet.secondary.hp.current}/${sheet.secondary.hp.max}`,
    charSAN: `${sheet.secondary.san.current}/${sheet.secondary.san.max}`,
    charMP: `${sheet.secondary.mp.current}/${sheet.secondary.mp.max}`,
    charLuck: String(sheet.secondary.luck),
    // ── Nested ZOD path entries ──
    '调查员.生命值.当前': String(sheet.secondary.hp.current),
    '调查员.生命值.最大': String(sheet.secondary.hp.max),
    '调查员.理智值.当前': String(sheet.secondary.san.current),
    '调查员.理智值.最大': String(sheet.secondary.san.max),
    '调查员.魔法值.当前': String(sheet.secondary.mp.current),
    '调查员.魔法值.最大': String(sheet.secondary.mp.max),
    '调查员.姓名': sheet.identity.name,
    '调查员.职业': sheet.identity.occupation,
    '调查员.年龄': String(sheet.identity.age),
    '调查员.性别': sheet.identity.gender,
    '调查员.幸运': String(sheet.secondary.luck),
    greeting: sheet.greeting || '',
    description: sheet.description || '',
    personality: sheet.personality || '',
    scenario: sheet.scenario || '',
    personaDescription: sheet.personaDescription || '',
  };
}
