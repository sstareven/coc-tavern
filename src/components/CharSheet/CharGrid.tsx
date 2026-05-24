import { useCharSheetStore } from '../../stores/useCharSheetStore';
import type { COC7Characteristic } from '../../types';

const CHAR_ORDER: { key: COC7Characteristic; zh: string; en: string }[] = [
  { key: 'STR', zh: '力量', en: 'STR' },
  { key: 'CON', zh: '体质', en: 'CON' },
  { key: 'POW', zh: '意志', en: 'POW' },
  { key: 'DEX', zh: '敏捷', en: 'DEX' },
  { key: 'APP', zh: '外貌', en: 'APP' },
  { key: 'SIZ', zh: '体型', en: 'SIZ' },
  { key: 'INT', zh: '智力', en: 'INT' },
  { key: 'EDU', zh: '教育', en: 'EDU' },
];

const DEFAULT_VALUES: Record<COC7Characteristic, number> = {
  STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50,
};

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
