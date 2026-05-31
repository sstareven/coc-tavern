import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { btnBase, btnDisabled } from './styles';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useChatStore } from '../../stores/useChatStore';
import { useBookStore } from '../../stores/useBookStore';
import { kvSet } from '../../db/kv';
import { useDarkThreadStore } from '../../stores/useDarkThreadStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { useVariableStore } from '../../stores/useVariableStore';
import { useLorebookStore } from '../../stores/useLorebookStore';
import { useKeywordStore } from '../../stores/useKeywordStore';
import { cleanupOrphanGameState, saveConversation } from '../../stores/sessionLifecycle';
import { useCharacterPresetsStore, type CharacterPreset } from '../../stores/useCharacterPresetsStore';
import { sendChatCompletion } from '../../sillytavern/api-router';
import { DEFAULT_INPUT_PRESET } from '../../constants/presets';
import type { CharacterSheet, COC7Characteristic } from '../../types';
import {
  CHAR_ROLL, getDBBuild, resolveSkillBase,
} from '../../sillytavern/coc-rules';
import {
  STEPS, CHAR_ORDER, type SkillCat, ALL_SKILLS, SKILL_DESC, COC_OCCUPATIONS,
  DEFAULT_CHARS, POOL_VALUES,
} from '../../sillytavern/coc-data';
import { StepIdentity } from './steps/StepIdentity';
import { StepCharacteristics } from './steps/StepCharacteristics';
import { StepDerivedStats } from './steps/StepDerivedStats';
import { StepSkills } from './steps/StepSkills';
import { StepBackground } from './steps/StepBackground';
import { StepReview } from './steps/StepReview';

/* ============================== Helpers ============================== */

function getBaseForSkill(sk: typeof ALL_SKILLS[number], charValues: Record<COC7Characteristic, number>): number {
  if (typeof sk.base === 'number') return sk.base;
  if (sk.base === 'DEX_HALF') return Math.floor((charValues.DEX ?? 50) / 2);
  return charValues.EDU ?? 50;
}

/* ============================== Component ============================== */

interface Props {
  onComplete: () => void;
  onClose: () => void;
}

export function CharacterCreator({ onComplete, onClose }: Props) {
  const setSheet = useCharSheetStore((s) => s.setSheet);
  const [step, setStep] = useState(0);

  /* ---- Step 1: Identity ---- */
  const [name, setName] = useState('');
  const [player, setPlayer] = useState('');
  const [occupation, setOccupation] = useState('');
  const [customOccupation, setCustomOccupation] = useState('');
  const [age, setAge] = useState(25);
  const [sex, setSex] = useState('男');
  const [residence, setResidence] = useState('');
  const [birthplace, setBirthplace] = useState('');

  /* ---- Step 2: Characteristics ---- */
  const [charValues, setCharValues] = useState<Record<COC7Characteristic, number>>(DEFAULT_CHARS);

  const [poolMode, setPoolMode] = useState(true);
  const [poolAssignments, setPoolAssignments] = useState<Record<COC7Characteristic, number | null>>(() => {
    const init = {} as Record<COC7Characteristic, number | null>;
    CHAR_ORDER.forEach((c) => { init[c.key] = null; });
    return init;
  });
  const [poolValues, setPoolValues] = useState<number[]>(() => [...POOL_VALUES]);

  const availablePoolValues = useMemo(() => {
    const remaining = [...poolValues];
    const assigned = (Object.values(poolAssignments) as (number | null)[]).filter((v): v is number => v != null);
    for (const v of assigned) {
      const idx = remaining.indexOf(v);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    return remaining;
  }, [poolAssignments, poolValues]);

  const allCharsAssigned = poolMode
    ? CHAR_ORDER.every((c) => poolAssignments[c.key] != null)
    : CHAR_ORDER.every((c) => typeof charValues[c.key] === 'number');

  /* ---- Lifted callbacks for StepCharacteristics ---- */

  const adjChar = (key: COC7Characteristic, delta: number) => {
    setCharValues(prev => {
      const v = (prev[key] || 50) + delta;
      return { ...prev, [key]: Math.max(1, Math.min(99, v)) };
    });
  };

  const rollChar = (key: COC7Characteristic) => {
    const fn = CHAR_ROLL[key];
    const val = fn ? fn() : 50;
    setCharValues(prev => ({ ...prev, [key]: val }));
  };

  const randomAll = () => {
    const newVals: Record<string, number> = {};
    CHAR_ORDER.forEach(({ key }) => { const fn = CHAR_ROLL[key]; newVals[key] = fn ? fn() : 50; });
    setCharValues(prev => ({ ...prev, ...newVals }));
  };

  const handlePoolAssign = (key: COC7Characteristic, value: number | null) => {
    setPoolAssignments((prev) => {
      const next = { ...prev, [key]: value };
      if (value != null) {
        setCharValues((cv) => ({ ...cv, [key]: value }));
      }
      return next;
    });
  };

  const switchToFreeMode = () => {
    const newChars = { ...charValues };
    CHAR_ORDER.forEach(({ key }) => {
      if (poolAssignments[key] != null) {
        newChars[key] = poolAssignments[key]!;
      }
    });
    setCharValues(newChars);
    setPoolMode(false);
  };

  const switchToPoolMode = () => {
    const newAssignments = {} as Record<COC7Characteristic, number | null>;
    const remaining = [...poolValues];
    CHAR_ORDER.forEach(({ key }) => {
      const val = charValues[key] ?? 50;
      const idx = remaining.indexOf(val);
      if (idx >= 0) {
        newAssignments[key] = val;
        remaining.splice(idx, 1);
      } else {
        newAssignments[key] = null;
      }
    });
    setPoolAssignments(newAssignments);
    setPoolMode(true);
  };

  // 清空点数池分配：所有骰子退回托盘
  const resetPool = () => {
    const cleared = {} as Record<COC7Characteristic, number | null>;
    CHAR_ORDER.forEach(({ key }) => { cleared[key] = null; });
    setPoolAssignments(cleared);
  };

  // 「随机」：用 COC 骰子公式重掷 8 个池数值，放回骰子池等待拖拽分配（不填入属性）
  const randomizePool = () => {
    const rolled = CHAR_ORDER.map(({ key }) => {
      const fn = CHAR_ROLL[key];
      return fn ? fn() : 50;
    });
    setPoolValues(rolled);
    // 清空旧分配：旧骰子数值可能已不在新池中
    const cleared = {} as Record<COC7Characteristic, number | null>;
    CHAR_ORDER.forEach(({ key }) => { cleared[key] = null; });
    setPoolAssignments(cleared);
  };

  // 随机打乱：把 8 个固定池数值洗牌后逐一分配到 8 个属性
  const shufflePool = () => {
    const shuffled = [...poolValues];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const nextAssign = {} as Record<COC7Characteristic, number | null>;
    const nextChars = { ...charValues };
    CHAR_ORDER.forEach(({ key }, i) => {
      nextAssign[key] = shuffled[i];
      nextChars[key] = shuffled[i];
    });
    setPoolAssignments(nextAssign);
    setCharValues(nextChars);
  };

  // 交换两个属性的骰子（拖到已占用的槽位时触发；目标可为空=移动）
  const swapPool = (from: COC7Characteristic, to: COC7Characteristic) => {
    if (from === to) return;
    setPoolAssignments((prev) => {
      const fromVal = prev[from];
      const toVal = prev[to];
      const next = { ...prev, [to]: fromVal, [from]: toVal };
      setCharValues((cv) => ({
        ...cv,
        [to]: fromVal != null ? fromVal : cv[to],
        [from]: toVal != null ? toVal : cv[from],
      }));
      return next;
    });
  };

  const [luckValue, setLuckValue] = useState<number | null>(null);

  /* ---- Step 3: Derived (auto-calc) ---- */
  const derived = useMemo(() => {
    const c = (k: COC7Characteristic) => charValues[k] ?? 0;
    const siz = c('SIZ');
    const con = c('CON');
    const pow = c('POW');
    const str = c('STR');
    const hpMax = Math.floor((siz + con) / 10);
    const sanMax = pow;
    const mpMax = Math.floor(pow / 5);
    const { db, build } = getDBBuild(str + siz);
    return { hpMax, sanMax, mpMax, db, build };
  }, [charValues]);

  /* ---- Step 4: Skills ---- */
  const [creditRating, setCreditRating] = useState(0);
  const crRef = useRef(creditRating);
  useEffect(() => { crRef.current = creditRating; }, [creditRating]);
  const [occSkills, setOccSkills] = useState<string[]>([]);
  const [occPoints, setOccPoints] = useState<Record<string, number>>({});
  const [interestSkills, setInterestSkills] = useState<string[]>([]);
  const [interestPoints, setInterestPoints] = useState<Record<string, number>>({});
  const [filterCat, setFilterCat] = useState<SkillCat | null>(null);
  const [openField, setOpenField] = useState<string | null>(null);

  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'occ' | 'int' | null>(null);

  const saveAndExit = () => { setEditingSkill(null); setEditingType(null); };

  const reEnterEdit = (skillName: string, type: 'occ' | 'int') => {
    setEditingSkill(skillName);
    setEditingType(type);
  };

  const eduVal = charValues.EDU ?? 0;
  const intVal = charValues.INT ?? 0;
  const occPointPool = eduVal * 4;
  const intPointPool = intVal * 2;
  const intRef = useRef(0);
  useEffect(() => { intRef.current = intPointPool; }, [intPointPool]);

  const toggleOccSkill = useCallback((skillName: string) => {
    setOccSkills((prev) => {
      if (prev.includes(skillName)) return prev;
      if (prev.length >= 8) return prev;
      return [...prev, skillName];
    });
    reEnterEdit(skillName, 'occ');
  }, []);

  const toggleInterestSkill = useCallback((skillName: string) => {
    setInterestSkills((prev) => {
      if (prev.includes(skillName)) return prev;
      return [...prev, skillName];
    });
    reEnterEdit(skillName, 'int');
  }, []);

  /* ---- Lifted callbacks for StepSkills ---- */

  const adjOccPoint = (skillName: string, delta: number) => {
    setOccPoints((p) => {
      const cur = p[skillName] ?? 0;
      const used = Object.values(p).reduce((a, b) => a + b, 0) + crRef.current;
      const remaining = occPointPool - used;
      const sk = ALL_SKILLS.find((s) => s.name === skillName);
      const base = sk ? getBaseForSkill(sk, charValues) : 0;
      const maxBySkill = 99 - base;
      const target = cur + delta;
      const newVal = Math.max(0, Math.min(Math.min(cur + remaining, maxBySkill), target));
      return { ...p, [skillName]: newVal };
    });
  };

  const adjIntPoint = (skillName: string, delta: number) => {
    setInterestPoints((p) => {
      const cur = p[skillName] ?? 0;
      const used = Object.values(p).reduce((a, b) => a + b, 0);
      const remaining = intPointPool - used;
      const sk = ALL_SKILLS.find((s) => s.name === skillName);
      const base = sk ? getBaseForSkill(sk, charValues) : 0;
      const maxBySkill = 99 - base;
      const target = cur + delta;
      const newVal = Math.max(0, Math.min(Math.min(cur + remaining, maxBySkill), target));
      return { ...p, [skillName]: newVal };
    });
  };

  const clearOccSkill = (skillName: string) => {
    setOccSkills((prev) => prev.filter((s) => s !== skillName));
    setOccPoints((p) => { const n = { ...p }; delete n[skillName]; return n; });
  };

  const clearIntSkill = (skillName: string) => {
    setInterestSkills((prev) => prev.filter((s) => s !== skillName));
    setInterestPoints((p) => { const n = { ...p }; delete n[skillName]; return n; });
  };

  const occTotalAllocated = Object.values(occPoints).reduce((a, b) => a + b, 0) + creditRating;
  const intTotalAllocated = Object.values(interestPoints).reduce((a, b) => a + b, 0);
  const occRemaining = occPointPool - occTotalAllocated;
  const intRemaining = intPointPool - intTotalAllocated;
  const canProceedStep4 = occRemaining === 0 && intRemaining === 0 && occSkills.length > 0;

  /* ---- Step 5: Background ---- */
  const [description, setDescription] = useState('');
  const [beliefs, setBeliefs] = useState('');
  const [significantPeople, setSignificantPeople] = useState('');
  const [meaningfulLocations, setMeaningfulLocations] = useState('');
  const [treasuredPossessions, setTreasuredPossessions] = useState('');
  const [traits, setTraits] = useState('');
  const [injuries, setInjuries] = useState('');
  const [phobias, setPhobias] = useState('');
  const [quickFilling, setQuickFilling] = useState(false);
  const [quickFillError, setQuickFillError] = useState('');

  /* ---- Presets ---- */
  const { presets, savePreset, deletePreset } = useCharacterPresetsStore();
  const [showPresetLoad, setShowPresetLoad] = useState(false);

  const saveCurrentPreset = useCallback(() => {
    const data = { name, player, occupation, customOccupation, age, sex, residence, birthplace, charValues, luckValue, creditRating, occSkills, occPoints, interestSkills, interestPoints, description, beliefs, significantPeople, meaningfulLocations, treasuredPossessions, traits, injuries, phobias };
    savePreset(data);
  }, [savePreset, name, player, occupation, customOccupation, age, sex, residence, birthplace, charValues, luckValue, creditRating, occSkills, occPoints, interestSkills, interestPoints, description, beliefs, significantPeople, meaningfulLocations, treasuredPossessions, traits, injuries, phobias]);

  const loadPreset = useCallback((preset: CharacterPreset) => {
    const d = preset.data;
    setName(d.name||''); setPlayer(d.player||''); setOccupation(d.occupation||''); setCustomOccupation(d.customOccupation||''); setAge(d.age??25); setSex(d.sex||'男'); setResidence(d.residence||''); setBirthplace(d.birthplace||'');
    setCharValues(d.charValues||DEFAULT_CHARS); setLuckValue(d.luckValue??null); setCreditRating(d.creditRating??0); setOccSkills(d.occSkills||[]); setOccPoints(d.occPoints||{}); setInterestSkills(d.interestSkills||[]); setInterestPoints(d.interestPoints||{});
    setDescription(d.description||''); setBeliefs(d.beliefs||''); setSignificantPeople(d.significantPeople||''); setMeaningfulLocations(d.meaningfulLocations||''); setTreasuredPossessions(d.treasuredPossessions||''); setTraits(d.traits||''); setInjuries(d.injuries||''); setPhobias(d.phobias||'');
    setPoolMode(false); setShowPresetLoad(false);
  }, [DEFAULT_CHARS]);

  const handleLoadPreset = useCallback((preset: CharacterPreset) => {
    loadPreset(preset);
    setStep(5);
  }, [loadPreset]);

  /* ---- Step 3: Luck roll ---- */

  const rollLuck = useCallback(() => {
    const d1 = Math.ceil(Math.random() * 6);
    const d2 = Math.ceil(Math.random() * 6);
    const d3 = Math.ceil(Math.random() * 6);
    setLuckValue((d1 + d2 + d3) * 5);
  }, []);

  /* ---- Confirm ---- */
  const handleConfirm = useCallback(() => {
    const chars = Object.fromEntries(
      CHAR_ORDER.map((c) => [c.key, charValues[c.key] ?? 50]),
    ) as Record<COC7Characteristic, number>;

    const siz = chars.SIZ;
    const con = chars.CON;
    const pow = chars.POW;
    const str = chars.STR;
    const hpMax = Math.floor((siz + con) / 10);
    const sanMax = pow;
    const mpMax = Math.floor(pow / 5);
    const { db, build } = getDBBuild(str + siz);

    const halfFifth = Object.fromEntries(
      CHAR_ORDER.map((c) => {
        const val = chars[c.key];
        return [c.key, { half: Math.floor(val / 2), fifth: Math.floor(val / 5) }];
      }),
    ) as Record<COC7Characteristic, { half: number; fifth: number }>;

    const luck = luckValue ?? 50;

    // Build skills record
    const skills: Record<string, { base: number; current: number }> = {};

    // Credit Rating
    skills['信用评级'] = { base: 0, current: creditRating };

    // Cthulhu Mythos — always 0, never increases through creation
    skills['克苏鲁神话'] = { base: 0, current: 0 };

    // Occupation skills
    for (const skillName of occSkills) {
      const spec = ALL_SKILLS.find((s) => s.name === skillName);
      const base = spec ? resolveSkillBase(spec.base, chars) : 0;
      const occAlloc = occPoints[skillName] ?? 0;
      const intAlloc = interestPoints[skillName] ?? 0;
      skills[skillName] = { base, current: Math.min(99, base + occAlloc + intAlloc) };
    }

    // Personal interest skills
    for (const skillName of interestSkills) {
      if (occSkills.includes(skillName)) continue;
      const spec = ALL_SKILLS.find((s) => s.name === skillName);
      const base = spec ? resolveSkillBase(spec.base, chars) : 0;
      const intAlloc = interestPoints[skillName] ?? 0;
      skills[skillName] = { base, current: Math.min(99, base + intAlloc) };
    }

    const charId = `INV-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`;

    const finalOccupation = occupation === '__custom__' ? (customOccupation || '调查员') : (occupation || '调查员');

      // Combine background fields into a rich description
      const bgParts: string[] = [];
      bgParts.push(`【个人描述 Description】\n${description.trim() || '此人的过往如同被墨水浸染的旧档案，所有记录都已模糊不清。没有人知道他从哪里来，也没有人能说清他经历过什么。'}`);
      bgParts.push(`【思想/信念 Beliefs】\n${beliefs.trim() || '信念栏是空白的——或许他什么都不相信，又或许他的信念过于危险，不宜写在纸上。'}`);
      bgParts.push(`【重要之人 Significant People】\n${significantPeople.trim() || '没有任何人被列为重要联系人。这意味着孤独，或者意味着保护。'}`);
      bgParts.push(`【重要场所 Meaningful Locations】\n${meaningfulLocations.trim() || '档案中未记录任何意义非凡之地。也许那些地方已经不复存在了。'}`);
      bgParts.push(`【珍贵之物 Treasured Possessions】\n${treasuredPossessions.trim() || '此人似乎没有任何牵挂之物——或者说，那些珍贵的东西早已失去。'}`);
      bgParts.push(`【特质 Traits】\n${traits.trim() || '沉默寡言，行踪不定。'}`);
      bgParts.push(`【伤口/伤痕 Injuries】\n${injuries.trim() || '表面上看不出明显伤痕，但谁知道衣领下藏着什么。'}`);
      bgParts.push(`【恐惧症/狂躁症 Phobias】\n${phobias.trim() || '未记录在案。但每个调查员都有不愿面对的东西。'}`);
      const combinedDesc = bgParts.join('\n\n');

      const sheet: CharacterSheet = {
        characteristics: chars,
        halfFifth,
        secondary: {
          hp: { current: hpMax, max: hpMax },
          san: { current: sanMax, max: sanMax },
          mp: { current: mpMax, max: mpMax },
          luck,
          mov: 8,
          db,
          build,
        },
        skills,
        identity: {
          name: name || '未命名调查员',
          occupation: finalOccupation,
          age,
          gender: sex,
          birthplace,
          residence,
          id: charId,
        },
        greeting: '',
        description: combinedDesc,
        personality: '',
        scenario: '',
        personaDescription: '',
      };

    try {
      const bg = {
        player,
        description,
        beliefs,
        significantPeople,
        meaningfulLocations,
        treasuredPossessions,
        traits,
        injuries,
        phobias,
      };
      kvSet('coc_character_bg', JSON.stringify(bg));
    } catch {
      /* quota exceeded */
    }

    setSheet(sheet);
    cleanupOrphanGameState();
    useDarkThreadStore.getState().clearAll();
    useInventoryStore.getState().clearAll();
    useVariableStore.getState().clearAll();
    useLorebookStore.getState().clearSummaryEntries();
    useKeywordStore.getState().replaceAll({});
    // 重置书本到全新序章——新会话不残留上一局页面，确保新建人物后立即显示序章页。
    useBookStore.getState().resetToPrologue();
    const newId = useChatStore.getState().createSession(sheet.identity.name || '未命名调查员');
    // 持久化新会话（含刚 setSheet 的角色卡 + 序章页）到关系表，避免未交互即返回主菜单时丢档。
    void saveConversation(newId);
    onComplete();
  }, [
    charValues, creditRating, occSkills, occPoints, interestSkills, interestPoints,
    luckValue, name, player, occupation, customOccupation, age, sex, residence, birthplace,
    description, beliefs, significantPeople, meaningfulLocations,
    treasuredPossessions, traits, injuries, phobias,
    setSheet, onComplete,
  ]);

  /* ---- Nav ---- */
  const canGoNext = () => {
    switch (step) {
      case 0: return name.trim().length > 0;
      case 1: return allCharsAssigned;
      case 2: return luckValue !== null;
      case 3: return canProceedStep4;
      case 4: return true;
      default: return true;
    }
  };

  const randomAllocate = () => {
    // Reset all
    setOccSkills([]); setOccPoints({});
    setInterestSkills([]); setInterestPoints({});
    setCreditRating(0);
    // Get suggested skills from current occupation
    const selectedOcc = occupation && occupation !== '__custom__' ? COC_OCCUPATIONS.find((o) => o.name === occupation) : null;
    const suggested = selectedOcc?.skills || [];
    const crMin = selectedOcc?.crMin ?? 0;
    const crMax = selectedOcc?.crMax ?? 99;
    const getBaseVal = (name: string) => {
      const sk = ALL_SKILLS.find((x) => x.name === name);
      if (!sk) return 0;
      if (typeof sk.base === 'number') return sk.base;
      if (sk.base === 'DEX_HALF') return Math.floor((charValues.DEX ?? 50) / 2);
      return charValues.EDU ?? 50;
    };
    const allocLoop = (points: Record<string, number>, names: string[], pool: number) => {
      const alloc = { ...points };
      let rem = pool;
      const eligible = names.filter((s) => (alloc[s] ?? 0) + getBaseVal(s) < 99);
      let safety = 0;
      while (rem > 0 && eligible.length > 0 && safety++ < 10000) {
        const i = Math.floor(Math.random() * eligible.length);
        const cur = alloc[eligible[i]] ?? 0;
        const cap = 99 - getBaseVal(eligible[i]);
        if (cur >= cap) { eligible.splice(i, 1); continue; }
        const add = Math.max(1, Math.min(rem, Math.ceil(Math.random() * Math.min(8, rem)), cap - cur));
        alloc[eligible[i]] = cur + add;
        rem -= add;
      }
      return alloc;
    };
    const shuffled = (arr: string[]) => arr.sort(() => Math.random() - 0.5);
    const isCustomOcc = occupation === '__custom__';
    if (!isCustomOcc && suggested.length > 0) {
      const cr = Math.floor(Math.random() * (Math.min(crMax, occPointPool) - crMin + 1)) + crMin;
      setCreditRating(cr);
      setOccSkills([...suggested]);
      const occPoolForSkills = occPointPool - cr;
      if (occPoolForSkills > 0) {
        setOccPoints((prev) => allocLoop(prev, suggested, occPoolForSkills));
      }
    } else {
      setCreditRating(0);
    }
    const usedNames = new Set(isCustomOcc ? [] : suggested);
    const intPool = ALL_SKILLS.filter((s) => !usedNames.has(s.name) && s.name !== '克苏鲁神话');
    const pickInt = shuffled(intPool.map((x) => x.name)).slice(0, 4);
    setInterestSkills(pickInt);
    if (pickInt.length > 0 && intPointPool > 0) {
      setInterestPoints((prev) => allocLoop(prev, pickInt, intPointPool));
    }
  };

  const nextStep = () => { if (canGoNext() && step < STEPS.length - 1) setStep(step + 1); };
  const prevStep = () => { if (step > 0) setStep(step - 1); };
  const prevOccRef = useRef(occupation);
  useEffect(() => {
    if (occupation && prevOccRef.current && occupation !== prevOccRef.current) {
      setOccSkills([]); setOccPoints({});
      setInterestSkills([]); setInterestPoints({});
      setCreditRating(0);
    }
    prevOccRef.current = occupation;
  }, [occupation]);

  /* ---- Quick Fill ---- */
  const quickFill = async () => {
    const settings = useSettingsStore.getState();
    if (!settings.apiKey) {
      setQuickFillError('请先在设置中配置API密钥后再使用快速填充功能。');
      return;
    }
    setQuickFillError('');
    setQuickFilling(true);
    try {
      const occText = occupation === '__custom__' ? customOccupation : occupation;
      const occObj = COC_OCCUPATIONS.find((o) => o.name === occupation);

      const charLines: string[] = [];
      for (const { key, zh } of CHAR_ORDER) {
        const v = charValues[key] ?? 50;
        const bars: string[] = [];
        if (v >= 80) bars.push('卓越');
        else if (v >= 70) bars.push('优秀');
        else if (v >= 60) bars.push('良好');
        else if (v >= 40) bars.push('中等');
        else bars.push('较低');
        charLines.push(`${zh} ${v}（${bars.join('')}）`);
      }

      const occSkillLines: string[] = [];
      for (const s of occSkills) {
        const sk = ALL_SKILLS.find((x) => x.name === s);
        const base = sk ? resolveSkillBase(sk.base, charValues as Record<COC7Characteristic, number>) : 0;
        const pts = (occPoints[s] ?? 0) + (interestPoints[s] ?? 0);
        const total = Math.min(99, base + pts);
        const desc = SKILL_DESC[s] || '';
        const tag = (occPoints[s] ?? 0) > 0 ? `[职业专精 +${occPoints[s]}]` : `[兴趣 +${interestPoints[s] ?? 0}]`;
        occSkillLines.push(`- ${s}：${total}%（基础${base} ${tag}）— ${desc}`);
      }

      const intOnly = interestSkills.filter((s) => !occSkills.includes(s));
      const intSkillLines: string[] = [];
      for (const s of intOnly) {
        const sk = ALL_SKILLS.find((x) => x.name === s);
        const base = sk ? resolveSkillBase(sk.base, charValues as Record<COC7Characteristic, number>) : 0;
        const pts = interestPoints[s] ?? 0;
        if (pts <= 0) continue;
        const desc = SKILL_DESC[s] || '';
        intSkillLines.push(`- ${s}：${Math.min(99, base + pts)}%（基础${base} +兴趣${pts}）— ${desc}`);
      }

      let occContext = '';
      if (occObj) {
        occContext = `推荐职业技能：${occObj.skills.join('、')}。信用评级范围：${occObj.crMin}%-${occObj.crMax}%。`;
      }

      const prompt = [
        `你是1920年代美国克苏鲁召唤（Call of Cthulhu 7th）TRPG 调查员背景故事生成器。`,
        `请根据以下角色数据，结合其职业特征、技能专精、出生地和居住地，为每个字段生成贴切的背景文本。`,
        ``,
        `## 角色身份`,
        `- 姓名：${name || '未知'}`,
        `- 职业：${occText || '调查员'}（1920年代美国，请理解该职业的典型形象、社会地位和生活方式）`,
        `- 年龄：${age}岁`,
        `- 性别：${sex}`,
        `${birthplace ? `- 出生地：${birthplace}` : ''}`,
        `${residence ? `- 居住地：${residence}` : ''}`,
        `${occContext ? `- ${occContext}` : ''}`,
        ``,
        `## 属性（数值越高越突出）`,
        ...charLines.map((l) => `- ${l}`),
        `${creditRating > 0 ? `- 信用评级：${creditRating}%（反映社会地位和经济水平）` : ''}`,
        ``,
        `## 职业技能（投入点数越高=该角色在这方面越精专/经验越丰富）`,
        ...(occSkillLines.length > 0 ? occSkillLines : ['（无职业技能投入）']),
        ...(intSkillLines.length > 0 ? ['', `## 兴趣技能`, ...intSkillLines] : []),
        ``,
        `## 生成要求`,
        `每个字段的内容必须与角色的职业、技能、属性和生活背景紧密相关：`,
        `- 外貌描述应体现职业特征（如：水手经日晒的皮肤、教授学者的气质、工人的粗壮的双手）`,
        `- 思想信念应与职业世界观一致（如：科学家相信理性、神职人员虔诚、记者追求真相）`,
        `- 重要之人应与职业/生活相关（如：教授的导师、记者的线人、医生的病人）`,
        `- 重要场所应是角色职业/生活中常去之处`,
        `- 珍贵之物应与其职业或人生经历相关`,
        `- 特质应反映技能专精指向的性格（如：擅心理学→敏锐、擅格斗→好斗、擅话术→圆滑）`,
        `- 伤疤应与职业风险或经历匹配（如无合理伤疤则留空）`,
        `- 恐惧症应与角色经历或职业环境相关（如无合理恐惧则留空）`,
        ``,
        `## 输出格式`,
        `严格按以下 ### 标题分段输出，每个字段用 ### 标记，标题后换行写中文内容。留空的字段写"无"。`,
        ``,
        `### 个人描述`,
        `（1-3句外貌与气质描述）`,
        ``,
        `### 思想信念`,
        `（1-3句）`,
        ``,
        `### 重要之人`,
        `（1句）`,
        ``,
        `### 重要场所`,
        `（1句）`,
        ``,
        `### 珍贵之物`,
        `（1句）`,
        ``,
        `### 特质`,
        `（关键词，逗号分隔）`,
        ``,
        `### 伤疤`,
        `（无则填"无"）`,
        ``,
        `### 恐惧症`,
        `（无则填"无"）`,
      ].join('\n');

      const response = await sendChatCompletion(
        [{ role: 'user', content: prompt }],
        { ...DEFAULT_INPUT_PRESET, temperature: 0.75, maxTokens: 1200 },
        settings.apiBaseUrl, settings.apiKey, settings.apiModel,
      );

      const rawText = response.content || '';

      const MARKER_MAP: Record<string, string> = {
        '个人描述': 'description', '思想信念': 'beliefs',
        '重要之人': 'significantPeople', '重要场所': 'meaningfulLocations',
        '珍贵之物': 'treasuredPossessions', '特质': 'traits',
        '伤疤': 'injuries', '恐惧症': 'phobias',
      };

      const sectionRe = /###\s*([^\n]+)\s*\n([\s\S]*?)(?=\n###\s|\n*$)/g;
      const extracted: Record<string, string> = {};
      let m: RegExpExecArray | null;
      while ((m = sectionRe.exec(rawText)) !== null) {
        const title = m[1].trim();
        const content = m[2].replace(/[\r\n]+$/, '').trim();
        const fieldKey = MARKER_MAP[title] ?? Object.entries(MARKER_MAP).find(([k]) => title.includes(k))?.[1];
        if (fieldKey && content && content !== '无') {
          extracted[fieldKey] = content;
        }
      }

      if (Object.keys(extracted).length === 0) {
        let jsonStr = rawText;
        const cbMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (cbMatch) jsonStr = cbMatch[1].trim();
        const braceStart = jsonStr.indexOf('{');
        const braceEnd = jsonStr.lastIndexOf('}');
        if (braceStart >= 0 && braceEnd > braceStart) jsonStr = jsonStr.substring(braceStart, braceEnd + 1);
        jsonStr = jsonStr.replace(/\n/g, ' ').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').replace(/[，、]/g, ',').replace(/[：]/g, ':');

        const FIELD_MAP: [string, string[]][] = [
          ['description', ['描述', '个人描述', '外貌']],
          ['beliefs', ['信念', '思想信念', '思想', '价值观', '信仰']],
          ['significantPeople', ['重要之人', '重要的人', '关系人物']],
          ['meaningfulLocations', ['重要场所', '有意义的场所', '场所']],
          ['treasuredPossessions', ['珍贵之物', '珍贵的物品', '物品']],
          ['traits', ['特质', '性格', '性格特质', '个性']],
          ['injuries', ['伤口', '伤痕', '伤疤', '旧伤']],
          ['phobias', ['恐惧症', '狂躁症', '恐惧', '畏惧']],
        ];

        function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

        try {
          const obj = JSON.parse(jsonStr);
          for (const [en, aliases] of FIELD_MAP) {
            if (obj[en] != null) extracted[en] = String(obj[en]);
            else for (const cn of aliases) { if (obj[cn] != null) { extracted[en] = String(obj[cn]); break; } }
          }
        } catch {
          for (const [en, aliases] of FIELD_MAP) {
            const allKeys = [en, ...aliases];
            for (const key of allKeys) {
              const re = new RegExp(`"${escapeRe(key)}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*[,}\\]]|$)`, 'i');
              const rm = jsonStr.match(re);
              if (rm) { extracted[en] = rm[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'); break; }
            }
          }
        }
      }

      const s = (v: string | undefined) => (v != null ? String(v) : '');
      const d = s(extracted.description);
      const b = s(extracted.beliefs);
      const sp = s(extracted.significantPeople);
      const ml = s(extracted.meaningfulLocations);
      const tp = s(extracted.treasuredPossessions);
      const t = s(extracted.traits);
      const i = s(extracted.injuries);
      const ph = s(extracted.phobias);

      const filled: string[] = [];
      if (d) { setDescription(d); filled.push('description'); }
      if (b) { setBeliefs(b); filled.push('beliefs'); }
      if (sp) { setSignificantPeople(sp); filled.push('significantPeople'); }
      if (ml) { setMeaningfulLocations(ml); filled.push('meaningfulLocations'); }
      if (tp) { setTreasuredPossessions(tp); filled.push('treasuredPossessions'); }
      if (t) { setTraits(t); filled.push('traits'); }
      if (i) { setInjuries(i); filled.push('injuries'); }
      if (ph) { setPhobias(ph); filled.push('phobias'); }

      if (filled.length === 0) {
        setQuickFillError('AI 返回的内容无法解析。请重试或手动填写。');
      } else {
        setQuickFillError('');
      }
    } catch (err: unknown) {
      setQuickFillError(`生成失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setQuickFilling(false);
    }
  };

  /* ---- Render step content ---- */
  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <StepIdentity
            name={name} setName={setName}
            player={player} setPlayer={setPlayer}
            age={age} setAge={setAge}
            sex={sex} setSex={setSex}
            residence={residence} setResidence={setResidence}
            birthplace={birthplace} setBirthplace={setBirthplace}
            presets={presets}
            showPresetLoad={showPresetLoad} setShowPresetLoad={setShowPresetLoad}
            onLoadPreset={handleLoadPreset}
            onDeletePreset={deletePreset}
          />
        );
      case 1:
        return (
          <StepCharacteristics
            charValues={charValues}
            poolMode={poolMode}
            poolAssignments={poolAssignments}
            availablePoolValues={availablePoolValues}
            onAdjChar={adjChar}
            onRollChar={rollChar}
            onRandomAll={randomAll}
            onPoolAssign={handlePoolAssign}
            onSwapPool={swapPool}
            onResetPool={resetPool}
            onRandomizePool={randomizePool}
            onShufflePool={shufflePool}
            onSwitchToFreeMode={switchToFreeMode}
            onSwitchToPoolMode={switchToPoolMode}
          />
        );
      case 2:
        return (
          <StepDerivedStats
            charValues={charValues}
            derived={derived}
            luckValue={luckValue}
            onRollLuck={rollLuck}
            onSetLuckValue={setLuckValue}
          />
        );
      case 3:
        return (
          <StepSkills
            occupation={occupation}
            onSetOccupation={setOccupation}
            customOccupation={customOccupation}
            onSetCustomOccupation={setCustomOccupation}
            occSkills={occSkills}
            interestSkills={interestSkills}
            occPoints={occPoints}
            interestPoints={interestPoints}
            creditRating={creditRating}
            onSetCreditRating={setCreditRating}
            filterCat={filterCat}
            onSetFilterCat={setFilterCat}
            editingSkill={editingSkill}
            editingType={editingType}
            charValues={charValues}
            occRemaining={occRemaining}
            intRemaining={intRemaining}
            occPointPool={occPointPool}
            intPointPool={intPointPool}
            onToggleOccSkill={toggleOccSkill}
            onToggleInterestSkill={toggleInterestSkill}
            onReEnterEdit={reEnterEdit}
            onAdjOccPoint={adjOccPoint}
            onAdjIntPoint={adjIntPoint}
            onClearOccSkill={clearOccSkill}
            onClearIntSkill={clearIntSkill}
            onSaveAndExit={saveAndExit}
          />
        );
      case 4:
        return (
          <StepBackground
            description={description} onSetDescription={setDescription}
            beliefs={beliefs} onSetBeliefs={setBeliefs}
            significantPeople={significantPeople} onSetSignificantPeople={setSignificantPeople}
            meaningfulLocations={meaningfulLocations} onSetMeaningfulLocations={setMeaningfulLocations}
            treasuredPossessions={treasuredPossessions} onSetTreasuredPossessions={setTreasuredPossessions}
            traits={traits} onSetTraits={setTraits}
            injuries={injuries} onSetInjuries={setInjuries}
            phobias={phobias} onSetPhobias={setPhobias}
            quickFilling={quickFilling}
            quickFillError={quickFillError}
            onQuickFill={quickFill}
            openField={openField}
            onSetOpenField={setOpenField}
          />
        );
      case 5:
        return (
          <StepReview
            charValues={charValues}
            derived={derived}
            luckValue={luckValue}
            name={name}
            player={player}
            occupation={occupation}
            customOccupation={customOccupation}
            age={age}
            sex={sex}
            residence={residence}
            birthplace={birthplace}
            occSkills={occSkills}
            interestSkills={interestSkills}
            occPoints={occPoints}
            interestPoints={interestPoints}
            creditRating={creditRating}
            description={description}
            beliefs={beliefs}
            significantPeople={significantPeople}
            meaningfulLocations={meaningfulLocations}
            treasuredPossessions={treasuredPossessions}
            traits={traits}
            injuries={injuries}
            phobias={phobias}
            onSavePreset={saveCurrentPreset}
          />
        );
      default:
        return null;
    }
  };

  /* ===== Main render ===== */
  return (
    <>
      <style>{`input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield;text-align:center}
.sk-btn{transition:filter 0.15s,transform 0.15s,text-shadow 0.15s;cursor:pointer;transform:translateZ(0)}
.sk-btn:hover{filter:brightness(2.3);transform:translateZ(0) scale(1.08)}
.sk-btn:active{filter:brightness(1.6);transform:translateZ(0) scale(0.95)}
.sk-btn-occ{text-shadow:0 0 5px rgba(196,168,85,0.7),0 0 10px rgba(196,168,85,0.3)}
.sk-btn-int{text-shadow:0 0 5px rgba(120,175,220,0.7),0 0 10px rgba(120,175,220,0.3)}
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.sk-desc-inner{display:flex;width:max-content;animation:ticker var(--tkr-dur,6s) linear infinite}
.sk-desc-inner span{flex-shrink:0;padding-right:120px}
input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.18)!important}
input[type=range]::-webkit-slider-thumb{transition:filter 0.15s,transform 0.15s cubic-bezier(0.4,0,0.2,1);cursor:pointer}
input[type=range]::-webkit-slider-thumb:hover{filter:brightness(1.3);transform:scale(1.25)}
input[type=range]::-webkit-slider-thumb:active{filter:brightness(0.85);transform:scale(0.85)}
.bg-input{scrollbar-width:thin;scrollbar-color:rgba(196,168,85,0.22) transparent}
.bg-input::-webkit-scrollbar{width:5px}
.bg-input::-webkit-scrollbar-track{background:rgba(0,0,0,0.12);border-radius:3px}
.bg-input::-webkit-scrollbar-thumb{background:rgba(196,168,85,0.22);border-radius:3px;transition:background 0.25s cubic-bezier(0.4,0,0.2,1)}
.bg-input::-webkit-scrollbar-thumb:hover{background:rgba(196,168,85,0.45)}
`}</style>
      {/* Backdrop */}
      <div
        onClick={() => {}}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 800,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 850,
        width: 560,
        maxWidth: '94vw',
        ...(step === 4
          ? { height: '55vh' }
          : { maxHeight: '88vh' }),
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        border: '1px solid rgba(196,168,85,0.25)',
        borderRadius: 6,
        boxShadow: '0 8px 60px rgba(0,0,0,0.7)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '18px 24px 14px',
          borderBottom: '1px solid rgba(196,168,85,0.18)',
          background: 'rgba(13,10,7,0.6)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                color: 'var(--gold)',
                letterSpacing: 4,
                margin: 0,
                lineHeight: 1.3,
              }}>
                创建调查员角色
              </h2>
              <div style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 11,
                color: 'var(--ink-subtle)',
                letterSpacing: 3,
                marginTop: 2,
              }}>
                INVESTIGATOR CREATOR
              </div>
            </div>
            <button onClick={onClose} className="sk-btn" style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid transparent', borderRadius: 3,
              background: 'transparent', color: 'var(--ink-subtle)', fontSize: 16,
              fontFamily: 'var(--font-ui)',
            }}>
              ✕
            </button>
          </div>

          {/* Step indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14,
          }}>
            {STEPS.map((label, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {i > 0 && (
                    <div style={{
                      width: 20, height: 1,
                      background: i <= step ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
                      transition: 'var(--transition-smooth)',
                    }} />
                  )}
                  <button
                    onClick={() => { if (done) setStep(i); }}
                    className={done ? 'sk-btn' : undefined}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      border: active ? '1px solid var(--gold)' : done ? '1px solid rgba(196,168,85,0.35)' : '1px solid rgba(255,255,255,0.1)',
                      background: active ? 'var(--gold)' : done ? 'rgba(196,168,85,0.15)' : 'transparent',
                      color: active ? 'var(--void)' : done ? 'var(--gold)' : 'var(--ink-subtle)',
                      fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700,
                      cursor: done ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {done ? '✓' : i + 1}
                  </button>
                  {active && (
                    <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          padding: '20px 24px',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--ink-faded) transparent',
          display: 'flex', flexDirection: 'column',
          minHeight: 0,
        }}>
            {renderStepContent()}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '14px 24px',
          borderTop: '1px solid rgba(196,168,85,0.15)',
          background: 'rgba(13,10,7,0.5)',
          flexShrink: 0,
        }}>
          <button
            onClick={prevStep}
            disabled={step === 0}
            className={step > 0 ? 'sk-btn' : undefined}
            style={step === 0 ? btnDisabled : btnBase}
          >
            ← 上一步
          </button>

          {step === 3 && (
            <button onClick={(e) => { e.stopPropagation(); randomAllocate(); }}
              className="sk-btn"
              style={{ ...btnBase, background: 'rgba(196,168,85,0.08)', borderColor: 'rgba(196,168,85,0.25)', color: 'var(--gold)' }}
            >⚄ 随机分配</button>
          )}

          {step < STEPS.length - 1 ? (
            <button
              onClick={nextStep}
              disabled={!canGoNext()}
              className={canGoNext() ? 'sk-btn' : undefined}
              style={canGoNext() ? { ...btnBase, background: 'rgba(196,168,85,0.15)', borderColor: 'rgba(196,168,85,0.5)' } : btnDisabled}
            >
              下一步 →
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              className="sk-btn"
              style={{ ...btnBase, background: 'rgba(139,58,58,0.25)', borderColor: 'rgba(204,51,51,0.4)', color: 'var(--blood-bright)' }}
            >
              确认创建
            </button>
          )}
        </div>
      </div>
    </>
  );
}
