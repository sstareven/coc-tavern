import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { btnBase, btnDisabled } from './styles';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useCharacterPresetsStore, type CharacterPreset } from '../../stores/useCharacterPresetsStore';
import { sendChatCompletion } from '../../sillytavern/api-router';
import { DEFAULT_INPUT_PRESET } from '../../constants/presets';
import type { CharacterSheet, COC7Characteristic } from '../../types';
import {
  CHAR_ROLL, resolveSkillBase, deriveSecondaryStats,
  applyAgeModifiers, rollEduImprovement, roll3D6,
  clampSkillPointAlloc,
} from '../../sillytavern/coc-rules';
import {
  STEPS, CHAR_ORDER, type SkillCat,
  DEFAULT_CHARS, POOL_VALUES,
} from '../../sillytavern/coc-data';
import { useScenarioStore } from '../../stores/useScenarioStore';
import {
  getScenarioOccupationPool, getScenarioSkillPool, getScenarioSkillDescMap,
  type ScenarioSkillPoolEntry,
} from '../../scenario/scenario-pools';
import { StepIdentity } from './steps/StepIdentity';
import { StepCharacteristics } from './steps/StepCharacteristics';
import { StepDerivedStats } from './steps/StepDerivedStats';
import { StepSkills } from './steps/StepSkills';
import { StepBackground } from './steps/StepBackground';
import { StepReview } from './steps/StepReview';
import { RelationEditor } from './RelationEditor';
import type { ScenarioRelation } from '../../types/scenario';
import { useIsMobile } from '../../hooks/useIsMobile';

/* ============================== Helpers ============================== */

function getBaseForSkill(sk: ScenarioSkillPoolEntry, charValues: Record<COC7Characteristic, number>): number {
  // 取值这层保留在本地（从池中取每条 base spec），spec→base 解析委托给 resolveSkillBase 统一规则。
  return resolveSkillBase(sk.base, charValues);
}

/* ============================== Component ============================== */

interface Props {
  onComplete: () => void;
  onClose: () => void;
}

export function CharacterCreator({ onComplete, onClose }: Props) {
  const isMobile = useIsMobile();
  // 人物创建面板不随「界面缩放」放大（太大）—— v1.11.6 改用 ...
  // 让 layout box 自适应屏幕大小，渲染后正好填满 viewport 不溢出。
  // 不再订阅 uiScale ——CSS 变量 --ui-scale 直接由 applyUiScale 维护，组件不需要 React state。
  const [step, setStep] = useState(0);

  // 当前激活剧本(若有)— 决定 StepSkills 看到的职业/技能池
  // ScenarioScreen.onPick 在玩家选剧本时 setLastPicked,所以 lastPicked 等同于"当前剧本"
  const lastPickedScn = useScenarioStore((s) => s.lastPicked);
  const activeScenario = useScenarioStore((s) => (lastPickedScn ? s.getById(lastPickedScn) : undefined));
  const skillPool = useMemo(() => getScenarioSkillPool(activeScenario), [activeScenario]);
  const occupationPool = useMemo(() => getScenarioOccupationPool(activeScenario), [activeScenario]);
  const skillDescMap = useMemo(() => getScenarioSkillDescMap(activeScenario), [activeScenario]);


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

  /* ---- A3.2: Age modifiers (R8) ---- */
  // previewAgeMod 是 reactive：随 charValues / age 变化重算，用于实时显示扣点分组要求。
  // ageDeductSCD/ageDeductSS 由玩家在 StepCharacteristics 手动分配。
  // appliedAgeMod / eduImprovementsLog 在 handleConfirm 时定格，供 StepReview 展示。
  const [ageDeductSCD, setAgeDeductSCD] = useState<{ STR: number; CON: number; DEX: number }>({ STR: 0, CON: 0, DEX: 0 });
  const [ageDeductSS, setAgeDeductSS] = useState<{ STR: number; SIZ: number }>({ STR: 0, SIZ: 0 });
  const [eduImprovementsLog, setEduImprovementsLog] = useState<Array<{ roll: number; improved: boolean; gain: number }>>([]);
  const [appliedAgeMod, setAppliedAgeMod] = useState<ReturnType<typeof applyAgeModifiers> | null>(null);

  const previewAgeMod = useMemo(() => applyAgeModifiers(charValues, age), [charValues, age]);
  // 当玩家改属性/年龄导致 previewAgeMod 变化、之前的分配可能超额时，自动复位为 0（不强制等额）。
  useEffect(() => {
    const scdTotal = ageDeductSCD.STR + ageDeductSCD.CON + ageDeductSCD.DEX;
    if (scdTotal > previewAgeMod.deductRemaining.strConDexGroup) {
      setAgeDeductSCD({ STR: 0, CON: 0, DEX: 0 });
    }
    const ssTotal = ageDeductSS.STR + ageDeductSS.SIZ;
    if (ssTotal > previewAgeMod.deductRemaining.strSizGroup) {
      setAgeDeductSS({ STR: 0, SIZ: 0 });
    }
  }, [previewAgeMod, ageDeductSCD, ageDeductSS]);

  const scdAllocatedSum = ageDeductSCD.STR + ageDeductSCD.CON + ageDeductSCD.DEX;
  const ssAllocatedSum = ageDeductSS.STR + ageDeductSS.SIZ;
  const scdReady = scdAllocatedSum === previewAgeMod.deductRemaining.strConDexGroup;
  const ssReady = ssAllocatedSum === previewAgeMod.deductRemaining.strSizGroup;
  const canBuildSheet = scdReady && ssReady;

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

  // Refs to read the *other* pool's allocation without stale closures
  // (adjOccPoint needs interestPoints[skill]; adjIntPoint needs occPoints[skill]).
  const occPointsRef = useRef(occPoints);
  const intPointsRef = useRef(interestPoints);
  useEffect(() => { occPointsRef.current = occPoints; }, [occPoints]);
  useEffect(() => { intPointsRef.current = interestPoints; }, [interestPoints]);

  const adjOccPoint = (skillName: string, delta: number) => {
    setOccPoints((p) => {
      const cur = p[skillName] ?? 0;
      const used = Object.values(p).reduce((a, b) => a + b, 0) + crRef.current;
      const remaining = occPointPool - used;
      const sk = skillPool.find((s) => s.name === skillName);
      const base = sk ? getBaseForSkill(sk, charValues) : 0;
      const otherAlloc = intPointsRef.current[skillName] ?? 0;
      const newVal = clampSkillPointAlloc(cur, delta, base, otherAlloc, remaining);
      return { ...p, [skillName]: newVal };
    });
  };

  const adjIntPoint = (skillName: string, delta: number) => {
    setInterestPoints((p) => {
      const cur = p[skillName] ?? 0;
      const used = Object.values(p).reduce((a, b) => a + b, 0);
      const remaining = intPointPool - used;
      const sk = skillPool.find((s) => s.name === skillName);
      const base = sk ? getBaseForSkill(sk, charValues) : 0;
      const otherAlloc = occPointsRef.current[skillName] ?? 0;
      const newVal = clampSkillPointAlloc(cur, delta, base, otherAlloc, remaining);
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
  // Invariant guard (BUG1): no single skill may exceed base+occ+int ≤ 99 — final defense before Step5.
  const allSkillsUnderCap = skillPool.every((sk) => {
    const occ = occPoints[sk.name] ?? 0;
    const int = interestPoints[sk.name] ?? 0;
    if (occ === 0 && int === 0) return true;
    const base = getBaseForSkill(sk, charValues);
    return base + occ + int <= 99;
  });
  const canProceedStep4 = occRemaining === 0 && intRemaining === 0 && occSkills.length > 0 && allSkillsUnderCap;

  /* ---- Step 5: Background ---- */
  const [description, setDescription] = useState('');
  const [beliefs, setBeliefs] = useState('');
  const [significantPeople, setSignificantPeople] = useState('');
  const [meaningfulLocations, setMeaningfulLocations] = useState('');
  const [treasuredPossessions, setTreasuredPossessions] = useState('');
  const [traits, setTraits] = useState('');
  const [injuries, setInjuries] = useState('');
  const [backgroundFears, setBackgroundFears] = useState('');
  const [initialItemsRaw, setInitialItemsRaw] = useState('');
  const [bgFilling, setBgFilling] = useState(false);
  const [backstoryError, setBackstoryError] = useState('');
  const [backstoryDraft, setBackstoryDraft] = useState('');
  const [bgConfirm, setBgConfirm] = useState(false);

  /* ---- Step 5b (新): Relations ---- */
  // CharCreator 编辑模式（编辑现有 player_created 卡）会通过 props 拿到 charId；
  // 新建模式下用临时 id（handleConfirm 时已 charId = `INV-...` 之前 random 出新 id 写入 sheet.identity.id）。
  // 这里 currentCharId 取 sheet 上的 identity.id 作占位即可——存盘前 RelationEditor 视角下 currentCharId
  // 必须稳定且与剧本中其他 character.id 不冲突，所以一开就生成且复用至 handleConfirm。
  const editingCharIdRef = useRef<string>(`INV-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`);
  const [relations, setRelations] = useState<ScenarioRelation[]>([]);
  const [presentAtStart, setPresentAtStart] = useState<string[]>([]);

  const handleRelationsChange = useCallback((nextRel: ScenarioRelation[], nextPresent: string[]) => {
    setRelations(nextRel);
    setPresentAtStart(nextPresent);
  }, []);

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
    // 1) 起点：玩家分配的原始 charValues
    const rawChars = Object.fromEntries(
      CHAR_ORDER.map((c) => [c.key, charValues[c.key] ?? 50]),
    ) as Record<COC7Characteristic, number>;

    // 2) 应用 R8 年龄修正：APP + EDU 直扣已在 ageMod.chars 中完成
    const ageMod = applyAgeModifiers(rawChars, age);
    const postAge = { ...ageMod.chars };

    // 3) 玩家分配的 STR/CON/DEX 与 STR/SIZ 组扣点（下限 1）
    postAge.STR = Math.max(1, postAge.STR - ageDeductSCD.STR - ageDeductSS.STR);
    postAge.CON = Math.max(1, postAge.CON - ageDeductSCD.CON);
    postAge.DEX = Math.max(1, postAge.DEX - ageDeductSCD.DEX);
    postAge.SIZ = Math.max(1, postAge.SIZ - ageDeductSS.SIZ);

    // 4) R5 EDU 提升轮（次数由年龄段决定）
    let edu = postAge.EDU;
    const eduLog: Array<{ roll: number; improved: boolean; gain: number }> = [];
    for (let n = 0; n < ageMod.eduImprovementCount; n++) {
      const er = rollEduImprovement(edu);
      eduLog.push({ roll: er.roll, improved: er.improved, gain: er.gain });
      edu = er.newEdu;
    }
    postAge.EDU = edu;
    setEduImprovementsLog(eduLog);
    setAppliedAgeMod(ageMod);

    const chars = postAge;
    const { hpMax, sanMax, mpMax, db, build } = deriveSecondaryStats(chars);

    const halfFifth = Object.fromEntries(
      CHAR_ORDER.map((c) => {
        const val = chars[c.key];
        return [c.key, { half: Math.floor(val / 2), fifth: Math.floor(val / 5) }];
      }),
    ) as Record<COC7Characteristic, { half: number; fifth: number }>;

    // 5) 幸运：15-19 段重投取大，其他段按玩家已掷的 luckValue（或现掷一次）
    const luck = ageMod.luckRollAgain
      ? Math.max(roll3D6() * 5, roll3D6() * 5)
      : (luckValue ?? roll3D6() * 5);

    // Build skills record
    const skills: Record<string, { base: number; current: number }> = {};

    // Credit Rating
    skills['信用评级'] = { base: 0, current: creditRating };

    // Cthulhu Mythos — always 0, never increases through creation
    skills['克苏鲁神话'] = { base: 0, current: 0 };

    // Occupation skills
    for (const skillName of occSkills) {
      const spec = skillPool.find((s) => s.name === skillName);
      const base = spec ? resolveSkillBase(spec.base, chars) : 0;
      const occAlloc = occPoints[skillName] ?? 0;
      const intAlloc = interestPoints[skillName] ?? 0;
      skills[skillName] = { base, current: Math.min(99, base + occAlloc + intAlloc) };
    }

    // Personal interest skills
    for (const skillName of interestSkills) {
      if (occSkills.includes(skillName)) continue;
      const spec = skillPool.find((s) => s.name === skillName);
      const base = spec ? resolveSkillBase(spec.base, chars) : 0;
      const intAlloc = interestPoints[skillName] ?? 0;
      skills[skillName] = { base, current: Math.min(99, base + intAlloc) };
    }

    const charId = editingCharIdRef.current;

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
          mov: ageMod.mov,
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
        initialItemsRaw: initialItemsRaw,
      };

    // M4: 不再 startNewConversation / setSheet / saveConversation /(后续 activateScenario)。
    // 改为把自创卡作为 player_created 角色 applyPatch 写入剧本 characters[],
    // CharCreator 关闭后由 App.tsx 回到 RosterPicker,玩家在 RosterPicker 选他/别人才真正进游戏。
    // M5：扩展为同时写入 relations + presentAtStart,并把"玩家勾选与某 NPC 一起开场"
    // 反向应用到目标 NPC.presentAtStart=true(M10 activateScenario 会读 character.presentAtStart 决定 isPresent)。
    const lastPickedScn = useScenarioStore.getState().lastPicked;
    if (lastPickedScn) {
      const playerScenarioChar = {
        id: charId,
        role: 'player_created' as const,
        sheet,
        npcAttrs: {
          identityTag: '玩家',
          attitudeDefault: 0,
          relationshipDefault: '',
          locationDefault: '',
          publicBio: '',
          hiddenBio: '',
          // 把 8 段背景独立字段也同步带上,与 PeopleTab 编辑路径对齐
          description,
          beliefs,
          significantPeople,
          meaningfulLocations,
          treasuredPossessions,
          traits,
          injuries,
          backgroundFears,
          initialItemsRaw,
        },
        relations,
        presentAtStart: presentAtStart.includes(charId), // 玩家自身的 presentAtStart 不由此处决定; 本字段反向用于"其它角色对玩家"
        createdAt: Date.now(),
      };
      useScenarioStore.getState().applyPatch(lastPickedScn, { patchCharacters: [playerScenarioChar] });
      // 把"玩家勾选与某 NPC 一起开场"的反向也作为该 NPC 的 presentAtStart 来源——
      // M10 activateScenario 会读 character.presentAtStart 决定 isPresent;这里把玩家勾过的
      // 目标 NPC.presentAtStart 设 true(不动其它字段)。
      const targetDoc = useScenarioStore.getState().getById(lastPickedScn);
      if (targetDoc) {
        const updates = targetDoc.characters
          .filter((c) => presentAtStart.includes(c.id))
          .map((c) => ({ ...c, presentAtStart: true }));
        if (updates.length > 0) {
          useScenarioStore.getState().applyPatch(lastPickedScn, { patchCharacters: updates });
        }
      }
    } else {
      console.warn('[CharacterCreator] lastPicked 为空,无法把自创卡写入剧本 — 跳过 applyPatch');
    }
    onComplete();
  }, [
    charValues, creditRating, occSkills, occPoints, interestSkills, interestPoints,
    luckValue, name, player, occupation, customOccupation, age, sex, residence, birthplace,
    description, beliefs, significantPeople, meaningfulLocations,
    treasuredPossessions, traits, injuries, backgroundFears,
    ageDeductSCD, ageDeductSS,
    initialItemsRaw,
    relations, presentAtStart,
    onComplete,
  ]);

  /* ---- Nav ---- */
  const canGoNext = () => {
    switch (step) {
      case 0: return name.trim().length > 0;
      case 1: return allCharsAssigned && canBuildSheet;
      case 2: return luckValue !== null;
      case 3: return canProceedStep4;
      case 4: return true;
      case 5: return true;
      default: return true;
    }
  };

  const randomAllocate = () => {
    const selectedOcc = occupation && occupation !== '__custom__' ? occupationPool.find((o) => o.name === occupation) : null;
    const suggested = selectedOcc?.skills || [];
    const crMin = selectedOcc?.crMin ?? 0;
    const crMax = selectedOcc?.crMax ?? 99;
    const isCustomOcc = occupation === '__custom__';
    const getBaseVal = (name: string) => {
      const sk = skillPool.find((x) => x.name === name);
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
      const intPool = skillPool.filter((s) => !usedNames.has(s.name) && s.name !== '克苏鲁神话');
      const pickInt = shuffled(intPool.map((x) => x.name)).slice(0, 4);
      setInterestSkills(pickInt);
      setInterestPoints(pickInt.length > 0 && intPointPool > 0 ? allocLoop({}, pickInt, intPointPool) : {});
    }
  };

  // 重置技能分配（清空职业/兴趣技能与点数，信用评级回到该职业最低基础值），允许重新分配。
  const resetAllocation = () => {
    const occObj = occupation && occupation !== '__custom__' ? occupationPool.find((o) => o.name === occupation) : null;
    setOccSkills([]); setOccPoints({});
    setInterestSkills([]); setInterestPoints({});
    setCreditRating(occObj?.crMin ?? 0);
  };

  const nextStep = () => { if (canGoNext() && step < STEPS.length - 1) setStep(step + 1); };
  const prevStep = () => { if (step > 0) setStep(step - 1); };
  useEffect(() => {
    if (occupation !== prevOccRef.current) {
      // 切换职业（含首次选定）：清空技能分配，信用评级回到该职业的最低基础值(crMin)，自定义职业为 0。
      const occObj = occupation && occupation !== '__custom__' ? occupationPool.find((o) => o.name === occupation) : null;
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
      setBackstoryError('请先在设置中配置 密钥后再使用背景补写功能。');
      return;
    }
    setBackstoryError('');
    setBgFilling(true);
    try {
      const occText = occupation === '__custom__' ? customOccupation : occupation;
      const occObj = occupationPool.find((o) => o.name === occupation);

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
        const sk = skillPool.find((x) => x.name === s);
        const base = sk ? resolveSkillBase(sk.base, charValues as Record<COC7Characteristic, number>) : 0;
        const pts = (occPoints[s] ?? 0) + (interestPoints[s] ?? 0);
        const desc = skillDescMap[s] || '';
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
        // v1.11.6: maxTokens 1600 → 20000 —— 思考型模型(deepseek-v4-pro/reasoner)先在
        // <think> 里花掉几千 token,1600 不够装 8 个字段(每段 2-4 句 × 80 字 ≈ 1500 输出),
        // 实测被截断导致 markdown ### 标题不全 → 解析 applied=0 → 报「AI 返回的内容无法解析」。
        { ...DEFAULT_INPUT_PRESET, temperature: 0.8, maxTokens: 20000 },
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
      setBackstoryError('请先在设置中配置 密钥后再使用背景补写功能。');
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
            ageBand={{
              strSizGroup: previewAgeMod.deductRemaining.strSizGroup,
              strConDexGroup: previewAgeMod.deductRemaining.strConDexGroup,
              appDeduct: previewAgeMod.appDeduct,
              mov: previewAgeMod.mov,
              eduImprovementCount: previewAgeMod.eduImprovementCount,
              luckRollAgain: previewAgeMod.luckRollAgain,
            }}
            scdAlloc={ageDeductSCD}
            ssAlloc={ageDeductSS}
            onScdAlloc={(k, v) => setAgeDeductSCD((p) => ({ ...p, [k]: v }))}
            onSsAlloc={(k, v) => setAgeDeductSS((p) => ({ ...p, [k]: v }))}
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
            initialItemsRaw={initialItemsRaw} onSetInitialItemsRaw={setInitialItemsRaw}
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
        return activeScenario ? (
          <RelationEditor
            scenarioDoc={activeScenario}
            currentCharId={editingCharIdRef.current}
            relations={relations}
            presentAtStart={presentAtStart}
            onChange={handleRelationsChange}
          />
        ) : (
          <div style={{ color: 'var(--ink-subtle)', fontSize: 12, padding: 14 }}>
            未选择剧本，无法编辑关系。点【下一步】跳过。
          </div>
        );
      case 6:
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
            ageModSummary={appliedAgeMod ? {
              age,
              scdGroup: appliedAgeMod.deductRemaining.strConDexGroup,
              scdAlloc: ageDeductSCD,
              ssGroup: appliedAgeMod.deductRemaining.strSizGroup,
              ssAlloc: ageDeductSS,
              appDeduct: appliedAgeMod.appDeduct,
              movDelta: appliedAgeMod.mov - 8,
              eduImprovements: eduImprovementsLog,
            } : {
              // 进入审阅页时还未"确认创建"，appliedAgeMod 为 null：展示预览（基于 previewAgeMod）。
              age,
              scdGroup: previewAgeMod.deductRemaining.strConDexGroup,
              scdAlloc: ageDeductSCD,
              ssGroup: previewAgeMod.deductRemaining.strSizGroup,
              ssAlloc: ageDeductSS,
              appDeduct: previewAgeMod.appDeduct,
              movDelta: previewAgeMod.mov - 8,
              eduImprovements: [],
            }}
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
      {/* Backdrop —— v1.11.6: 不再用 inset:0(那会被根 zoom 拉到 150vw 致子元素居中漂移)。
          改用 vw/vh ÷ uiScale 让 layout 算出来后渲染正好 100vw × 100vh 不超出。 */}
      <div
        onClick={() => {}}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: 'calc(100vw / var(--auto-zoom, 1))',
          height: 'calc(100vh / var(--auto-zoom, 1))',
          zIndex: 800,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        zIndex: 850,
        // v1.11.6: 不再用 zoom: 1/uiScale 反向抵消（那是旧 hack）。
        // 改成「自适应屏幕大小」：layout 维度 ÷ uiScale，让 zoom 后的实际渲染尺寸
        // = layout × uiScale → 永远在 vw/vh 范围内，不会溢出，跟主体一起放大。
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        overflow: 'hidden',
        ...(isMobile
          ? { inset: 0, width: 'calc(100vw / var(--auto-zoom, 1))', height: '100dvh', border: 'none', borderRadius: 0, boxShadow: 'none' }
          : {
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'calc(min(720px, 94vw) / var(--auto-zoom, 1))',
              // v1.11.8: 所有 step 统一 maxHeight 88vh,背景故事不再用 55vh(用户反馈太矮)
              // 让面板自适应填满屏幕上下,内容多时自动滚动。
              maxHeight: 'calc(88vh / var(--auto-zoom, 1))',
              minHeight: step === 4 ? 'calc(70vh / var(--auto-zoom, 1))' : undefined,
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
                fontSize: 'calc(18px * var(--system-ratio, 1))',
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
              background: 'transparent', color: 'var(--ink-subtle)', fontSize: 'calc(16px * var(--system-ratio, 1))',
              fontFamily: 'var(--font-ui)',
            }}>
              ✕
            </button>
          </div>

          {/* Step indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14,
            flexWrap: isMobile ? 'wrap' : 'nowrap', rowGap: 8, width: '100%',
          }}>
            {STEPS.map((label, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: i > 0 ? 1 : 'none', minWidth: 0 }}>
                  {i > 0 && (
                    <div style={{
                      flex: 1, minWidth: 16, maxWidth: 80, height: 1,
                      background: i <= step ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
                      transition: 'var(--transition-smooth)',
                    }} />
                  )}
                  <button
                    onClick={() => { if (done) setStep(i); }}
                    className={done ? 'sk-btn' : undefined}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      border: active ? '1px solid var(--gold)' : done ? '1px solid rgba(196,168,85,0.35)' : '1px solid rgba(255,255,255,0.1)',
                      background: active ? 'var(--gold)' : done ? 'rgba(196,168,85,0.15)' : 'transparent',
                      color: active ? 'var(--void)' : done ? 'var(--gold)' : 'var(--ink-subtle)',
                      fontSize: 'calc(12px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', fontWeight: 700,
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
              disabled={!canBuildSheet}
              className={canBuildSheet ? 'sk-btn' : undefined}
              style={canBuildSheet
                ? { ...btnBase, background: 'rgba(139,58,58,0.25)', borderColor: 'rgba(204,51,51,0.4)', color: 'var(--blood-bright)' }
                : btnDisabled}
            >
              确认创建
            </button>
          )}
        </div>
      </div>
    </>
  );
}
