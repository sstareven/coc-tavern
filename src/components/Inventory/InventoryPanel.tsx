import { useState, useEffect, useCallback } from 'react';
import { useInventoryStore, CATEGORY_LABELS } from '../../stores/useInventoryStore';
import type { InventoryItem, ItemCategory } from '../../types';
import { closeBtnStyle } from '../../styles/panelStyles';

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
    <div style={{ borderBottom: '1px solid rgba(196,168,85,0.06)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', cursor: 'pointer',
          transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.04)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Name */}
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'var(--font-body)',
          color: item.isKeyItem ? 'var(--gold)' : 'var(--text-light)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.isKeyItem && <span style={{ marginRight: 4, fontSize: 9, color: 'var(--gold)' }}>★</span>}
          {item.name}
        </span>

        {/* Quantity */}
        {!item.equipped && item.quantity > 1 && (
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--brass)',
            background: 'rgba(196,168,85,0.08)', padding: '1px 5px', borderRadius: 3,
            flexShrink: 0,
          }}>
            x{item.quantity}
          </span>
        )}

        {/* Category */}
        <span style={{
          width: 48, flexShrink: 0, fontSize: 10, fontFamily: 'var(--font-ui)',
          color: 'var(--ink-subtle)', textAlign: 'center',
        }}>
          {CATEGORY_LABELS[item.category]}
        </span>

        {/* Equip/Unequip button */}
        <button
          onClick={(e) => { e.stopPropagation(); onEquipToggle(item.name, !item.equipped); }}
          style={{
            flexShrink: 0, padding: '2px 6px', fontSize: 9, fontFamily: 'var(--font-ui)',
            border: '1px solid rgba(196,168,85,0.15)', borderRadius: 2,
            background: 'transparent', color: 'var(--ink-subtle)', cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.color = 'var(--gold)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(196,168,85,0.15)'; e.currentTarget.style.color = 'var(--ink-subtle)'; }}
        >
          {item.equipped ? '卸下' : '装备'}
        </button>

        {/* Expand arrow */}
        <span style={{
          width: 16, flexShrink: 0, fontSize: 10, fontFamily: 'var(--font-mono)',
          color: 'var(--brass)', textAlign: 'center',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)',
        }}>
          ▸
        </span>
      </div>

      {/* Expanded description */}
      <div style={{
        overflow: 'hidden',
        maxHeight: expanded ? '200px' : '0px',
        opacity: expanded ? 1 : 0,
        transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
      }}>
        <div style={{
          padding: '4px 10px 10px 32px',
          fontSize: 11, fontFamily: 'var(--font-body)', color: 'var(--ink-subtle)',
          lineHeight: 1.7, fontStyle: 'italic',
        }}>
          {item.description || '(无描述)'}
        </div>
      </div>
    </div>
  );
}

export function InventoryPanel() {
  const isOpen = useInventoryStore((s) => s.isOpen);
  const close = useInventoryStore((s) => s.close);
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

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  }, [close]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, handleEsc]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 700,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Slide-out panel */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 500, maxWidth: '94vw', zIndex: 750,
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        borderRight: '1px solid rgba(196,168,85,0.2)',
        boxShadow: '4px 0 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px', borderBottom: '1px solid rgba(196,168,85,0.18)',
          background: 'rgba(13,10,7,0.5)', flexShrink: 0,
          position: 'sticky', top: 0, zIndex: 2,
          backdropFilter: 'blur(8px)',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: 18,
            color: 'var(--gold)', letterSpacing: 4, margin: 0,
          }}>
            背包与装备
          </h3>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: 'rgba(196,168,85,0.3)', letterSpacing: 2, marginLeft: 6,
          }}>
            INVENTORY
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={close} style={closeBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >
            ✕
          </button>
        </div>

        {/* Content — two columns */}
        <div style={{
          flex: 1, display: 'flex', overflow: 'hidden',
        }}>
          {/* Left: Equipment */}
          <div style={{
            flex: '0 0 45%', display: 'flex', flexDirection: 'column',
            borderRight: '1px solid rgba(196,168,85,0.1)',
            overflowY: 'auto', scrollbarWidth: 'thin',
            scrollbarColor: 'var(--ink-faded) transparent',
          }}>
            {/* Section header */}
            <div style={{
              padding: '12px 12px 8px',
              borderBottom: '1px solid rgba(196,168,85,0.1)',
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: 'var(--font-ui)', fontSize: 10,
                color: 'var(--ink-subtle)', letterSpacing: 3,
                textTransform: 'uppercase',
              }}>
                装备中 · EQUIPPED
              </span>
            </div>

            {/* Column header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px',
              borderBottom: '1px solid rgba(196,168,85,0.06)',
              flexShrink: 0,
            }}>
              <span style={{ flex: 1, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(196,168,85,0.25)', letterSpacing: 1 }}>
                名称
              </span>
              <span style={{ width: 48, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(196,168,85,0.25)', textAlign: 'center', letterSpacing: 1 }}>
                类型
              </span>
              <span style={{ width: 36 }} />
              <span style={{ width: 16 }} />
            </div>

            {/* Equipped items */}
            {equipped.length === 0 ? (
              <div style={{
                padding: '24px 12px', textAlign: 'center',
                fontSize: 11, fontFamily: 'var(--font-body)', color: 'rgba(196,168,85,0.2)',
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

          {/* Right: Inventory */}
          <div style={{
            flex: '1 1 0', display: 'flex', flexDirection: 'column', minWidth: 0,
            overflowY: 'auto', scrollbarWidth: 'thin',
            scrollbarColor: 'var(--ink-faded) transparent',
          }}>
            {/* Section header */}
            <div style={{
              padding: '12px 12px 8px',
              borderBottom: '1px solid rgba(196,168,85,0.1)',
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: 'var(--font-ui)', fontSize: 10,
                color: 'var(--ink-subtle)', letterSpacing: 3,
                textTransform: 'uppercase',
              }}>
                物品栏 · ITEMS
              </span>
            </div>

            {/* Category filter tabs */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 2,
              padding: '6px 8px',
              borderBottom: '1px solid rgba(196,168,85,0.06)',
              flexShrink: 0,
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
                      padding: '3px 8px', fontSize: 9, fontFamily: 'var(--font-ui)',
                      letterSpacing: 0.5, border: '1px solid',
                      borderColor: active ? 'var(--brass)' : 'rgba(196,168,85,0.1)',
                      borderRadius: 2,
                      background: active ? 'rgba(196,168,85,0.12)' : 'transparent',
                      color: active ? 'var(--gold)' : 'var(--ink-subtle)',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.color = 'var(--gold)'; }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) { e.currentTarget.style.borderColor = 'rgba(196,168,85,0.1)'; e.currentTarget.style.color = 'var(--ink-subtle)'; }
                    }}
                  >
                    {tab.label}{count > 0 ? ` (${count})` : ''}
                  </button>
                );
              })}
            </div>

            {/* Column header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px',
              borderBottom: '1px solid rgba(196,168,85,0.06)',
              flexShrink: 0,
            }}>
              <span style={{ flex: 1, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(196,168,85,0.25)', letterSpacing: 1 }}>
                名称
              </span>
              <span style={{ width: 30, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(196,168,85,0.25)', textAlign: 'center', letterSpacing: 1 }}>
                数量
              </span>
              <span style={{ width: 48, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(196,168,85,0.25)', textAlign: 'center', letterSpacing: 1 }}>
                类型
              </span>
              <span style={{ width: 36 }} />
              <span style={{ width: 16 }} />
            </div>

            {/* Filtered items */}
            {filtered.length === 0 ? (
              <div style={{
                padding: '24px 12px', textAlign: 'center',
                fontSize: 11, fontFamily: 'var(--font-body)', color: 'rgba(196,168,85,0.2)',
                fontStyle: 'italic',
              }}>
                {items.length === 0 ? '背包空空如也...' : '该分类下无物品'}
              </div>
            ) : (
              filtered.map((item) => (
                <ItemRow key={item.id} item={item} onEquipToggle={handleEquipToggle} />
              ))
            )}
          </div>
        </div>

        {/* Footer — item count */}
        <div style={{
          padding: '8px 16px', borderTop: '1px solid rgba(196,168,85,0.1)',
          flexShrink: 0, display: 'flex', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(196,168,85,0.25)' }}>
            共 {items.length} 件物品
          </span>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(196,168,85,0.25)' }}>
            装备 {equipped.length} / 背包 {bagItems.length}
          </span>
        </div>
      </div>
    </>
  );
}
