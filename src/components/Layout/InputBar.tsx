import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatPipeline } from '../../hooks/useChatPipeline';
import { useApiProfilesStore } from '../../stores/useApiProfilesStore';
import { useBookStore } from '../../stores/useBookStore';
import { useCombatStore } from '../../stores/useCombatStore';
import { useNpcStore } from '../../stores/useNpcStore';
import { useChatStore } from '../../stores/useChatStore';
import { saveConversation } from '../../stores/sessionLifecycle';
import { useMapStore } from '../../stores/useMapStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { usePanelStore } from '../../stores/usePanelStore';
import { useLocationElementStore } from '../../stores/useLocationElementStore';
import { resolveButtonMode } from '../../sillytavern/choice-match';
import { revealHiddenRolls } from '../../sillytavern/hidden-roll';
import { TokenCounter } from '../Shared/TokenCounter';
import { PromptViewer } from '../Settings/PromptViewer';
import { StreamingPreview } from '../Shared/StreamingPreview';
import { TurnProgressBar } from '../Shared/TurnProgressBar';
import { ActionSheet } from '../Book/ActionSheet';
import { useIsMobile } from '../../hooks/useIsMobile';

export function InputBar() {
  const [input, setInput] = useState('');
  const [wandOpen, setWandOpen] = useState(false);
  const apiModel = useApiProfilesStore((s) => s.selectedMainModel);
  const isMobile = useIsMobile();

  // 手机端任一全屏面板开启时(背包/角色/名册/地图),隐藏 ActionSheet 入口,避免与浮层叠加。
  const inventoryOpen = useInventoryStore((s) => s.isOpen);
  const charSheetOpen = useCharSheetStore((s) => s.isOpen);
  const npcOpen = useNpcStore((s) => s.isOpen);
  const mapOpen = useMapStore((s) => s.isOpen);
  const anyMobileOverlay = inventoryOpen || charSheetOpen || npcOpen || mapOpen;
  const showMobileActionSheet = isMobile && !anyMobileOverlay;

  const currentPage = useBookStore((s) => s.pages[s.pageIndex]);
  const currentChoices = currentPage
    ? [...currentPage.rightChoices, ...(currentPage.rewrite?.choices ?? [])]
    : [];
  const buttonMode = resolveButtonMode(input, currentChoices);

  // ── Pipeline hook ──
  const pipeline = useChatPipeline(() => {});

  // ── Textarea 自增长：高度由 input state 驱动，提交/回填/补全后自动回缩 ──
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // v1.11.8: 上限 200→120px,防 footer 撑过高把书本往上顶;
    // textarea 自身 overflow:auto 让超长文本内部滚动。
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  // ── Auto-submit listener ──
  useEffect(() => {
    const handler = () => { handleSubmitRef.current(); };
    document.addEventListener('auto-submit-input', handler);
    return () => document.removeEventListener('auto-submit-input', handler);
  }, []);

  // ── 脱战结算：真实战斗 status 转 'resolving' 后【不自动推进】，等玩家在战斗面板点「推进」(combat-advance 事件)
  // 再把战斗日志交主管线生成右页(承接战斗结果+后续选项)，好让玩家先回看战斗记录。
  // 测试战斗(/战斗测试)不推进正文，脱战直接清场。一次性触发(resolvingRef 守卫)。──
  const resolvingRef = useRef(false);
  const pipelineRef = useRef(pipeline);
  useEffect(() => { pipelineRef.current = pipeline; });
  useEffect(() => {
    const doAdvance = () => {
      const enc = useCombatStore.getState().encounter;
      if (!enc || enc.status !== 'resolving' || enc.test || resolvingRef.current) return;
      resolvingRef.current = true;
      const reason = enc.endReason ?? 'disengage';
      const outcomeText: Record<string, string> = {
        victory: '调查员获胜', defeat: '调查员落败/倒下', flee: '调查员逃离战斗',
        enemy_retreat: '敌人撤退', disengage: '脱离了近战', surrender: '一方投降',
      };
      const summary = enc.log.map((l) => l.text).join('\n');
      const openerLine = enc.opener ? `触发本场战斗的行动：${enc.opener}\n` : '';
      const input = `（即时战斗结束：${outcomeText[reason] ?? '战斗结束'}。以下是这场战斗的经过，请据此承接叙述战斗结果与现场状况，并给出后续行动选项。）\n${openerLine}${summary}`;
      void (async () => {
        try {
          await pipelineRef.current.submit(input);
        } finally {
          const pages = useBookStore.getState().pages;
          if (pages.length > 0) {
            useBookStore.getState().setPageCombatLog(pages.length - 1, { entries: enc.log, endReason: reason });
            useChatStore.getState().savePages(useBookStore.getState().pages);
          }
          useNpcStore.getState().applyCombatResult(enc.combatants); // 把名册NPC战斗员终值HP/状态回写档案
          useCombatStore.getState().clearCombat();
          const id = useChatStore.getState().activeId;
          if (id) void saveConversation(id);
        }
      })();
    };
    document.addEventListener('combat-advance', doAdvance);
    const unsub = useCombatStore.subscribe((s) => {
      // 仅重置一次性守卫；测试战斗的结束改由战斗面板「结束测试」按钮手动 clearCombat（不再自动清场，避免面板凭空消失）。
      if (!s.encounter) resolvingRef.current = false;
    });
    return () => { document.removeEventListener('combat-advance', doAdvance); unsub(); };
  }, []);

  // ── Click outside to close wand menu ──
  useEffect(() => {
    if (!wandOpen) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (!e.target.closest('.wand-menu-container')) setWandOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [wandOpen]);

  // ── Handlers ──

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || pipeline.loading) return;
    // 暗骰：把输入栏里的掩码 token 换回真实结果再提交给 LLM（玩家始终只看到掩码）
    const forLLM = revealHiddenRolls(trimmed);
    const result = await pipeline.submit(forLLM);
    setInput(result);
  };
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  const handleRegenerate = async () => {
    await pipeline.regenerate();
  };

  const handleRewrite = async () => {
    const trimmed = input.trim();
    if (!trimmed || pipeline.loading) return;
    await pipeline.rewriteAction(trimmed);
  };

  // ── Render ──

  return (
    <>
      <TokenCounter
        visible={pipeline.showTokenCounter}
        onClose={pipeline.closeTokenCounter}
        contextBreakdown={pipeline.tokenContext}
        model={apiModel}
      />
      <PromptViewer
        visible={pipeline.showPromptViewer}
        onClose={pipeline.closePromptViewer}
      />
      {pipeline.isStreaming && (
        <StreamingPreview visible={pipeline.isStreaming} text={pipeline.streamingText} />
      )}
      <footer
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          borderTop: '1px solid rgba(196,168,85,0.15)',
          background: 'rgba(13,10,7,0.85)',
          backdropFilter: 'blur(8px)',
          position: 'relative', // ActionSheet 抽屉以此为锚向上展开
          zIndex: 11,           // 高于 ActionSheet 遮罩(8)/抽屉(9),确保 InputBar 始终可触发
        }}
      >
        {/* 手机端: 选择行动入口 / 抽屉,放在 footer 顶部贴住 InputBar 输入行上方 */}
        {showMobileActionSheet && <ActionSheet />}
        <style>{`.inputbar-textarea::-webkit-scrollbar{width:5px}.inputbar-textarea::-webkit-scrollbar-track{background:rgba(0,0,0,0.15);border-radius:3px}.inputbar-textarea::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}.inputbar-textarea::-webkit-scrollbar-thumb:hover{background:var(--gold)}`}</style>
        <TurnProgressBar />
        {pipeline.error && (
          <div
            style={{
              padding: '6px 24px',
              fontSize: 'calc(12px * var(--system-ratio, 1))',
              color: '#e8815b',
              fontFamily: 'var(--font-ui)',
              letterSpacing: 1,
              background: 'rgba(180,60,30,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{pipeline.error}</span>
            <span
              onClick={pipeline.clearError}
              style={{ cursor: 'pointer', opacity: 0.7, fontSize: 'calc(16px * var(--system-ratio, 1))' }}
              title="关闭"
            >
              ×
            </span>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? 6 : 8,
            padding: isMobile ? '5px 10px' : '10px 24px',
          }}
        >
          {/* Magic wand button with popup menu */}
          <div className="wand-menu-container" style={{ position: 'relative' }}>
            <button
              onClick={() => setWandOpen(!wandOpen)}
              title="工具"
              style={wandBtnStyle(isMobile)}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--gold)';
                e.currentTarget.style.borderColor = 'var(--gold)';
              }}
              onMouseLeave={(e) => {
                if (!wandOpen) {
                  e.currentTarget.style.color = 'var(--ink-subtle)';
                  e.currentTarget.style.borderColor = 'var(--brass)';
                }
              }}
            >
              ✦
            </button>

            <AnimatePresence>
              {wandOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    left: 0,
                    minWidth: 160,
                    background:
                      'linear-gradient(180deg, rgba(42,31,20,0.98) 0%, rgba(26,20,16,0.98) 100%)',
                    border: '1px solid var(--gold)',
                    borderRadius: 6,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
                    overflow: 'hidden',
                    zIndex: 700,
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontFamily: 'var(--font-ui)',
                      fontSize: 'calc(11px * var(--system-ratio, 1))',
                    }}
                  >
                    <tbody>
                      <WandRow
                        icon="✦"
                        label="检定记录"
                        iconColor="var(--gold)"
                        onClick={() => {
                          pipeline.toggleDiceHistory();
                          setWandOpen(false);
                        }}
                      />
                      <WandRow
                        icon="T"
                        label="Token 计数"
                        iconColor="var(--gold)"
                        iconMono
                        divider
                        onClick={() => {
                          pipeline.openTokenCounter(input);
                          setWandOpen(false);
                        }}
                      />
                      <WandRow
                        icon="◷"
                        label="缓存命中"
                        iconColor="#69f0ae"
                        divider
                        onClick={() => {
                          usePanelStore.getState().open('cacheStats');
                          setWandOpen(false);
                        }}
                      />
                      <WandRow
                        icon="⬡"
                        label="变量引擎"
                        iconColor="#7b9fc1"
                        divider
                        onClick={() => {
                          pipeline.openVariablePanel();
                          setWandOpen(false);
                        }}
                      />
                      <WandRow
                        icon="◈"
                        label="提示词查看器"
                        iconColor="var(--gold)"
                        divider
                        onClick={() => {
                          pipeline.openPromptViewer(input);
                          setWandOpen(false);
                        }}
                      />
                      <WandRow
                        icon="↻"
                        label="重新生成"
                        iconColor="var(--gold)"
                        divider
                        onClick={() => {
                          handleRegenerate();
                          setWandOpen(false);
                        }}
                      />
                      <WandRow
                        icon="&#9881;"
                        label="调试日志"
                        iconColor="var(--ink-subtle)"
                        iconMono
                        divider
                        onClick={() => {
                          pipeline.toggleDebugLog();
                          setWandOpen(false);
                        }}
                      />
                      <WandRow
                        icon="⤓"
                        label="导出地图数据"
                        iconColor="#7b9fc1"
                        divider
                        onClick={() => {
                          exportMapData();
                          setWandOpen(false);
                        }}
                      />
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
            {/* Slash command autocomplete */}
            {input.startsWith('/') && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 800,
                  background:
                    'linear-gradient(180deg, rgba(20,16,12,0.96) 0%, rgba(13,10,7,0.98) 100%)',
                  border: '1px solid var(--gold)',
                  borderRadius: 4,
                  marginBottom: 4,
                  maxHeight: 180,
                  overflowY: 'auto',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)',
                }}
              >
                {pipeline.allCommands
                  .filter(
                    (c) =>
                      c.name.startsWith(input.slice(1).split(/[\s=]/)[0].toLowerCase()) ||
                      input === '/',
                  )
                  .map((c) => (
                    <div
                      key={c.name}
                      onClick={() => {
                        setInput('/' + c.name + ' ');
                      }}
                      style={{
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'calc(11px * var(--system-ratio, 1))',
                        color: 'var(--text-light)',
                        borderBottom: '1px solid rgba(196,168,85,0.06)',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'rgba(196,168,85,0.08)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = 'transparent')
                      }
                    >
                      <span style={{ color: 'var(--gold)', fontWeight: 'bold' }}>
                        /{c.name}
                      </span>
                      <span
                        style={{
                          color: 'var(--ink-subtle)',
                          marginLeft: 8,
                          fontSize: 'calc(10px * var(--system-ratio, 1))',
                        }}
                      >
                        {c.description}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            <textarea
              name="coc-input"
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (pipeline.error) pipeline.clearError();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  // Enter 跟随右侧按钮模式：自定义行动(rewrite)走补写，其余(命中选项/命令)走推进
                  if (buttonMode === 'rewrite') handleRewrite();
                  else handleSubmit();
                }
              }}
              placeholder="输入行动或对话..."
              disabled={pipeline.loading}
              rows={1}
              style={{
                flex: 1,
                padding: '10px 16px',
                border: '1px solid var(--brass)',
                borderRadius: 3,
                background: 'rgba(0,0,0,0.3)',
                color: 'var(--text-light)',
                fontFamily: 'var(--font-ui)',
                fontSize: 'calc(14px * var(--system-ratio, 1))',
                letterSpacing: 1,
                outline: 'none',
                caretColor: 'var(--gold)',
                opacity: pipeline.loading ? 0.5 : 1,
                resize: 'none',
                overflowY: 'auto',
                maxHeight: 200,
                minHeight: 42,
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)',
              }}
              className="inputbar-textarea"
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--gold)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--brass)';
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid var(--gold)',
              borderRadius: 3,
              overflow: 'hidden',
              opacity: pipeline.loading ? 0.7 : 1,
            }}
          >
            <button
              onClick={handleSubmit}
              disabled={pipeline.loading || buttonMode !== 'advance'}
              title="推进剧情"
              data-sfx="primary"
              style={dualBtnStyle(buttonMode === 'advance', pipeline.loading, isMobile)}
              onMouseEnter={(e) => {
                if (buttonMode === 'advance' && !pipeline.loading) {
                  e.currentTarget.style.background = 'rgba(196,168,85,0.28)';
                  e.currentTarget.style.color = 'var(--gold)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  buttonMode === 'advance' ? 'rgba(196,168,85,0.18)' : 'transparent';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseDown={(e) => {
                if (buttonMode === 'advance' && !pipeline.loading)
                  e.currentTarget.style.transform = 'scale(0.98)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {pipeline.loading && buttonMode === 'advance' ? '...' : '推 进'}
            </button>
            <div style={{ height: 1, background: 'rgba(196,168,85,0.25)' }} />
            <button
              onClick={handleRewrite}
              disabled={pipeline.loading || buttonMode !== 'rewrite'}
              title="补写当前自定义行动，生成新候选选项"
              style={dualBtnStyle(buttonMode === 'rewrite', pipeline.loading, isMobile)}
              onMouseEnter={(e) => {
                if (buttonMode === 'rewrite' && !pipeline.loading) {
                  e.currentTarget.style.background = 'rgba(196,168,85,0.28)';
                  e.currentTarget.style.color = 'var(--gold)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  buttonMode === 'rewrite' ? 'rgba(196,168,85,0.18)' : 'transparent';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseDown={(e) => {
                if (buttonMode === 'rewrite' && !pipeline.loading)
                  e.currentTarget.style.transform = 'scale(0.98)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {pipeline.loading && buttonMode === 'rewrite' ? '...' : '行动补写'}
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}

// ── Sub-components ──

interface WandRowProps {
  icon: string;
  label: string;
  iconColor: string;
  iconMono?: boolean;
  divider?: boolean;
  onClick: () => void;
}

function WandRow({ icon, label, iconColor, iconMono, divider, onClick }: WandRowProps) {
  const isGear = icon.charCodeAt(0) === 38; // HTML entity &#9881;
  return (
    <tr
      onClick={onClick}
      style={{
        cursor: 'pointer',
        transition: 'background 0.15s',
        ...(divider
          ? { borderTop: '1px solid rgba(196,168,85,0.1)' }
          : {}),
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(196,168,85,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <td
        style={{
          padding: '10px 14px',
          width: 28,
          textAlign: 'center',
          color: iconColor,
          ...(iconMono
            ? {
                fontFamily: 'var(--font-mono)',
                fontWeight: 'bold' as const,
                fontSize: isGear ? 10 : 11,
              }
            : { fontSize: 'calc(14px * var(--system-ratio, 1))' }),
        }}
      >
        {icon}
      </td>
      <td
        style={{
          padding: '10px 14px 10px 0',
          color: 'var(--text-light)',
          letterSpacing: 1,
        }}
      >
        {label}
      </td>
    </tr>
  );
}

function dualBtnStyle(active: boolean, loading: boolean, mobile = false): React.CSSProperties {
  return {
    padding: mobile ? '6px 10px' : '7px 24px',
    border: 'none',
    background: active ? 'rgba(196,168,85,0.18)' : 'transparent',
    color: active ? 'var(--gold)' : 'rgba(196,168,85,0.35)',
    fontFamily: 'var(--font-ui)',
    fontSize: `calc(${mobile ? 12 : 13}px * var(--system-ratio, 1))`,
    letterSpacing: mobile ? 1 : 3,
    minWidth: mobile ? 56 : undefined,
    cursor: active && !loading ? 'pointer' : 'default',
    pointerEvents: active && !loading ? 'auto' : 'none',
    whiteSpace: 'nowrap',
    transition: 'var(--transition-smooth)',
  };
}

function wandBtnStyle(mobile = false): React.CSSProperties {
  return {
    width: mobile ? 30 : 32,
    height: mobile ? 30 : 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: '1px solid var(--brass)',
    background: 'rgba(0,0,0,0.2)',
    color: 'var(--ink-subtle)',
    fontFamily: 'var(--font-ui)',
    fontSize: 'calc(14px * var(--system-ratio, 1))',
    borderRadius: 3,
    cursor: 'pointer',
    transition: 'var(--transition-smooth)',
    flexShrink: 0,
  };
}

/**
 * 导出当前会话的地图数据为 JSON 并触发下载（排查用调试工具）。
 * 含 locations/edges/locationElements 原始快照，外加 diagnostics：
 * - isolatedLocations：无任何 edge 引用的孤立节点（对应「孤立无连线地点」异常）
 * - emptyDescriptionLocations：description 为空的节点（对应「校门(无描述)」异常）
 * - danglingEdges：端点指向不存在 location 的悬空边
 * - currentLocationDangling：currentLocationId 指向不存在 location
 * 下载五步法对齐 DebugLog.exportLogs / VariablePanel.handleExport。
 */
function exportMapData() {
  const { locations, edges, currentLocationId } = useMapStore.getState();
  const elements = useLocationElementStore.getState().elements;

  const ids = new Set(locations.map((l) => l.id));
  const referenced = new Set<string>();
  for (const e of edges) {
    referenced.add(e.fromId);
    referenced.add(e.toId);
  }

  const isolatedLocations = locations
    .filter((l) => !referenced.has(l.id))
    .map((l) => ({ id: l.id, name: l.name }));
  const emptyDescriptionLocations = locations
    .filter((l) => !l.description || !l.description.trim())
    .map((l) => ({ id: l.id, name: l.name }));
  const danglingEdges = edges
    .filter((e) => !ids.has(e.fromId) || !ids.has(e.toId))
    .map((e) => ({
      id: e.id,
      fromId: e.fromId,
      toId: e.toId,
      type: e.type,
      missingEnd: !ids.has(e.fromId) && !ids.has(e.toId) ? 'both' : !ids.has(e.fromId) ? 'from' : 'to',
    }));
  const currentLocationDangling =
    currentLocationId !== null && !ids.has(currentLocationId)
      ? { currentLocationId, exists: false }
      : null;

  const payload = {
    exportedAt: Date.now(),
    currentLocationId,
    locations,
    edges,
    locationElements: elements,
    diagnostics: {
      summary: {
        locationCount: locations.length,
        edgeCount: edges.length,
        elementCount: elements.length,
        isolatedCount: isolatedLocations.length,
        emptyDescCount: emptyDescriptionLocations.length,
        danglingCount: danglingEdges.length,
        currentValid: currentLocationDangling === null,
      },
      isolatedLocations,
      emptyDescriptionLocations,
      danglingEdges,
      currentLocationDangling,
    },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `coc-map-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
