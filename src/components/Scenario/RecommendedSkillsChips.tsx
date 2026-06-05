// 剧本系统 - Step 4 推荐技能 chip 行(角色创建第 4 步使用)
// source 为空 → 「通用热门技能」(POPULAR_SKILLS);非空 → 「剧本推荐」
import { POPULAR_SKILLS } from '../../data/popular-skills';

interface Props {
  source: string[];
  occSelected: string[];
  intSelected: string[];
  onClick: (name: string) => void;
  emptyHint?: string;
}

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

export function RecommendedSkillsChips({ source, occSelected, intSelected, onClick, emptyHint }: Props) {
  const hasSource = source.length > 0;
  const chips = hasSource ? source : POPULAR_SKILLS;
  const title = hasSource ? '剧本推荐' : '通用热门技能';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--font-ui)',
        fontSize: 'calc(11px * var(--system-ratio, 1))',
        letterSpacing: 1,
        color: hasSource ? 'var(--gold)' : 'var(--ink-faded, #8a7a55)',
      }}>
        <span>{title}</span>
        {!hasSource && emptyHint ? (
          <span style={{ opacity: 0.65, letterSpacing: 0.5, fontSize: 'calc(10px * var(--system-ratio, 1))' }}>
            {emptyHint}
          </span>
        ) : null}
      </div>
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', overflowY: 'hidden',
        paddingBottom: 2, scrollbarWidth: 'thin',
      }}>
        {chips.map((name) => {
          const picked = occSelected.includes(name) || intSelected.includes(name);
          return (
            <Chip
              key={name}
              name={name}
              picked={picked}
              onClick={() => { if (!picked) onClick(name); }}
            />
          );
        })}
      </div>
    </div>
  );
}

function Chip({ name, picked, onClick }: { name: string; picked: boolean; onClick: () => void }) {
  // 已选 chip:不响应、视觉淡化(cursor:default);未选 chip:hover 放大增亮 + active 按压。
  return (
    <button
      type="button"
      onClick={picked ? undefined : onClick}
      disabled={picked}
      style={{
        flexShrink: 0,
        padding: '4px 10px',
        borderRadius: 11,
        border: picked ? '1px solid rgba(196,168,85,0.18)' : '1px solid rgba(196,168,85,0.45)',
        background: picked ? 'rgba(196,168,85,0.06)' : 'rgba(0,0,0,0.2)',
        color: picked ? 'rgba(196,168,85,0.45)' : 'var(--parchment, #d8c79a)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'calc(11px * var(--system-ratio, 1))',
        letterSpacing: 0.5,
        whiteSpace: 'nowrap',
        cursor: picked ? 'default' : 'pointer',
        transition: `transform 200ms ${EASE}, filter 200ms ${EASE}, background 200ms ${EASE}, border-color 200ms ${EASE}`,
      }}
      onMouseEnter={(e) => {
        if (picked) return;
        e.currentTarget.style.transform = 'scale(1.06)';
        e.currentTarget.style.filter = 'brightness(1.18)';
        e.currentTarget.style.background = 'rgba(196,168,85,0.18)';
      }}
      onMouseLeave={(e) => {
        if (picked) return;
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.filter = 'brightness(1)';
        e.currentTarget.style.background = 'rgba(0,0,0,0.2)';
      }}
      onMouseDown={(e) => { if (!picked) e.currentTarget.style.transform = 'scale(0.96)'; }}
      onMouseUp={(e) => { if (!picked) e.currentTarget.style.transform = 'scale(1.06)'; }}
    >
      {name}
    </button>
  );
}
