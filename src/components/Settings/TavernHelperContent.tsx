import { useState, useRef } from 'react';
import { useTavernHelperStore, uid, BUILTIN_TH_IDS } from '../../stores/useTavernHelperStore';
import type { THScriptTree, THScript, THScriptFolder, THCodeCollapse } from '../../types';
import { rowStyle, labelStyle, numInputStyle, Toggle, HelpIcon } from './_shared';
import { IconFolder, IconScript, IconPencil, IconClose, IconCheck, IconChevronDown } from '../Layout/TabIcons';

type SubTab = 'scripts' | 'render' | 'optimize';

export function TavernHelperContent() {
  const [tab, setTab] = useState<SubTab>('scripts');

  return (
    <div>
      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {([
          { key: 'scripts' as const, label: '脚本' },
          { key: 'render' as const, label: '渲染' },
          { key: 'optimize' as const, label: '优化' },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '6px 18px', borderRadius: 3, cursor: 'pointer',
            border: tab === t.key ? '1px solid var(--gold)' : '1px solid rgba(196,168,85,0.12)',
            background: tab === t.key ? 'rgba(196,168,85,0.12)' : 'rgba(0,0,0,0.15)',
            color: tab === t.key ? 'var(--gold)' : 'var(--ink-subtle)',
            fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio, 1))', letterSpacing: 1,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'scripts' && <ScriptTab />}
      {tab === 'render' && <RenderTab />}
      {tab === 'optimize' && <OptimizeTab />}
    </div>
  );
}

// ── Help Popup —— 代理给 _shared.HelpIcon(hover + portal + tooltipDelay 一致行为) ──
function HelpPopup({ content }: { content: string }) {
  return <HelpIcon text={content} />;
}

// ── Toggle Switch —— 代理给 _shared.Toggle(药丸样式 + hover/active 反馈一致) ──
function ToggleRow({ label, enabled, onChange, help }: { label: string; enabled: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <div style={rowStyle}>
      <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 2 }}>
        {label}
        {help && <HelpPopup content={help} />}
      </span>
      <Toggle on={enabled} onChange={() => onChange(!enabled)} />
    </div>
  );
}

// ── Script Tab ──
function ScriptTab() {
  const store = useTavernHelperStore();
  const [scope, setScope] = useState<'global' | 'preset'>('global');
  const [search, setSearch] = useState('');
  const [searchRegex, setSearchRegex] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<THScript>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const importScopeRef = useRef<'global' | 'preset'>('global');

  const tree = scope === 'global' ? store.globalScripts : store.presetScripts;
  const addItem = scope === 'global' ? store.addGlobalItem : store.addPresetItem;
  const deleteItem = scope === 'global' ? store.deleteGlobalItem : store.deletePresetItem;
  const updateItem = scope === 'global' ? store.updateGlobalItem : store.updatePresetItem;

  const filteredTree = (() => {
    if (!search.trim()) return tree;
    const pattern = searchRegex ? (() => { try { return new RegExp(search, 'i'); } catch { return null; } })() : null;
    function filter(items: THScriptTree[]): THScriptTree[] {
      const result: THScriptTree[] = [];
      for (const item of items) {
        const nameMatch = pattern ? pattern.test(item.name) : item.name.toLowerCase().includes(search.toLowerCase());
        if (item.type === 'script') {
          if (nameMatch) result.push(item);
        } else {
          const filtered = filter(item.children);
          if (nameMatch || filtered.length > 0) result.push({ ...item, children: filtered.length > 0 ? filtered : item.children });
        }
      }
      return result;
    }
    return filter(tree);
  })();

  const handleAddScript = (s: 'global' | 'preset') => {
    addItem({ id: uid(), type: 'script', enabled: true, name: '新脚本', content: '', info: '' });
    setScope(s);
  };

  const handleAddFolder = (s: 'global' | 'preset') => {
    addItem({ id: uid(), type: 'folder', name: '新文件夹', icon: 'fa-solid fa-folder', color: '#c4a855', children: [] });
    setScope(s);
  };

  const handleImport = (s: 'global' | 'preset') => {
    const e = fileRef.current;
    if (!e?.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        const scripts: THScriptTree[] = Array.isArray(data) ? data : [data];
        for (const sc of scripts) { if (sc.name) { sc.id = uid(); addItem(sc); } }
      } catch { /* */ }
    };
    reader.readAsText(e.files[0]);
    e.value = '';
    setScope(s);
  };

  const handleExport = (s: 'global' | 'preset') => {
    const data = s === 'global' ? store.globalScripts : store.presetScripts;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `th-scripts-${s}-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const startEdit = (item: THScriptTree) => {
    setEditingId(item.id);
    setEditForm(item.type === 'script' ? { name: item.name, content: item.content, info: item.info, enabled: item.enabled } : { name: item.name });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateItem(editingId, (item) => item.type === 'script' ? { ...item, name: editForm.name || item.name, content: editForm.content ?? item.content, info: editForm.info ?? item.info, enabled: editForm.enabled ?? item.enabled } : { ...item, name: editForm.name || item.name } as THScriptTree);
    setEditingId(null);
  };

  const handleToggle = (item: THScript) => updateItem(item.id, (i) => i.type === 'script' ? { ...i, enabled: !i.enabled } : i);

  const renderItem = (item: THScriptTree, depth: number) => {
    const isFolder = item.type === 'folder';
    const isEditing = editingId === item.id;
    if (isEditing) {
      return (
        <div key={item.id} style={{ padding: '6px 8px', marginLeft: depth * 16, border: '1px solid var(--gold)', borderRadius: 3, background: 'rgba(0,0,0,0.2)', marginBottom: 2 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="名称" style={{ ...inputStyle, flex: 1, fontSize: 'calc(10px * var(--system-ratio, 1))' }} />
            {item.type === 'script' && <input value={editForm.info || ''} onChange={(e) => setEditForm({ ...editForm, info: e.target.value })} placeholder="描述" style={{ ...inputStyle, flex: 1, fontSize: 'calc(10px * var(--system-ratio, 1))' }} />}
            <button onClick={saveEdit} style={miniBtnGreen} title="保存"><IconCheck size={11} /></button>
            <button onClick={() => setEditingId(null)} style={miniBtn} title="取消"><IconClose size={11} /></button>
          </div>
          {item.type === 'script' && <textarea value={editForm.content || ''} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} placeholder="脚本内容（JavaScript代码）" style={{ ...textareaStyle, minHeight: 80 }} />}
        </div>
      );
    }
    return (
      <div key={item.id}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', marginLeft: depth * 16, borderBottom: '1px solid rgba(196,168,85,0.06)', opacity: (item.type === 'script' ? item.enabled : true) ? 1 : 0.4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, color: isFolder ? (item as THScriptFolder).color : 'var(--ink-faded)' }}>{isFolder ? <IconFolder size={13} /> : <IconScript size={13} />}</span>
          <span style={{ flex: 1, fontSize: 'calc(11px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', color: 'var(--text-light)', cursor: 'pointer' }} onClick={() => startEdit(item)}>
            {item.name}
            {item.type === 'script' && item.enabled && <span style={{ fontSize: 'calc(8px * var(--system-ratio, 1))', color: 'var(--success)', marginLeft: 6 }}>ON</span>}
          </span>
          {item.type === 'script' && <button onClick={() => handleToggle(item)} style={{ ...miniBtn, padding: '1px 8px', fontSize: 'calc(9px * var(--system-ratio, 1))', color: item.enabled ? 'var(--success)' : 'var(--ink-faded)' }}>{item.enabled ? 'ON' : 'OFF'}</button>}
          <button onClick={() => startEdit(item)} style={iconBtn} title="编辑"><IconPencil size={11} /></button>
          {!BUILTIN_TH_IDS.has(item.id) && (
            <button onClick={() => { if (confirm(`删除 "${item.name}"？`)) deleteItem(item.id); }} style={{ ...iconBtn, color: 'var(--blood)' }} title="删除"><IconClose size={11} /></button>
          )}
        </div>
        {isFolder && (item as THScriptFolder).children.map((child) => renderItem(child, depth + 1))}
      </div>
    );
  };

  return (
    <div>
      {/* Scope + toolbar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
        <button onClick={() => setScope('global')} style={scope === 'global' ? scopeBtnActive : scopeBtn}>{'全局脚本库 (' + store.globalScripts.length + ')'}</button>
        <button onClick={() => setScope('preset')} style={scope === 'preset' ? scopeBtnActive : scopeBtn}>{'预设脚本库 (' + store.presetScripts.length + ')'}</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <DropdownMenu label="+ 添加脚本" items={[{ label: '全局脚本库', action: () => handleAddScript('global') }, { label: '预设脚本库', action: () => handleAddScript('preset') }]} />
        <DropdownMenu label={<><IconFolder size={11} /> 添加文件夹</>} items={[{ label: '全局脚本库', action: () => handleAddFolder('global') }, { label: '预设脚本库', action: () => handleAddFolder('preset') }]} />
        <DropdownMenu label="导入" items={[{ label: '导入到全局脚本库', action: () => { importScopeRef.current = 'global'; fileRef.current?.click(); } }, { label: '导入到预设脚本库', action: () => { importScopeRef.current = 'preset'; fileRef.current?.click(); } }]} />
        <input type="file" accept=".json" ref={fileRef} onChange={() => handleImport(importScopeRef.current)} style={{ display: 'none' }} />
        <button onClick={() => handleExport(scope)} style={toolBtn}>导出</button>
      </div>
      {/* Search */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchRegex ? '正则搜索...' : '搜索...'} style={{ ...inputStyle, flex: 1, fontSize: 'calc(10px * var(--system-ratio, 1))' }} onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'} onBlur={(e) => e.currentTarget.style.borderColor = 'var(--brass)'} />
        <button onClick={() => setSearchRegex(!searchRegex)} style={{ ...toolBtn, color: searchRegex ? 'var(--gold)' : 'var(--ink-subtle)', borderColor: searchRegex ? 'var(--gold)' : 'var(--brass)', fontFamily: 'var(--font-mono)', fontSize: 'calc(9px * var(--system-ratio, 1))', letterSpacing: 0 }}>.*</button>
      </div>
      {/* Tree */}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {filteredTree.length === 0 ? <div style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', textAlign: 'center', padding: 30 }}>{search ? '无匹配结果' : '暂无脚本，点击上方按钮添加'}</div> : filteredTree.map((item) => renderItem(item, 0))}
      </div>
    </div>
  );
}

// ── Render Tab ──
function RenderTab() {
  const render = useTavernHelperStore((s) => s.render);
  const setRender = useTavernHelperStore((s) => s.setRender);

  return (
    <div>
      <ToggleRow label="启用渲染器" enabled={render.renderEnabled} onChange={(v) => setRender({ renderEnabled: v })}
        help="启用后，符合条件的代码块将被渲染" />
      <div style={{ marginTop: 12, fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>渲染优化</div>
      <div style={rowStyle}>
        <span style={labelStyle}>渲染深度</span>
        <input type="number" value={render.renderDepth} onChange={(e) => setRender({ renderDepth: Number(e.target.value) || 0 })} min={0}
          style={numInputStyle} />
      </div>
      <div style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', marginBottom: 8, marginTop: 2 }}>
        限制书本保留的页数，从最新页开始计数。为0时保留全部。需配合优化→消息加载优化启用
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>启用代码折叠</span>
        <select value={render.codeCollapse} onChange={(e) => setRender({ codeCollapse: e.target.value as THCodeCollapse })}
          style={miniSelect}>
          <option value="disable">禁用</option>
          <option value="all">全部</option>
          <option value="frontend">仅前端</option>
        </select>
      </div>
      <ToggleRow label="启用 Blob URL 渲染" enabled={render.blobUrlRendering} onChange={(v) => setRender({ blobUrlRendering: v })}
        help="使用Blob URL渲染前端界面，更方便F12调试；某些浏览器可能不支持" />
      <ToggleRow label="取消前端代码高亮" enabled={render.disableCodeHighlight} onChange={(v) => setRender({ disableCodeHighlight: v })}
        help="避免酒馆对可渲染成前端界面的代码块进行语法高亮，从而提升渲染性能" />
      <div style={{ marginTop: 12, fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>实验功能</div>
      <ToggleRow label="允许流式渲染" enabled={render.allowStreamRender} onChange={(v) => setRender({ allowStreamRender: v })}
        help="在AI流式输出时就渲染，某些前端界面可能无法这样渲染。此外，这可能与某些脚本、插件、酒馆美化不兼容" />
    </div>
  );
}

// ── Optimize Tab ──
function OptimizeTab() {
  const optimize = useTavernHelperStore((s) => s.optimize);
  const setOptimize = useTavernHelperStore((s) => s.setOptimize);

  return (
    <div>
      <div style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>性能</div>
      <ToggleRow label="要加载 # 条消息 → 要渲染 # 条消息" enabled={optimize.optimizeMessageLoad} onChange={(v) => setOptimize({ optimizeMessageLoad: v })}
        help={`优化消息加载和渲染，限制同时显示的楼层数量。\n\n例如设置 5 条消息，则页面最多显示 5 个楼层。发送新消息或收到回复时旧楼层自动取消渲染，删除楼层时旧楼层自动补全。\n\n原本酒馆只允许设置为 5 的倍数，现在可设置为任意非负数。`} />

      <div style={{ marginTop: 16, fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>世界书</div>
      <ToggleRow label="强制使用推荐的世界书全局设置" enabled={optimize.forceWorldbookSettings} onChange={(v) => setOptimize({ forceWorldbookSettings: v })}
        help={`强制使用推荐的世界书全局设置:\n扫描深度: 2, 上下文百分比: 100, Token预算上限: 0, 最小激活数: 0, 最大深度: 0, 最大递归深度: 0, 插入策略: 角色世界书优先, 包括名称: false, 递归扫描: true, 区分大小写: false, 匹配整个单词: false, 使用群组评分: false, 溢出警报: false\n\n角色卡作者默认均会用这样的全局设置。`} />

      <div style={{ marginTop: 16, fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>预设</div>
      <ToggleRow label="最大化预设上下文长度" enabled={optimize.maximizePresetContext} onChange={(v) => setOptimize({ maximizePresetContext: v })}
        help={`启用后预设面板的上下文长度(token)将被锁定成最大(200w)，避免酒馆错误地截断本来可以完整发给AI的提示词。\n\n酒馆无法精确计算提示词token数，加上插件处理，计算出的token数往往比实际高。预设上下文太低会让酒馆错误截断提示词，锁定成最大值可避免。`} />

    </div>
  );
}

// ── DropdownMenu ──
function DropdownMenu({ label, items }: { label: React.ReactNode; items: { label: string; action: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ ...toolBtn, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{label}</span>
        <IconChevronDown size={9} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000, background: 'var(--leather)', border: '1px solid var(--gold)', borderRadius: 3, marginTop: 2, minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,0.6)' }}>
            {items.map((item) => (
              <div key={item.label} onClick={() => { item.action(); setOpen(false); }} style={{ padding: '6px 10px', cursor: 'pointer', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', borderBottom: '1px solid rgba(196,168,85,0.06)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(196,168,85,0.08)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>{item.label}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Shared styles (本地按钮专用,公用样式从 _shared 导入) ──
const inputStyle: React.CSSProperties = { padding: '6px 8px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)', fontSize: 'calc(11px * var(--system-ratio, 1))', outline: 'none', caretColor: 'var(--gold)' };
const textareaStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)', fontSize: 'calc(10px * var(--system-ratio, 1))', minHeight: 50, resize: 'vertical' as const, outline: 'none', caretColor: 'var(--gold)' };
const miniSelect: React.CSSProperties = { padding: '3px 6px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)', fontSize: 'calc(10px * var(--system-ratio, 1))', outline: 'none', cursor: 'pointer', transition: 'var(--transition-smooth)' };
const toolBtn: React.CSSProperties = { padding: '4px 10px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', cursor: 'pointer', whiteSpace: 'nowrap' as const, transition: 'var(--transition-smooth)' };
const miniBtn: React.CSSProperties = { padding: '3px 8px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', cursor: 'pointer', transition: 'var(--transition-smooth)' };
const miniBtnGreen: React.CSSProperties = { ...miniBtn, color: 'var(--success)', borderColor: 'var(--success)' };
const iconBtn: React.CSSProperties = { width: 24, height: 24, display: 'inline-flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, border: '1px solid transparent', borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)', cursor: 'pointer', opacity: 0.6, transition: 'var(--transition-smooth)' };
const scopeBtn: React.CSSProperties = { padding: '4px 12px', borderRadius: 3, cursor: 'pointer', border: '1px solid rgba(196,168,85,0.12)', background: 'rgba(0,0,0,0.15)', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', letterSpacing: 1, transition: 'var(--transition-smooth)' };
const scopeBtnActive: React.CSSProperties = { ...scopeBtn, border: '1px solid var(--gold)', background: 'rgba(196,168,85,0.12)', color: 'var(--gold)' };
