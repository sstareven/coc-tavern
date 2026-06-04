// src/components/Book/OptionResolutionOverlay.tsx
//
// A1.8 — RightPage 选项检定 staging 浮层（薄 UI 壳）。
//
// 流程：DiceAnimation 滚完 → GameView 检查 useOptionStagingStore.pending →
//       有则浮出本组件，三按钮：推骰 / 花费幸运 / 直接落账。
//
// 所有判定逻辑在 src/sillytavern/option-staging.ts（纯函数，独立测试）。
// 复用 dice-panel-state 的 previewLuckResult / commitButtonLabel / maxLuckSpend —— 与 DicePanel 子状态机同款。

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOptionStagingStore } from '../../stores/useOptionStagingStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useDiceStore, canStartPush } from '../../stores/useDiceStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useVariableStore } from '../../stores/useVariableStore';
import {
  applyLuckSpend,
  applyPushReroll,
  rebuildInputText,
  buildPushedRecord,
  buildLuckSpentRecord,
} from '../../sillytavern/option-staging';
import {
  previewLuckResult,
  commitButtonLabel,
  maxLuckSpend,
} from '../Dice/dice-panel-state';
import { IconLuck, IconPush } from '../Layout/TabIcons';

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];

/** 把 trigger.inputText 推回 textarea + 触发 auto-submit。与 GameView.onDiceComplete 同款。 */
function commitToTextarea(inputText: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>('footer textarea');
  if (!textarea) return;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value',
  )?.set;
  setter?.call(textarea, inputText);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
  if (useSettingsStore.getState().autoSubmitChoice) {
    setTimeout(() => document.dispatchEvent(new Event('auto-submit-input')), 100);
  }
}

export function OptionResolutionOverlay() {
  const pending = useOptionStagingStore((s) => s.pending);
  const resolveStore = useOptionStagingStore((s) => s.resolve);
  const luck = useCharSheetStore((s) => s.sheet.secondary.luck);

  const [luckSpend, setLuckSpend] = useState(0);
  const [mode, setMode] = useState<'choose' | 'luck-slider'>('choose');

  // 重置子态：浮层关闭/换 trigger 时回到「choose」
  const visible = !!pending;
  useEffect(() => {
    if (!visible) {
      setMode('choose');
      setLuckSpend(0);
    }
  }, [visible]);

  const handleDirectCommit = useCallback(() => {
    if (!pending) return;
    // 直接落账：用 trigger 自带的 record + inputText（fillInputBar 里原本要做的事）
    useDiceStore.getState().stashRecord(pending.record);
    commitToTextarea(pending.inputText);
    resolveStore({
      inputText: pending.inputText,
      record: pending.record,
      luckSpent: 0,
      pushed: false,
    });
  }, [pending, resolveStore]);

  // Esc = 直接落账（与点击背景同语义）；只在浮层可见时挂监听，避免抢占其他面板的 Esc。
  useEffect(() => {
    if (!visible) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDirectCommit();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [visible, handleDirectCommit]);

  const handleEnterLuckSlider = useCallback(() => {
    setMode('luck-slider');
    setLuckSpend(0);
  }, []);

  const handleConfirmLuck = useCallback(() => {
    if (!pending) return;
    if (luckSpend <= 0) {
      handleDirectCommit();
      return;
    }
    const result = applyLuckSpend(
      pending.originalRoll, luckSpend, pending.target, pending.sanCheck, pending.skill,
    );
    // applyLuckToRoll 拒绝路径：appliedSpend=0 → 不扣点，按直接落账走
    if (result.appliedSpend <= 0) {
      handleDirectCommit();
      return;
    }
    // 扣幸运（走 G2 自纠通路；与 useDiceStore.commitWithLuck 同款）
    useVariableStore.getState().applyCorrectiveOps([
      { op: 'delta', path: '/调查员/幸运', value: -result.appliedSpend },
    ]);
    const newRecord = buildLuckSpentRecord(pending, {
      finalRoll: result.finalRoll,
      resultType: result.resultType,
      appliedSpend: result.appliedSpend,
    });
    const newInputText = rebuildInputText(pending.inputText, pending.resultLine, result.line);
    useDiceStore.getState().stashRecord(newRecord);
    commitToTextarea(newInputText);
    resolveStore({
      inputText: newInputText, record: newRecord,
      luckSpent: result.appliedSpend, pushed: false,
    });
  }, [pending, luckSpend, resolveStore, handleDirectCommit]);

  const handlePush = useCallback(() => {
    if (!pending) return;
    const reason = window.prompt('推动检定的理由？', '再翻一遍 / 不甘心 / 用力一些');
    if (reason == null) return; // 玩家取消推骰，停留在浮层
    const push = applyPushReroll(pending.target, pending.sanCheck, pending.skill, reason);
    const newRecord = buildPushedRecord(pending, push);
    const newInputText = rebuildInputText(pending.inputText, pending.resultLine, push.line);
    useDiceStore.getState().stashRecord(newRecord);
    commitToTextarea(newInputText);
    resolveStore({
      inputText: newInputText, record: newRecord,
      luckSpent: 0, pushed: true,
    });
  }, [pending, resolveStore]);

  if (!pending) return null;

  // 推骰资格 (canStartPush) 已在 trigger 入队时间过 shouldStage；
  // 这里再用 canStartPush 复查一次：原始结果必须是 failure（成功后玩家不会想推骰）。
  const canPush = canStartPush({
    resultType: pending.originalResult,
    sanCheck: pending.sanCheck,
    mode: 'check', // staging 只允许 check（opposed 已被 shouldStage 排除）
    alreadyPushed: false,
  });
  const canLuck = luck > 0 && pending.originalRoll > 1;
  const sliderMax = maxLuckSpend(pending.originalRoll, luck);
  const luckPreview = mode === 'luck-slider' && pending.originalRoll > 0
    ? previewLuckResult(pending.originalRoll, luckSpend, pending.target, pending.sanCheck)
    : null;

  // 中文标签——与 DicePanel/RightPage 保持一致；不引入新表
  const RESULT_LABEL: Record<string, string> = {
    'crit-success': '大成功！',
    'extreme-success': '极难成功',
    'hard-success': '困难成功',
    success: '成功',
    failure: '失败',
    'crit-failure': '大失败！',
  };
  const RESULT_COLOR: Record<string, string> = {
    'crit-success': 'var(--gold)',
    'extreme-success': '#69f0ae',
    'hard-success': '#4fc3f7',
    success: '#69f0ae',
    failure: '#ef5350',
    'crit-failure': '#d50000',
  };

  return (
    <AnimatePresence>
      <motion.div
        key="ors-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        style={{
          position: 'fixed', inset: 0, zIndex: 850,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        }}
        onClick={(e) => {
          // 点击背景关闭 = 直接落账（玩家明示意图：不动）
          if (e.target === e.currentTarget) handleDirectCommit();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 6 }}
          transition={{ duration: 0.35, ease: EASE }}
          style={{
            background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
            border: '1px solid var(--gold)',
            borderRadius: 8,
            padding: '22px 28px 20px',
            minWidth: 340, maxWidth: 460, width: '90%',
            boxShadow: '0 0 60px rgba(0,0,0,0.6), 0 0 14px rgba(196,168,85,0.08)',
            color: 'var(--text-light)', fontFamily: 'var(--font-ui)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题区 — 显示检定结果 */}
          <div style={{
            borderBottom: '1px solid rgba(196,168,85,0.2)', paddingBottom: 12, marginBottom: 16,
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold)',
              letterSpacing: 3, margin: 0,
            }}>检定结果</h3>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-subtle)' }}>
              {pending.skill} · d100={String(pending.originalRoll).padStart(2, '0')}/{pending.target}
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '14px 0', marginBottom: 14,
            border: '1px solid rgba(196,168,85,0.12)', borderRadius: 6,
            background: 'rgba(0,0,0,0.22)',
          }}>
            <span style={{
              fontSize: 22, fontWeight: 600, letterSpacing: 6,
              fontFamily: 'var(--font-display)',
              color: RESULT_COLOR[pending.originalResult] || 'var(--ink-subtle)',
              textShadow: `0 0 18px ${RESULT_COLOR[pending.originalResult] || 'rgba(255,255,255,0.1)'}66`,
            }}>
              {RESULT_LABEL[pending.originalResult] || pending.originalResult}
            </span>
          </div>

          {/* choose 子态：三按钮 */}
          {mode === 'choose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {canPush && (
                <ActionButton
                  icon={<IconPush size={16} />}
                  label="推动检定 / Push"
                  hint="再掷一次；失败时风险变重（KP 决定）"
                  onClick={handlePush}
                  tone="warn"
                />
              )}
              {canLuck && (
                <ActionButton
                  icon={<IconLuck size={16} />}
                  label="花费幸运 / Spend Luck"
                  hint={`当前幸运 ${luck}；最多可扣 ${sliderMax} 点`}
                  onClick={handleEnterLuckSlider}
                  tone="gold"
                />
              )}
              <ActionButton
                label="直接落账 / Commit"
                hint="按当前结果提交，剧情继续"
                onClick={handleDirectCommit}
                tone="neutral"
              />
              <div style={{
                marginTop: 4, textAlign: 'center', fontSize: 10, color: 'var(--ink-subtle)',
                letterSpacing: 2, opacity: 0.6,
              }}>
                Esc / 点击背景 = 直接落账
              </div>
            </div>
          )}

          {/* luck-slider 子态 */}
          {mode === 'luck-slider' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                fontSize: 12, color: 'var(--ink-subtle)', letterSpacing: 2,
              }}>
                <span>扣点：<span style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>{luckSpend}</span></span>
                <span>剩余幸运 {luck - luckSpend} / {luck}</span>
              </div>
              <input
                type="range"
                min={0}
                max={sliderMax}
                value={luckSpend}
                onChange={(e) => setLuckSpend(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--gold)' }}
              />
              {luckPreview && (
                <div style={{
                  padding: '10px 12px', borderRadius: 4,
                  background: 'rgba(196,168,85,0.08)',
                  border: '1px solid rgba(196,168,85,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  fontSize: 12, color: 'var(--text-light)',
                }}>
                  <span>预览：</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {String(luckPreview.previewRoll).padStart(2, '0')} / {pending.target}
                  </span>
                  <span style={{
                    color: RESULT_COLOR[luckPreview.previewResult] || 'var(--ink-subtle)',
                    fontFamily: 'var(--font-display)', letterSpacing: 3,
                  }}>
                    {RESULT_LABEL[luckPreview.previewResult] || luckPreview.previewResult}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton
                  label={commitButtonLabel(luckSpend)}
                  onClick={handleConfirmLuck}
                  tone="gold"
                  compact
                />
                <ActionButton
                  label="返回"
                  onClick={() => { setMode('choose'); setLuckSpend(0); }}
                  tone="neutral"
                  compact
                />
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── 内部按钮 — hover 1.04 / active 0.97 / cubic-bezier(0.4,0,0.2,1) ──

interface ActionButtonProps {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  tone: 'gold' | 'warn' | 'neutral';
  compact?: boolean;
}

function ActionButton({ icon, label, hint, onClick, tone, compact }: ActionButtonProps) {
  const palette = tone === 'gold'
    ? { bg: 'rgba(196,168,85,0.14)', border: 'var(--gold)', color: 'var(--gold)' }
    : tone === 'warn'
    ? { bg: 'rgba(204,51,51,0.12)', border: 'rgba(204,51,51,0.6)', color: '#ef5350' }
    : { bg: 'rgba(0,0,0,0.22)', border: 'rgba(196,168,85,0.25)', color: 'var(--text-light)' };
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.18, ease: EASE }}
      style={{
        flex: compact ? 1 : 'initial',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 10,
        padding: compact ? '8px 12px' : '10px 14px',
        border: `1px solid ${palette.border}`,
        borderRadius: 4,
        background: palette.bg,
        color: palette.color,
        fontFamily: 'var(--font-ui)', fontSize: 13, letterSpacing: 2,
        cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1), border-color 0.2s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {icon && <span style={{ display: 'inline-flex', alignItems: 'center', color: palette.color }}>{icon}</span>}
      <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {hint && <span style={{ fontSize: 10, opacity: 0.6, letterSpacing: 1, marginTop: 2 }}>{hint}</span>}
      </span>
    </motion.button>
  );
}
