import { useState, useEffect } from 'react';

interface Props {
  value: number;
  color?: 'player' | 'opponent' | 'bonus';
  label?: string;
  large?: boolean;
}

const colorMap = {
  player: { border: 'var(--gold)', text: 'var(--gold)', bg: 'rgba(196,168,85,0.08)' },
  opponent: { border: 'var(--blood)', text: 'var(--blood)', bg: 'rgba(139,58,58,0.12)' },
  bonus: { border: 'var(--success)', text: 'var(--success)', bg: 'rgba(58,107,90,0.1)' },
};

export function DiceDie({ value, color = 'player', label, large }: Props) {
  const [rolling, setRolling] = useState(true);
  const max = large ? 100 : 9;
  const [displayValue, setDisplayValue] = useState(Math.floor(Math.random() * (max + 1)));

  useEffect(() => {
    setRolling(true);
    const timer = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * (max + 1)));
    }, 50);
    const stop = setTimeout(() => {
      clearInterval(timer);
      setRolling(false);
      setDisplayValue(value);
    }, 500);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [value, max]);

  const c = colorMap[color];
  const size = large ? 80 : 52;
  const fontSize = large ? 36 : 24;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `2px solid ${c.border}`,
        borderRadius: 6,
        background: c.bg,
        fontSize,
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        color: c.text,
        transition: 'transform 0.1s ease',
        transform: rolling ? 'rotate(-6deg) scale(1.08)' : 'rotate(0deg) scale(1)',
        boxShadow: `0 0 16px ${c.border}22`,
        minWidth: large ? 80 : 52,
      }}>
        {displayValue}
      </div>
      {label && (
        <span style={{ fontSize: 9, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)', letterSpacing: 1 }}>
          {label}
        </span>
      )}
    </div>
  );
}
