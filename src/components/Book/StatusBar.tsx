import { useBookStore } from '../../stores/useBookStore';
import { useVariableStore } from '../../stores/useVariableStore';

const NO_VALUE = '未知';

export function StatusBar() {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const vars = useVariableStore((s) => s.variables);
  let scene = pages[pageIndex]?.sceneInfo;

  // Fallback: fill missing fields from MVU variable store (ZOD nested paths)
  // Also triggers for partial sceneInfo (e.g. prologue has location but no date/time)
  if (!scene) {
    scene = { date: '', weekday: '', time: '', weather: '', location: '' };
  }
  const date = scene.date
    || vars['世界.日期']?.value
    || vars.date?.value  // legacy flat key
    || NO_VALUE;
  const weekday = scene.weekday
    || computeWeekday(date)
    || '';
  const time = scene.time
    || vars['世界.时间']?.value
    || vars.time?.value  // legacy flat key
    || NO_VALUE;
  const weather = scene.weather
    || vars['世界.天气']?.value
    || vars.weather?.value  // legacy flat key
    || NO_VALUE;
  const location = scene.location
    || vars['世界.地点']?.value
    || vars.location?.value  // legacy flat key
    || NO_VALUE;

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
      <span style={itemStyle}>{date}</span>
      {weekday ? <><span style={dividerStyle}>·</span><span style={itemStyle}>{weekday}</span></> : null}
      <span style={dividerStyle}>·</span>

      {/* Weather icon + text */}
      <span style={itemStyle}>
        {weatherIcon(weather)}
        {' '}{weather}
      </span>
      <span style={dividerStyle}>·</span>

      {/* Time */}
      <span style={itemStyle}>{time}</span>

      <span style={{ margin: '0 10px', width: 1, height: 18, background: 'rgba(196,168,85,0.25)' }} />

      {/* Location */}
      <span style={{
        ...itemStyle,
        color: 'var(--gold)',
        fontSize: 14,
        letterSpacing: 3,
      }}>
        {location}
      </span>
    </div>
  );
}

/** Compute weekday from date strings like "1925年" or "1925-01-01" */
function computeWeekday(dateStr: string): string {
  if (!dateStr || dateStr === NO_VALUE) return '';
  try {
    let m: RegExpMatchArray | null;
    // Try "1925年3月15日" format
    m = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (m) {
      const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      return days[d.getDay()];
    }
    // Try "1925-03-15" format
    m = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      return days[d.getDay()];
    }
  } catch { /* keep empty */ }
  return '';
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
