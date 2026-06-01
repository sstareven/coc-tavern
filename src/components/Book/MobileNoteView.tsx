// src/components/Book/MobileNoteView.tsx
import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBookStore } from '../../stores/useBookStore';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { renderContentWithCodeBlocks } from '../Shared/CodeBlockRenderer';
import { beautifyText } from '../Shared/TextBeautifier';
import { InventoryChangesBar } from './RightPage';
import { resolveSwipe } from './swipe';
import { sfxPageFlip } from '../../audio/sfx';
import type { DiceRecord } from '../../types';

const RESULT_COLORS: Record<string, string> = {
  'crit-success': '#e8c84a', 'extreme-success': '#5a8a4a', 'hard-success': '#5a8a4a',
  'success': '#6b7a4a', 'failure': '#8b6040', 'crit-failure': '#d45050',
};
const RESULT_LABELS: Record<string, string> = {
  'crit-success': '大成功', 'extreme-success': '极难成功', 'hard-success': '困难成功',
  'success': '成功', 'failure': '失败', 'crit-failure': '大失败',
};

export function MobileNoteView() {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const direction = useBookStore((s) => s.flipDirection);
  const nextPage = useBookStore((s) => s.nextPage);
  const prevPage = useBookStore((s) => s.prevPage);
  const thRender = useTavernHelperStore((s) => s.render);
  const pt = useTavernHelperStore((s) => s.promptTemplate);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const page = pages[pageIndex];
  if (!page) return null;

  const canGoNext = pageIndex < pages.length - 1;
  const canGoPrev = pageIndex > 0;

  // 手机端即时翻页（不走桌面 1500ms 的 3D 翻转），配合快速横滑动画——手一滑就翻。
  const goNext = () => {
    if (!canGoNext) return;
    useBookStore.setState({ flipDirection: 'forward' });
    nextPage();
    try { sfxPageFlip(); } catch { /* audio not available */ }
  };
  const goPrev = () => {
    if (!canGoPrev) return;
    useBookStore.setState({ flipDirection: 'backward' });
    prevPage();
    try { sfxPageFlip(); } catch { /* audio not available */ }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    // 更低阈值 = 手一滑就翻
    const dir = resolveSwipe(dx, dy, { threshold: 36 });
    if (dir === 'left') goNext();
    else if (dir === 'right') goPrev();
  };

  const effectiveRender = pt.enabled ? pt.renderEnabled : true;
  const renderOpts = {
    enabled: thRender.renderEnabled, collapse: thRender.codeCollapse,
    noHighlight: thRender.disableCodeHighlight, codeBlocks: pt.enabled ? pt.codeBlocksEnabled : true,
  };
  const rendered = effectiveRender
    ? renderContentWithCodeBlocks(page.leftContent, renderOpts)
    : [page.leftContent];

  // 手机端把右页（抉择时刻）正文并入同一张便条，跟在左页叙事之后。
  const rightText = (page.rightContent ?? '').trim();
  const renderedRight = rightText
    ? (effectiveRender ? renderContentWithCodeBlocks(page.rightContent, renderOpts) : [page.rightContent])
    : null;

  const dice: DiceRecord[] = page.diceResults ?? [];
  const enterX = direction === 'forward' ? 60 : -60;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={pageIndex}
          initial={{ opacity: 0, x: enterX }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -enterX }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', minHeight: 0,
            margin: 10, padding: '16px 16px 12px', borderRadius: 8,
            background: 'linear-gradient(160deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
            color: 'var(--ink)', fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.75,
          }}
        >
          {/* 标题 + 骰子记录 */}
          <div style={{ flexShrink: 0, marginBottom: 10, borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.25)', paddingBottom: 8 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 3, margin: 0 }}>{page.leftHeader}</h3>
            {dice.slice(0, 2).map((d, i) => {
              const c = RESULT_COLORS[d.type] || RESULT_COLORS.failure;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${c}55)` }} />
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-ui)', color: c, letterSpacing: 1.5, whiteSpace: 'nowrap' }}>
                    {d.skill} {RESULT_LABELS[d.type] || d.type}
                  </span>
                  <div style={{ flex: 1, height: 1, background: `linear-gradient(to left, transparent, ${c}55)` }} />
                </div>
              );
            })}
            {/* 小总结（剧情回顾）—— 与检定结果一起冻结在顶部 */}
            {page.summary && (
              <p style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--ink-subtle)', letterSpacing: 0.3, lineHeight: 1.6, margin: '8px 0 0', textIndent: '2em' }}>
                {page.summary}
              </p>
            )}
          </div>
          {/* 叙事卷轴 */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4, WebkitOverflowScrolling: 'touch' }}>
            {/* 物品获取提示（手机端不可点，仅展示，防误触） */}
            <InventoryChangesBar inventoryChanges={page.inventoryChanges ?? []} interactive={false} />
            {rendered.length === 1 && typeof rendered[0] === 'string'
              ? <p style={{ textIndent: '2em', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{beautifyText(rendered[0])}</p>
              : rendered.map((node, i) => typeof node === 'string'
                  ? <p key={i} style={{ textIndent: '2em', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{beautifyText(node)}</p>
                  : <span key={i}>{node}</span>)}
            {renderedRight && (
              <>
                {/* 抉择时刻 —— 左右页正文分割线（仅手机端） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 14px' }}>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(var(--ink-faded-rgb),0.4))' }} />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--blood)', letterSpacing: 4, whiteSpace: 'nowrap' }}>抉择时刻</span>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, rgba(var(--ink-faded-rgb),0.4))' }} />
                </div>
                {renderedRight.length === 1 && typeof renderedRight[0] === 'string'
                  ? <p style={{ textIndent: '2em', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{beautifyText(renderedRight[0])}</p>
                  : renderedRight.map((node, i) => typeof node === 'string'
                      ? <p key={`r${i}`} style={{ textIndent: '2em', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{beautifyText(node)}</p>
                      : <span key={`r${i}`}>{node}</span>)}
              </>
            )}
            {page.rewrite?.text && (
              <>
                {/* 行动补写过渡叙述 —— 移动端置于卷轴最底部，单独成段，不混入右页正文 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 14px' }}>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(var(--ink-faded-rgb),0.4))' }} />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--gold)', letterSpacing: 4, whiteSpace: 'nowrap' }}>奇思妙想</span>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, rgba(var(--ink-faded-rgb),0.4))' }} />
                </div>
                <p style={{ textIndent: '2em', marginBottom: 12, fontStyle: 'italic', color: 'var(--ink-subtle)', whiteSpace: 'pre-wrap' }}>{beautifyText(page.rewrite.text)}</p>
              </>
            )}
          </div>
          {page.leftPage && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', letterSpacing: 3, paddingTop: 8, borderTop: '1px solid rgba(var(--ink-faded-rgb),0.15)', flexShrink: 0 }}>{page.leftPage}</div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 左上角翻页提示（小字，稍后淡隐）——靠左右滑动/拖动翻页 */}
      <motion.div
        initial={{ opacity: 0.75 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 1.8, duration: 1.4, ease: [0.4, 0, 0.2, 1] }}
        style={{
          position: 'absolute', top: 0, left: 16, zIndex: 6, pointerEvents: 'none',
          fontSize: 9.5, letterSpacing: 1.5, whiteSpace: 'nowrap',
          color: 'rgba(196,168,85,0.7)', fontFamily: 'var(--font-ui)',
        }}
      >
        ‹ 左右滑动翻页 ›
      </motion.div>
    </div>
  );
}
