import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useInventoryStore, CATEGORY_LABELS } from '../../stores/useInventoryStore';
import type { InventoryItem, ItemCategory } from '../../types';

type Filter = 'all' | ItemCategory;

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'weapon', label: '武器' },
  { key: 'tool', label: '工具' },
  { key: 'consumable', label: '消耗品' },
  { key: 'clue', label: '线索' },
  { key: 'key_item', label: '关键' },
  { key: 'misc', label: '杂物' },
];

function ItemRow({ item, onEquipToggle }: { item: InventoryItem; onEquipToggle: (name: string, equip: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ borderBottom: '1px solid rgba(107,90,58,0.1)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 0', cursor: 'pointer',
          transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(107,90,58,0.06)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{
          flex: 1, minWidth: 0, fontSize: 13, fontFamily: 'var(--font-body)',
          color: item.isKeyItem ? '#8b6914' : 'var(--ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.isKeyItem && <span style={{ marginRight: 3, fontSize: 9 }}>★</span>}
          {item.name}
        </span>

        {item.quantity > 1 && (
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)',
            flexShrink: 0,
          }}>
            ×{item.quantity}
          </span>
        )}

        <span style={{
          width: 40, flexShrink: 0, fontSize: 10, fontFamily: 'var(--font-ui)',
          color: 'var(--ink-subtle)', textAlign: 'center',
        }}>
          {CATEGORY_LABELS[item.category]}
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); onEquipToggle(item.name, !item.equipped); }}
          style={{
            flexShrink: 0, padding: '1px 5px', fontSize: 9, fontFamily: 'var(--font-ui)',
            border: '1px solid rgba(107,90,58,0.18)', borderRadius: 2,
            background: 'transparent', color: 'var(--ink-subtle)', cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--ink)';
            e.currentTarget.style.color = 'var(--ink)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(107,90,58,0.18)';
            e.currentTarget.style.color = 'var(--ink-subtle)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.95)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
        >
          {item.equipped ? '卸下' : '装备'}
        </button>

        <span style={{
          width: 12, flexShrink: 0, fontSize: 10,
          color: 'var(--ink-faded)', textAlign: 'center',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)',
          display: 'inline-block',
        }}>
          ▸
        </span>
      </div>

      <div style={{
        overflow: 'hidden',
        maxHeight: expanded ? '200px' : '0px',
        opacity: expanded ? 1 : 0,
        transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
      }}>
        <div style={{
          padding: '2px 0 10px 18px',
          fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink-subtle)',
          lineHeight: 1.7, fontStyle: 'italic',
        }}>
          {item.description || '（无描述）'}
        </div>
      </div>
    </div>
  );
}

export function InventoryOverlay() {
  const items = useInventoryStore((s) => s.items);
  const equipItem = useInventoryStore((s) => s.equipItem);
  const unequipItem = useInventoryStore((s) => s.unequipItem);

  const [filter, setFilter] = useState<Filter>('all');

  const equipped = items.filter((i) => i.equipped);
  const bagItems = items.filter((i) => !i.equipped);
  const filtered = filter === 'all' ? bagItems : bagItems.filter((i) => i.category === filter);

  const handleEquipToggle = useCallback((name: string, equip: boolean) => {
    if (equip) equipItem(name);
    else unequipItem(name);
  }, [equipItem, unequipItem]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ rotateY: -180 }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: 'absolute', inset: 0, zIndex: 10,
        display: 'flex', borderRadius: 4, overflow: 'hidden',
        transformOrigin: '0% 50%',
        backfaceVisibility: 'hidden',
      }}
    >
      {/* Left page — Equipment */}
      <div style={{
        flex: '1 1 0', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
        borderRadius: '3px 0 0 3px',
        boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.04)',
        padding: '28px 20px 20px 28px',
      }}>
        <div style={{ borderBottom: '1px solid rgba(107,90,58,0.25)', paddingBottom: 8, marginBottom: 12 }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: 18,
            color: 'var(--ink)', letterSpacing: 4, margin: 0,
          }}>
            装备中
          </h3>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 8,
            color: 'var(--ink-faded)', letterSpacing: 2,
          }}>
            EQUIPPED
          </span>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          paddingBottom: 5,
          borderBottom: '1px solid rgba(107,90,58,0.1)',
          marginBottom: 2,
        }}>
          <span style={{ flex: 1, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(107,90,58,0.4)', letterSpacing: 1 }}>
            名称
          </span>
          <span style={{ width: 40, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(107,90,58,0.4)', textAlign: 'center', letterSpacing: 1 }}>
            类型
          </span>
          <span style={{ width: 34 }} />
          <span style={{ width: 12 }} />
        </div>

        <div className="inv-scroll" style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.06)',
        }}>
          {equipped.length === 0 ? (
            <div style={{
              padding: '48px 0', textAlign: 'center',
              fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink-faded)',
              fontStyle: 'italic',
            }}>
              未装备任何物品
            </div>
          ) : (
            equipped.map((item) => (
              <ItemRow key={item.id} item={item} onEquipToggle={handleEquipToggle} />
            ))
          )}
        </div>

        <div style={{
          borderTop: '1px solid rgba(107,90,58,0.15)',
          paddingTop: 8, marginTop: 6,
          fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)', letterSpacing: 2,
        }}>
          装备 {equipped.length} 件
        </div>
      </div>

      {/* Spine */}
      <div style={{
        width: 2, flexShrink: 0,
        background: 'linear-gradient(to right, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.03) 50%, rgba(0,0,0,0.06) 100%)',
      }} />

      {/* Right page — Inventory */}
      <div style={{
        flex: '1 1 0', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(225deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
        borderRadius: '0 3px 3px 0',
        boxShadow: 'inset 1px 0 2px rgba(0,0,0,0.04)',
        padding: '28px 28px 20px 20px',
      }}>
        <div style={{ borderBottom: '1px solid rgba(107,90,58,0.25)', paddingBottom: 8, marginBottom: 8 }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: 18,
            color: 'var(--ink)', letterSpacing: 4, margin: 0,
          }}>
            物品栏
          </h3>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 8,
            color: 'var(--ink-faded)', letterSpacing: 2,
          }}>
            ITEMS
          </span>
        </div>

        {/* Category filter */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 3,
          paddingBottom: 6,
          borderBottom: '1px solid rgba(107,90,58,0.1)',
          marginBottom: 2,
        }}>
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.key;
            const count = tab.key === 'all'
              ? bagItems.length
              : bagItems.filter((i) => i.category === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                style={{
                  padding: '1px 6px', fontSize: 10, fontFamily: 'var(--font-ui)',
                  letterSpacing: 0.5, border: '1px solid',
                  borderColor: active ? 'rgba(107,90,58,0.35)' : 'rgba(107,90,58,0.12)',
                  borderRadius: 2,
                  background: active ? 'rgba(107,90,58,0.08)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--ink-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.borderColor = 'rgba(107,90,58,0.3)';
                    e.currentTarget.style.color = 'var(--ink)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.borderColor = 'rgba(107,90,58,0.12)';
                    e.currentTarget.style.color = 'var(--ink-subtle)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
                onMouseDown={(e) => { if (!active) e.currentTarget.style.transform = 'scale(0.95)'; }}
                onMouseUp={(e) => { if (!active) e.currentTarget.style.transform = 'scale(1.05)'; }}
              >
                {tab.label}{count > 0 ? ` ${count}` : ''}
              </button>
            );
          })}
        </div>

        {/* Column header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          paddingBottom: 5,
          borderBottom: '1px solid rgba(107,90,58,0.1)',
          marginBottom: 2,
        }}>
          <span style={{ flex: 1, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(107,90,58,0.4)', letterSpacing: 1 }}>
            名称
          </span>
          <span style={{ width: 24, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(107,90,58,0.4)', textAlign: 'center', letterSpacing: 1 }}>
            数量
          </span>
          <span style={{ width: 40, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(107,90,58,0.4)', textAlign: 'center', letterSpacing: 1 }}>
            类型
          </span>
          <span style={{ width: 34 }} />
          <span style={{ width: 12 }} />
        </div>

        <div className="inv-scroll" style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.06)',
        }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: '48px 0', textAlign: 'center',
              fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink-faded)',
              fontStyle: 'italic',
            }}>
              {items.length === 0 ? '背包空空如也……' : '该分类下无物品'}
            </div>
          ) : (
            filtered.map((item) => (
              <ItemRow key={item.id} item={item} onEquipToggle={handleEquipToggle} />
            ))
          )}
        </div>

        <div style={{
          borderTop: '1px solid rgba(107,90,58,0.15)',
          paddingTop: 8, marginTop: 6,
          display: 'flex', justifyContent: 'space-between',
          fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)', letterSpacing: 2,
        }}>
          <span>共 {items.length} 件</span>
          <span>背包 {bagItems.length} 件</span>
        </div>
      </div>
    </motion.div>
  );
}
