import { useBookStore } from '../../stores/useBookStore';

export function StatusBar() {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const scene = pages[pageIndex]?.sceneInfo;

  if (!scene) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: '6px 0 8px',
        flexShrink: 0,
        fontFamily: 'var(--font-display)',
        fontSize: 13,
        color: 'var(--parchment)',
        letterSpacing: 2,
        userSelect: 'none',
      }}
    >
      {/* Date */}
      <span style={itemStyle}>{scene.date}</span>
      <span style={dividerStyle}>·</span>
      <span style={itemStyle}>{scene.weekday}</span>
      <span style={dividerStyle}>·</span>

      {/* Weather icon + text */}
      <span style={itemStyle}>
        {weatherIcon(scene.weather)}
        {' '}{scene.weather}
      </span>
      <span style={dividerStyle}>·</span>

      {/* Time */}
      <span style={itemStyle}>{scene.time}</span>

      <span style={{ margin: '0 10px', width: 1, height: 18, background: 'rgba(196,168,85,0.25)' }} />

      {/* Location */}
      <span style={{
        ...itemStyle,
        color: 'var(--gold)',
        fontSize: 14,
        letterSpacing: 3,
      }}>
        {scene.location}
      </span>
    </div>
  );
}

// Simple weather → icon mapping
function weatherIcon(weather: string): string {
  const w = weather.toLowerCase();
  if (w.includes('雨') || w.includes('暴')) return '🌧';
  if (w.includes('雪')) return '❄';
  if (w.includes('雾') || w.includes('霾')) return '🌫';
  if (w.includes('风')) return '💨';
  if (w.includes('晴') || w.includes('朗')) return '☀';
  if (w.includes('云') || w.includes('阴')) return '☁';
  if (w.includes('月')) return '🌙';
  return '◆';
}

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  color: 'var(--parchment)',
  textShadow: '0 0 6px rgba(196,168,85,0.2)',
};

const dividerStyle: React.CSSProperties = {
  margin: '0 8px',
  color: 'var(--ink-faded)',
  opacity: 0.5,
};
