import { useEffect, useState, useCallback } from 'react';
import { TopBar } from './TopBar';
import { InputBar } from './InputBar';
import { Storybook } from '../Book/Storybook';
import { StatusBar } from '../Book/StatusBar';
import { DiceAnimation, PolyRollAnimation } from '../Shared/DiceAnimation';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useChatStore } from '../../stores/useChatStore';
import { useBookStore } from '../../stores/useBookStore';

interface Props { onReturnToMenu: () => void }

export function GameView({ onReturnToMenu }: Props) {
  // Restore pages from active session on mount
  useEffect(() => {
    const savedPages = useChatStore.getState().getActivePages();
    if (savedPages.length > 0) {
      useBookStore.getState().setPages(savedPages);
    }
  }, []);

  const [diceAnim, setDiceAnim] = useState<{
    visible: boolean; skillName: string; target: number; roll: number; resultType: string; inputText: string;
    bonus: 'none' | 'bonus' | 'penalty'; bonusTens: number;
    opposed: boolean; opponentRoll: number; opponentTarget: number; opponentResultType: string; opposedOutcome: 'win' | 'lose' | 'draw';
    kind: 'check' | 'poly'; polyTheme: 'damage' | 'sanity'; polyLabel: string; polyExpr: string; polyTotal: number; polySub: string;
  }>({ visible: false, skillName: '', target: 0, roll: 0, resultType: '', inputText: '', bonus: 'none', bonusTens: 0, opposed: false, opponentRoll: 0, opponentTarget: 0, opponentResultType: 'failure', opposedOutcome: 'draw', kind: 'check', polyTheme: 'damage', polyLabel: '', polyExpr: '', polyTotal: 0, polySub: '' });
  // Listen for dice animation events from RightPage choices
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setDiceAnim({
        visible: true, skillName: detail.skillName, target: detail.target, roll: detail.roll, resultType: detail.resultType, inputText: detail.inputText,
        bonus: detail.bonus || 'none', bonusTens: detail.bonusTens || 0,
        opposed: detail.opposed || false, opponentRoll: detail.opponentRoll || 0, opponentTarget: detail.opponentTarget || 0, opponentResultType: detail.opponentResultType || 'failure', opposedOutcome: detail.opposedOutcome || 'draw',
        kind: detail.kind || 'check', polyTheme: detail.polyTheme || 'damage', polyLabel: detail.polyLabel || '', polyExpr: detail.polyExpr || '', polyTotal: detail.polyTotal || 0, polySub: detail.polySub || '',
      });
    };
    document.addEventListener('dice-roll-animate', handler);
    return () => document.removeEventListener('dice-roll-animate', handler);
  }, []);

  const onDiceComplete = useCallback(() => {
    setDiceAnim((prev) => {
      if (!prev.visible) return prev; // Already hidden by newer animation
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
      return { ...prev, visible: false };
    });
  }, []);

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar onReturnToMenu={onReturnToMenu} />

      <main style={{
        flex: 1, minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        padding: '12px 24px 24px',
      }}>
        <StatusBar />

        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1, minHeight: 0,
          width: '100%',
          padding: '8px 0',
        }}>
          {/* Desk table surface */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(92vw, 960px)',
            height: 'min(65vh, 600px)',
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
          }} />

          <Storybook />
        </div>
      </main>

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
        onComplete={onDiceComplete}
      />
    </div>
  );
}
