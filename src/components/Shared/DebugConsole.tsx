import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBookStore } from '../../stores/useBookStore';
import type { DiceResultType } from '../../types';

export function DebugConsole() {
  const [open, setOpen] = useState(false);
  const [cmd, setCmd] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        setOpen((v) => { if (!v) setTimeout(() => ref.current?.focus(), 50); return !v; });
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const run = useCallback((input: string) => {
    const trimmed = input.trim().toLowerCase();
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
        leftPage: `— ${bookStore.pages.length * 2 + 3} —`,
        rightPage: `— ${bookStore.pages.length * 2 + 4} —`,
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
          { skill: '侦查', roll: '42', target: '60', type: 'success' as DiceResultType, time: Date.now() },
          { skill: '力量(对抗)', roll: '95', target: '50', type: 'crit-failure' as DiceResultType, time: Date.now() },
        ],
      };
      bookStore.appendPage(testPage);
      const updatedLen = useBookStore.getState().pages.length;
      useBookStore.getState().goToPage(updatedLen - 1);
      result = `已生成调试页面 (第 ${updatedLen} 页)`;
    } else if (trimmed === 'info') {
      const p = bookStore.pages[bookStore.pageIndex];
      result = `当前: 第${bookStore.pageIndex + 1}/${bookStore.pages.length}页 | "${p?.leftHeader}" | summary: ${p?.summary ? '有' : '无'} | dice: ${p?.diceResults?.length || 0}条`;
    } else if (trimmed === 'game') {
      document.dispatchEvent(new CustomEvent('debug-enter-game'));
      result = '进入游戏界面';
    } else if (trimmed === 'menu') {
      document.dispatchEvent(new CustomEvent('debug-return-menu'));
      result = '返回主菜单';
    } else if (trimmed === 'help') {
      result = '命令: home/first | last | goto N | test/dummy | info | game | menu | help | clear';
    } else if (trimmed === 'clear') {
      setLog([]);
      setCmd('');
      return;
    } else {
      result = `未知命令: ${trimmed} (输入 help 查看可用命令)`;
    }

    setLog((prev) => [...prev.slice(-9), `> ${input}\n${result}`]);
    setCmd('');
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: -200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -200, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: 480, maxWidth: '90vw', zIndex: 9990,
            background: 'rgba(10,8,6,0.95)', border: '1px solid rgba(196,168,85,0.3)',
            borderTop: 'none', borderRadius: '0 0 8px 8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            padding: '8px 12px',
            fontFamily: 'var(--font-mono)', fontSize: 11,
          }}
        >
          {log.length > 0 && (
            <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 6, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) transparent' }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: 'rgba(196,168,85,0.6)', whiteSpace: 'pre-wrap', padding: '2px 0', borderBottom: '1px solid rgba(196,168,85,0.06)' }}>{l}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: 'var(--gold)', fontSize: 10 }}>{'>'}</span>
            <input
              ref={ref}
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && cmd.trim()) run(cmd); if (e.key === 'Escape') setOpen(false); e.stopPropagation(); }}
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
  );
}
