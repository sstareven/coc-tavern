/**
 * A2 重设 — SanityCheckPanel: 玩家点 SanityBubble 后弹出的【阴森恐怖】SAN check 面板。
 *
 * 流程 (按钮驱动, 步进式):
 *   1. INTRO    — 显示触发描述 + "面对" 按钮
 *   2. ROLLING  — d100 vs effectiveTarget 动画(掷骰数字滚动 1.4s)
 *   3. LOSS     — 掷 SAN loss 骰子 + 显示扣 N 点理智 + "承受" 按钮
 *   4. DONE     — 落账 → close() + markResolved
 *
 * 美术与 OptionResolutionOverlay 不同:
 *  - 深血色 / 黑红渐变背景, 不要 var(--leather)/var(--gold)
 *  - var(--font-display) 标题, 略带扭曲 letter-spacing 增加压迫
 *  - dripping/glitch 动画装饰 — 标题位左右两个血滴 SVG, 缓慢飘
 *  - 关闭背景点击禁用(强制完成检定, 不能跳过)
 *
 * 规则锁:
 *  - SAN check itself: per R4 不可推骰 + per R7 不可花幸运(只有 INT/CON/POW 这种属性 check 才允许)
 *  - SAN loss 后单次 ≥5: 由 boutEvaluator 在 settleVariables 后置相位接管(applyCorrectiveOps 写 SAN delta
 *    → useVariableStore.processResponse 路径捕获 sanDelta → runPostSettleEvaluators → boutEvaluator)
 *
 * 注: 本面板调 applyCorrectiveOps 写 /调查员/理智值/当前 -N。这一 corrective 调用会:
 *   - 经 mvu-charsheet-redirect 落到 sheet.secondary.san.current
 *   - 触发 useVariableStore.processResponse 的 charSheetDeltas.sanDelta 旁路
 *   - 由 runPostSettleEvaluators 触发 boutEvaluator(永久/不定/Bout 判定)
 *  注: applyCorrectiveOps 当前不跑 evaluators(只 processResponse 跑), 故需手动调一次
 *  runPostSettleEvaluators — 见 GameView/useChatPipeline 后续接入, 当前 commit 仅落 SAN, evaluator
 *  接驳由独立流程(主管线再次 settleVariables 时跑); 这是已知边界, 在 task 完成自评中说明。
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSanityPanelStore } from '../../stores/useSanityPanelStore';
import { useSanityBubbleStore } from '../../stores/useSanityBubbleStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useVariableStore } from '../../stores/useVariableStore';
import {
  rollSanCheck,
  rollSanLoss,
  buildSanityOps,
  readCheckTarget,
  applyDifficulty,
} from '../../sillytavern/sanity-prompt-engine';

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];

type Phase = 'intro' | 'rolling' | 'result' | 'loss';

const DIFFICULTY_LABEL: Record<string, string> = {
  normal: '普通',
  hard: '困难',
  extreme: '极难',
};

const CHECK_LABEL: Record<string, string> = {
  POW: 'POW',
  INT: 'INT',
  skill: '技能',
};

export function SanityCheckPanel() {
  const prompt = useSanityPanelStore((s) => s.activePrompt);
  const closeStore = useSanityPanelStore((s) => s.close);
  const sheet = useCharSheetStore((s) => s.sheet);

  const [phase, setPhase] = useState<Phase>('intro');
  // 检定结果
  const [d100, setD100] = useState(0);
  const [target, setTarget] = useState(0);
  const [passed, setPassed] = useState(false);
  const [loss, setLoss] = useState(0);
  // 数字滚动动画
  const [rollDisplay, setRollDisplay] = useState(0);

  // 重置面板态: 切 prompt / 关闭后清空
  useEffect(() => {
    if (prompt) {
      setPhase('intro');
      setD100(0); setTarget(0); setPassed(false); setLoss(0); setRollDisplay(0);
    }
  }, [prompt?.id]);

  const handleStart = useCallback(() => {
    if (!prompt) return;
    setPhase('rolling');
    // 1.4s 数字滚动动画 → 落定 d100 结果
    const r = rollSanCheck(sheet, prompt);
    setD100(r.d100);
    setTarget(r.effectiveTarget);
    setPassed(r.passed);
    const startedAt = performance.now();
    const DURATION = 1400;
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - startedAt) / DURATION;
      if (t >= 1) {
        setRollDisplay(r.d100);
        setPhase('result');
        return;
      }
      // 缓动: 越接近终点滚得越慢
      const eased = 1 - Math.pow(1 - t, 3);
      // 滚动数字: 在 1..100 间快速变动, 终点逼近实际 d100
      const cur = Math.max(1, Math.min(100,
        Math.floor((Math.random() * 100 + 1) * (1 - eased) + r.d100 * eased)
      ));
      setRollDisplay(cur);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [prompt, sheet]);

  const handleAcceptResult = useCallback(() => {
    if (!prompt) return;
    const expr = passed ? prompt.sanLossSuccess : prompt.sanLossFail;
    const n = rollSanLoss(expr);
    setLoss(n);
    setPhase('loss');
  }, [prompt, passed]);

  const handleCommit = useCallback(() => {
    if (!prompt) return;
    // 落账: applyCorrectiveOps 走 mvu-charsheet-redirect → sheet.secondary.san.current
    // boutEvaluator 后续判定永久/不定/Bout
    const ops = buildSanityOps(loss);
    if (ops.length > 0) {
      useVariableStore.getState().applyCorrectiveOps(ops);
    }
    // 立即触发 post-settle evaluators(boutEvaluator)，让 Bout/不定/永久判定与本次扣 SAN 同回合落账，
    // 而不是等到下回 LLM 主回复时才补判 —— 用户体验上"点完就出 Bout"。
    // 用 dynamic import 避免循环依赖（evaluator 模块自己也 import useVariableStore）。
    // 失败被吞（evaluator 内部已 try/catch + warn），不阻塞关 panel/markResolved 流程。
    (async () => {
      try {
        const { runPostSettleEvaluators } = await import('../../sillytavern/post-settle-evaluators');
        runPostSettleEvaluators({
          sheet: useCharSheetStore.getState().sheet,
          statData: useVariableStore.getState().statData,
          patchReport: {
            applied: 1,
            failed: [],
            charSheetDeltas: { sanDelta: -loss, episodeId: 'bubble:' + Date.now() },
          },
          applyCorrectiveOps: (corrOps) => useVariableStore.getState().applyCorrectiveOps(corrOps),
        });
      } catch (err) {
        console.warn('[SanityCheckPanel] runPostSettleEvaluators 失败被吞:', err);
      }
    })();
    useSanityBubbleStore.getState().markResolved(prompt.id);
    closeStore();
  }, [prompt, loss, closeStore]);

  if (!prompt) return null;

  const baseTarget = readCheckTarget(sheet, prompt);
  const effectiveTarget = applyDifficulty(baseTarget, prompt.difficulty);
  const checkLabel = prompt.checkType === 'skill'
    ? (prompt.checkSkill ?? '技能')
    : CHECK_LABEL[prompt.checkType];

  return (
    <AnimatePresence>
      <motion.div
        key="sanp-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{
          position: 'fixed', inset: 0, zIndex: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(ellipse at center, rgba(40,0,0,0.65) 0%, rgba(0,0,0,0.92) 70%)',
          backdropFilter: 'blur(5px)',
        }}
        // 关闭背景点击禁用 — SAN check 不可跳过
      >
        {/* 全局动画样式 — 只挂一次 */}
        <style>{`
          @keyframes san-panel-flicker {
            0%, 100% { opacity: 1; }
            50%      { opacity: 0.92; }
          }
          @keyframes san-panel-drip {
            0%   { transform: translateY(-8px); opacity: 0; }
            50%  { opacity: 0.85; }
            100% { transform: translateY(24px); opacity: 0; }
          }
          @keyframes san-roll-glitch {
            0%, 100% { transform: translateX(0); text-shadow: 0 0 8px rgba(255,0,0,0.55); }
            33%      { transform: translateX(-1px); text-shadow: -2px 0 #ff0033, 2px 0 #00f0ff, 0 0 12px rgba(255,0,0,0.7); }
            66%      { transform: translateX(1px); text-shadow: 2px 0 #ff0033, -2px 0 #00f0ff, 0 0 12px rgba(255,0,0,0.7); }
          }
        `}</style>

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 6 }}
          transition={{ duration: 0.45, ease: EASE }}
          style={{
            position: 'relative',
            minWidth: 380, maxWidth: 520, width: '92%',
            padding: '26px 32px 24px',
            borderRadius: 6,
            border: '1px solid rgba(140, 16, 16, 0.7)',
            background: 'linear-gradient(180deg, #1a0405 0%, #100202 60%, #050000 100%)',
            boxShadow:
              '0 0 80px rgba(120,0,0,0.45), 0 0 24px rgba(60,0,0,0.6) inset, 0 0 2px rgba(255,80,80,0.25)',
            color: '#e8d4d4',
            fontFamily: 'var(--font-ui)',
            animation: `san-panel-flicker 3.6s ${EASE} infinite`,
          }}
        >
          {/* 顶部血滴装饰 — 标题两侧持续滴 */}
          {[8, 92].map((leftPct) => (
            <span
              key={leftPct}
              aria-hidden="true"
              style={{
                position: 'absolute', top: 6, left: `${leftPct}%`,
                width: 3, height: 8,
                borderRadius: '0 0 50% 50%',
                background: 'linear-gradient(180deg, #ff3030 0%, #500808 100%)',
                animation: `san-panel-drip 3.2s ${EASE} infinite`,
                animationDelay: `${leftPct * 12}ms`,
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* 标题 */}
          <h3 style={{
            margin: 0, marginBottom: 18,
            fontFamily: 'var(--font-display)',
            fontSize: 17, letterSpacing: 8,
            color: '#ff7a7a',
            textAlign: 'center',
            textShadow: '0 0 12px rgba(180,0,0,0.7), 0 1px 1px rgba(0,0,0,0.8)',
            borderBottom: '1px dashed rgba(140, 16, 16, 0.4)',
            paddingBottom: 14,
          }}>
            理 智 检 定
          </h3>

          {/* 触发描述 */}
          <p style={{
            margin: '0 0 18px',
            fontSize: 13, lineHeight: 1.8,
            color: '#c8b0b0', fontStyle: 'italic',
            textAlign: 'center', letterSpacing: 0.8,
            textShadow: '0 1px 1px rgba(0,0,0,0.6)',
          }}>
            {prompt.trigger}
          </p>

          {/* 检定信息条 */}
          <div style={{
            display: 'flex', justifyContent: 'space-around', alignItems: 'center',
            padding: '10px 14px', marginBottom: 16,
            border: '1px solid rgba(140,16,16,0.35)',
            background: 'rgba(40,0,0,0.4)',
            borderRadius: 4,
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: '#a07070', letterSpacing: 1.5,
          }}>
            <span>项目: <span style={{ color: '#ff9090' }}>{checkLabel}</span></span>
            <span>难度: <span style={{ color: '#ff9090' }}>{DIFFICULTY_LABEL[prompt.difficulty]}</span></span>
            <span>目标: <span style={{ color: '#ff9090' }}>{effectiveTarget}</span>
              {prompt.difficulty !== 'normal' && (
                <span style={{ marginLeft: 4, opacity: 0.45, fontSize: 10, textDecoration: 'line-through' }}>{baseTarget}</span>
              )}
            </span>
          </div>

          {/* INTRO */}
          {phase === 'intro' && (
            <ActionButton label="面 对" onClick={handleStart} />
          )}

          {/* ROLLING / RESULT — 数字滚动 + 显示成功失败 */}
          {(phase === 'rolling' || phase === 'result') && (
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 60,
                letterSpacing: 4,
                lineHeight: 1,
                marginBottom: 8,
                animation: phase === 'rolling'
                  ? `san-roll-glitch 0.18s ${EASE} infinite`
                  : 'none',
                textShadow: phase === 'result' && passed
                  ? '0 0 14px rgba(120,255,160,0.55)'
                  : '0 0 18px rgba(255,30,30,0.8)',
                color: phase === 'result' ? (passed ? '#a0f0a0' : '#ff5050') : '#ff8a8a',
                transition: `color 360ms ${EASE}, text-shadow 360ms ${EASE}`,
              }}>
                {String(phase === 'rolling' ? rollDisplay : d100).padStart(2, '0')}
              </div>
              <div style={{
                fontSize: 11, color: '#806060',
                letterSpacing: 3, fontFamily: 'var(--font-ui)',
              }}>
                d100 / {target || effectiveTarget}
              </div>
            </div>
          )}

          {phase === 'result' && (
            <>
              <div style={{
                textAlign: 'center', marginBottom: 16,
                fontFamily: 'var(--font-display)',
                fontSize: 22, letterSpacing: 6,
                color: passed ? '#a0f0a0' : '#ff5050',
                textShadow: passed ? '0 0 14px rgba(120,255,160,0.5)' : '0 0 18px rgba(255,30,30,0.8)',
              }}>
                {passed ? '稳 住' : '崩 溃'}
              </div>
              <ActionButton label="承受后果" onClick={handleAcceptResult} />
            </>
          )}

          {/* LOSS — 显示扣 SAN, 按钮落账 */}
          {phase === 'loss' && (
            <>
              <div style={{
                textAlign: 'center', marginBottom: 16,
                padding: '12px 0',
                border: '1px solid rgba(140,16,16,0.5)',
                borderRadius: 4,
                background: 'rgba(70,0,0,0.45)',
              }}>
                <div style={{ fontSize: 10, color: '#806060', letterSpacing: 3, marginBottom: 6 }}>
                  理 智 损 失
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 38,
                  color: loss > 0 ? '#ff4040' : '#a0f0a0',
                  letterSpacing: 3,
                  textShadow: loss > 0 ? '0 0 18px rgba(255,30,30,0.8)' : '0 0 8px rgba(120,255,160,0.4)',
                }}>
                  {loss > 0 ? `- ${loss}` : '0'}
                </div>
                {loss >= 5 && (
                  <div style={{
                    marginTop: 8, fontSize: 11, color: '#ff9090',
                    letterSpacing: 2, fontStyle: 'italic',
                  }}>
                    意识开始扭曲...
                  </div>
                )}
              </div>
              <ActionButton label="落 账" onClick={handleCommit} tone="commit" />
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── 内部血色按钮 — hover 1.04 / active 0.97 / cubic-bezier(0.4, 0, 0.2, 1) ───
function ActionButton({
  label, onClick, tone = 'default',
}: { label: string; onClick: () => void; tone?: 'default' | 'commit' }) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const scale = active ? 0.97 : hover ? 1.04 : 1;
  const isCommit = tone === 'commit';
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        display: 'block', width: '100%',
        padding: '12px 18px',
        border: `1px solid ${isCommit ? 'rgba(200,30,30,0.85)' : 'rgba(140,16,16,0.7)'}`,
        background: hover
          ? (isCommit ? 'rgba(140,16,16,0.55)' : 'rgba(80,10,10,0.55)')
          : (isCommit ? 'rgba(100,10,10,0.45)' : 'rgba(40,5,5,0.55)'),
        color: hover ? '#ffd0d0' : '#e0b8b8',
        fontFamily: 'var(--font-display)',
        fontSize: 14, letterSpacing: 6,
        cursor: 'pointer',
        borderRadius: 4,
        boxShadow: isCommit
          ? '0 0 22px rgba(180,0,0,0.45), inset 0 0 6px rgba(255,80,80,0.18)'
          : '0 0 14px rgba(100,0,0,0.35)',
        transition: `transform 220ms ${EASE.join(',')}, background 220ms ${EASE.join(',')}, color 220ms ${EASE.join(',')}, box-shadow 220ms ${EASE.join(',')}`,
        transform: `scale(${scale})`,
        textShadow: '0 1px 1px rgba(0,0,0,0.6)',
      }}
    >
      {label}
    </button>
  );
}
