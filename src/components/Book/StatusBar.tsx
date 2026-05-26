import { useBookStore } from '../../stores/useBookStore';
import { useVariableStore } from '../../stores/useVariableStore';

export function StatusBar() {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const vars = useVariableStore((s) => s.variables);
  let scene = pages[pageIndex]?.sceneInfo;

  // Fallback: build sceneInfo from MVU variable store
  if (!scene || !scene.location) {
    const loc = vars.location?.value || '';
    const date = vars.date?.value || '';
    const time = vars.time?.value || '';
    const weather = vars.weather?.value || '';
    if (loc || date) {
      // Try to compute weekday from date string like "1923年10月15日"
      let weekday = '';
      try {
        const dm = date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (dm) {
          const d = new Date(parseInt(dm[1]), parseInt(dm[2]) - 1, parseInt(dm[3]));
          const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
          weekday = days[d.getDay()];
        }
      } catch { /* keep empty */ }
      scene = {
        date: date || '未知日期',
        weekday: weekday || '',
        time: time || '未知时间',
        weather: weather || '未知天气',
        location: loc || '未知地点',
      };
    }
  }

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
