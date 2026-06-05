import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLogStore } from '../../stores/useLogStore';
import type { LogLevel, LogCategory } from '../../stores/useLogStore';

const levelColors: Record<LogLevel, string> = { info: 'var(--ink-subtle)', warn: '#c4a855', error: '#c45543', debug: '#7b9fc1' };
const levelLabels: Record<LogLevel, string> = { info: 'INFO', warn: 'WARN', error: 'ERR', debug: 'DBG' };
const categoryLabels: Record<LogCategory, string> = { api: 'API', preset: '预设', worldbook: '世界书', regex: '正则', variable: '变量', system: '系统', general: '通用' };

export function DebugLog() {
  const visible = useLogStore((s) => s.visible);
  const logs = useLogStore((s) => s.logs);
  const filter = useLogStore((s) => s.filter);
  const toggle = useLogStore((s) => s.toggle);
  const clear = useLogStore((s) => s.clear);
  const setFilter = useLogStore((s) => s.setFilter);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => { document.addEventListener('toggle-debug-log', toggle); return () => document.removeEventListener('toggle-debug-log', toggle); }, [toggle]);
  useEffect(() => { if (!visible) return; const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [logs.length, visible]);

  const filtered = logs.filter((e) => {
    if (filter.level !== 'all' && e.level !== filter.level) return false;
    if (filter.category !== 'all' && e.category !== filter.category) return false;
    if (filter.search && !e.message.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) { setSelected(new Set()); }
    else { setSelected(new Set(filtered.map((e) => e.id))); }
  };

  const copySelected = () => {
    const text = filtered
      .filter((e) => selected.has(e.id))
      .map((e) => `[${e.time}] [${levelLabels[e.level]}] [${categoryLabels[e.category]}] ${e.message}`)
      .join('\n');
    // 复制成功后清空选中（计数归 0），方便接着框选/复制下一批。
    navigator.clipboard.writeText(text).then(() => setSelected(new Set())).catch(() => {});
  };

  const exportLogs = () => {
    const text = filtered
      .map((e) => `[${e.time}] [${levelLabels[e.level]}] [${categoryLabels[e.category]}] ${e.message}`)
      .join('\n');
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coc-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.2 }}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 990, height: 340, background: 'linear-gradient(180deg, rgba(13,10,7,0.98) 0%, rgba(20,16,12,0.98) 100%)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(196,168,85,0.2)', display: 'flex', flexDirection: 'column' }}>
          <style>{`.dl-scroll::-webkit-scrollbar{width:5px}.dl-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.15);border-radius:3px}.dl-scroll::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}.dl-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}`}</style>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid rgba(196,168,85,0.12)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--gold)', letterSpacing: 2 }}>日志查看器 ({logs.length})</span>
              <select name="debug-log-level" value={filter.level} onChange={(e) => setFilter({ level: e.target.value as LogLevel | 'all' })} style={miniSelect}>
                <option value="all">全部级别</option>
                <option value="info">INFO</option><option value="warn">WARN</option><option value="error">ERROR</option><option value="debug">DEBUG</option>
              </select>
              <select name="debug-log-category" value={filter.category} onChange={(e) => setFilter({ category: e.target.value as LogCategory | 'all' })} style={miniSelect}>
                <option value="all">全部分类</option>
                {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input name="debug-log-search" value={filter.search} onChange={(e) => setFilter({ search: e.target.value })} placeholder="搜索..." onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'} onBlur={(e) => e.currentTarget.style.borderColor = 'var(--brass)'}
                style={{ ...miniSelect, width: 100, fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--text-light)' }} />
              <button onClick={selectAll} style={headerBtn}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.18)'; e.currentTarget.style.color = 'var(--gold)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >{selected.size === filtered.length && filtered.length > 0 ? '取消' : '全选'}</button>
              <button onClick={copySelected} disabled={selected.size === 0} style={{ ...headerBtn, opacity: selected.size === 0 ? 0.4 : 1 }}
                onMouseEnter={(e) => { if (selected.size === 0) return; e.currentTarget.style.background = 'rgba(196,168,85,0.18)'; e.currentTarget.style.color = 'var(--gold)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseDown={(e) => { if (selected.size === 0) return; e.currentTarget.style.transform = 'scale(0.94)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >复制({selected.size})</button>
              <button onClick={exportLogs} disabled={filtered.length === 0} style={{ ...headerBtn, opacity: filtered.length === 0 ? 0.4 : 1 }} title="把当前筛选的日志导出为 txt 文件"
                onMouseEnter={(e) => { if (filtered.length === 0) return; e.currentTarget.style.background = 'rgba(196,168,85,0.18)'; e.currentTarget.style.color = 'var(--gold)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseDown={(e) => { if (filtered.length === 0) return; e.currentTarget.style.transform = 'scale(0.94)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >导出</button>
              <button onClick={clear} style={headerBtn}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.18)'; e.currentTarget.style.color = 'var(--gold)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >清空</button>
              <button onClick={toggle} style={headerBtn}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.18)'; e.currentTarget.style.color = 'var(--gold)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >关闭</button>
            </div>
          </div>

          <div ref={scrollRef} className="dl-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 0', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio, 1))' }}>{logs.length === 0 ? '暂无日志' : '无匹配日志'}</div>
            ) : (
              filtered.map((entry) => {
                const isSel = selected.has(entry.id);
                return (
                  <div key={entry.id} onClick={() => toggleSelect(entry.id)} style={{
                    display: 'flex', gap: 6, padding: '2px 12px 2px 8px', fontFamily: 'var(--font-mono)', fontSize: 'calc(11px * var(--system-ratio, 1))', lineHeight: '20px', alignItems: 'baseline',
                    borderBottom: '1px solid rgba(255,255,255,0.01)', cursor: 'pointer',
                    background: isSel ? 'rgba(196,168,85,0.1)' : 'transparent',
                  }}>
                    <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', width: 14, color: isSel ? 'var(--gold)' : 'transparent', flexShrink: 0 }}>{isSel ? '✓' : ''}</span>
                    <span style={{ color: 'var(--ink-faded)', flexShrink: 0, fontSize: 'calc(10px * var(--system-ratio, 1))' }}>{entry.time}</span>
                    <span style={{ color: levelColors[entry.level], flexShrink: 0, width: 30, fontSize: 'calc(9px * var(--system-ratio, 1))', fontWeight: 'bold' }}>{levelLabels[entry.level]}</span>
                    <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)', flexShrink: 0, background: 'rgba(255,255,255,0.04)', borderRadius: 2, padding: '0 4px', lineHeight: '16px' }}>{categoryLabels[entry.category] || entry.category}</span>
                    <span style={{ color: 'var(--text-light)', wordBreak: 'break-all' }}>{entry.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const miniSelect: React.CSSProperties = { padding: '3px 6px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', fontSize: 'calc(10px * var(--system-ratio, 1))', outline: 'none', cursor: 'pointer' };
const headerBtn: React.CSSProperties = { padding: '3px 10px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.2)', color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', fontSize: 'calc(10px * var(--system-ratio, 1))', cursor: 'pointer', transition: 'var(--transition-smooth)' };
