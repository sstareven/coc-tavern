import { useBookStore } from '../../stores/useBookStore';
import { useVariableStore } from '../../stores/useVariableStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';

const NO_VALUE = '未知';

/** 取实时变量(LLM 游戏中更新)优先，回退角色卡 secondary。返回 current/max 数对。 */
function resolveStat(
  vars: Record<string, { value: string } | undefined>,
  curKey: string,
  maxKey: string,
  fallback: { current: number; max: number },
): { current: number; max: number } {
  const c = parseInt(vars[curKey]?.value ?? '', 10);
  const m = parseInt(vars[maxKey]?.value ?? '', 10);
  return {
    current: Number.isNaN(c) ? fallback.current : c,
    max: Number.isNaN(m) ? fallback.max : m,
  };
}

export function StatusBar() {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const vars = useVariableStore((s) => s.variables);
  const secondary = useCharSheetStore((s) => s.sheet.secondary);
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

  // HP/SAN/MP：实时变量优先，回退角色卡
  const hp = resolveStat(vars, '调查员.生命值.当前', '调查员.生命值.最大', secondary.hp);
  const san = resolveStat(vars, '调查员.理智值.当前', '调查员.理智值.最大', secondary.san);
  const mp = resolveStat(vars, '调查员.魔法值.当前', '调查员.魔法值.最大', secondary.mp);
  const hasStats = hp.max > 0 || san.max > 0 || mp.max > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '0 0 6px',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Row 1 — scene info */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          color: 'var(--parchment)',
          letterSpacing: 2,
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

      {/* Row 2 — HP / SAN / MP (below the time row) */}
      {hasStats && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatPill label="HP" stat={hp} color="var(--success)" />
          <StatPill label="SAN" stat={san} color="var(--blood)" />
          <StatPill label="MP" stat={mp} color="var(--gold)" />
        </div>
      )}
    </div>
  );
}

/** 单个属性药丸：标签 + 当前/最大，按属性语义着色。 */
function StatPill({ label, stat, color }: { label: string; stat: { current: number; max: number }; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 10px', borderRadius: 10,
      background: 'rgba(0,0,0,0.25)',
      border: `1px solid ${color}`,
      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 0.5,
      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
    }}>
      <span style={{ color, fontWeight: 700, letterSpacing: 1 }}>{label}</span>
      <span style={{ color: 'var(--parchment)' }}>
        {stat.current}<span style={{ color: 'var(--ink-faded)', margin: '0 1px' }}>/</span>{stat.max}
      </span>
    </span>
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
