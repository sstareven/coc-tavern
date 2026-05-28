import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { CHAR_ORDER, DEFAULT_CHARS as DEFAULT_VALUES } from '../../sillytavern/coc-data';

export function CharGrid() {
  const sheet = useCharSheetStore((s) => s.sheet);
  const chars = sheet.characteristics;
  const hf = sheet.halfFifth;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        padding: 0,
      }}
    >
      {CHAR_ORDER.map(({ key, zh, en }) => {
        const val = chars[key] ?? DEFAULT_VALUES[key];
        const modified = val !== DEFAULT_VALUES[key];
        const half = hf[key]?.half ?? Math.floor(val / 2);
        const fifth = hf[key]?.fifth ?? Math.floor(val / 5);
        return (
          <div
            key={key}
            style={{
              padding: '10px 12px',
              border: '1px solid rgba(196,168,85,0.15)',
              borderRadius: 4,
              background: 'rgba(0,0,0,0.15)',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {/* Gold dot for modified */}
            {modified && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 6,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--gold)',
                  boxShadow: '0 0 4px var(--gold)',
                }}
              />
            )}
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink-subtle)',
                fontFamily: 'var(--font-ui)',
                letterSpacing: 2,
              }}
            >
              {zh}
            </div>
            <div
              style={{
                fontSize: 24,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: 'var(--gold)',
                lineHeight: 1,
              }}
            >
              {val}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-subtle)',
              }}
            >
              <span>1/2 {half}</span>
              <span>1/5 {fifth}</span>
            </div>
            <div
              style={{
                fontSize: 8,
                color: 'var(--ink-faded)',
                fontFamily: 'var(--font-ui)',
                letterSpacing: 1,
              }}
            >
              {en}
            </div>
          </div>
        );
      })}
    </div>
  );
}
