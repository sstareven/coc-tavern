// src/components/Book/ActionSheet.tsx
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBookStore } from '../../stores/useBookStore';
import { ChoiceButton } from './RightPage';
import type { ChoiceItem } from '../../types';

const SCROLL_CUE_THRESHOLD = 5; // ≥5 项才显示下隐暗示

export function ActionSheet() {
  const pages = useBookStore((s) => s.pages);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const page = pages[pageIndex];
  const choices: ChoiceItem[] = page?.rightChoices ?? [];
  const rewriteChoices: ChoiceItem[] = page?.rewrite?.choices ?? [];
  const allChoices = [...choices, ...rewriteChoices];

  // 翻页后自动收起抽屉、复位滚动暗示
  useEffect(() => { setOpen(false); setScrolled(false); }, [pageIndex]);

  if (!page || allChoices.length === 0) return null;

  const showCue = allChoices.length >= SCROLL_CUE_THRESHOLD && !scrolled;

  return (
    <>
      {/* 叙事变暗遮罩 */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            onClick={() => setOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 8 }}
          />
        )}
      </AnimatePresence>

      {/* 入口条（收起态） */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            flexShrink: 0, margin: '0 10px 8px', padding: '10px',
            borderRadius: 8, border: 'none',
            background: 'linear-gradient(180deg, #c4a855, #a8893f)',
            color: '#1a1410', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'calc(16px * var(--text-ratio, 1))', letterSpacing: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: '0 3px 9px rgba(0,0,0,0.4)', cursor: 'pointer',
            transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1), filter 0.2s cubic-bezier(0.4,0,0.2,1)',
          }}
          onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; e.currentTarget.style.filter = 'brightness(1.08)'; }}
          onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'none'; }}
        >
          <span>⚜ 选择行动</span>
          <span style={{ opacity: 0.7 }}>({allChoices.length}) ▲</span>
        </button>
      )}

      {/* 抽屉（展开态） */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 9,
              margin: '0 8px 8px', padding: '9px 9px 5px',
              background: 'rgba(13,10,7,0.95)', border: '1px solid var(--gold)',
              borderRadius: '12px 12px 8px 8px', boxShadow: '0 -10px 26px rgba(0,0,0,0.6)',
            }}
          >
            {/* grip */}
            <div onClick={() => setOpen(false)}
              style={{ width: 36, height: 4, background: 'var(--ink-subtle)', borderRadius: 3, margin: '0 auto 8px', cursor: 'pointer', transition: 'var(--transition-smooth)' }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.4)'; e.currentTarget.style.transform = 'scaleX(1.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'scaleX(1)'; }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scaleX(1.15) scaleY(0.8)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scaleX(1.15)'; }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7,
              fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--text-ratio, 1))', letterSpacing: 1, color: 'var(--gold)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(15px * var(--text-ratio, 1))', letterSpacing: 3 }}>选择行动</span>
              <span
                style={{ color: 'var(--ink-subtle)', cursor: 'pointer', transition: 'var(--transition-smooth)', display: 'inline-block' }}
                onClick={() => setOpen(false)}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >收起 ▼</span>
            </div>

            <div style={{ position: 'relative' }}>
              <div
                ref={scrollRef}
                onScroll={(e) => { if (e.currentTarget.scrollTop > 4) setScrolled(true); }}
                style={{ maxHeight: '42vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: showCue ? 28 : 0, WebkitOverflowScrolling: 'touch' }}
              >
                {allChoices.map((ch) => <ChoiceButton key={`${ch.num}-${ch.text}`} choice={ch} variant="dark" />)}
              </div>

              {/* 下隐滚动暗示：渐隐遮罩 + 下弹箭头 */}
              {showCue && (
                <>
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 46, pointerEvents: 'none',
                    background: 'linear-gradient(180deg, rgba(13,10,7,0), rgba(13,10,7,0.96))' }} />
                  <div style={{ position: 'absolute', left: '50%', bottom: 4, transform: 'translateX(-50%)',
                    color: 'var(--gold)', fontSize: 'calc(14px * var(--text-ratio, 1))', pointerEvents: 'none', animation: 'asBob 1.3s ease-in-out infinite' }}>⌄</div>
                </>
              )}
            </div>
            <style>{`@keyframes asBob{0%,100%{transform:translateX(-50%) translateY(0);opacity:.5}50%{transform:translateX(-50%) translateY(4px);opacity:1}}`}</style>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
