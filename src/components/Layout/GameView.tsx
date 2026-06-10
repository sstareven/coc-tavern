import { useEffect, useState, useCallback, useRef } from 'react';
import { TopBar } from './TopBar';
import { InputBar } from './InputBar';
import { Storybook } from '../Book/Storybook';
import { StatusBar } from '../Book/StatusBar';
import { DiceAnimation, PolyRollAnimation } from '../Shared/DiceAnimation';
import { OptionResolutionOverlay } from '../Book/OptionResolutionOverlay';
import { SanityCheckPanel } from '../Book/SanityCheckPanel';
import { CurrentScenarioBadge } from '../Scenario/CurrentScenarioBadge';
import { TeamSidebar } from './TeamSidebar';
import { ImmersiveToggleFAB } from './ImmersiveToggleFAB';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useViewportHeight } from '../../hooks/useViewportHeight';
import { useReadingModeStore } from '../../stores/useReadingModeStore';
import { useOptionStagingStore } from '../../stores/useOptionStagingStore';
import { useDiceStore } from '../../stores/useDiceStore';
import { shouldStage, type StagingTrigger } from '../../sillytavern/option-staging';

interface Props { onReturnToMenu: () => void }

export function GameView({ onReturnToMenu }: Props) {
  // Session game state is loaded by switchConversation/loadConversation when entering a game
  // (via LoadGameModal onSelect or new-game flow), so GameView does NOT re-restore on mount —
  // that would double-load over the already-loaded state.
  const [diceAnim, setDiceAnim] = useState<{
    visible: boolean; skillName: string; target: number; roll: number; resultType: string; inputText: string;
    bonus: 'none' | 'bonus' | 'penalty'; bonusTens: number;
    opposed: boolean; opponentRoll: number; opponentTarget: number; opponentResultType: string; opposedOutcome: 'win' | 'lose' | 'draw';
    kind: 'check' | 'poly'; polyTheme: 'damage' | 'sanity'; polyLabel: string; polyExpr: string; polyTotal: number; polySub: string; hidden: boolean;
    /** A1.8 — fillInputBar 把 staging 触发器挂到事件 payload；动画结束后由 onDiceComplete 决定 stage 或直接落账。 */
    stagingTrigger: StagingTrigger | null;
  }>({ visible: false, skillName: '', target: 0, roll: 0, resultType: '', inputText: '', bonus: 'none', bonusTens: 0, opposed: false, opponentRoll: 0, opponentTarget: 0, opponentResultType: 'failure', opposedOutcome: 'draw', kind: 'check', polyTheme: 'damage', polyLabel: '', polyExpr: '', polyTotal: 0, polySub: '', hidden: false, stagingTrigger: null });
  // ref 镜像 diceAnim,供 onDiceComplete callback 读取当前 state 而不写在 setDiceAnim updater 里
  // —— React 18+ 严格检测 setState updater 的 purity,updater 内调 zustand setter 会触发其他
  // 组件(如 OptionResolutionOverlay)在 GameView render 期间 rerender,触发警告
  // "Cannot update a component while rendering a different component"。
  const diceAnimRef = useRef(diceAnim);
  diceAnimRef.current = diceAnim;
  // Listen for dice animation events from RightPage choices
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setDiceAnim({
        visible: true, skillName: detail.skillName, target: detail.target, roll: detail.roll, resultType: detail.resultType, inputText: detail.inputText,
        bonus: detail.bonus || 'none', bonusTens: detail.bonusTens || 0,
        opposed: detail.opposed || false, opponentRoll: detail.opponentRoll || 0, opponentTarget: detail.opponentTarget || 0, opponentResultType: detail.opponentResultType || 'failure', opposedOutcome: detail.opposedOutcome || 'draw',
        kind: detail.kind || 'check', polyTheme: detail.polyTheme || 'damage', polyLabel: detail.polyLabel || '', polyExpr: detail.polyExpr || '', polyTotal: detail.polyTotal || 0, polySub: detail.polySub || '', hidden: detail.hidden || false,
        stagingTrigger: detail.stagingTrigger || null,
      });
    };
    document.addEventListener('dice-roll-animate', handler);
    return () => document.removeEventListener('dice-roll-animate', handler);
  }, []);

  const onDiceComplete = useCallback(() => {
    // 通知战斗面板：骰子动画已结束，可揭示此前暂存的战斗日志文字。
    document.dispatchEvent(new Event('dice-animate-done'));
    const prev = diceAnimRef.current;
    if (!prev.visible) return;
    // 先 setState 隐藏动画（updater 保持 pure：只返回新 state，不做副作用）
    setDiceAnim({ ...prev, visible: false });

    // 副作用在 setState 之外完成——避免在 GameView reconciliation 阶段同步触发
    // OptionResolutionOverlay 的 rerender（React 18+ 严格检测）。
    // A1.8 — 若 fillInputBar 标记了 stagingTrigger，动画结束后把它推给 OptionResolutionOverlay；
    // 不写 textarea、不 stashRecord 由浮层 commit/cancel 路径接管。
    if (prev.stagingTrigger && shouldStage({
      kind: prev.stagingTrigger.kind,
      sanCheck: prev.stagingTrigger.sanCheck,
      opposed: prev.stagingTrigger.kind === 'opposed',
    })) {
      useOptionStagingStore.getState().open(prev.stagingTrigger);
      return;
    }

    // 非 staging 路径（poly/hidden/opposed/sanCheck）保持原行为：写 textarea + auto-submit。
    // 这些类别 fillInputBar 已经 stashRecord 完毕，这里只补 textarea/dispatch。
    const textarea = document.querySelector<HTMLTextAreaElement>('footer textarea');
    if (textarea && prev.inputText) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      nativeInputValueSetter?.call(textarea, prev.inputText);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();
      if (useSettingsStore.getState().autoSubmitChoice) {
        setTimeout(() => document.dispatchEvent(new Event('auto-submit-input')), 100);
      }
    }
  }, []);

  // A1.8 — 切换/读取会话时把任何挂着的 staging 浮层一并清掉，避免跨档残留。
  // 与 useDiceStore.clearAll 同源（GameView 是 session 边界）。
  useEffect(() => {
    const handler = () => {
      useOptionStagingStore.getState().cancel();
      useDiceStore.getState().clearPending();
    };
    document.addEventListener('session-reset', handler);
    return () => document.removeEventListener('session-reset', handler);
  }, []);

  const isMobile = useIsMobile();
  const viewportH = useViewportHeight();
  const immersive = useReadingModeStore((s) => s.immersive);
  const topCollapsed = useReadingModeStore((s) => s.topCollapsed);
  // 手机端用可视视口高度（软键盘弹出时收缩，输入栏随之顶到键盘上方）；桌面回退 100dvh。
  // 两条路径都除以 --auto-zoom：根容器 zoom=0.75 时若直接给 ${viewportH}px,
  // 渲染高 = 1307 × 0.75 = 980,卡片够不到屏幕底部留 326px 空白。
  // 除以 zoom 之后 layout box = viewportH/zoom,渲染回 viewportH 恰好满屏。
  const appHeight = isMobile && viewportH
    ? `calc(${viewportH}px / var(--auto-zoom, 1))`
    : 'calc(100dvh / var(--auto-zoom, 1))';

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: appHeight }}>
      {/* 沉浸模式(仅手机端开关 UI):藏 TopBar + 剧本/队伍胶囊条,卷轴最大化。桌面端不应用,保留完整 UI。 */}
      {!(isMobile && immersive) && <TopBar onReturnToMenu={onReturnToMenu} />}
      {/* 手机端:剧本+队伍胶囊包成 TopBar 下方一行,避免 fixed 浮在 MobileTabBar/StatusBar 之上遮挡。
          桌面端:沿用各自 fixed 浮在左上角(top:56/92),不占布局。 */}
      {isMobile ? (
        !immersive && (
          <div style={{
            display: 'flex', flexShrink: 0, alignItems: 'center', gap: 6, flexWrap: 'wrap',
            padding: topCollapsed ? '0 10px' : '2px 10px',
            maxHeight: topCollapsed ? 0 : 60,
            opacity: topCollapsed ? 0 : 1,
            overflow: 'hidden',
            background: '#14100b',
            borderBottom: topCollapsed ? 'none' : '1px solid rgba(196,168,85,0.08)',
            transition: 'max-height 220ms cubic-bezier(0.4,0,0.2,1), opacity 200ms cubic-bezier(0.4,0,0.2,1), padding 200ms cubic-bezier(0.4,0,0.2,1), border-color 200ms cubic-bezier(0.4,0,0.2,1)',
          }}>
            <TeamSidebar />
            <CurrentScenarioBadge />
          </div>
        )
      ) : (
        <>
          <CurrentScenarioBadge />
          <TeamSidebar />
        </>
      )}

      {isMobile ? (
        <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          <Storybook />
        </main>
      ) : (
        <main style={{
          flex: 1, minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
          padding: '12px 24px 24px',
        }}>
          {/* Status bar — flow element, always visible above the desk */}
          <div style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            zIndex: 4,
            pointerEvents: 'none',
            paddingBottom: 4,
          }}>
            <div style={{ pointerEvents: 'auto' }}>
              <StatusBar />
            </div>
          </div>

          {/* Book area — centers the desk+book as one unit */}
          <div style={{
            flex: 1, minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}>
            {/* Desk surface — IS the book cover wrapper; Storybook lives inside it.
                They share the same box so they always shrink/grow together. */}
            <div style={{
              position: 'relative',
              width: 'min(92vw, 960px)',
              height: 'min(65vh, 600px, 100%)',
              boxSizing: 'border-box',
              borderRadius: 16,
              background: `
                url("data:image/svg+xml,%3Csvg width='400' height='400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence baseFrequency='0.65 0.15' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.12'/%3E%3C/svg%3E"),
                linear-gradient(178deg,
                  #4a3020 0%,
                  #3d2818 15%,
                  #352218 35%,
                  #3a2416 55%,
                  #2e1d10 75%,
                  #25180c 100%
                ),
                repeating-linear-gradient(2deg, transparent, transparent 5px, rgba(0,0,0,0.03) 5px, rgba(0,0,0,0.03) 6px),
                repeating-linear-gradient(88deg, transparent, transparent 3px, rgba(255,255,255,0.015) 3px, rgba(255,255,255,0.015) 4px)
              `,
              border: '2px solid rgba(100,70,40,0.3)',
              boxShadow: `
                inset 0 2px 3px rgba(255,255,255,0.04),
                inset 0 -3px 10px rgba(0,0,0,0.45),
                0 2px 0 rgba(120,80,40,0.08),
                0 0 50px rgba(0,0,0,0.55),
                0 20px 60px rgba(0,0,0,0.4)
              `,
            }}>
              <Storybook />
            </div>
          </div>
        </main>
      )}

      <InputBar />

      <DiceAnimation
        visible={diceAnim.visible && diceAnim.kind !== 'poly'}
        skillName={diceAnim.skillName}
        target={diceAnim.target}
        roll={diceAnim.roll}
        resultType={diceAnim.resultType}
        onComplete={onDiceComplete}
        bonus={diceAnim.bonus}
        bonusTens={diceAnim.bonusTens}
        opposed={diceAnim.opposed}
        opponentRoll={diceAnim.opponentRoll}
        opponentTarget={diceAnim.opponentTarget}
        opponentResultType={diceAnim.opponentResultType}
        opposedOutcome={diceAnim.opposedOutcome}
      />

      <PolyRollAnimation
        visible={diceAnim.visible && diceAnim.kind === 'poly'}
        theme={diceAnim.polyTheme}
        label={diceAnim.polyLabel}
        expr={diceAnim.polyExpr}
        total={diceAnim.polyTotal}
        sub={diceAnim.polySub}
        hidden={diceAnim.hidden}
        onComplete={onDiceComplete}
      />

      {/* A1.8 — 选项检定 staging 浮层：动画结束后浮出，让玩家选 推骰/幸运/落账。 */}
      <OptionResolutionOverlay />
      {/* A2 重设 — 玩家点叙事血色气泡后弹的阴森 SAN 检定面板 */}
      <SanityCheckPanel />
      {/* 沉浸阅读浮动按钮:仅手机端显示,点一下藏 TopBar/胶囊条/StatusBar/PageBanner。 */}
      {isMobile && <ImmersiveToggleFAB />}
    </div>
  );
}
