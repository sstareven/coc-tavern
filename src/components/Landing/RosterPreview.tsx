// 选角预览 — 玩家在 RosterPicker 点「选这个角色 →」后弹的全屏 dialog。
// 顶部剧本脉络条 + 角色卡片式预览 + 折叠区（信念/重要之人/...）/ 关系网 / 底部「← 返回选角」「✓ 确认入局」。
// ESC 等同「返回选角」。HARD CONTRACT: 绝不渲染 char.npcAttrs.hiddenBio（守秘人字段）。

import { useEffect, useState } from 'react';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { buildCharacterPreviewVM } from '../../scenario/character-preview-engine';
import { splitInitialItems } from '../../scenario/items-splitter';
import { ExpandableSection } from '../common/ExpandableSection';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scenarioId: string;
  charIdx: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function IconBack({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function IconCheck({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l5 5 11-11" />
    </svg>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      fontSize: 10, fontFamily: 'var(--font-ui)', letterSpacing: 1.2,
      color: 'var(--gold)',
      border: '1px solid rgba(196,168,85,0.35)',
      borderRadius: 10,
      background: 'rgba(196,168,85,0.06)',
    }}>{children}</span>
  );
}

function FootBtn({
  children, onClick, accent, disabled,
}: { children: React.ReactNode; onClick: () => void; accent?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 22px',
        fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 2,
        color: accent ? 'var(--gold)' : 'var(--text-light, #d0c2a0)',
        background: accent ? 'rgba(196,168,85,0.14)' : 'transparent',
        border: `1px solid ${accent ? 'var(--brass)' : 'rgba(196,168,85,0.45)'}`,
        borderRadius: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: `transform 180ms ${EASE}, background 180ms ${EASE}, box-shadow 180ms ${EASE}`,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = accent ? 'rgba(196,168,85,0.24)' : 'rgba(196,168,85,0.10)';
        e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)';
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.45)';
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = accent ? 'rgba(196,168,85,0.14)' : 'transparent';
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.boxShadow = 'none';
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'translateY(0) scale(0.97)'; }}
      onMouseUp={(e) => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)'; }}
    >
      {children}
    </button>
  );
}

export function RosterPreview({ scenarioId, charIdx, onConfirm, onCancel }: Props) {
  const getById = useScenarioStore((s) => s.getById);
  const scn = getById(scenarioId);
  const char = scn?.characters[charIdx];

  // 折叠状态 — 默认全收起
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const toggle = (k: string) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // ESC = 返回选角
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (!scn || !char) {
    return (
      <div role="alert" style={{
        position: 'fixed', inset: 0, zIndex: 145,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(8,5,2,0.92)',
        color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2,
      }}>
        角色不存在 —
        <button onClick={onCancel} style={{
          marginLeft: 10, background: 'none', border: '1px solid var(--brass)',
          padding: '6px 14px', color: 'var(--gold)', cursor: 'pointer', borderRadius: 2,
        }}>返回</button>
      </div>
    );
  }

  const vm = buildCharacterPreviewVM(char, scn);
  const items = splitInitialItems(vm.itemsRaw);

  return (
    <div
      className="scenario-editor"
      role="dialog" aria-label="角色预览"
      style={{
        position: 'fixed', inset: 0, zIndex: 145,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '24px 16px',
        background: 'radial-gradient(ellipse at center, rgba(24,18,10,0.96) 0%, rgba(6,4,3,0.98) 70%)',
        backdropFilter: 'blur(4px)',
        overflowY: 'auto',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 720,
        display: 'flex', flexDirection: 'column', gap: 16,
        flexShrink: 0,
      }}>
        {/* 顶部脉络条：剧本元信息 */}
        <header style={{
          padding: '14px 18px',
          background: 'rgba(20,14,8,0.65)',
          border: '1px solid rgba(196,168,85,0.22)',
          borderRadius: 4,
        }}>
          <div style={{
            fontFamily: 'var(--font-display)', color: 'var(--gold)',
            fontSize: 18, letterSpacing: 4, marginBottom: 4,
          }}>{scn.meta.name}</div>
          <div style={{
            fontFamily: 'var(--font-ui)', color: 'rgba(196,168,85,0.65)',
            fontSize: 11, letterSpacing: 1, marginBottom: 8,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', lineHeight: 1.5,
          }}>{scn.meta.blurb}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Chip>{scn.meta.type}</Chip>
            <Chip>{scn.meta.durationHint}</Chip>
            <Chip>SAN {scn.meta.sanLossHint}</Chip>
            <Chip>{scn.meta.headcountHint}</Chip>
          </div>
        </header>

        {/* 主体卡片 */}
        <article style={{
          padding: '20px 24px',
          background: 'linear-gradient(180deg, rgba(30,22,16,0.85) 0%, rgba(17,12,7,0.85) 100%)',
          border: '1px solid var(--brass)',
          borderRadius: 4,
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        }}>
          {/* 身份头 */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
            marginBottom: 16,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-display)', color: 'var(--gold)',
                fontSize: 22, letterSpacing: 3, marginBottom: 4,
              }}>{vm.name}</div>
              <div style={{
                fontFamily: 'var(--font-ui)', color: 'var(--text-light, #d0c2a0)',
                fontSize: 12, letterSpacing: 1.2, marginBottom: 6,
              }}>{vm.occupation}</div>
              <div style={{
                fontFamily: 'var(--font-mono)', color: 'rgba(196,168,85,0.6)',
                fontSize: 10, letterSpacing: 1,
              }}>{vm.ageGenderResidence}</div>
            </div>
            <Chip>{vm.roleHint}</Chip>
          </div>

          {/* 八围网格 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)',
              letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8,
            }}>基础属性</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {vm.chars.map((c) => (
                <div key={c.key} style={{
                  padding: '6px 4px', textAlign: 'center',
                  border: '1px solid rgba(196,168,85,0.15)',
                  background: 'rgba(196,168,85,0.05)',
                  borderRadius: 3,
                }}>
                  <div style={{
                    fontSize: 9, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)',
                    letterSpacing: 1, marginBottom: 2,
                  }}>{c.label}</div>
                  <div style={{
                    fontSize: 18, fontFamily: 'var(--font-mono)', color: 'var(--gold)',
                    fontWeight: 700,
                  }}>{c.value}</div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 8, display: 'flex', gap: 14,
              fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-light, #d0c2a0)',
              letterSpacing: 1.5,
            }}>
              <span>HP <span style={{ color: 'var(--gold)' }}>{vm.vitals.hpMax}</span></span>
              <span>SAN <span style={{ color: 'var(--gold)' }}>{vm.vitals.sanMax}</span></span>
              <span>MP <span style={{ color: 'var(--gold)' }}>{vm.vitals.mpMax}</span></span>
            </div>
          </div>

          {/* Top 技能 */}
          {vm.topSkills.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)',
                letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6,
              }}>擅长</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: 'var(--text-light, #d0c2a0)', lineHeight: 1.8,
              }}>
                {vm.topSkills.map((s, i) => (
                  <span key={s.name}>
                    {s.name} <span style={{ color: 'var(--gold)' }}>{s.value}</span>
                    {i < vm.topSkills.length - 1 && <span style={{ color: 'rgba(196,168,85,0.35)' }}> · </span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* publicBio / description / traits */}
          {vm.publicBio && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)',
                letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4,
              }}>关于他/她</div>
              <p style={{
                margin: 0, fontFamily: 'var(--font-body)',
                color: 'var(--text-light, #d0c2a0)', fontSize: 13, lineHeight: 1.7,
              }}>{vm.publicBio}</p>
            </div>
          )}
          {vm.description && (
            <p style={{
              margin: '0 0 10px', fontFamily: 'var(--font-body)',
              color: 'rgba(208,194,160,0.85)', fontSize: 12, lineHeight: 1.7,
              fontStyle: 'italic',
            }}>{vm.description}</p>
          )}
          {vm.traits && (
            <p style={{
              margin: '0 0 14px', fontFamily: 'var(--font-body)',
              color: 'rgba(208,194,160,0.8)', fontSize: 12, lineHeight: 1.7,
            }}>{vm.traits}</p>
          )}

          {/* 随身物品 */}
          {items.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)',
                letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6,
              }}>随身</div>
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 12,
                color: 'var(--text-light, #d0c2a0)', lineHeight: 1.7,
              }}>{items.join(' · ')}</div>
            </div>
          )}

          {/* 折叠区 — 默认全收起 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
            {vm.beliefs && (
              <ExpandableSection title="信念" expanded={openSet.has('beliefs')} onToggle={() => toggle('beliefs')}>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--text-light, #d0c2a0)' }}>{vm.beliefs}</p>
              </ExpandableSection>
            )}
            {vm.significantPeople && (
              <ExpandableSection title="重要之人" expanded={openSet.has('significantPeople')} onToggle={() => toggle('significantPeople')}>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--text-light, #d0c2a0)' }}>{vm.significantPeople}</p>
              </ExpandableSection>
            )}
            {vm.meaningfulLocations && (
              <ExpandableSection title="重要场所" expanded={openSet.has('meaningfulLocations')} onToggle={() => toggle('meaningfulLocations')}>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--text-light, #d0c2a0)' }}>{vm.meaningfulLocations}</p>
              </ExpandableSection>
            )}
            {vm.treasuredPossessions && (
              <ExpandableSection title="珍贵之物" expanded={openSet.has('treasuredPossessions')} onToggle={() => toggle('treasuredPossessions')}>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--text-light, #d0c2a0)' }}>{vm.treasuredPossessions}</p>
              </ExpandableSection>
            )}
            {vm.injuries && (
              <ExpandableSection title="伤痛" expanded={openSet.has('injuries')} onToggle={() => toggle('injuries')}>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--text-light, #d0c2a0)' }}>{vm.injuries}</p>
              </ExpandableSection>
            )}
            {vm.backgroundFears && (
              <ExpandableSection title="恐惧" expanded={openSet.has('backgroundFears')} onToggle={() => toggle('backgroundFears')}>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--text-light, #d0c2a0)' }}>{vm.backgroundFears}</p>
              </ExpandableSection>
            )}
            {vm.relations.length > 0 && (
              <ExpandableSection title="关系网" hint={`${vm.relations.length} 条`} expanded={openSet.has('relations')} onToggle={() => toggle('relations')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {vm.relations.map((r, i) => (
                    <div key={r.targetId + i} style={{
                      padding: '6px 10px',
                      border: '1px solid rgba(196,168,85,0.15)',
                      borderRadius: 3,
                      background: 'rgba(0,0,0,0.18)',
                    }}>
                      <div style={{
                        fontFamily: 'var(--font-ui)', fontSize: 12,
                        color: 'var(--text-light, #d0c2a0)', letterSpacing: 0.8,
                      }}>
                        <span style={{ color: 'var(--gold)' }}>{r.typeLabel}</span> —{' '}
                        {r.targetName}
                        {r.targetOccupation && (
                          <span style={{ color: 'rgba(196,168,85,0.55)', fontSize: 11 }}>（{r.targetOccupation}）</span>
                        )}
                      </div>
                      {r.note && (
                        <div style={{
                          marginTop: 4, paddingLeft: 8, borderLeft: '2px solid rgba(196,168,85,0.25)',
                          fontFamily: 'var(--font-body)', fontSize: 11,
                          color: 'rgba(208,194,160,0.78)', lineHeight: 1.6,
                          fontStyle: 'italic',
                        }}>「{r.note}」</div>
                      )}
                    </div>
                  ))}
                </div>
              </ExpandableSection>
            )}
          </div>
        </article>

        {/* 底部操作条 */}
        <footer style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          padding: '14px 0 24px',
        }}>
          <FootBtn onClick={onCancel}>
            <IconBack /> 返回选角
          </FootBtn>
          <FootBtn accent onClick={onConfirm}>
            <IconCheck /> 确认入局，开始序章
          </FootBtn>
        </footer>
      </div>
    </div>
  );
}
