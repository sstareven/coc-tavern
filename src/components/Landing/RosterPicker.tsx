import { useEffect, useMemo } from 'react';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { groupRoster, type RosterRow } from '../../scenario/roster-engine';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scenarioId: string;
  onPickChar: (charIdx: number, mode: 'newChar' | 'preset') => void;
  onBack: () => void;
  onAddNewCharacter: () => void;
}

function IconBack({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function IconUserPlus({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20a6 6 0 0112 0" />
      <path d="M18 8v6M15 11h6" />
    </svg>
  );
}

function IconPencil({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}

function IconTrash({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

// 「作者预设」内部「推荐主角 / 配角」子分区小标题（含可选副标题）。
function SubLabel({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10,
      margin: '0 0 8px', padding: '2px 2px 6px',
      borderBottom: '1px dashed rgba(196,168,85,0.18)',
    }}>
      <span style={{
        fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--gold)',
        letterSpacing: 3, fontWeight: 600,
      }}>{title}</span>
      {subtitle && (
        <span style={{
          fontFamily: 'var(--font-ui)', fontSize: 10,
          color: 'rgba(196,168,85,0.55)', letterSpacing: 1,
        }}>{subtitle}</span>
      )}
    </div>
  );
}

function RowBtn({
  onClick, children, accent, danger, dataTestId,
}: {
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  accent?: boolean;
  danger?: boolean;
  dataTestId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={dataTestId}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px',
        fontFamily: 'var(--font-ui)', fontSize: 11.5, letterSpacing: 1,
        color: danger ? '#d47a6a' : (accent ? 'var(--gold)' : 'var(--text-light, #d0c2a0)'),
        background: accent ? 'rgba(196,168,85,0.10)' : 'transparent',
        border: `1px solid ${danger ? 'rgba(212,122,106,0.55)' : 'rgba(196,168,85,0.45)'}`,
        borderRadius: 2,
        cursor: 'pointer',
        transition: `transform 180ms ${EASE}, background 180ms ${EASE}, box-shadow 180ms ${EASE}, color 180ms ${EASE}`,
      }}
      onMouseEnter={(ev) => {
        ev.currentTarget.style.background = danger
          ? 'rgba(212,122,106,0.14)'
          : 'rgba(196,168,85,0.18)';
        ev.currentTarget.style.transform = 'translateY(-1px) scale(1.02)';
        ev.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.45)';
      }}
      onMouseLeave={(ev) => {
        ev.currentTarget.style.background = accent ? 'rgba(196,168,85,0.10)' : 'transparent';
        ev.currentTarget.style.transform = 'translateY(0) scale(1)';
        ev.currentTarget.style.boxShadow = 'none';
      }}
      onMouseDown={(ev) => { ev.currentTarget.style.transform = 'translateY(0) scale(0.97)'; }}
      onMouseUp={(ev) => { ev.currentTarget.style.transform = 'translateY(-1px) scale(1.02)'; }}
    >
      {children}
    </button>
  );
}

function formatDate(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export function RosterPicker({ scenarioId, onPickChar, onBack, onAddNewCharacter }: Props) {
  const getById = useScenarioStore((s) => s.getById);
  const upsert = useScenarioStore((s) => s.upsert);
  const scn = getById(scenarioId);

  // 分组逻辑下沉到 src/scenario/roster-engine.ts (纯函数 + 单元测试)。
  // 三段都保留 scn.characters 原序 idx,onPickChar 传 charIdx 仍是原序。
  const grouped = useMemo(() => groupRoster(scn), [scn]);
  const hasPreset = grouped.protagonists.length + grouped.optionals.length > 0;

  // ESC 关闭整面板（与 header「← 返回选剧本」等价，承担全屏 dialog 的键盘退出）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onBack();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);

  if (!scn) {
    return (
      <div role="alert" style={{
        position: 'fixed', inset: 0, zIndex: 150,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(8,5,2,0.92)',
        color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2,
      }}>
        剧本不存在 — <button onClick={onBack} style={{
          marginLeft: 10, background: 'none', border: '1px solid var(--brass)',
          padding: '6px 14px', color: 'var(--gold)', cursor: 'pointer', borderRadius: 2,
        }}>返回</button>
      </div>
    );
  }

  const handleDelete = (charId: string, charName: string): void => {
    // eslint-disable-next-line no-alert
    const ok = window.confirm(`删除自创角色「${charName}」?此操作不可撤销。`);
    if (!ok) return;
    const next = { ...scn, characters: scn.characters.filter((c) => c.id !== charId), updatedAt: Date.now() };
    upsert(next);
  };

  const renderRow = ({ c, idx }: RosterRow, isUserCreated: boolean) => {
    const name = c.sheet?.identity?.name || c.npcAttrs.identityTag || '未命名';
    const occ = c.sheet?.identity?.occupation || '';
    const roleHint = c.role === 'protagonist' ? '推荐主角' : (c.role === 'optional' ? '配角' : '你的角色');
    const dateHint = isUserCreated ? formatDate(c.createdAt) : '';
    return (
      <div
        key={c.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px',
          background: 'rgba(20,14,8,0.55)',
          border: '1px solid rgba(196,168,85,0.22)',
          borderRadius: 3,
          transition: `border-color 180ms ${EASE}, background 180ms ${EASE}`,
        }}
        onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = 'rgba(196,168,85,0.5)'; }}
        onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = 'rgba(196,168,85,0.22)'; }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div data-testid="roster-row-name" style={{
            fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gold)',
            letterSpacing: 1, marginBottom: 3,
          }}>{name}</div>
          <div style={{
            fontFamily: 'var(--font-ui)', fontSize: 11, color: 'rgba(196,168,85,0.6)',
            letterSpacing: 1,
          }}>
            {occ && <span>{occ}</span>}
            {occ && <span style={{ margin: '0 6px' }}>·</span>}
            <span>{roleHint}</span>
            {dateHint && <><span style={{ margin: '0 6px' }}>·</span><span>{dateHint}</span></>}
          </div>
        </div>
        {isUserCreated && (
          <>
            <RowBtn
              dataTestId="roster-row-edit"
              onClick={() => {
                // 编辑入口:复用「新建调查员」流程(CharCreator 加载该卡)。
                // 当前 CharacterCreator 尚不支持「加载已存在 player_created 卡」,M4 仅留入口,
                // 实际加载逻辑由 M5 关系编辑步连同 CharCreator 整体增强时落地;此处先把 charId
                // 写到 lastPicked 旁挂的草稿位是一种思路,但本里程碑暂直接走「新建空卡」路径,
                // 保持流程闭环。点击行为等同于「新建调查员」(占位)。
                onAddNewCharacter();
              }}
            >
              <IconPencil /> 编辑
            </RowBtn>
            <RowBtn
              dataTestId="roster-row-delete"
              danger
              onClick={() => handleDelete(c.id, name)}
            >
              <IconTrash /> 删除
            </RowBtn>
          </>
        )}
        <RowBtn
          accent
          onClick={() => onPickChar(idx, isUserCreated ? 'newChar' : 'preset')}
        >
          选这个角色 →
        </RowBtn>
      </div>
    );
  };

  return (
    <div
      className="scenario-editor"
      role="dialog" aria-label="选择角色"
      style={{
        position: 'fixed', inset: 0, zIndex: 140,
        display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(ellipse at center, var(--abyss, #18120a) 0%, var(--void, #060403) 70%)',
        overflow: 'hidden',
      }}
    >
      <header style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '14px 22px',
        borderBottom: '1px solid rgba(196,168,85,0.22)',
        background: 'rgba(10,7,4,0.65)',
        backdropFilter: 'blur(4px)',
      }}>
        <RowBtn onClick={onBack}>
          <IconBack /> 返回选剧本
        </RowBtn>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-display)', color: 'var(--gold)',
            fontSize: 16, letterSpacing: 3,
          }}>选择你的角色</div>
          <div style={{
            fontFamily: 'var(--font-ui)', color: 'rgba(196,168,85,0.6)',
            fontSize: 11, letterSpacing: 1.5, marginTop: 2,
          }}>剧本《{scn.meta.name}》</div>
        </div>
        <RowBtn accent onClick={onAddNewCharacter}>
          <IconUserPlus /> 新建调查员
        </RowBtn>
      </header>

      <div style={{
        flex: 1, minHeight: 0,
        overflowY: 'auto',
        padding: '20px 24px 40px',
      }}>
        <section style={{ marginBottom: 28 }}>
          <h3 style={{
            margin: '0 0 12px',
            fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gold)',
            letterSpacing: 3, fontWeight: 500,
            borderBottom: '1px solid rgba(196,168,85,0.25)',
            paddingBottom: 6,
          }}>作者预设</h3>
          {!hasPreset ? (
            <div style={{
              padding: 20, textAlign: 'center',
              color: 'rgba(196,168,85,0.5)', fontFamily: 'var(--font-ui)', fontSize: 12,
            }}>本剧本未预设可选角色</div>
          ) : (
            <>
              {grouped.protagonists.length > 0 && (
                <div style={{ marginBottom: grouped.optionals.length > 0 ? 18 : 0 }}>
                  <SubLabel title="主角视角" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {grouped.protagonists.map((row) => renderRow(row, false))}
                  </div>
                </div>
              )}
              {grouped.optionals.length > 0 && (
                <div>
                  <SubLabel title="配角视角" subtitle="作者未为你专门调谐" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {grouped.optionals.map((row) => renderRow(row, false))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section>
          <h3 style={{
            margin: '0 0 12px',
            fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gold)',
            letterSpacing: 3, fontWeight: 500,
            borderBottom: '1px solid rgba(196,168,85,0.25)',
            paddingBottom: 6,
          }}>你创建的</h3>
          {grouped.userCreated.length === 0 ? (
            <div style={{
              padding: 20, textAlign: 'center',
              color: 'rgba(196,168,85,0.5)', fontFamily: 'var(--font-ui)', fontSize: 12,
            }}>暂无自创角色,点顶部「新建调查员」开始创建</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {grouped.userCreated.map((row) => renderRow(row, true))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
