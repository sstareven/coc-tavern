import { useState, useEffect } from 'react';

interface Props {
  value: number;
  color?: 'player' | 'opponent' | 'bonus';
  label?: string;
}

const colorMap = {
  player: { border: 'var(--gold)', text: 'var(--gold)', bg: 'rgba(196,168,85,0.08)' },
  opponent: { border: 'var(--blood)', text: 'var(--blood)', bg: 'rgba(139,58,58,0.12)' },
  bonus: { border: 'var(--success)', text: 'var(--success)', bg: 'rgba(58,107,90,0.1)' },
};

export function DiceDie({ value, color = 'player', label }: Props) {
  const [rolling, setRolling] = useState(true);
  const [displayValue, setDisplayValue] = useState(Math.floor(Math.random() * 10));

  useEffect(() => {
    setRolling(true);
    const timer = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 10));
    }, 60);
    const stop = setTimeout(() => {
      clearInterval(timer);
      setRolling(false);
      setDisplayValue(value);
    }, 400);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [value]);

  const c = colorMap[color];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 56,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `2px solid ${c.border}`,
        borderRadius: 4,
        background: c.bg,
        fontSize: 28,
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        color: c.text,
        transition: 'transform 0.1s ease',
        transform: rolling ? 'rotate(-6deg) scale(1.08)' : 'rotate(0deg) scale(1)',
        boxShadow: `0 0 12px ${c.border}22`,
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
