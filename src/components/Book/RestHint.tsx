import { useVariableStore } from '../../stores/useVariableStore';
import { useCombatStore } from '../../stores/useCombatStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { getTreePath, setTreePath } from '../../sillytavern/mvu-var-access';
import { formatEpochDisplay, canRestNow, executeRest } from '../../sillytavern/time-engine';

export function RestHint() {
  const statData = useVariableStore((s) => s.statData);
  const epoch = Number(getTreePath(statData, '世界.时间.epoch')) || 0;
  const lastRest = Number(getTreePath(statData, '世界.时间.lastRestEpoch')) || 0;
  const inCombat = useCombatStore((s) => !!s.encounter);
  const hoursSinceRest = (epoch - lastRest) / 60;
  const canRest = canRestNow(epoch, lastRest, inCombat) && epoch > 0;

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

    // HP +1 (COC7e 自然恢复)
    const cs = useCharSheetStore.getState();
    const hp = cs.sheet.secondary.hp;
    if (hp.current < hp.max && hpRecovered > 0) {
      const newSheet = structuredClone(cs.sheet);
      newSheet.secondary.hp.current = Math.min(hp.max, hp.current + hpRecovered);
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
      <span style={{ color: 'var(--gold-bright)', fontSize: 'calc(13px * var(--system-ratio, 1))' }}>☽</span>
      <span>调查员已连续活动超过 {Math.floor(hoursSinceRest)} 小时，可以寻找安全场所休息</span>
      <button
        onClick={handleRest}
        style={{
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
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(196,168,85,0.15)';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.95)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        休息
      </button>
    </div>
  );
}
