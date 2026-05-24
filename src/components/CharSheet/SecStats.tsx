import { useCharSheetStore } from '../../stores/useCharSheetStore';

const STATS: { key: string; zh: string; color: string }[] = [
  { key: 'hp', zh: 'HP 生命', color: 'var(--success)' },
  { key: 'san', zh: 'SAN 理智', color: 'var(--blood)' },
  { key: 'mp', zh: 'MP 魔法', color: 'var(--gold)' },
  { key: 'luck', zh: 'LUCK 幸运', color: 'var(--gold-bright)' },
  { key: 'mov', zh: 'MOV 移动', color: 'var(--ink-subtle)' },
  { key: 'db', zh: 'DB 伤害', color: 'var(--ink-subtle)' },
];

export function SecStats() {
  const sheet = useCharSheetStore((s) => s.sheet);
  const sec = sheet.secondary;

  const renderValue = (key: string): string => {
    switch (key) {
      case 'hp': return `${sec.hp.current} / ${sec.hp.max}`;
      case 'san': return `${sec.san.current} / ${sec.san.max}`;
      case 'mp': return `${sec.mp.current} / ${sec.mp.max}`;
      case 'luck': return String(sec.luck);
      case 'mov': return String(sec.mov);
      case 'db': return sec.db;
      default: return '';
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 8,
      }}
    >
      {STATS.map((s) => (
        <div
          key={s.key}
          style={{
            padding: '8px 10px',
            border: `1px solid ${s.color}22`,
            borderRadius: 3,
            background: 'rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)',
              letterSpacing: 2,
            }}
          >
            {s.zh}
          </div>
          <div
            style={{
              fontSize: 18,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: s.color,
            }}
          >
            {renderValue(s.key)}
          </div>
        </div>
      ))}
    </div>
  );
}
