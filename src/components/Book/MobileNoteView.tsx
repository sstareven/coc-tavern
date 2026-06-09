// src/components/Book/MobileNoteView.tsx
import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBookStore } from '../../stores/useBookStore';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { useStreamingPrintStore } from '../../stores/useStreamingPrintStore';
import { useReadingModeStore } from '../../stores/useReadingModeStore';
import { renderContentWithCodeBlocks } from '../Shared/CodeBlockRenderer';
import { beautifyText } from '../Shared/TextBeautifier';
import { InventoryChangesBar } from './RightPage';
import { PageBanner } from './PageBanner';
import { renderLpStreamingSegment, renderRpStreamingSegment } from './StreamingSegments';
import { resolveSwipe } from './swipe';
import { sfxPageFlip } from '../../audio/sfx';
import { triggerImageGenForPage } from '../../api/image-gen-trigger';
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
  const immersive = useReadingModeStore((s) => s.immersive);
  // 流式刻印订阅 — 主管线 onToken 把 walker events 喂给 useStreamingPrinter,
  // printer 按 40ms 节拍把字符 push 到这些 store 字段。
  const isStreamingPrint = useStreamingPrintStore((s) => s.isStreamingPrint);
  const streamingLeftHeader = useStreamingPrintStore((s) => s.leftHeaderText);
  const streamingLeftSegments = useStreamingPrintStore((s) => s.leftSegments);
  const streamingRightHeader = useStreamingPrintStore((s) => s.rightHeaderText);
  const streamingRightSegments = useStreamingPrintStore((s) => s.rightSegments);
  const streamingSummary = useStreamingPrintStore((s) => s.summarySegments);
  const streamingChoices = useStreamingPrintStore((s) => s.choices);
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
          key={isStreamingPrint ? 'streaming' : pageIndex}
          initial={{ opacity: 0, x: isStreamingPrint ? 0 : enterX }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: isStreamingPrint ? 0 : -enterX }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', minHeight: 0,
            margin: 4, padding: '14px 18px 12px', borderRadius: 8,
            background: 'linear-gradient(160deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
            color: 'var(--ink)', fontFamily: 'var(--font-body)', fontSize: 'calc(16.5px * var(--text-ratio, 1))', lineHeight: 1.8,
          }}
        >
          {/* 标题 + 骰子记录 —— 检定记录用 chip 徽章列展示,与标题视觉分层,不再像副标题下划线 */}
          <div style={{ flexShrink: 0, marginBottom: 12, borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.25)', paddingBottom: 8 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--text-ratio, 1))', color: 'var(--ink)', letterSpacing: 2, margin: 0 }}>
              {isStreamingPrint
                ? (streamingLeftHeader || page.leftHeader || '')
                : page.leftHeader}
            </h3>
            {/* 非流式时显示骰子记录;流式期间骰子数据未到位 */}
            {!isStreamingPrint && dice.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {dice.slice(0, 2).map((d, i) => {
                  const c = RESULT_COLORS[d.type] || RESULT_COLORS.failure;
                  return (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 10,
                      border: `1px solid ${c}55`, background: `${c}14`,
                      fontSize: 'calc(10px * var(--text-ratio, 1))',
                      fontFamily: 'var(--font-ui)', color: c, letterSpacing: 1,
                    }}>
                      {d.skill} · {RESULT_LABELS[d.type] || d.type}
                    </span>
                  );
                })}
              </div>
            )}
            {/* 小总结(剧情回顾) —— 流式期间用 streamingSummary 刻印,非流式用 page.summary */}
            {isStreamingPrint
              ? (streamingSummary.length > 0 && (
                  <p style={{ fontSize: 'calc(11px * var(--text-ratio, 1))', fontStyle: 'italic', color: 'var(--ink-subtle)', letterSpacing: 0.3, lineHeight: 1.6, margin: '8px 0 0', textIndent: '2em' }}>
                    {streamingSummary.map((seg, i) => renderLpStreamingSegment(seg, i))}
                  </p>
                ))
              : (page.summary && (
                  <p style={{ fontSize: 'calc(11px * var(--text-ratio, 1))', fontStyle: 'italic', color: 'var(--ink-subtle)', letterSpacing: 0.3, lineHeight: 1.6, margin: '8px 0 0', textIndent: '2em' }}>
                    {page.summary}
                  </p>
                ))}
          </div>
          {/* 叙事卷轴 — 流式分支用 streamingSegments,非流式用 page.leftContent。
              PageBanner 放在卷轴内首位,跟随正文一起滚动(沉浸模式时整体不渲染插画)。 */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4, WebkitOverflowScrolling: 'touch' }}>
            {/* 片头插画 — 流式期间数据未到位不渲染;沉浸模式藏起来让出阅读空间 */}
            {!isStreamingPrint && !immersive && (page.imageUrl || page.imageGenStatus === 'pending' || page.imageGenStatus === 'failed') && (
              <PageBanner
                src={page.imageUrl}
                pageId={page.id}
                imageAt={page.imageGenAt}
                alt={page.leftHeader}
                status={page.imageGenStatus}
                onRegenerate={() => { void triggerImageGenForPage({ pageIdx: pageIndex, source: 'manual' }); }}
              />
            )}

            {isStreamingPrint ? (
              <>
                <p style={{ textIndent: '2em', marginBottom: 14, whiteSpace: 'pre-wrap' }}>
                  {streamingLeftSegments.map((seg, i) => renderLpStreamingSegment(seg, i))}
                </p>
                {(streamingRightHeader || streamingRightSegments.length > 0) && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 14px' }}>
                      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(var(--ink-faded-rgb),0.4))' }} />
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(13px * var(--text-ratio, 1))', color: 'var(--blood)', letterSpacing: 4, whiteSpace: 'nowrap' }}>抉择时刻</span>
                      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, rgba(var(--ink-faded-rgb),0.4))' }} />
                    </div>
                    <p style={{ textIndent: '2em', marginBottom: 14, whiteSpace: 'pre-wrap' }}>
                      {streamingRightSegments.map((seg, i) => renderRpStreamingSegment(seg, i))}
                    </p>
                    {streamingChoices.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                        {streamingChoices.map((c, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px',
                            border: '1px solid rgba(var(--ink-faded-rgb),0.35)', borderRadius: 4,
                            background: 'rgba(196,168,85,0.06)', color: 'var(--ink-subtle)',
                            fontFamily: 'var(--font-body)', fontSize: 'calc(14px * var(--text-ratio, 1))',
                            opacity: 0.85,
                          }}>
                            <span style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 'calc(13px * var(--text-ratio, 1))', minWidth: 24 }}>{c.num}</span>
                            <span style={{ flex: 1 }}>
                              {(c.textSegments ?? []).map((seg, j) => renderRpStreamingSegment(seg, j))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {/* 物品获取提示（手机端不可点，仅展示，防误触） */}
                <InventoryChangesBar inventoryChanges={page.inventoryChanges ?? []} interactive={false} />
                {rendered.length === 1 && typeof rendered[0] === 'string'
                  ? <p style={{ textIndent: '2em', marginBottom: 14, whiteSpace: 'pre-wrap' }}>{beautifyText(rendered[0])}</p>
                  : rendered.map((node, i) => typeof node === 'string'
                      ? <p key={i} style={{ textIndent: '2em', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{beautifyText(node)}</p>
                      : <span key={i}>{node}</span>)}
                {renderedRight && (
                  <>
                    {/* 抉择时刻 —— 左右页正文分割线（仅手机端） */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 14px' }}>
                      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(var(--ink-faded-rgb),0.4))' }} />
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(13px * var(--text-ratio, 1))', color: 'var(--blood)', letterSpacing: 4, whiteSpace: 'nowrap' }}>抉择时刻</span>
                      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, rgba(var(--ink-faded-rgb),0.4))' }} />
                    </div>
                    {renderedRight.length === 1 && typeof renderedRight[0] === 'string'
                      ? <p style={{ textIndent: '2em', marginBottom: 14, whiteSpace: 'pre-wrap' }}>{beautifyText(renderedRight[0])}</p>
                      : renderedRight.map((node, i) => typeof node === 'string'
                          ? <p key={`r${i}`} style={{ textIndent: '2em', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{beautifyText(node)}</p>
                          : <span key={`r${i}`}>{node}</span>)}
                  </>
                )}
                {page.rewrite?.text && (
                  <>
                    {/* 行动补写过渡叙述 —— 移动端置于卷轴最底部，单独成段，不混入右页正文 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 14px' }}>
                      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(var(--ink-faded-rgb),0.4))' }} />
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(13px * var(--text-ratio, 1))', color: 'var(--gold)', letterSpacing: 4, whiteSpace: 'nowrap' }}>奇思妙想</span>
                      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, rgba(var(--ink-faded-rgb),0.4))' }} />
                    </div>
                    <p style={{ textIndent: '2em', marginBottom: 14, fontStyle: 'italic', color: 'var(--ink-subtle)', whiteSpace: 'pre-wrap' }}>{beautifyText(page.rewrite.text)}</p>
                  </>
                )}
              </>
            )}
          </div>
          {!isStreamingPrint && page.leftPage && (
            <div style={{ textAlign: 'center', fontSize: 'calc(12px * var(--text-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', letterSpacing: 3, paddingTop: 8, borderTop: '1px solid rgba(var(--ink-faded-rgb),0.15)', flexShrink: 0 }}>{page.leftPage}</div>
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
          fontSize: 'calc(9.5px * var(--text-ratio, 1))', letterSpacing: 1.5, whiteSpace: 'nowrap',
          color: 'rgba(196,168,85,0.7)', fontFamily: 'var(--font-ui)',
        }}
      >
        ‹ 左右滑动翻页 ›
      </motion.div>
    </div>
  );
}
