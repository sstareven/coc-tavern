// 剧本选择全屏 — 见 docs/specs/2026-06-06-scenario-system-design.md §A1
// 主体: builtins ∪ userScenarios grid；点剧本卡 → onPick(id) 直跳 RosterPicker
import { useState } from 'react';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { pickAndImportScenario } from '../../scenario/scenario-io';
import type { ScenarioDoc } from '../../types/scenario';
import { ScenarioCard } from './ScenarioCard';

interface Props {
  onPick: (id: string) => void;
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
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
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

export function ScenarioScreen({ onPick, onClose, onOpenEditor }: Props) {
  const builtins = useScenarioStore(s => s.builtins);
  const userScenarios = useScenarioStore(s => s.userScenarios);
  const upsert = useScenarioStore(s => s.upsert);
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
    const existing = useScenarioStore.getState().getById(r.doc.id);
    if (existing) {
      const choice = window.confirm(`已存在同 id 剧本 "${existing.meta.name}",是否替换?\n(取消则放弃导入)`);
      if (!choice) return;
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
            color: 'var(--text-light, #d4c4a0)', opacity: 0.7,
            fontFamily: 'var(--font-ui)',
          }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>暂无剧本</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>点击右上「新剧本」或「导入」开始</div>
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
                onPlay={() => onPick(scn.id)}
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
    </div>
  );
}
