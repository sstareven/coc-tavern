import { useBookStore } from '../../stores/useBookStore';
import { useVariableStore } from '../../stores/useVariableStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';

const NO_VALUE = '未知';

/** 状态栏取的场景值可能残留关键词标签 {{词}}（供正文高亮，本栏不渲染高亮）、var 标签或 HTML，
 *  显示前清成纯文本：去掉花括号保留词、剥除标签。 */
function cleanStatus(s: string): string {
  if (!s) return s;
  return s
    .replace(/<var\s+name=['"][^"']+['"]\s+value=['"][^"']*['"]\s*\/>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{([^{}]*)\}\}/g, '$1')
    .replace(/\{([^{}:=,]+)\}/g, '$1')
    .trim();
}

/** 从 statData 嵌套树按点号路径取标量(如 世界.时间)。缺失/非标量返回 ''。 */
function statPath(tree: Record<string, unknown>, dotPath: string): string {
  let cur: unknown = tree;
  for (const seg of dotPath.split('.')) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return '';
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (cur === null || cur === undefined) return '';
  if (typeof cur === 'object') return '';
  return String(cur);
}

export function StatusBar({ compact = false }: { compact?: boolean } = {}) {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const vars = useVariableStore((s) => s.variables);
  const statData = useVariableStore((s) => s.statData);
  const secondary = useCharSheetStore((s) => s.sheet.secondary);
  let scene = pages[pageIndex]?.sceneInfo;

  // Fallback: fill missing fields from MVU variable store.
  // 世界.* 现存于 statData 嵌套树(MVU ZOD);兼容旧扁平 variables key。
  if (!scene) {
    scene = { date: '', weekday: '', time: '', weather: '', location: '' };
  }
  const date = cleanStatus(scene.date
    || statPath(statData, '世界.日期')
    || vars['世界.日期']?.value
    || vars.date?.value  // legacy flat key
    || NO_VALUE);
  const weekday = cleanStatus(scene.weekday
    || computeWeekday(date)
    || '');
  const time = cleanStatus(scene.time
    || statPath(statData, '世界.时间')
    || vars['世界.时间']?.value
    || vars.time?.value  // legacy flat key
    || NO_VALUE);
  const weather = cleanStatus(scene.weather
    || statPath(statData, '世界.天气')
    || vars['世界.天气']?.value
    || vars.weather?.value  // legacy flat key
    || NO_VALUE);
  const location = cleanStatus(scene.location
    || statPath(statData, '世界.地点')
    || vars['世界.地点']?.value
    || vars.location?.value  // legacy flat key
    || NO_VALUE);

  // HP/SAN/MP：角色卡(useCharSheetStore)是 调查员.* 的唯一源真理(MVU 把 调查员.* 的
  // patch 重定向到角色卡,故绝不读扁平变量,避免任何平行/残留值污染显示)。
  const hp = { current: secondary.hp.current, max: secondary.hp.max };
  const san = { current: secondary.san.current, max: secondary.san.max };
  const mp = { current: secondary.mp.current, max: secondary.mp.max };
  const hasStats = hp.max > 0 || san.max > 0 || mp.max > 0;

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
        fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--parchment)', userSelect: 'none' }}>
        <span style={{ color: 'var(--gold)', letterSpacing: 1 }}>{location}</span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span>{date}</span>
        {weekday && <><span style={{ opacity: 0.5 }}>·</span><span>{weekday}</span></>}
        <span style={{ opacity: 0.5 }}>·</span>
        <span>{weatherIcon(weather)} {weather}</span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span>{time}</span>
        {hasStats && (
          <>
            <span style={{ width: 1, height: 12, background: 'rgba(196,168,85,0.25)', margin: '0 2px' }} />
            <CompactStat label="HP" stat={hp} color="var(--success)" />
            <CompactStat label="SAN" stat={san} color="var(--blood)" />
            <CompactStat label="MP" stat={mp} color="var(--gold)" />
          </>
        )}
      </div>
    );
  }

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

function CompactStat({ label, stat, color }: { label: string; stat: { current: number; max: number }; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
      <span style={{ color, fontWeight: 700 }}>{label}</span>
      <span style={{ color: 'var(--parchment)' }}>{stat.current}/{stat.max}</span>
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
