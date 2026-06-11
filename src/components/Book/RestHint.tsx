import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { useVariableStore } from '../../stores/useVariableStore';
import { useCombatStore } from '../../stores/useCombatStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useNpcStore } from '../../stores/useNpcStore';
import { getTreePath, setTreePath } from '../../sillytavern/mvu-var-access';
import { formatEpochDisplay, canRestNow, executeRest, executeMedicalCare, rollSanRecovery, computeMpRecovery } from '../../sillytavern/time-engine';
import { rollPsychoanalysis } from '../../sillytavern/sanity-engine';

const restActionBtnStyle: CSSProperties = {
  padding: '3px 12px',
  background: 'transparent',
  border: '1px solid var(--brass)',
  borderRadius: 4,
  color: 'var(--gold)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'calc(11px * var(--system-ratio, 1))',
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
  flexShrink: 0,
};

function RestActionBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const onEnter = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'rgba(196,168,85,0.15)';
    e.currentTarget.style.transform = 'scale(1.05)';
  };
  const onLeave = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent';
    e.currentTarget.style.transform = 'scale(1)';
  };
  const onDown = (e: ReactMouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(0.95)'; };
  const onUp = (e: ReactMouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(1)'; };

  return (
    <button
      onClick={onClick}
      style={restActionBtnStyle}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseDown={onDown}
      onMouseUp={onUp}
    >
      {children}
    </button>
  );
}

export function RestHint() {
  const statData = useVariableStore((s) => s.statData);
  const epoch = Number(getTreePath(statData, '世界.时间.epoch')) || 0;
  const lastRest = Number(getTreePath(statData, '世界.时间.lastRestEpoch')) || 0;
  const inCombat = useCombatStore((s) => !!s.encounter);
  const hoursSinceRest = (epoch - lastRest) / 60;
  const canRest = canRestNow(epoch, lastRest, inCombat) && epoch > 0;

  // Find best party NPC with Medicine (医学) skill
  const partyNpcs = useNpcStore((s) => {
    const party = Object.values(s.profiles).filter((p) => p.isPresent && p.inParty);
    const withMedicine = party
      .filter((p) => p.skills && typeof p.skills['医学'] === 'number' && p.skills['医学'] > 0)
      .sort((a, b) => (b.skills?.['医学'] ?? 0) - (a.skills?.['医学'] ?? 0));
    return withMedicine.length > 0 ? withMedicine[0] : null;
  });

  // Find best party NPC with Psychoanalysis (精神分析) skill
  const psychoanalystNpc = useNpcStore((s) => {
    const party = Object.values(s.profiles).filter((p) => p.isPresent && p.inParty);
    const withPsych = party
      .filter((p) => p.skills && typeof p.skills['精神分析'] === 'number' && p.skills['精神分析'] > 0)
      .sort((a, b) => (b.skills?.['精神分析'] ?? 0) - (a.skills?.['精神分析'] ?? 0));
    return withPsych.length > 0 ? withPsych[0] : null;
  });

  if (!canRest) return null;

  const handleRest = () => {
    const varStore = useVariableStore.getState();
    const sd: Record<string, unknown> = structuredClone(varStore.statData) ?? {};
    const prevEpoch = Number(getTreePath(sd, '世界.时间.epoch')) || 0;
    const { newEpoch, hpRecovered } = executeRest(prevEpoch);
    setTreePath(sd, '世界.时间.epoch', newEpoch);
    setTreePath(sd, '世界.时间.lastRestEpoch', newEpoch);
    const startDate = String(getTreePath(sd, '世界.时间.startDate') || '');
    if (startDate) {
      setTreePath(sd, '世界.时间.display', formatEpochDisplay(startDate, newEpoch));
    }
    varStore.setStatData(sd);

    // Clone sheet once, apply HP + SAN recovery, write once
    const cs = useCharSheetStore.getState();
    const newSheet = structuredClone(cs.sheet);
    let sheetChanged = false;

    // HP recovery (COC7e: 8h rest = 0 HP, only fatigue reset)
    const hp = newSheet.secondary.hp;
    if (hp.current < hp.max && hpRecovered > 0) {
      newSheet.secondary.hp.current = Math.min(hp.max, hp.current + hpRecovered);
      sheetChanged = true;
    }

    // SAN self-help: d100 vs POW, success = +1D3
    const san = newSheet.secondary.san;
    const pow = newSheet.characteristics.POW;
    const sanResult = rollSanRecovery(pow, san.current, san.max);
    if (sanResult.recovered > 0) {
      newSheet.secondary.san.current = san.current + sanResult.recovered;
      sheetChanged = true;
    }

    // MP recovery (COC7e p148: proportional over 24h)
    const mpMax = Math.floor(pow / 5);
    const mpCurrent = newSheet.secondary.mp.current;
    const mpRecovery = computeMpRecovery(mpMax, mpCurrent, 8);
    if (mpRecovery > 0) {
      newSheet.secondary.mp.current = mpCurrent + mpRecovery;
      sheetChanged = true;
    }

    if (sheetChanged) {
      cs.setSheet(newSheet);
    }
  };

  const handleMedicalCare = () => {
    if (!partyNpcs) return;
    const medicineSkill = partyNpcs.skills?.['医学'] ?? 0;
    if (medicineSkill <= 0) return;

    const cs = useCharSheetStore.getState();
    const hp = cs.sheet.secondary.hp;
    const result = executeMedicalCare(medicineSkill, hp.max);

    if (result.success && result.hpRecovered > 0 && hp.current < hp.max) {
      const newSheet = structuredClone(cs.sheet);
      newSheet.secondary.hp.current = Math.min(hp.max, hp.current + result.hpRecovered);
      cs.setSheet(newSheet);
    }
  };

  const handlePsychoanalysis = () => {
    if (!psychoanalystNpc) return;
    const psychSkill = psychoanalystNpc.skills?.['精神分析'] ?? 0;
    if (psychSkill <= 0) return;

    const cs = useCharSheetStore.getState();
    const san = cs.sheet.secondary.san;
    const result = rollPsychoanalysis(psychSkill, san.current, san.max);

    if (result.success && result.recovered > 0 && san.current < san.max) {
      const newSheet = structuredClone(cs.sheet);
      newSheet.secondary.san.current = Math.min(san.max, san.current + result.recovered);
      cs.setSheet(newSheet);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      padding: '6px 14px', margin: '0 0 8px',
      background: 'rgba(196,168,85,0.08)',
      border: '1px solid rgba(196,168,85,0.25)',
      borderRadius: 6,
      fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio, 1))',
      color: 'var(--parchment)', opacity: 0.85,
      transition: 'opacity 0.3s cubic-bezier(0.4,0,0.2,1)',
    }}>
      {/* TODO: replace Unicode crescent with TabIcons SVG icon when available */}
      <span style={{ color: 'var(--gold-bright)', fontSize: 'calc(13px * var(--system-ratio, 1))' }}>☽</span>
      <span>调查员已连续活动超过 {Math.floor(hoursSinceRest)} 小时，可以寻找安全场所休息</span>
      <RestActionBtn onClick={handleRest}>休息</RestActionBtn>
      {partyNpcs && (
        <RestActionBtn onClick={handleMedicalCare}>接受治疗({partyNpcs.name})</RestActionBtn>
      )}
      {psychoanalystNpc && (
        <RestActionBtn onClick={handlePsychoanalysis}>心理治疗({psychoanalystNpc.name})</RestActionBtn>
      )}
    </div>
  );
}
