import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { btnBase, btnDisabled } from './styles';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useVariableStore } from '../../stores/useVariableStore';
import { createInitialStatData } from '../../sillytavern/mvu-initial-statdata';
import { startNewConversation, saveConversation } from '../../stores/sessionLifecycle';
import { useCharacterPresetsStore, type CharacterPreset } from '../../stores/useCharacterPresetsStore';
import { sendChatCompletion } from '../../sillytavern/api-router';
import { DEFAULT_INPUT_PRESET } from '../../constants/presets';
import type { CharacterSheet, COC7Characteristic } from '../../types';
import {
  CHAR_ROLL, resolveSkillBase, deriveSecondaryStats,
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
import { useIsMobile } from '../../hooks/useIsMobile';

/* ============================== Helpers ============================== */

function getBaseForSkill(sk: typeof ALL_SKILLS[number], charValues: Record<COC7Characteristic, number>): number {
  // 取值这层保留在本地（从 ALL_SKILLS 项取 base spec），spec→base 解析委托给 resolveSkillBase 统一规则。
  return resolveSkillBase(sk.base, charValues);
}

/* ============================== Component ============================== */

interface Props {
  onComplete: () => void;
  onClose: () => void;
}

export function CharacterCreator({ onComplete, onClose }: Props) {
  const setSheet = useCharSheetStore((s) => s.setSheet);
  const isMobile = useIsMobile();
  // 人物创建面板不随「界面缩放」放大（太大）——反向 zoom 抵消根元素 zoom。
  const uiScale = useSettingsStore((s) => s.uiScale);
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
  const derived = useMemo(() => deriveSecondaryStats(charValues), [charValues]);

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
  const [backgroundFears, setBackgroundFears] = useState('');
  const [bgFilling, setBgFilling] = useState(false);
  const [backstoryError, setBackstoryError] = useState('');
  const [backstoryDraft, setBackstoryDraft] = useState('');
  const [bgConfirm, setBgConfirm] = useState(false);

  /* ---- Presets ---- */
  const { presets, savePreset, deletePreset } = useCharacterPresetsStore();
  const [showPresetLoad, setShowPresetLoad] = useState(false);
  // 记录上一次的职业，供「切换职业清空技能」effect 与 loadPreset 协同：
  // loadPreset 设置职业的同时会把它同步为最新值，使 effect 不把刚载入的技能误判为「换职业」而清空。
  const prevOccRef = useRef(occupation);

  const saveCurrentPreset = useCallback(() => {
    const data = { name, player, occupation, customOccupation, age, sex, residence, birthplace, charValues, luckValue, creditRating, occSkills, occPoints, interestSkills, interestPoints, description, beliefs, significantPeople, meaningfulLocations, treasuredPossessions, traits, injuries, backgroundFears };
    savePreset(data);
  }, [savePreset, name, player, occupation, customOccupation, age, sex, residence, birthplace, charValues, luckValue, creditRating, occSkills, occPoints, interestSkills, interestPoints, description, beliefs, significantPeople, meaningfulLocations, treasuredPossessions, traits, injuries, backgroundFears]);

  const loadPreset = useCallback((preset: CharacterPreset) => {
    const d = preset.data;
    setName(d.name||''); setPlayer(d.player||''); setOccupation(d.occupation||''); setCustomOccupation(d.customOccupation||''); setAge(d.age??25); setSex(d.sex||'男'); setResidence(d.residence||''); setBirthplace(d.birthplace||'');
    setCharValues(d.charValues||DEFAULT_CHARS); setLuckValue(d.luckValue??null); setCreditRating(d.creditRating??0); setOccSkills(d.occSkills||[]); setOccPoints(d.occPoints||{}); setInterestSkills(d.interestSkills||[]); setInterestPoints(d.interestPoints||{});
    // 兼容老预设：backgroundFears 是新键名（A0.1 重命名），phobias 是 legacy 键；优先读新键，回退老键。
    setDescription(d.description||''); setBeliefs(d.beliefs||''); setSignificantPeople(d.significantPeople||''); setMeaningfulLocations(d.meaningfulLocations||''); setTreasuredPossessions(d.treasuredPossessions||''); setTraits(d.traits||''); setInjuries(d.injuries||''); setBackgroundFears(d.backgroundFears || d.phobias || '');
    // 关键：把 prevOcc 同步为载入的职业，否则下面监听 occupation 的 effect 会判定「换了职业」，
    // 把刚 setOccSkills/setInterestSkills 填入的技能立即清空（表现为载入预设后技能全空）。
    prevOccRef.current = d.occupation||'';
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

    const { hpMax, sanMax, mpMax, db, build } = deriveSecondaryStats(chars);

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
      bgParts.push(`【恐惧症/狂躁症 Phobias】\n${backgroundFears.trim() || '未记录在案。但每个调查员都有不愿面对的东西。'}`);
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
        posture: '站立',
        statusConditions: [],
        dailySanLoss: 0,
        temporaryInsanity: { active: false, roundsLeft: 0 },
        indefiniteInsanity: { active: false, daysLeft: 0 },
        permanentInsanity: false,
        phobias: [],
        manias: [],
        known_spells: [],
        recovery: {},
      };

    // 清空所有按会话隔离的旧态并创建新会话——隔离不变量集中在 startNewConversation，
    // 杜绝逐个手动清空时漏掉某个 store（历史上漏清 clues/npc/map 致「开新游戏继承旧档」的跨档泄漏）。
    const newId = startNewConversation(sheet.identity.name || '未命名调查员');
    // MVU ZOD：种入初始 statData 叙事树(世界/剧情/战斗;调查员.* 归角色卡故排除)。
    // 在 startNewConversation 内 clearAllGameState(statData={}) 之后执行。
    useVariableStore.getState().setStatData(createInitialStatData());
    // 次序关键：clearAllGameState 会把角色卡重置为默认，故 setSheet 必须在 startNewConversation 之后，
    // 否则 saveConversation 读到默认卡 → isDefaultSheet → 跳过持久化 → 新人物角色卡丢失。
    setSheet(sheet);
    // 持久化新会话（含刚 setSheet 的角色卡 + 序章页）到关系表，避免未交互即返回主菜单时丢档。
    void saveConversation(newId);
    onComplete();
  }, [
    charValues, creditRating, occSkills, occPoints, interestSkills, interestPoints,
    luckValue, name, player, occupation, customOccupation, age, sex, residence, birthplace,
    description, beliefs, significantPeople, meaningfulLocations,
    treasuredPossessions, traits, injuries, backgroundFears,
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
    const selectedOcc = occupation && occupation !== '__custom__' ? COC_OCCUPATIONS.find((o) => o.name === occupation) : null;
    const suggested = selectedOcc?.skills || [];
    const crMin = selectedOcc?.crMin ?? 0;
    const crMax = selectedOcc?.crMax ?? 99;
    const isCustomOcc = occupation === '__custom__';
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

    if (isCustomOcc) {
      // 自定义职业：保留玩家已选的职业/兴趣技能，仅重新分配点数（不清空选择）。
      const cr = Math.min(creditRating, occPointPool);
      setCreditRating(cr);
      const occPoolForSkills = occPointPool - cr;
      setOccPoints(occSkills.length > 0 && occPoolForSkills > 0 ? allocLoop({}, occSkills, occPoolForSkills) : {});
      setInterestPoints(interestSkills.length > 0 && intPointPool > 0 ? allocLoop({}, interestSkills, intPointPool) : {});
    } else {
      // 预定义职业：用推荐技能、随机选兴趣技能并随机信用评级。
      const cr = Math.floor(Math.random() * (Math.min(crMax, occPointPool) - crMin + 1)) + crMin;
      setCreditRating(cr);
      setOccSkills([...suggested]);
      const occPoolForSkills = occPointPool - cr;
      setOccPoints(suggested.length > 0 && occPoolForSkills > 0 ? allocLoop({}, suggested, occPoolForSkills) : {});
      const usedNames = new Set(suggested);
      const intPool = ALL_SKILLS.filter((s) => !usedNames.has(s.name) && s.name !== '克苏鲁神话');
      const pickInt = shuffled(intPool.map((x) => x.name)).slice(0, 4);
      setInterestSkills(pickInt);
      setInterestPoints(pickInt.length > 0 && intPointPool > 0 ? allocLoop({}, pickInt, intPointPool) : {});
    }
  };

  // 重置技能分配（清空职业/兴趣技能与点数，信用评级回到该职业最低基础值），允许重新分配。
  const resetAllocation = () => {
    const occObj = occupation && occupation !== '__custom__' ? COC_OCCUPATIONS.find((o) => o.name === occupation) : null;
    setOccSkills([]); setOccPoints({});
    setInterestSkills([]); setInterestPoints({});
    setCreditRating(occObj?.crMin ?? 0);
  };

  const nextStep = () => { if (canGoNext() && step < STEPS.length - 1) setStep(step + 1); };
  const prevStep = () => { if (step > 0) setStep(step - 1); };
  useEffect(() => {
    if (occupation !== prevOccRef.current) {
      // 切换职业（含首次选定）：清空技能分配，信用评级回到该职业的最低基础值(crMin)，自定义职业为 0。
      const occObj = occupation && occupation !== '__custom__' ? COC_OCCUPATIONS.find((o) => o.name === occupation) : null;
      setOccSkills([]); setOccPoints({});
      setInterestSkills([]); setInterestPoints({});
      setCreditRating(occObj?.crMin ?? 0);
    }
    prevOccRef.current = occupation;
  }, [occupation]);

  /* ---- 背景补写（AI 整理：草稿 + 已填字段 + 角色档案 → 8 个背景字段） ---- */
  // 8 个背景字段统一定义（顺序即输出顺序），供构造原文与解析回填复用。
  const bgFieldDefs: { key: string; zh: string; value: string; setter: (v: string) => void }[] = [
    { key: 'description',          zh: '个人描述', value: description,          setter: setDescription },
    { key: 'beliefs',              zh: '思想信念', value: beliefs,              setter: setBeliefs },
    { key: 'significantPeople',    zh: '重要之人', value: significantPeople,    setter: setSignificantPeople },
    { key: 'meaningfulLocations',  zh: '重要场所', value: meaningfulLocations,  setter: setMeaningfulLocations },
    { key: 'treasuredPossessions', zh: '珍贵之物', value: treasuredPossessions, setter: setTreasuredPossessions },
    { key: 'traits',               zh: '特质',     value: traits,               setter: setTraits },
    { key: 'injuries',             zh: '伤疤',     value: injuries,             setter: setInjuries },
    { key: 'backgroundFears',      zh: '恐惧症（背景）', value: backgroundFears,     setter: setBackgroundFears },
  ];

  // 核心：构造统一 prompt（草稿 + 已填字段原文 + 角色档案），让 AI 产出全部 8 格。
  // mode 决定写回范围：overwrite=写回全部；fillEmpty=只写原本为空的字段（保护手填内容）。
  const runBackstoryFill = async (mode: 'overwrite' | 'fillEmpty') => {
    setBgConfirm(false);
    const settings = useSettingsStore.getState();
    if (!settings.apiKey) {
      setBackstoryError('请先在设置中配置 API 密钥后再使用背景补写功能。');
      return;
    }
    setBackstoryError('');
    setBgFilling(true);
    try {
      const occText = occupation === '__custom__' ? customOccupation : occupation;
      const occObj = COC_OCCUPATIONS.find((o) => o.name === occupation);

      const charLines: string[] = [];
      for (const { key, zh } of CHAR_ORDER) {
        const v = charValues[key] ?? 50;
        let tier = '较低';
        if (v >= 80) tier = '卓越';
        else if (v >= 70) tier = '优秀';
        else if (v >= 60) tier = '良好';
        else if (v >= 40) tier = '中等';
        charLines.push(`${zh} ${v}（${tier}）`);
      }

      const occSkillLines: string[] = [];
      for (const s of occSkills) {
        const sk = ALL_SKILLS.find((x) => x.name === s);
        const base = sk ? resolveSkillBase(sk.base, charValues as Record<COC7Characteristic, number>) : 0;
        const pts = (occPoints[s] ?? 0) + (interestPoints[s] ?? 0);
        const desc = SKILL_DESC[s] || '';
        occSkillLines.push(`- ${s}：${Math.min(99, base + pts)}%${desc ? ` — ${desc}` : ''}`);
      }

      let occContext = '';
      if (occObj) {
        occContext = `推荐职业技能：${occObj.skills.join('、')}。信用评级范围：${occObj.crMin}%-${occObj.crMax}%。`;
      }

      const draft = backstoryDraft.trim();
      const filledBlocks = bgFieldDefs
        .filter((f) => f.value.trim() !== '')
        .map((f) => `### ${f.zh}\n${f.value.trim()}`)
        .join('\n\n');

      const prompt = [
        `你是1920年代美国《克苏鲁的呼唤》（Call of Cthulhu 7th）TRPG 调查员背景整理师。`,
        `你的任务：把玩家提供的零散素材，整理、归类、补全为 8 个规范的背景字段。你既是归类者，也是润色者，但绝不是篡改者。`,
        ``,
        `## 角色档案（供你理解语境，勿与已知信息矛盾）`,
        `- 姓名：${name || '未知'}`,
        `- 职业：${occText || '调查员'}（1920年代美国）`,
        `- 年龄：${age}岁`,
        `- 性别：${sex}`,
        `${birthplace ? `- 出生地：${birthplace}` : ''}`,
        `${residence ? `- 居住地：${residence}` : ''}`,
        `${occContext ? `- ${occContext}` : ''}`,
        ``,
        `## 属性（数值越高越突出）`,
        ...charLines.map((l) => `- ${l}`),
        `${creditRating > 0 ? `- 信用评级：${creditRating}%` : ''}`,
        ...(occSkillLines.length > 0 ? ['', `## 技能专精（数值越高越擅长）`, ...occSkillLines] : []),
        ``,
        draft
          ? `## 玩家草稿（一段自由描述，可能混杂多个字段的信息，需你正确拆解归类）\n${draft}`
          : `## 玩家草稿\n（玩家未提供草稿）`,
        ``,
        filledBlocks
          ? `## 玩家已手填的字段原文（必须忠实保留其核心事实）\n${filledBlocks}`
          : `## 玩家已手填的字段原文\n（无）`,
        ``,
        `## 整理规则（务必逐条严格遵守）`,
        `1. 【忠实保留】草稿与已填原文中的每一个核心事实、人名、地名、关系、情绪、时间都必须完整体现，绝不改写、替换或删除。`,
        `2. 【正确归类】把草稿里散落的信息分配到最贴切的字段（如「戴圆框眼镜」归个人描述，「怕黑」归恐惧症，「父亲的银怀表」归珍贵之物）。`,
        `3. 【补全空缺】草稿和已填都未覆盖的字段，结合上面的职业/属性/技能/年代合理补全，使 8 个字段都不为空；补全须自然贴合，不得虚构与已知矛盾的重大新事实。`,
        `4. 【适度扩写】每个字段写成 2-4 句连贯中文，富有画面感。`,
        `5. 【特质字段】用逗号分隔的关键词列表（如「缄默、固执、好奇心强」），可在其后补一句简短说明。`,
        `6. 【完整输出】必须输出下列全部 8 个字段，缺一不可。`,
        ``,
        `## 输出格式`,
        `严格按 ### 标题分段，标题后换行写该字段中文内容，不要带任何前缀标记：`,
        ...bgFieldDefs.map((f) => `### ${f.zh}`),
      ].join('\n');

      const response = await sendChatCompletion(
        [{ role: 'user', content: prompt }],
        { ...DEFAULT_INPUT_PRESET, temperature: 0.8, maxTokens: 1600 },
        settings.apiBaseUrl, settings.apiKey, settings.apiModel,
      );

      const rawText = response.content || '';
      const byZh: Record<string, string> = {};
      for (const f of bgFieldDefs) byZh[f.zh] = f.key;

      const sectionRe = /###\s*([^\n]+)\s*\n([\s\S]*?)(?=\n###\s|\n*$)/g;
      const extracted: Record<string, string> = {};
      let m: RegExpExecArray | null;
      while ((m = sectionRe.exec(rawText)) !== null) {
        const title = m[1].trim();
        const content = m[2].replace(/[\r\n]+$/, '').trim();
        const fieldKey = byZh[title] ?? Object.entries(byZh).find(([zh]) => title.includes(zh))?.[1];
        if (fieldKey && content && content !== '无') extracted[fieldKey] = content;
      }

      const applied: string[] = [];
      for (const f of bgFieldDefs) {
        const next = extracted[f.key];
        if (!next) continue;
        if (mode === 'fillEmpty' && f.value.trim() !== '') continue; // 仅填空格：跳过已填
        f.setter(next);
        applied.push(f.key);
      }

      if (applied.length === 0) {
        setBackstoryError('AI 返回的内容无法解析，背景未改动。请重试。');
      } else {
        setBackstoryError('');
      }
    } catch (err: unknown) {
      setBackstoryError(`背景补写失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setBgFilling(false);
    }
  };

  // 点「背景补写」入口：无 apiKey 报错；若已有手填字段→弹确认条让用户选覆盖/仅填空格；否则直接整理。
  const handleBackstoryFill = () => {
    if (!useSettingsStore.getState().apiKey) {
      setBackstoryError('请先在设置中配置 API 密钥后再使用背景补写功能。');
      return;
    }
    setBackstoryError('');
    const hasFilled = bgFieldDefs.some((f) => f.value.trim() !== '');
    if (hasFilled) {
      setBgConfirm(true); // 有已填内容：让用户决定覆盖还是仅填空格
    } else {
      void runBackstoryFill('overwrite'); // 全空：直接整理/生成，无覆盖风险
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
            backgroundFears={backgroundFears} onSetBackgroundFears={setBackgroundFears}
            backstoryDraft={backstoryDraft}
            onSetBackstoryDraft={setBackstoryDraft}
            bgFilling={bgFilling}
            backstoryError={backstoryError}
            onBackstoryFill={handleBackstoryFill}
            bgConfirm={bgConfirm}
            onConfirmOverwrite={() => runBackstoryFill('overwrite')}
            onConfirmFillEmpty={() => runBackstoryFill('fillEmpty')}
            onConfirmCancel={() => setBgConfirm(false)}
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
            backgroundFears={backgroundFears}
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
        zIndex: 850,
        zoom: uiScale === 1 ? undefined : 1 / uiScale,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        overflow: 'hidden',
        ...(isMobile
          ? { inset: 0, width: '100vw', height: '100dvh', border: 'none', borderRadius: 0, boxShadow: 'none' }
          : {
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 560,
              maxWidth: '94vw',
              ...(step === 4 ? { height: '55vh' } : { maxHeight: '88vh' }),
              border: '1px solid rgba(196,168,85,0.25)',
              borderRadius: 6,
              boxShadow: '0 8px 60px rgba(0,0,0,0.7)',
            }),
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
            flexWrap: isMobile ? 'wrap' : 'nowrap', rowGap: 8,
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={(e) => { e.stopPropagation(); resetAllocation(); }}
                className="sk-btn"
                style={{ ...btnBase, background: 'rgba(139,58,58,0.1)', borderColor: 'rgba(139,58,58,0.3)', color: 'var(--blood-bright)' }}
              >↺ 重置</button>
              <button onClick={(e) => { e.stopPropagation(); randomAllocate(); }}
                className="sk-btn"
                style={{ ...btnBase, background: 'rgba(196,168,85,0.08)', borderColor: 'rgba(196,168,85,0.25)', color: 'var(--gold)' }}
              >⚄ 随机分配</button>
            </div>
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
