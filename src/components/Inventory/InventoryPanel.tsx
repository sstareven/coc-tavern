import { useState } from 'react';
import { motion } from 'framer-motion';
import { useInventoryStore, CATEGORY_LABELS } from '../../stores/useInventoryStore';
import { useClueStore } from '../../stores/useClueStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobilePageToggle, type Side } from '../Book/MobilePageToggle';
import { IconClue } from '../Layout/TabIcons';
import type { InventoryItem, ItemCategory, Clue } from '../../types';

type Filter = 'all' | ItemCategory;

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'weapon', label: '武器' },
  { key: 'tool', label: '工具' },
  { key: 'consumable', label: '消耗品' },
  { key: 'key_item', label: '关键' },
  { key: 'misc', label: '杂物' },
];

function ItemRow({ item }: { item: InventoryItem }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="cv-row" style={{ borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.1)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', cursor: 'pointer', transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--ink-faded-rgb),0.06)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontFamily: 'var(--font-body)', color: item.isKeyItem ? '#8b6914' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.isKeyItem && <span style={{ marginRight: 3, fontSize: 9 }}>★</span>}
          {item.name}
        </span>
        {item.quantity > 1 && (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)', flexShrink: 0 }}>×{item.quantity}</span>
        )}
        <span style={{ width: 44, flexShrink: 0, fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)', textAlign: 'center' }}>
          {CATEGORY_LABELS[item.category]}
        </span>
        <span style={{ width: 12, flexShrink: 0, fontSize: 10, color: 'var(--ink-faded)', textAlign: 'center', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)', display: 'inline-block' }}>▸</span>
      </div>
      <div style={{ overflow: 'hidden', maxHeight: expanded ? 200 : 0, opacity: expanded ? 1 : 0, transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease' }}>
        <div style={{ padding: '2px 0 10px 6px', fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink-subtle)', lineHeight: 1.7, fontStyle: 'italic' }}>
          {item.description || '（无描述）'}
        </div>
      </div>
    </div>
  );
}

function ClueRow({ clue, archived = false, evolvedIntoName }: { clue: Clue; archived?: boolean; evolvedIntoName?: string }) {
  const [expanded, setExpanded] = useState(false);
  const major = clue.tier === 'major';
  return (
    <div className="cv-row" style={{ borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.1)', opacity: archived ? 0.55 : 1 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '8px 0', cursor: 'pointer', transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--ink-faded-rgb),0.06)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ flexShrink: 0, marginTop: 1, color: major ? 'var(--gold-bright)' : 'var(--gold)', display: 'inline-flex' }}>
          {major ? <span style={{ fontSize: 13 }}>★</span> : <IconClue size={14} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--ink)', letterSpacing: 1, fontWeight: major ? 700 : 400 }}>{clue.name}</div>
          {evolvedIntoName && (
            <div style={{ fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)', fontStyle: 'italic', marginTop: 1 }}>→ 已演化为 {evolvedIntoName}</div>
          )}
          {clue.summary && (
            <div style={{ fontSize: 11, fontFamily: 'var(--font-body)', color: 'var(--ink-subtle)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap' }}>{clue.summary}</div>
          )}
        </div>
        <span style={{ width: 12, flexShrink: 0, fontSize: 10, color: 'var(--ink-faded)', textAlign: 'center', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)', display: 'inline-block', marginTop: 2 }}>▸</span>
      </div>
      <div style={{ overflow: 'hidden', maxHeight: expanded ? 400 : 0, opacity: expanded ? 1 : 0, transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease' }}>
        <div style={{ padding: '0 0 12px 22px', fontSize: 12.5, fontFamily: 'var(--font-body)', color: 'var(--ink)', lineHeight: 1.75 }}>
          {clue.discoveryNarrative || '（暂无更多发现细节）'}
          {clue.relatedTo && clue.relatedTo.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {clue.relatedTo.map((r, i) => (
                <span key={i} style={{ fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--gold)', padding: '1px 7px', borderRadius: 8, border: '1px solid rgba(196,168,85,0.35)', background: 'rgba(196,168,85,0.08)' }}>{r}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function InventoryOverlay() {
  const items = useInventoryStore((s) => s.items);
  const clues = useClueStore((s) => s.clues);
  const [filter, setFilter] = useState<Filter>('all');
  const isMobile = useIsMobile();
  const [side, setSide] = useState<Side>('left');

  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter);

  const [showArchived, setShowArchived] = useState(false);
  const activeClues = clues.filter((c) => c.status !== 'archived');
  const archivedClues = clues.filter((c) => c.status === 'archived');
  const clueNameById = (id?: string) => (id ? clues.find((c) => c.id === id)?.name : undefined);

  return (
    <motion.div
      initial="enter" animate="visible" exit="exit"
      variants={{ enter: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: isMobile ? 'column' : 'row', borderRadius: 4 }}
    >
      {isMobile && <MobilePageToggle left="物品" right="线索" side={side} onSide={setSide} />}

      {/* Left page — 随身物品 */}
      <motion.div style={{
        flex: '1 1 0', display: isMobile && side !== 'left' ? 'none' : 'flex', flexDirection: 'column',
        background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
        borderRadius: '3px 0 0 3px', boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.04)',
        padding: '28px 20px 20px 28px', overflow: 'hidden',
      }}>
        <div style={{ borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.25)', paddingBottom: 8, marginBottom: 8 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 4, margin: 0 }}>随身物品</h3>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-faded)', letterSpacing: 2 }}>CARRIED ITEMS</span>
        </div>

        {/* Category filter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, paddingBottom: 6, borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.1)', marginBottom: 2 }}>
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.key;
            const count = tab.key === 'all' ? items.length : items.filter((i) => i.category === tab.key).length;
            return (
              <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
                padding: '1px 6px', fontSize: 10, fontFamily: 'var(--font-ui)', letterSpacing: 0.5, border: '1px solid',
                borderColor: active ? 'rgba(var(--ink-faded-rgb),0.35)' : 'rgba(var(--ink-faded-rgb),0.12)', borderRadius: 2,
                background: active ? 'rgba(var(--ink-faded-rgb),0.08)' : 'transparent', color: active ? 'var(--ink)' : 'var(--ink-subtle)',
                cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
              }}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = 'rgba(var(--ink-faded-rgb),0.3)'; e.currentTarget.style.color = 'var(--ink)'; } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = 'rgba(var(--ink-faded-rgb),0.12)'; e.currentTarget.style.color = 'var(--ink-subtle)'; } }}
              >{tab.label}{count > 0 ? ` ${count}` : ''}</button>
            );
          })}
        </div>

        <div className="inv-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.06)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink-faded)', fontStyle: 'italic' }}>
              {items.length === 0 ? '身上空空如也……' : '该分类下无物品'}
            </div>
          ) : (
            filtered.map((item) => <ItemRow key={item.id} item={item} />)
          )}
        </div>

        <div style={{ borderTop: '1px solid rgba(var(--ink-faded-rgb),0.15)', paddingTop: 8, marginTop: 6, fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)', letterSpacing: 2 }}>
          随身 {items.length} 件
        </div>
      </motion.div>

      {/* Spine */}
      <div style={{ width: 2, flexShrink: 0, display: isMobile ? 'none' : 'block', background: 'linear-gradient(to right, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.03) 50%, rgba(0,0,0,0.06) 100%)' }} />

      {/* Right page — 线索 */}
      <motion.div
        variants={isMobile ? undefined : { exit: { rotateY: -180 } }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        style={{
          flex: '1 1 0', display: isMobile && side !== 'right' ? 'none' : 'flex', flexDirection: 'column',
          background: 'linear-gradient(225deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
          borderRadius: '0 3px 3px 0', boxShadow: 'inset 1px 0 2px rgba(0,0,0,0.04)',
          padding: '28px 28px 20px 20px', transformOrigin: '0% 50%', backfaceVisibility: 'hidden', overflow: 'hidden',
        }}>
        <div style={{ borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.25)', paddingBottom: 8, marginBottom: 8 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 4, margin: 0 }}>线索</h3>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-faded)', letterSpacing: 2 }}>CLUES</span>
        </div>

        <div className="inv-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.06)' }}>
          {activeClues.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink-faded)', fontStyle: 'italic' }}>
              尚未发现任何线索……
            </div>
          ) : (
            activeClues.map((clue) => <ClueRow key={clue.id} clue={clue} />)
          )}

          {archivedClues.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div
                onClick={() => setShowArchived((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 0', fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)', letterSpacing: 1, borderTop: '1px dashed rgba(var(--ink-faded-rgb),0.2)' }}
              >
                <span style={{ transform: showArchived ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)', display: 'inline-block' }}>▸</span>
                已演化 · 历史线索 ({archivedClues.length})
              </div>
              <div style={{ overflow: 'hidden', maxHeight: showArchived ? 2000 : 0, opacity: showArchived ? 1 : 0, transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease' }}>
                {archivedClues.map((clue) => (
                  <ClueRow key={clue.id} clue={clue} archived evolvedIntoName={clueNameById(clue.evolvedIntoId)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid rgba(var(--ink-faded-rgb),0.15)', paddingTop: 8, marginTop: 6, fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)', letterSpacing: 2 }}>
          线索 {activeClues.length} 条{archivedClues.length > 0 ? ` · 历史 ${archivedClues.length}` : ''}
        </div>
      </motion.div>
    </motion.div>
  );
}
