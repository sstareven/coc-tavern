import { useCharSheetStore } from '../../stores/useCharSheetStore';

export function InvestigatorCard() {
  const identity = useCharSheetStore((s) => s.sheet.identity);

  const details = [
    { label: '年龄', value: identity.age },
    { label: '性别', value: identity.gender },
    { label: '出生地', value: identity.birthplace },
    { label: '居住地', value: identity.residence },
  ];

  return (
    <div
      style={{
        border: '1px solid rgba(196,168,85,0.2)',
        borderRadius: 6,
        background: 'linear-gradient(135deg, rgba(42,31,20,0.6) 0%, rgba(26,20,16,0.8) 100%)',
        padding: 18,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative corner */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 50,
          height: 50,
          borderLeft: '1px solid rgba(196,168,85,0.1)',
          borderBottom: '1px solid rgba(196,168,85,0.1)',
          borderBottomLeftRadius: 6,
        }}
      />

      {/* Header row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        {/* Portrait placeholder */}
        <div
          style={{
            width: 48,
            height: 60,
            border: '1px solid rgba(196,168,85,0.3)',
            borderRadius: 3,
            background: 'rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 18, color: 'var(--gold)' }}>&#9733;</span>
        </div>

        {/* Name + occupation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <div
            style={{
              fontSize: 16,
              fontFamily: 'var(--font-display)',
              color: 'var(--gold)',
              letterSpacing: 3,
            }}
          >
            {identity.name}
          </div>
          <div
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              color: 'var(--ink-subtle)',
              letterSpacing: 2,
            }}
          >
            {identity.occupation}
          </div>
          <div
            style={{
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              color: 'var(--brass)',
              letterSpacing: 1,
              marginTop: 2,
            }}
          >
            #{identity.id.split('-').pop()}
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 16px',
          marginBottom: 10,
        }}
      >
        {details.map((d) => (
          <div key={d.label} style={{ display: 'flex', gap: 6, fontSize: 11, alignItems: 'baseline' }}>
            <span style={{ color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', flexShrink: 0, letterSpacing: 1 }}>
              {d.label}:
            </span>
            <span style={{ color: 'var(--text-light)', fontFamily: 'var(--font-body)' }}>
              {d.value}
            </span>
          </div>
        ))}
      </div>

      {/* ID card footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid rgba(196,168,85,0.1)',
          paddingTop: 10,
          fontSize: 9,
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-faded)',
          letterSpacing: 1,
        }}
      >
        <span>{identity.id}</span>
        <span>COC 7th Edition</span>
      </div>
    </div>
  );
}
