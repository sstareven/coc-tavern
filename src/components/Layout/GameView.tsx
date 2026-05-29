import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TopBar } from './TopBar';
import { InputBar } from './InputBar';
import { Storybook } from '../Book/Storybook';
import { StatusBar } from '../Book/StatusBar';
import { DiceAnimation } from '../Shared/DiceAnimation';
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

  // Debug console (press ~ to toggle)
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugCmd, setDebugCmd] = useState('');
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const debugRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        setDebugOpen((v) => { if (!v) setTimeout(() => debugRef.current?.focus(), 50); return !v; });
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const runDebugCmd = useCallback((cmd: string) => {
    const trimmed = cmd.trim().toLowerCase();
    const bookStore = useBookStore.getState();
    let result = '';

    if (trimmed === 'home' || trimmed === 'first') {
      bookStore.goToPage(0);
      result = `跳转到第 1 页 (共 ${bookStore.pages.length} 页)`;
    } else if (trimmed === 'last') {
      bookStore.goToPage(bookStore.pages.length - 1);
      result = `跳转到最后一页 (第 ${bookStore.pages.length} 页)`;
    } else if (trimmed.startsWith('goto ')) {
      const n = parseInt(trimmed.slice(5));
      if (n >= 1 && n <= bookStore.pages.length) {
        bookStore.goToPage(n - 1);
        result = `跳转到第 ${n} 页`;
      } else { result = `无效页码 (1-${bookStore.pages.length})`; }
    } else if (trimmed === 'test' || trimmed === 'dummy') {
      const lorem = '这是一段测试用的占位正文。阿卡姆的街道在黄昏中显得格外幽暗，远处传来密斯卡塔尼克河低沉的流水声。你沿着鹅卵石路向前走去，路灯尚未点亮，只有几扇窗户透出昏黄的煤油灯光。空气中弥漫着潮湿的泥土与旧纸张的气味。\n\n你注意到街角有一个黑影一闪而过。远处的钟楼敲响了六下，回声在空旷的街道上久久不散。你的手不自觉地握紧了口袋里的手电筒。';
      const testPage = {
        leftHeader: '调试页面 · DEBUG',
        leftContent: lorem,
        leftPage: `— ${bookStore.pages.length * 2 + 1} —`,
        rightPage: `— ${bookStore.pages.length * 2 + 2} —`,
        rightHeader: '测试选项',
        rightContent: '这是一个调试用的测试页面，用于检查布局是否正常。',
        rightChoices: [
          { num: 'I', text: '普通选项', action: '继续探索' },
          { num: 'II', text: '检定选项', action: '进行侦查检定(普通)，搜查周围' },
          { num: 'III', text: '困难检定', action: '进行图书馆使用检定(困难, 奖励骰)，查阅档案' },
          { num: 'IV', text: '对抗选项', action: '进行力量对抗(对手目标值:45)，与守卫角力' },
        ],
        summary: '调查员在弗朗西斯书店的档案室中发现了失踪案的卷宗和一本可疑的非法出版物，档案管理员韦瑟比似乎在暗中监视着调查员的一举一动，后巷传来的低语声令人不安。',
        diceResults: [
          { skill: '侦查', roll: '42', target: '60', type: 'success' as const, time: Date.now() },
          { skill: '力量(对抗)', roll: '95', target: '50', type: 'crit-failure' as const, time: Date.now() },
        ],
      };
      bookStore.appendPage(testPage);
      bookStore.goToPage(bookStore.pages.length - 1);
      result = `已生成调试页面 (第 ${bookStore.pages.length} 页)`;
    } else if (trimmed === 'info') {
      const p = bookStore.pages[bookStore.pageIndex];
      result = `当前: 第${bookStore.pageIndex + 1}/${bookStore.pages.length}页 | "${p?.leftHeader}" | summary: ${p?.summary ? '有' : '无'} | dice: ${p?.diceResults?.length || 0}条`;
    } else if (trimmed === 'help') {
      result = '命令: home/first | last | goto N | test/dummy | info | help | clear';
    } else if (trimmed === 'clear') {
      setDebugLog([]);
      return;
    } else {
      result = `未知命令: ${trimmed} (输入 help 查看可用命令)`;
    }

    setDebugLog((prev) => [...prev.slice(-9), `> ${cmd}\n${result}`]);
    setDebugCmd('');
  }, []);

  const [diceAnim, setDiceAnim] = useState<{
    visible: boolean; skillName: string; target: number; roll: number; resultType: string; inputText: string;
    bonus: 'none' | 'bonus' | 'penalty'; bonusTens: number;
    opposed: boolean; opponentRoll: number; opponentTarget: number; opponentResultType: string; opposedOutcome: 'win' | 'lose' | 'draw';
  }>({ visible: false, skillName: '', target: 0, roll: 0, resultType: '', inputText: '', bonus: 'none', bonusTens: 0, opposed: false, opponentRoll: 0, opponentTarget: 0, opponentResultType: 'failure', opposedOutcome: 'draw' });
  // Listen for dice animation events from RightPage choices
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setDiceAnim({ visible: true, skillName: detail.skillName, target: detail.target, roll: detail.roll, resultType: detail.resultType, inputText: detail.inputText, bonus: detail.bonus || 'none', bonusTens: detail.bonusTens || 0, opposed: detail.opposed || false, opponentRoll: detail.opponentRoll || 0, opponentTarget: detail.opponentTarget || 0, opponentResultType: detail.opponentResultType || 'failure', opposedOutcome: detail.opposedOutcome || 'draw' });
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
        visible={diceAnim.visible}
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

      {/* Debug console (press ~ to toggle) */}
      <AnimatePresence>
        {debugOpen && (
          <motion.div
            initial={{ y: -200, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -200, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
              width: 480, maxWidth: '90vw', zIndex: 999,
              background: 'rgba(10,8,6,0.95)', border: '1px solid rgba(196,168,85,0.3)',
              borderTop: 'none', borderRadius: '0 0 8px 8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              padding: '8px 12px',
              fontFamily: 'var(--font-mono)', fontSize: 11,
            }}
          >
            {debugLog.length > 0 && (
              <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 6, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) transparent' }}>
                {debugLog.map((l, i) => (
                  <div key={i} style={{ color: 'rgba(196,168,85,0.6)', whiteSpace: 'pre-wrap', padding: '2px 0', borderBottom: '1px solid rgba(196,168,85,0.06)' }}>{l}</div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: 'var(--gold)', fontSize: 10 }}>{'>'}</span>
              <input
                ref={debugRef}
                value={debugCmd}
                onChange={(e) => setDebugCmd(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && debugCmd.trim()) runDebugCmd(debugCmd); if (e.key === 'Escape') setDebugOpen(false); e.stopPropagation(); }}
                placeholder="输入命令 (help 查看可用命令)"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: 11,
                  caretColor: 'var(--gold)',
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
