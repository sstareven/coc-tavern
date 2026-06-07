import { useMemo, useState, useCallback } from 'react';
import type { ScenarioDoc, ScenarioRelation, RelationType } from '../../types/scenario';
import { inputStyle, labelStyle } from './styles';

export interface RelationEditorProps {
  scenarioDoc: ScenarioDoc;
  currentCharId: string;
  relations: ScenarioRelation[];
  presentAtStart: string[];
  lockedNpcsDisabled?: boolean;
  onChange: (relations: ScenarioRelation[], presentAtStart: string[]) => void;
}

const RELATION_OPTIONS: Array<{ value: '' | RelationType; label: string }> = [
  { value: '',             label: '陌生' },
  { value: 'family',       label: '亲属' },
  { value: 'lover',        label: '恋人' },
  { value: 'friend',       label: '朋友' },
  { value: 'colleague',    label: '同事' },
  { value: 'mentor',       label: '师徒' },
  { value: 'rival',        label: '竞争对手' },
  { value: 'enemy',        label: '敌人' },
  { value: 'acquaintance', label: '点头之交' },
];

const HOSTILE: ReadonlySet<RelationType> = new Set<RelationType>(['enemy', 'rival']);

function relationLabel(t: RelationType | undefined): string {
  if (!t) return '陌生';
  return RELATION_OPTIONS.find((o) => o.value === t)?.label ?? '陌生';
}

export function RelationEditor({
  scenarioDoc,
  currentCharId,
  relations,
  presentAtStart,
  lockedNpcsDisabled = true,
  onChange,
}: RelationEditorProps) {
  const others = useMemo(
    () => scenarioDoc.characters.filter((c) => c.id !== currentCharId),
    [scenarioDoc.characters, currentCharId],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const relationMap = useMemo(() => {
    const m = new Map<string, ScenarioRelation>();
    for (const r of relations) m.set(r.targetId, r);
    return m;
  }, [relations]);

  const presentSet = useMemo(() => new Set(presentAtStart), [presentAtStart]);

  const selectedChar = selectedId ? others.find((c) => c.id === selectedId) ?? null : null;
  const selectedRel = selectedId ? relationMap.get(selectedId) : undefined;
  const isLocked = selectedChar?.role === 'locked_npc';
  const isPresent = selectedId ? presentSet.has(selectedId) : false;
  const hostileConflict = !!(selectedRel && HOSTILE.has(selectedRel.type) && isPresent);

  const emit = useCallback(
    (nextRels: ScenarioRelation[], nextPresent: string[]) => {
      onChange(nextRels, nextPresent);
    },
    [onChange],
  );

  const updateRelation = (targetId: string, patch: Partial<ScenarioRelation> & { remove?: boolean }) => {
    const existing = relationMap.get(targetId);
    let nextRels: ScenarioRelation[];
    if (patch.remove) {
      nextRels = relations.filter((r) => r.targetId !== targetId);
    } else if (existing) {
      nextRels = relations.map((r) => (r.targetId === targetId ? { ...r, ...patch } as ScenarioRelation : r));
    } else {
      const seed: ScenarioRelation = { targetId, type: patch.type ?? 'acquaintance', note: patch.note };
      nextRels = [...relations, { ...seed, ...patch } as ScenarioRelation];
    }
    emit(nextRels, presentAtStart);
  };

  const handleTypeChange = (targetId: string, value: string) => {
    if (value === '') {
      updateRelation(targetId, { remove: true });
      return;
    }
    updateRelation(targetId, { type: value as RelationType });
  };

  const handleNoteChange = (targetId: string, value: string) => {
    const existing = relationMap.get(targetId);
    if (!existing) {
      const seed: ScenarioRelation = { targetId, type: 'acquaintance', note: value };
      emit([...relations, seed], presentAtStart);
      return;
    }
    updateRelation(targetId, { note: value });
  };

  const handlePresentToggle = (targetId: string, next: boolean) => {
    const nextPresent = next
      ? Array.from(new Set([...presentAtStart, targetId]))
      : presentAtStart.filter((id) => id !== targetId);
    emit(relations, nextPresent);
  };

  return (
    <div
      className="scenario-editor"
      style={{
        display: 'flex',
        gap: 14,
        minHeight: 320,
        height: '100%',
      }}
    >
      {/* 列表 30% */}
      <div
        style={{
          flex: '0 0 30%',
          minWidth: 180,
          maxHeight: 420,
          overflowY: 'auto',
          border: '1px solid rgba(196,168,85,0.18)',
          borderRadius: 4,
          background: 'rgba(13,10,7,0.4)',
        }}
      >
        {others.length === 0 && (
          <div style={{ padding: 14, color: 'var(--ink-subtle)', fontSize: 12 }}>
            剧本里没有其他角色
          </div>
        )}
        {others.map((c) => {
          const rel = relationMap.get(c.id);
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="sk-btn"
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: active ? 'rgba(196,168,85,0.18)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(196,168,85,0.1)',
                color: active ? 'var(--gold)' : 'var(--ink)',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)',
              }}
            >
              <div style={{ fontWeight: 600 }}>{c.sheet.identity.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-subtle)', marginTop: 2 }}>
                {c.sheet.identity.occupation} · {relationLabel(rel?.type)}
                {c.role === 'locked_npc' ? ' · 钉死' : ''}
              </div>
            </button>
          );
        })}
      </div>

      {/* 侧栏 70% */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 14,
          border: '1px solid rgba(196,168,85,0.18)',
          borderRadius: 4,
          background: 'rgba(13,10,7,0.4)',
        }}
      >
        {!selectedChar && (
          <div style={{ color: 'var(--ink-subtle)', fontSize: 12 }}>
            从左侧挑一个角色编辑关系
          </div>
        )}
        {selectedChar && (
          <>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 16 }}>
                {selectedChar.sheet.identity.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-subtle)', marginTop: 2 }}>
                {selectedChar.sheet.identity.occupation}
                {selectedChar.role === 'protagonist' ? ' · 推荐主角' : ''}
                {selectedChar.role === 'optional' ? ' · 配角' : ''}
                {selectedChar.role === 'locked_npc' ? ' · 剧本钉死' : ''}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle} htmlFor="rel-type-select">关系类型</label>
              <select
                id="rel-type-select"
                aria-label="关系类型"
                value={selectedRel?.type ?? ''}
                onChange={(e) => handleTypeChange(selectedChar.id, e.target.value)}
                style={inputStyle}
              >
                {RELATION_OPTIONS.map((o) => (
                  <option key={o.value || 'stranger'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle} htmlFor="rel-note-area">备注</label>
              <textarea
                id="rel-note-area"
                aria-label="备注"
                value={selectedRel?.note ?? ''}
                onChange={(e) => handleNoteChange(selectedChar.id, e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="rel-present-checkbox"
                aria-label="开场和他一起在场"
                type="checkbox"
                checked={isPresent}
                disabled={lockedNpcsDisabled && isLocked}
                onChange={(e) => handlePresentToggle(selectedChar.id, e.target.checked)}
              />
              <label
                htmlFor="rel-present-checkbox"
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 12,
                  color: lockedNpcsDisabled && isLocked ? 'var(--ink-subtle)' : 'var(--ink)',
                  cursor: lockedNpcsDisabled && isLocked ? 'not-allowed' : 'pointer',
                }}
              >
                开场和他一起在场
              </label>
              {hostileConflict && (
                <span style={{ color: 'var(--blood-bright, #e0625b)', fontSize: 11, marginLeft: 8 }}>
                  与敌对者不能开场同场
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
