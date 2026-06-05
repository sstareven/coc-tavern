// 剧本选择全屏 — 见 docs/specs/2026-06-06-scenario-system-design.md §A1
// 主体: builtins ∪ userScenarios grid;onPick 把选中剧本+角色选择回报给宿主路由
import { useState } from 'react';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { pickAndImportScenario } from '../../scenario/scenario-io';
import { defaultSheet } from '../../stores/useCharSheetStore';
import type { ScenarioDoc, ScenarioCharacter } from '../../types/scenario';
import { ScenarioCard } from './ScenarioCard';

export type ScenarioPickChoice =
  | { mode: 'newChar' }
  | { mode: 'preset'; charIdx: number };

interface Props {
  onPick: (id: string, choice: ScenarioPickChoice) => void;
  onClose: () => void;
  onOpenEditor: (id: string) => void;
}

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'scn_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// 空白剧本骨架 — 新增按钮初始化用;通过 isValidScenarioDoc 守卫
function makeBlankScenario(): ScenarioDoc {
  const now = Date.now();
  return {
    id: uuid(),
    builtin: false,
    meta: {
      name: '新剧本',
      type: '调查',
      durationHint: '3-5h',
      difficulty: 2,
      headcountHint: '1-4人',
      sanLossHint: '中',
      blurb: '',
    },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

// ── 工具栏小图标(铜版线描风;与 TabIcons.tsx 同语言) ──
function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconImport({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l2-2h5l2 2h8v12H3V7z" />
      <path d="M12 11v6M9 14l3 3 3-3" />
    </svg>
  );
}
function IconClose({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function IconUser({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0113 0" />
    </svg>
  );
}

// 工具栏按钮(hover/active 含放大+按压)
function ToolbarButton({
  icon, label, onClick, danger,
}: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = pressed ? 0.95 : hover ? 1.05 : 1;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        fontSize: 12,
        fontFamily: 'var(--font-ui)',
        letterSpacing: 1.2,
        color: hover
          ? (danger ? '#e8b8b8' : 'var(--gold)')
          : (danger ? '#c89999' : 'var(--text-light, #d0c2a0)'),
        background: hover
          ? (danger ? 'rgba(180,60,60,0.14)' : 'rgba(196,168,85,0.12)')
          : 'transparent',
        border: `1px solid ${danger ? 'rgba(180,60,60,0.35)' : 'rgba(196,168,85,0.30)'}`,
        borderRadius: 2,
        cursor: 'pointer',
        transform: `scale(${scale})`,
        transition: `background 200ms ${EASE}, transform 180ms ${EASE}, color 200ms ${EASE}`,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ── 角色选择抽屉(modal in modal) ──
function CharacterPickerDrawer({
  scn, onPick, onCancel,
}: { scn: ScenarioDoc; onPick: (c: ScenarioPickChoice) => void; onCancel: () => void }) {
  const candidates: Array<{ ch: ScenarioCharacter; idx: number }> =
    scn.characters
      .map((ch, idx) => ({ ch, idx }))
      .filter(({ ch }) => ch.role === 'protagonist_candidate');

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(8,5,2,0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, #1e1610, #110c07)',
          border: '1px solid var(--brass)',
          borderRadius: 4,
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        <header style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(196,168,85,0.25)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h3 style={{
            margin: 0, fontSize: 15, color: 'var(--gold)',
            fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 600,
          }}>选择调查员 — {scn.meta.name}</h3>
          <ToolbarButton icon={<IconClose size={14} />} label="取消" onClick={onCancel} />
        </header>

        <div style={{
          flex: 1, overflowY: 'auto', padding: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* 新建角色 选项 */}
          <button
            onClick={() => onPick({ mode: 'newChar' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px',
              background: 'rgba(196,168,85,0.08)',
              border: '1px dashed var(--brass)', borderRadius: 3,
              color: 'var(--gold)', fontFamily: 'var(--font-ui)',
              fontSize: 13, letterSpacing: 1, cursor: 'pointer',
              transition: `background 200ms ${EASE}, transform 180ms ${EASE}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.18)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; e.currentTarget.style.transform = 'translateX(0)'; }}
          >
            <IconPlus size={18} />
            <div style={{ textAlign: 'left' }}>
              <div>新建角色</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>进入角色卡向导</div>
            </div>
          </button>

          {/* protagonist_candidate 列表 */}
          {candidates.map(({ ch, idx }) => {
            const name = ch.sheet?.name || defaultSheet.name || '未命名调查员';
            const occ = (ch.sheet as { occupation?: string }).occupation ?? '';
            const bio = ch.npcAttrs.publicBio;
            return (
              <button
                key={ch.id}
                onClick={() => onPick({ mode: 'preset', charIdx: idx })}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(196,168,85,0.25)', borderRadius: 3,
                  color: 'var(--text-light, #d0c2a0)',
                  fontFamily: 'var(--font-ui)', textAlign: 'left',
                  cursor: 'pointer',
                  transition: `background 200ms ${EASE}, transform 180ms ${EASE}, border-color 200ms ${EASE}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(196,168,85,0.10)';
                  e.currentTarget.style.borderColor = 'var(--brass)';
                  e.currentTarget.style.transform = 'translateX(2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  e.currentTarget.style.borderColor = 'rgba(196,168,85,0.25)';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <IconUser size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: 'var(--gold)', marginBottom: 2 }}>
                    {name}{occ ? ` · ${occ}` : ''}
                  </div>
                  {bio && (
                    <div style={{
                      fontSize: 11.5, lineHeight: 1.5, opacity: 0.75,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>{bio}</div>
                  )}
                </div>
              </button>
            );
          })}

          {candidates.length === 0 && (
            <div style={{
              padding: '24px 16px', textAlign: 'center',
              color: 'var(--ink, #8a7a52)', fontSize: 12, fontFamily: 'var(--font-ui)',
            }}>本剧本未配置可选角色 — 请「新建角色」</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ScenarioScreen({ onPick, onClose, onOpenEditor }: Props) {
  const builtins = useScenarioStore(s => s.builtins);
  const userScenarios = useScenarioStore(s => s.userScenarios);
  const upsert = useScenarioStore(s => s.upsert);
  const [pickerFor, setPickerFor] = useState<ScenarioDoc | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string): void => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  const handleNew = (): void => {
    const blank = makeBlankScenario();
    const newId = upsert(blank);
    onOpenEditor(newId);
  };

  const handleImport = async (): Promise<void> => {
    const r = await pickAndImportScenario();
    if (!r.ok) {
      showToast(`导入失败：${r.error}`);
      return;
    }
    const newId = upsert(r.doc);
    showToast(`已导入 — ${r.doc.meta.name}`);
    onOpenEditor(newId);
  };

  // 合并并排序：内置在前(按 builtin 数组顺序), 用户在后(按 updatedAt 倒序)
  const userSorted = [...userScenarios].sort((a, b) => b.updatedAt - a.updatedAt);
  const all = [...builtins, ...userSorted];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="选择剧本"
      style={{
        position: 'fixed', inset: 0, zIndex: 150,
        background: 'radial-gradient(ellipse at center, var(--abyss, #18120a) 0%, var(--void, #060403) 70%)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 工具栏 */}
      <header style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 22px',
        borderBottom: '1px solid rgba(196,168,85,0.20)',
        background: 'rgba(10,7,4,0.6)',
        backdropFilter: 'blur(4px)',
      }}>
        <h2 style={{
          margin: 0, fontSize: 16,
          fontFamily: 'var(--font-ui)', letterSpacing: 4, fontWeight: 500,
          color: 'var(--gold)',
        }}>剧本档案</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <ToolbarButton icon={<IconPlus />} label="新剧本" onClick={handleNew} />
          <ToolbarButton icon={<IconImport />} label="导入" onClick={() => { void handleImport(); }} />
          <ToolbarButton icon={<IconClose />} label="关闭" onClick={onClose} danger />
        </div>
      </header>

      {/* 主体 grid */}
      <main style={{
        flex: 1, overflowY: 'auto', padding: '28px 22px',
      }}>
        {all.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '64px 20px',
            color: 'var(--ink, #8a7a52)', fontFamily: 'var(--font-ui)',
          }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>暂无剧本</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>点击右上「新剧本」或「导入」开始</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 18,
            justifyContent: 'center',
            maxWidth: 1400,
            margin: '0 auto',
          }}>
            {all.map(scn => (
              <ScenarioCard
                key={scn.id}
                scn={scn}
                onPlay={() => setPickerFor(scn)}
                onEdit={() => onOpenEditor(scn.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* toast */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 16px', fontSize: 12, fontFamily: 'var(--font-ui)', letterSpacing: 1,
          color: 'var(--gold)', background: 'rgba(20,14,8,0.95)',
          border: '1px solid var(--brass)', borderRadius: 2,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }}>{toast}</div>
      )}

      {/* 角色选择抽屉 */}
      {pickerFor && (
        <CharacterPickerDrawer
          scn={pickerFor}
          onPick={(choice) => { const id = pickerFor.id; setPickerFor(null); onPick(id, choice); }}
          onCancel={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
