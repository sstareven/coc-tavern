import { useState, useMemo, useCallback } from 'react';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import type { CharacterSheet, COC7Characteristic } from '../../types';

/* ============================== Constants ============================== */

const STEPS = ['身份信息', '基础属性', '衍生属性', '职业与技能', '背景故事', '确认创建'];

function roll3D6() { return Math.floor(Math.random()*6)+1 + Math.floor(Math.random()*6)+1 + Math.floor(Math.random()*6)+1; }
function roll2D6() { return Math.floor(Math.random()*6)+1 + Math.floor(Math.random()*6)+1; }

const CHAR_ROLL: Record<string, () => number> = {
  STR: () => roll3D6()*5, CON: () => roll3D6()*5, POW: () => roll3D6()*5, DEX: () => roll3D6()*5,
  APP: () => roll3D6()*5, SIZ: () => (roll2D6()+6)*5, INT: () => (roll2D6()+6)*5, EDU: () => Math.min(99, (roll3D6()+3)*5),
};

const CHAR_ORDER: { key: COC7Characteristic; zh: string }[] = [
  { key: 'STR', zh: '力量' },
  { key: 'CON', zh: '体质' },
  { key: 'POW', zh: '意志' },
  { key: 'DEX', zh: '敏捷' },
  { key: 'APP', zh: '外貌' },
  { key: 'SIZ', zh: '体型' },
  { key: 'INT', zh: '智力' },
  { key: 'EDU', zh: '教育' },
];

const ALL_SKILLS: { name: string; en: string; base: number | 'DEX_HALF' | 'EDU' }[] = [
  { name: '会计学', en: 'Accounting', base: 5 },
  { name: '人类学', en: 'Anthropology', base: 1 },
  { name: '估价', en: 'Appraise', base: 5 },
  { name: '考古学', en: 'Archaeology', base: 1 },
  { name: '艺术与手艺', en: 'Art/Craft', base: 5 },
  { name: '魅惑', en: 'Charm', base: 15 },
  { name: '攀爬', en: 'Climb', base: 20 },
  { name: '计算机使用', en: 'Computer Use', base: 5 },
  { name: '乔装', en: 'Disguise', base: 5 },
  { name: '躲闪', en: 'Dodge', base: 'DEX_HALF' },
  { name: '汽车驾驶', en: 'Drive Auto', base: 20 },
  { name: '电气维修', en: 'Electrical Repair', base: 10 },
  { name: '电子学', en: 'Electronics', base: 1 },
  { name: '快速交谈', en: 'Fast Talk', base: 5 },
  { name: '格斗(斗殴)', en: 'Fighting(Brawl)', base: 25 },
  { name: '枪械(手枪)', en: 'Firearms(Handgun)', base: 20 },
  { name: '急救', en: 'First Aid', base: 30 },
  { name: '历史', en: 'History', base: 5 },
  { name: '恐吓', en: 'Intimidate', base: 15 },
  { name: '跳跃', en: 'Jump', base: 20 },
  { name: '语言(母语)', en: 'Language(Own)', base: 'EDU' },
  { name: '语言(其他)', en: 'Language(Other)', base: 1 },
  { name: '法律', en: 'Law', base: 5 },
  { name: '图书馆使用', en: 'Library Use', base: 20 },
  { name: '聆听', en: 'Listen', base: 20 },
  { name: '锁匠', en: 'Locksmith', base: 1 },
  { name: '机械维修', en: 'Mechanical Repair', base: 10 },
  { name: '医学', en: 'Medicine', base: 1 },
  { name: '博物学', en: 'Natural World', base: 10 },
  { name: '导航', en: 'Navigate', base: 10 },
  { name: '神秘学', en: 'Occult', base: 5 },
  { name: '操作重型机械', en: 'Operate Heavy Machinery', base: 1 },
  { name: '说服', en: 'Persuade', base: 10 },
  { name: '驾驶', en: 'Pilot', base: 1 },
  { name: '心理学', en: 'Psychology', base: 10 },
  { name: '精神分析', en: 'Psychoanalysis', base: 1 },
  { name: '骑术', en: 'Ride', base: 5 },
  { name: '科学', en: 'Science', base: 1 },
  { name: '巧手', en: 'Sleight of Hand', base: 10 },
  { name: '侦察', en: 'Spot Hidden', base: 25 },
  { name: '潜行', en: 'Stealth', base: 20 },
  { name: '生存', en: 'Survival', base: 10 },
  { name: '游泳', en: 'Swim', base: 20 },
  { name: '投掷', en: 'Throw', base: 20 },
  { name: '追踪', en: 'Track', base: 10 },
];

/* ============================== Helpers ============================== */



function getDBBuild(strPlusSiz: number): { db: string; build: number } {
  if (strPlusSiz >= 2 && strPlusSiz <= 64) return { db: '-2', build: -2 };
  if (strPlusSiz <= 84) return { db: '-1', build: -1 };
  if (strPlusSiz <= 124) return { db: '0', build: 0 };
  if (strPlusSiz <= 164) return { db: '+1D4', build: 1 };
  if (strPlusSiz <= 204) return { db: '+1D6', build: 2 };
  return { db: '+1D6', build: 2 };
}

function resolveSkillBase(
  spec: number | 'DEX_HALF' | 'EDU',
  chars: Partial<Record<COC7Characteristic, number>>,
): number {
  if (spec === 'DEX_HALF') return Math.floor((chars.DEX ?? 50) / 2);
  if (spec === 'EDU') return chars.EDU ?? 50;
  return spec;
}

/* ============================== Styles ============================== */

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(196,168,85,0.2)',
  borderRadius: 4,
  color: 'var(--text-light)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  outline: 'none',
  transition: 'var(--transition-smooth)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontFamily: 'var(--font-ui)',
  color: 'var(--ink-subtle)',
  letterSpacing: 2,
  marginBottom: 4,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none' as React.CSSProperties['appearance'],
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23c4a855'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 30,
};
  const plusMinusBtn: React.CSSProperties = { width: 32, height: 28, border: "1px solid var(--brass)", borderRadius: 3, background: "rgba(0,0,0,0.3)", color: "var(--ink-subtle)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

const btnBase: React.CSSProperties = {
  padding: '8px 24px',
  border: '1px solid rgba(196,168,85,0.3)',
  borderRadius: 4,
  background: 'rgba(196,168,85,0.08)',
  color: 'var(--gold)',
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  letterSpacing: 2,
  cursor: 'pointer',
  transition: 'var(--transition-smooth)',
};

const btnDisabled: React.CSSProperties = {
  ...btnBase,
  opacity: 0.35,
  cursor: 'not-allowed',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'var(--font-ui)',
  color: 'var(--ink-subtle)',
  letterSpacing: 3,
  marginBottom: 12,
  textTransform: 'uppercase' as const,
  borderBottom: '1px solid rgba(196,168,85,0.12)',
  paddingBottom: 8,
};

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
  const [age, setAge] = useState(25);
  const [sex, setSex] = useState('');
  const [residence, setResidence] = useState('');
  const [birthplace, setBirthplace] = useState('');

  /* ---- Step 2: Characteristics ---- */
  const defaultChars: Record<COC7Characteristic, number> = { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50 };
  const [charValues, setCharValues] = useState<Record<COC7Characteristic, number>>(defaultChars);

  const POOL_VALUES = [40, 50, 50, 50, 60, 60, 70, 80];
  const [poolMode, setPoolMode] = useState(true);
  const [poolAssignments, setPoolAssignments] = useState<Record<COC7Characteristic, number | null>>(() => {
    const init = {} as Record<COC7Characteristic, number | null>;
    CHAR_ORDER.forEach((c) => { init[c.key] = null; });
    return init;
  });

  const availablePoolValues = useMemo(() => {
    const remaining = [...POOL_VALUES];
    const assigned = (Object.values(poolAssignments) as (number | null)[]).filter((v): v is number => v != null);
    for (const v of assigned) {
      const idx = remaining.indexOf(v);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    return remaining;
  }, [poolAssignments]);

  const allCharsAssigned = poolMode
    ? CHAR_ORDER.every((c) => poolAssignments[c.key] != null)
    : CHAR_ORDER.every((c) => typeof charValues[c.key] === 'number');

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
  const [occSkills, setOccSkills] = useState<string[]>([]);
  const [occPoints, setOccPoints] = useState<Record<string, number>>({});
  const [interestSkills, setInterestSkills] = useState<string[]>([]);

  const eduVal = charValues.EDU ?? 0;
  const intVal = charValues.INT ?? 0;
  const occPointPool = eduVal * 4;
  const intPointPool = intVal * 2;

  const totalOccAllocated = useMemo(
    () => Object.values(occPoints).reduce((a, b) => a + b, 0),
    [occPoints],
  );
  const toggleOccSkill = useCallback((skillName: string) => {
    setOccSkills((prev) => {
      if (prev.includes(skillName)) {
        setOccPoints((p) => {
          const next = { ...p };
          delete next[skillName];
          return next;
        });
        return prev.filter((s) => s !== skillName);
      }
      if (prev.length >= 8) return prev;
      return [...prev, skillName];
    });
  }, []);

  const toggleInterestSkill = useCallback((skillName: string) => {
    setInterestSkills((prev) => {
      if (prev.includes(skillName)) return prev.filter((s) => s !== skillName);
      if (prev.length >= 4) return prev;
      return [...prev, skillName];
    });
  }, []);

  const occTotalAllocated = Object.values(occPoints).reduce((a, b) => a + b, 0) + creditRating;
  const occRemaining = occPointPool - occTotalAllocated;
  const canProceedStep4 = occRemaining === 0 && occSkills.length === 8;

  /* ---- Step 5: Background ---- */
  const [description, setDescription] = useState('');
  const [beliefs, setBeliefs] = useState('');
  const [significantPeople, setSignificantPeople] = useState('');
  const [meaningfulLocations, setMeaningfulLocations] = useState('');
  const [treasuredPossessions, setTreasuredPossessions] = useState('');
  const [traits, setTraits] = useState('');
  const [injuries, setInjuries] = useState('');
  const [phobias, setPhobias] = useState('');

  /* ---- Presets ---- */
  const [presets, setPresets] = useState<{ name: string; data: any }[]>(() => {
    try { const raw = localStorage.getItem('coc_char_presets'); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [showPresetLoad, setShowPresetLoad] = useState(false);

  const savePreset = useCallback(() => {
    const pn = (typeof prompt === 'function' ? prompt('请输入预设名称:') : '')?.trim();
    if (!pn) return;
    const data = { name, player, occupation, age, sex, residence, birthplace, charValues, luckValue, creditRating, occSkills, occPoints, interestSkills, description, beliefs, significantPeople, meaningfulLocations, treasuredPossessions, traits, injuries, phobias };
    const filtered = presets.filter((p: any) => p.name !== pn);
    const np = [...filtered, { name: pn, data }].slice(-10);
    setPresets(np);
    try { localStorage.setItem('coc_char_presets', JSON.stringify(np)); } catch {}
  }, [presets, name, player, occupation, age, sex, residence, birthplace, charValues, luckValue, creditRating, occSkills, occPoints, interestSkills, description, beliefs, significantPeople, meaningfulLocations, treasuredPossessions, traits, injuries, phobias]);

  const loadPreset = useCallback((preset: { name: string; data: any }) => {
    const d = preset.data;
    setName(d.name||''); setPlayer(d.player||''); setOccupation(d.occupation||''); setAge(d.age??25); setSex(d.sex||''); setResidence(d.residence||''); setBirthplace(d.birthplace||'');
    setCharValues(d.charValues||defaultChars); setLuckValue(d.luckValue??null); setCreditRating(d.creditRating??0); setOccSkills(d.occSkills||[]); setOccPoints(d.occPoints||{}); setInterestSkills(d.interestSkills||[]);
    setDescription(d.description||''); setBeliefs(d.beliefs||''); setSignificantPeople(d.significantPeople||''); setMeaningfulLocations(d.meaningfulLocations||''); setTreasuredPossessions(d.treasuredPossessions||''); setTraits(d.traits||''); setInjuries(d.injuries||''); setPhobias(d.phobias||'');
    setPoolMode(false); setShowPresetLoad(false);
  }, [defaultChars]);

  const deletePreset = useCallback((pn: string) => {
    const np = presets.filter((p:any) => p.name !== pn);
    setPresets(np);
    try { localStorage.setItem('coc_char_presets', JSON.stringify(np)); } catch {}
  }, [presets]);

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
    const dex = chars.DEX;
    const edu = chars.EDU;
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
      const allocated = occPoints[skillName] ?? 0;
      skills[skillName] = { base, current: base + allocated };
    }

    // Personal interest skills (+20% on top of base)
    for (const skillName of interestSkills) {
      const spec = ALL_SKILLS.find((s) => s.name === skillName);
      const base = spec ? resolveSkillBase(spec.base, chars) : 0;
      skills[skillName] = { base, current: base + 20 };
    }

    const charId = `INV-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`;

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
        occupation: occupation || '调查员',
        age,
        gender: sex,
        birthplace,
        residence,
        id: charId,
      },
    };

    // Persist background separately for completeness
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
      localStorage.setItem('coc_character_bg', JSON.stringify(bg));
    } catch {
      /* quota exceeded */
    }

    setSheet(sheet);
    onClose();
  }, [
    charValues, creditRating, occSkills, occPoints, interestSkills,
    luckValue, name, player, occupation, age, sex, residence, birthplace,
    description, beliefs, significantPeople, meaningfulLocations,
    treasuredPossessions, traits, injuries, phobias,
    setSheet, onClose,
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

  const nextStep = () => { if (canGoNext() && step < STEPS.length - 1) setStep(step + 1); };
  const prevStep = () => { if (step > 0) setStep(step - 1); };

  /* ---- Render step content ---- */
  const renderStepContent = () => {
    switch (step) {
      case 0: return renderIdentity();
      case 1: return renderCharacteristics();
      case 2: return renderDerived();
      case 3: return renderSkills();
      case 4: return renderBackground();
      case 5: return renderReview();
      default: return null;
    }
  };

  /* ===== Step 1: Identity ===== */
  function renderIdentity() {
    const fields: { label: string; value: string | number; set: (v: string) => void; type?: string }[] = [
      { label: '姓名 Name', value: name, set: setName },
      { label: '玩家 Player', value: player, set: setPlayer },
      { label: '职业 Occupation', value: occupation, set: setOccupation },
      { label: '年龄 Age', value: age, set: (v) => setAge(Number(v) || 0), type: 'number' },
      { label: '性别 Sex', value: sex, set: setSex, dropdown: ['男', '女', '其他'] },
      { label: '居住地 Residence', value: residence, set: setResidence },
      { label: '出生地 Birthplace', value: birthplace, set: setBirthplace },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Preset load */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPresetLoad(!showPresetLoad)}
              style={{
                padding: '4px 12px', border: '1px solid rgba(196,168,85,0.25)',
                borderRadius: 3, background: 'rgba(196,168,85,0.08)',
                color: 'var(--gold)', fontFamily: 'var(--font-ui)',
                fontSize: 10, cursor: 'pointer', letterSpacing: 1,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >加载预设 {presets.length > 0 ? `(${presets.length})` : ''}</button>
            {showPresetLoad && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                background: 'var(--abyss)', border: '1px solid rgba(196,168,85,0.25)',
                borderRadius: 4, padding: 4, zIndex: 900,
                minWidth: 180, maxHeight: 200, overflowY: 'auto',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}>
                {presets.length === 0 ? (
                  <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-subtle)', fontFamily: 'var(--font-body)' }}>
                    暂无预设
                  </div>
                ) : (
                  presets.map((p) => (
                    <div key={p.name} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', cursor: 'pointer', borderRadius: 3,
                      transition: 'var(--transition-smooth)',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span
                        onClick={() => { loadPreset(p); setStep(5); }}
                        style={{
                          flex: 1, fontSize: 11, color: 'var(--text-light)',
                          fontFamily: 'var(--font-body)',
                        }}
                      >{p.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePreset(p.name); }}
                        style={{
                          width: 18, height: 18, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', border: 'none', borderRadius: 2,
                          background: 'transparent', color: 'var(--ink-subtle)',
                          fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                        }}
                      >x</button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div style={sectionTitle}>身份信息 IDENTITY</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {fields.map((f) => (
            <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={labelStyle}>{f.label}</span>
              {f.dropdown ? (
                <select value={f.value} onChange={(e) => f.set(e.target.value)} style={inputStyle}>
                  {f.dropdown.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input type={f.type ?? 'text'} value={f.value} onChange={(e) => f.set(e.target.value)} style={inputStyle} placeholder="--" />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ===== Step 2: Characteristics ===== */
  function renderCharacteristics() {
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
      CHAR_ORDER.forEach(({key}) => { const fn = CHAR_ROLL[key]; newVals[key] = fn ? fn() : 50; });
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
      const remaining = [...POOL_VALUES];
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

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={sectionTitle}>基础属性 CHARACTERISTICS</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Mode toggle */}
            <div style={{
              display: 'flex', border: '1px solid rgba(196,168,85,0.25)', borderRadius: 4,
              overflow: 'hidden',
            }}>
              <button onClick={switchToPoolMode} style={{
                padding: '5px 12px', border: 'none',
                background: poolMode ? 'rgba(196,168,85,0.18)' : 'transparent',
                color: poolMode ? 'var(--gold)' : 'var(--ink-subtle)',
                fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
                letterSpacing: 1, transition: 'var(--transition-smooth)',
              }}>点数池分配</button>
              <button onClick={switchToFreeMode} style={{
                padding: '5px 12px', border: 'none',
                background: !poolMode ? 'rgba(196,168,85,0.18)' : 'transparent',
                color: !poolMode ? 'var(--gold)' : 'var(--ink-subtle)',
                fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
                letterSpacing: 1, transition: 'var(--transition-smooth)',
              }}>自由调整</button>
            </div>
            {!poolMode && (
              <button onClick={randomAll} style={{
                padding: '6px 16px', border: '1px solid var(--gold)', borderRadius: 4,
                background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
                fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer', letterSpacing: 2,
              }}>全随机</button>
            )}
          </div>
        </div>

        {poolMode && (
          <div style={{
            padding: '8px 12px', border: '1px solid rgba(196,168,85,0.12)',
            borderRadius: 4, background: 'rgba(196,168,85,0.04)',
            fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)',
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
              剩余数值:
            </span>
            {availablePoolValues.length > 0 ? availablePoolValues.map((v, i) => (
              <span key={i} style={{
                padding: '2px 8px', border: '1px solid rgba(196,168,85,0.2)',
                borderRadius: 3, color: 'var(--gold)', fontWeight: 600,
              }}>{v}</span>
            )) : (
              <span style={{ color: 'var(--success)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
                全部已分配
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {CHAR_ORDER.map(({ key, zh }) => {
            const val = charValues[key] || 50;
            const half = Math.floor(val / 2);
            const fifth = Math.floor(val / 5);
            const assignedPool = poolAssignments[key];

            if (poolMode) {
              const options = assignedPool != null
                ? [assignedPool, ...availablePoolValues]
                : availablePoolValues;
              return (
                <div key={key} style={{ padding: '10px 12px', border: '1px solid rgba(196,168,85,0.15)', borderRadius: 4, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 600 }}>{zh} ({key})</span>
                    <button onClick={() => handlePoolAssign(key, null)} style={{
                      padding: '2px 8px', border: '1px solid var(--brass)', borderRadius: 3,
                      background: 'transparent', color: 'var(--ink-subtle)',
                      fontFamily: 'var(--font-ui)', fontSize: 9, cursor: 'pointer',
                    }}>清除</button>
                  </div>
                  <select
                    value={assignedPool ?? ''}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      handlePoolAssign(key, v);
                    }}
                    style={selectStyle}
                  >
                    <option value="">-- 选择数值 --</option>
                    {options.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  {assignedPool != null && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>
                      <span>1/2: {half}</span><span>1/5: {fifth}</span>
                    </div>
                  )}
                </div>
              );
            }

            // Free mode
            return (
              <div key={key} style={{ padding: '10px 12px', border: '1px solid rgba(196,168,85,0.15)', borderRadius: 4, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 600 }}>{zh} ({key})</span>
                  <button onClick={() => rollChar(key)} style={{ padding: '2px 8px', border: '1px solid var(--brass)', borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', fontSize: 9, cursor: 'pointer' }}>ROLL</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <button onClick={() => adjChar(key, -5)} style={plusMinusBtn}>-5</button>
                  <button onClick={() => adjChar(key, -1)} style={plusMinusBtn}>-1</button>
                  <span style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--text-light)', fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{val}</span>
                  <button onClick={() => adjChar(key, +1)} style={plusMinusBtn}>+1</button>
                  <button onClick={() => adjChar(key, +5)} style={plusMinusBtn}>+5</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>
                  <span>1/2: {half}</span><span>1/5: {fifth}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ===== Step 3: Derived Stats ===== */
  function renderDerived() {
    const c = (k: COC7Characteristic) => charValues[k] ?? 0;
    const str = c('STR');
    const siz = c('SIZ');
    const strPlusSiz = str + siz;

    const stats = [
      { label: 'HP 生命值', value: `${derived.hpMax} / ${derived.hpMax}`, color: 'var(--success)' },
      { label: 'SAN 理智值', value: `${derived.sanMax} / ${derived.sanMax}`, color: 'var(--blood)' },
      { label: 'MP 魔法值', value: `${derived.mpMax} / ${derived.mpMax}`, color: 'var(--gold)' },
      { label: 'LUCK 幸运', value: luckValue != null ? String(luckValue) : '未投掷', color: 'var(--gold-bright)' },
      { label: 'MOV 移动', value: '8', color: 'var(--ink-subtle)' },
      { label: 'DB / Build', value: `${derived.db} / ${derived.build >= 0 ? '+' : ''}${derived.build}`, color: 'var(--ink-subtle)' },
    ];

    const dbTable = [
      { range: '2 – 64', db: '-2', build: -2 },
      { range: '65 – 84', db: '-1', build: -1 },
      { range: '85 – 124', db: '0', build: 0 },
      { range: '125 – 164', db: '+1D4', build: 1 },
      { range: '165 – 204', db: '+1D6', build: 2 },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={sectionTitle}>衍生属性 SECONDARY STATS</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {stats.map((s) => (
            <div key={s.label} style={{
              padding: '10px 12px',
              border: `1px solid ${s.color}22`,
              borderRadius: 4,
              background: 'rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}>
              <div style={{ fontSize: 9, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 2 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Luck roller */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px',
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
            幸运值 (3D6 x 5):
          </span>
          {luckValue != null ? (
            <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold-bright)' }}>
              {luckValue}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--ink-subtle)' }}>--</span>
          )}
          <button onClick={rollLuck} style={btnBase}>
            投掷
          </button>
          {luckValue != null && (
            <input
              type="number"
              value={luckValue}
              onChange={(e) => setLuckValue(Number(e.target.value) || 0)}
              style={{ ...inputStyle, width: 80, padding: '4px 8px' }}
              min={0}
              max={99}
            />
          )}
        </div>

        {/* DB / Build lookup */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.12)',
          borderRadius: 4,
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.1)',
        }}>
          <div style={{
            padding: '8px 12px',
            background: 'rgba(196,168,85,0.06)',
            fontSize: 11,
            color: 'var(--ink-subtle)',
            fontFamily: 'var(--font-ui)',
            letterSpacing: 2,
          }}>
            DB / Build 对照表 (STR + SIZ = {strPlusSiz})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
                <th style={{ ...thSmall, textAlign: 'left' }}>STR+SIZ</th>
                <th style={{ ...thSmall, textAlign: 'center' }}>DB</th>
                <th style={{ ...thSmall, textAlign: 'center' }}>Build</th>
              </tr>
            </thead>
            <tbody>
              {dbTable.map((row) => {
                const active = strPlusSiz >= parseInt(row.range.split('–')[0].trim()) &&
                  strPlusSiz <= parseInt(row.range.split('–')[1]?.trim() ?? '999');
                return (
                  <tr key={row.range} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: active ? 'rgba(196,168,85,0.08)' : 'transparent',
                  }}>
                    <td style={{ ...tdSmall, color: active ? 'var(--gold)' : 'var(--text-light)' }}>{row.range}</td>
                    <td style={{ ...tdSmall, textAlign: 'center', color: active ? 'var(--gold)' : 'var(--text-light)' }}>{row.db}</td>
                    <td style={{ ...tdSmall, textAlign: 'center', color: active ? 'var(--gold)' : 'var(--text-light)' }}>{row.build >= 0 ? `+${row.build}` : row.build}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ===== Step 4: Occupation & Skills ===== */
  function renderSkills() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={sectionTitle}>职业与技能 OCCUPATION & SKILLS</div>

        {/* Credit Rating */}
        <div style={{
          padding: '12px 14px',
          border: '1px solid rgba(196,168,85,0.18)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2 }}>
              信用评级 Credit Rating
            </span>
            <span style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold-bright)' }}>
              {creditRating}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.min(99, creditRating + occRemaining)}
            value={creditRating}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              const maxAllowed = creditRating + occRemaining;
              setCreditRating(Math.max(0, Math.min(v, maxAllowed, 99)));
            }}
            style={{ width: '100%', accentColor: 'var(--gold)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>
            <span>0</span><span>{Math.min(99, creditRating + occRemaining)}</span>
          </div>
        </div>

        {/* Occupation Skill Points */}
        <div style={{
          padding: '8px 12px',
          border: '1px solid rgba(196,168,85,0.12)',
          borderRadius: 4,
          background: 'rgba(196,168,85,0.04)',
          display: 'flex', justifyContent: 'space-between',
          fontSize: 12, fontFamily: 'var(--font-mono)',
        }}>
          <span style={{ color: 'var(--ink-subtle)' }}>
            职业技能点 (EDU x 4 = {eduVal} x 4):
          </span>
          <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
            {occRemaining} / {occPointPool} 剩余
          </span>
        </div>

        {/* Occupation Skills selection */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            选择 8 项职业技能 ({occSkills.length}/8)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
            {ALL_SKILLS.map((sk) => {
              const selected = occSkills.includes(sk.name);
              const points = occPoints[sk.name] ?? 0;
              const baseDisplay = typeof sk.base === 'number' ? String(sk.base) : (sk.base === 'DEX_HALF' ? 'DEX/2' : 'EDU');
              return (
                <div key={'occ-' + sk.name} style={{
                  padding: '6px 8px',
                  border: selected ? '1px solid rgba(196,168,85,0.3)' : '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 3,
                  background: selected ? 'rgba(196,168,85,0.06)' : 'rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)',
                }}
                  onClick={() => toggleOccSkill(sk.name)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: selected ? 'var(--gold)' : 'var(--text-light)', fontFamily: 'var(--font-body)' }}>
                      {sk.name}
                    </span>
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>
                      {baseDisplay}
                    </span>
                  </div>
                  {selected && (() => {
                    const base = typeof sk.base === 'number' ? sk.base : (sk.base === 'DEX_HALF' ? Math.floor((charValues.DEX ?? 50) / 2) : (charValues.EDU ?? 50));
                    const total = base + points;
                    const maxByPool = points + occRemaining;
                    const maxByCap = Math.max(0, 99 - base);
                    const maxAllowed = Math.min(maxByPool, maxByCap);
                    return (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <button onClick={(e) => { e.stopPropagation(); const v = Math.min(points + 10, maxAllowed); setOccPoints(p => ({ ...p, [sk.name]: v })); }} style={{ padding: '1px 5px', border: '1px solid var(--brass)', borderRadius: 2, background: 'transparent', color: 'var(--ink-subtle)', fontSize: 8, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>+10</button>
                        <button onClick={(e) => { e.stopPropagation(); const v = Math.min(points + 20, maxAllowed); setOccPoints(p => ({ ...p, [sk.name]: v })); }} style={{ padding: '1px 5px', border: '1px solid var(--brass)', borderRadius: 2, background: 'transparent', color: 'var(--ink-subtle)', fontSize: 8, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>+20</button>
                        <input type="number" min={0} max={maxAllowed} value={points}
                          onChange={(e) => { const v = Math.max(0, Math.min(maxAllowed, Number(e.target.value) || 0)); setOccPoints((p) => ({ ...p, [sk.name]: v })); }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ ...inputStyle, width: 50, padding: '2px 4px', fontSize: 10 }} />
                        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
                          {base}+{points}={total}
                        </span>
                      </div>
                    </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        {/* Personal Interest Skills */}
        <div style={{
          padding: '8px 12px',
          border: '1px solid rgba(196,168,85,0.12)',
          borderRadius: 4,
          background: 'rgba(196,168,85,0.04)',
          fontSize: 12, fontFamily: 'var(--font-mono)',
          color: 'var(--ink-subtle)',
        }}>
          个人兴趣点 (INT x 2 = {intVal} x 2 = {intPointPool}) — 选 4 项技能，每项在基础值上+20%
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            选择 4 项兴趣技能 ({interestSkills.length}/4)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, maxHeight: 250, overflowY: 'auto' }}>
            {ALL_SKILLS.map((sk) => {
              const selected = interestSkills.includes(sk.name);
              return (
                <div key={'int-' + sk.name} style={{
                  padding: '6px 8px',
                  border: selected ? '1px solid rgba(196,168,85,0.3)' : '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 3,
                  background: selected ? 'rgba(196,168,85,0.06)' : 'rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)',
                }}
                  onClick={() => toggleInterestSkill(sk.name)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: selected ? 'var(--gold)' : 'var(--text-light)', fontFamily: 'var(--font-body)' }}>
                      {sk.name}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                      {selected ? '+20%' : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ===== Step 5: Background ===== */
  function renderBackground() {
    const fields: { label: string; value: string; set: (v: string) => void; rows?: number }[] = [
      { label: '个人描述 Description', value: description, set: setDescription, rows: 2 },
      { label: '思想/信念 Beliefs', value: beliefs, set: setBeliefs },
      { label: '重要之人 Significant People', value: significantPeople, set: setSignificantPeople },
      { label: '重要场所 Meaningful Locations', value: meaningfulLocations, set: setMeaningfulLocations },
      { label: '珍贵之物 Treasured Possessions', value: treasuredPossessions, set: setTreasuredPossessions },
      { label: '特质 Traits', value: traits, set: setTraits },
      { label: '伤口/伤痕 Injuries', value: injuries, set: setInjuries },
      { label: '恐惧症/狂躁症 Phobias', value: phobias, set: setPhobias },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={sectionTitle}>背景故事 BACKGROUND</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fields.map((f) => (
            <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={labelStyle}>{f.label}</span>
              {f.rows ? (
                <textarea
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                  placeholder="--"
                />
              ) : (
                <input
                  type="text"
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  style={inputStyle}
                  placeholder="--"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ===== Step 6: Review ===== */
  function renderReview() {
    const c = (k: COC7Characteristic) => charValues[k] ?? 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={sectionTitle}>确认创建 REVIEW</div>

        {/* Preset save */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={savePreset} style={{ padding: '4px 12px', border: '1px solid var(--gold)', borderRadius: 3, background: 'rgba(196,168,85,0.1)', color: 'var(--gold)', fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer', letterSpacing: 2 }}>保存为预设</button>
        </div>

        {/* Identity summary */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
          padding: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            身份信息
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12 }}>
            <Row label="姓名" value={name || '--'} />
            <Row label="玩家" value={player || '--'} />
            <Row label="职业" value={occupation || '--'} />
            <Row label="年龄" value={String(age)} />
            <Row label="性别" value={sex || '--'} />
            <Row label="居住地" value={residence || '--'} />
            <Row label="出生地" value={birthplace || '--'} />
          </div>
        </div>

        {/* Characteristics summary */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
          padding: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            基础属性
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px 12px', fontSize: 12 }}>
            {CHAR_ORDER.map(({ key, zh }) => {
              const val = c(key);
              return (
                <div key={key} style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-light)' }}>
                  <span style={{ color: 'var(--ink-subtle)', fontSize: 10 }}>{zh} </span>
                  <span style={{ color: 'var(--gold)' }}>{val}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Derived summary */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
          padding: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            衍生属性
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            <div>HP: <span style={{ color: 'var(--success)' }}>{derived.hpMax}/{derived.hpMax}</span></div>
            <div>SAN: <span style={{ color: 'var(--blood)' }}>{derived.sanMax}/{derived.sanMax}</span></div>
            <div>MP: <span style={{ color: 'var(--gold)' }}>{derived.mpMax}/{derived.mpMax}</span></div>
            <div>LUCK: <span style={{ color: 'var(--gold-bright)' }}>{luckValue ?? '--'}</span></div>
            <div>MOV: 8</div>
            <div>DB: {derived.db} (Build {derived.build >= 0 ? '+' : ''}{derived.build})</div>
          </div>
        </div>

        {/* Skills summary */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
          padding: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            技能 ({occSkills.length + interestSkills.length + 1} 项)
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-subtle)', marginBottom: 6 }}>
            信用评级: <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{creditRating}%</span>
          </div>
          {occSkills.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--ink-subtle)', marginBottom: 4 }}>职业技能:</div>
              {occSkills.map((sn) => {
                const spec = ALL_SKILLS.find((s) => s.name === sn);
                const base = spec ? resolveSkillBase(spec.base, charValues as Record<COC7Characteristic, number>) : 0;
                const alloc = occPoints[sn] ?? 0;
                return (
                  <div key={sn} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-light)', marginLeft: 8 }}>
                    {sn}: {base}% + {alloc}% = <span style={{ color: 'var(--gold)' }}>{base + alloc}%</span>
                  </div>
                );
              })}
            </div>
          )}
          {interestSkills.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--ink-subtle)', marginBottom: 4 }}>兴趣技能 (+20%):</div>
              {interestSkills.map((sn) => {
                const spec = ALL_SKILLS.find((s) => s.name === sn);
                const base = spec ? resolveSkillBase(spec.base, charValues as Record<COC7Characteristic, number>) : 0;
                return (
                  <div key={sn} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-light)', marginLeft: 8 }}>
                    {sn}: {base}% + 20% = <span style={{ color: 'var(--gold)' }}>{base + 20}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Background summary */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
          padding: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            背景故事
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            {description && <Row label="个人描述" value={description} />}
            {beliefs && <Row label="思想/信念" value={beliefs} />}
            {significantPeople && <Row label="重要之人" value={significantPeople} />}
            {meaningfulLocations && <Row label="重要场所" value={meaningfulLocations} />}
            {treasuredPossessions && <Row label="珍贵之物" value={treasuredPossessions} />}
            {traits && <Row label="特质" value={traits} />}
            {injuries && <Row label="伤口/伤痕" value={injuries} />}
            {phobias && <Row label="恐惧症/狂躁症" value={phobias} />}
          </div>
        </div>
      </div>
    );
  }

  /* ===== Main render ===== */
  return (
    <>
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
        maxHeight: '88vh',
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
                fontSize: 10,
                color: 'var(--ink-subtle)',
                letterSpacing: 2,
                marginTop: 2,
              }}>
                INVESTIGATOR CREATOR
              </div>
            </div>
            <button onClick={onClose} style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid transparent', borderRadius: 3,
              background: 'transparent', color: 'var(--ink-subtle)', fontSize: 16,
              cursor: 'pointer', fontFamily: 'var(--font-ui)',
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--gold)';
                e.currentTarget.style.borderColor = 'var(--brass)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--ink-subtle)';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
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
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      border: active ? '1px solid var(--gold)' : done ? '1px solid rgba(196,168,85,0.35)' : '1px solid rgba(255,255,255,0.1)',
                      background: active ? 'var(--gold)' : done ? 'rgba(196,168,85,0.15)' : 'transparent',
                      color: active ? 'var(--void)' : done ? 'var(--gold)' : 'var(--ink-subtle)',
                      fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700,
                      cursor: done ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'var(--transition-smooth)',
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
        }}>
          <div style={{
            opacity: 1,
            transition: 'opacity 0.25s ease',
          }}>
            {renderStepContent()}
          </div>
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
            style={step === 0 ? btnDisabled : btnBase}
          >
            ← 上一步
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={nextStep}
              disabled={!canGoNext()}
              style={canGoNext() ? { ...btnBase, background: 'rgba(196,168,85,0.15)', borderColor: 'rgba(196,168,85,0.5)' } : btnDisabled}
            >
              下一步 →
            </button>
          ) : (
            <button
              onClick={handleConfirm}
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

/* ===== Tiny helpers ===== */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, fontSize: 12 }}>
      <span style={{ color: 'var(--ink-subtle)', flexShrink: 0 }}>{label}:</span>
      <span style={{ color: 'var(--text-light)' }}>{value}</span>
    </div>
  );
}

const thSmall: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 10,
  color: 'var(--ink-subtle)',
  letterSpacing: 1,
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
};

const tdSmall: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 11,
  color: 'var(--text-light)',
};
