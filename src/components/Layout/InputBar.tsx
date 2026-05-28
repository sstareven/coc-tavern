import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatPipeline } from '../../hooks/useChatPipeline';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { TokenCounter } from '../Shared/TokenCounter';
import { PromptViewer } from '../Settings/PromptViewer';
import { StreamingPreview } from '../Shared/StreamingPreview';

export function InputBar() {
  const [input, setInput] = useState('');
  const [wandOpen, setWandOpen] = useState(false);
  const apiModel = useSettingsStore((s) => s.apiModel);

  // ── Pipeline hook ──
  const pipeline = useChatPipeline(() => {});

  // ── Auto-submit listener ──
  useEffect(() => {
    const handler = () => { handleSubmitRef.current(); };
    document.addEventListener('auto-submit-input', handler);
    return () => document.removeEventListener('auto-submit-input', handler);
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
    const result = await pipeline.submit(trimmed);
    setInput(result);
  };
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  const handleRegenerate = async () => {
    await pipeline.regenerate();
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
        }}
      >
        <style>{`.inputbar-textarea::-webkit-scrollbar{width:5px}.inputbar-textarea::-webkit-scrollbar-track{background:rgba(0,0,0,0.15);border-radius:3px}.inputbar-textarea::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}.inputbar-textarea::-webkit-scrollbar-thumb:hover{background:var(--gold)}`}</style>
        {pipeline.error && (
          <div
            style={{
              padding: '6px 24px',
              fontSize: 12,
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
              style={{ cursor: 'pointer', opacity: 0.7, fontSize: 16 }}
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
            gap: 8,
            padding: '10px 24px',
          }}
        >
          {/* Magic wand button with popup menu */}
          <div className="wand-menu-container" style={{ position: 'relative' }}>
            <button
              onClick={() => setWandOpen(!wandOpen)}
              title="工具"
              style={wandBtnStyle}
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
                      fontSize: 11,
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
                        fontSize: 11,
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
                          fontSize: 10,
                        }}
                      >
                        {c.description}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (pipeline.error) pipeline.clearError();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 200) + 'px';
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
                fontSize: 14,
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
          <button
            onClick={handleSubmit}
            disabled={pipeline.loading}
            title="预览提示词后发送"
            style={{
              padding: '10px 28px',
              border: '1px solid var(--gold)',
              background: pipeline.loading
                ? 'rgba(196,168,85,0.05)'
                : 'rgba(196,168,85,0.1)',
              color: pipeline.loading ? 'rgba(196,168,85,0.4)' : 'var(--gold)',
              fontFamily: 'var(--font-ui)',
              fontSize: 14,
              letterSpacing: 4,
              borderRadius: 3,
              cursor: pipeline.loading ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
              transition: 'var(--transition-smooth)',
              opacity: pipeline.loading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!pipeline.loading)
                e.currentTarget.style.background = 'rgba(196,168,85,0.2)';
            }}
            onMouseLeave={(e) => {
              if (!pipeline.loading)
                e.currentTarget.style.background = 'rgba(196,168,85,0.1)';
            }}
          >
            {pipeline.loading ? '...' : '推 进'}
          </button>
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
            : { fontSize: 14 }),
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

const wandBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: '1px solid var(--brass)',
  background: 'rgba(0,0,0,0.2)',
  color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  borderRadius: 3,
  cursor: 'pointer',
  transition: 'var(--transition-smooth)',
  flexShrink: 0,
};
