import { useState } from 'react';
import type { ChatPreset, PromptItem } from '../../types';

interface Props { presetId: string; onClose: () => void; }

const DEFAULT_DATA: Record<string, ChatPreset> = {
  p1: {
    id: 'p1', name: '默认预设',
    temperature: 1.00, frequencyPenalty: 0.00, presencePenalty: 0.00, topP: 1.00, topK: 40, maxTokens: 2048,
    systemPrompt: '你是一个TRPG游戏主持人，负责运行克苏鲁的呼唤7版模组。',
    userPrefix: '玩家: ', assistantPrefix: '守秘人: ',
    unlockContext: false, contextLength: 65536, maxResponseTokens: 2048, alternativeReplies: 1,
    mainPrompt: '', auxiliaryPrompt: '', postHistoryPrompt: '',
    aiAssistPrompt: '根据上文内容，写出{{char}}的下一句对话或行动',
    worldBookTemplate: '[世界书: {0}]',
    scenarioTemplate: '场景: {{scenario}}',
    personalityTemplate: '性格: {{personality}}',
    groupChatPrompt: '请以{{char}}的身份回复。',
    newChatPrompt: '[新的聊天即将开始]',
    newGroupChatPrompt: '[新的群聊即将开始]',
    newExampleChatPrompt: '[新的示例聊天即将开始]',
    continuePrompt: '[继续推进]',
    emptyMessagePrompt: '',
    promptItems: [],
  },
};

const MODULE_ITEMS = [
  { key: 'main_prompt', label: 'Main Prompt', content: '' },
  { key: 'world_info_before', label: 'World Info (before)', content: '' },
  { key: 'persona', label: 'Persona Description', content: '' },
  { key: 'char_desc', label: 'Char Description', content: '' },
  { key: 'char_personality', label: 'Char Personality', content: '' },
  { key: 'scenario', label: 'Scenario', content: '' },
  { key: 'enhance', label: 'Enhance Definitions', content: '' },
  { key: 'auxiliary', label: 'Auxiliary Prompt', content: '' },
  { key: 'world_info_after', label: 'World Info (after)', content: '' },
  { key: 'chat_examples', label: 'Chat Examples', content: '' },
  { key: 'chat_history', label: 'Chat History', content: '' },
  { key: 'post_history', label: 'Post-History Instructions', content: '' },
];

export function PresetEditor({ presetId, onClose }: Props) {
  const base = DEFAULT_DATA[presetId];
  const [form, setForm] = useState<ChatPreset>(base ? { ...base } : DEFAULT_DATA.p1);
  const [viewStream, setViewStream] = useState(true);
  const [moduleEnabled, setModuleEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_ITEMS.map((m) => [m.key, true]))
  );
  const [editingPrompt, setEditingPrompt] = useState<PromptItem | null>(null);
  const [selectedLibId, setSelectedLibId] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // All items = markers + library prompts + inserted prompts
  const allItems: any[] = (() => {
    const existing = [...form.promptItems];
    for (const mod of MODULE_ITEMS) {
      if (!existing.find((p: any) => p.id === mod.key)) {
        existing.unshift({ id: mod.key, name: mod.label, kind: 'marker', readOnly: mod.key === 'chat_examples' || mod.key === 'chat_history', role: 'system', trigger: 'normal', position: 'relative', depth: 0, order: 0, content: mod.content, enabled: true, _library: false });
      }
    }
    return existing;
  })();
  const activeItems: any[] = allItems.filter((p: any) => p.kind === 'marker' || p._library !== true);
  const libraryItems: any[] = allItems.filter((p: any) => p.kind !== 'marker' && p._library !== false);

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const fromIdx = activeItems.findIndex((p: any) => p.id === dragId);
    const toIdx = activeItems.findIndex((p: any) => p.id === targetId);
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); setDragOverId(null); return; }
    const items = [...activeItems];
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    // Merge back: library items stay, new active order replaces old
    const newAll = [...libraryItems, ...items];
    set('promptItems', newAll as unknown as string);
    setDragId(null); setDragOverId(null);
  };

  if (!base) {
    return <div style={overlay} onClick={onClose}><div style={panel} onClick={(e) => e.stopPropagation()}><p style={{ color: 'var(--ink-subtle)', textAlign: 'center', padding: 40 }}>预设未找到</p></div></div>;
  }

  type FK = keyof ChatPreset;
  const set = (k: FK, v: string | number | boolean) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pe-scroll" style={{ ...panel, minWidth: 620, maxWidth: 660, maxHeight: '90vh', overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <style>{`
          .pe-scroll::-webkit-scrollbar { width: 5px; }
          .pe-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.15); border-radius: 3px; }
          .pe-scroll::-webkit-scrollbar-thumb { background: var(--brass); border-radius: 3px; }
          .pe-scroll::-webkit-scrollbar-thumb:hover { background: var(--gold); }
        `}</style>

        {/* Header */}
        <div style={s.header}>
          <h3 style={s.title}>预设编辑器 / PRESET EDITOR</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        {/* Top area */}
        <div style={s.section}>
          <div style={{ ...s.row, marginBottom: 6 }}>
            <label style={{ ...s.checkLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={form.unlockContext} onChange={(e) => set('unlockContext', e.target.checked)}
                style={{ accentColor: 'var(--gold)' }} />
              解除上下文上限
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={s.fieldCol}>
              <span style={s.label}>上下文长度 (Token)</span>
              <div style={s.sliderRow}>
                <input type="range" min={1024} max={200000} step={1024} value={form.contextLength}
                  onChange={(e) => set('contextLength', Number(e.target.value))} style={s.slider} />
                <input type="number" value={form.contextLength} onChange={(e) => set('contextLength', Number(e.target.value))}
                  style={s.numInput} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <div style={s.fieldCol}>
              <span style={s.label}>最大回复长度 (Token)</span>
              <div style={s.sliderRow}>
                <input type="range" min={64} max={8192} step={64} value={form.maxResponseTokens}
                  onChange={(e) => set('maxResponseTokens', Number(e.target.value))} style={s.slider} />
                <input type="number" value={form.maxResponseTokens} onChange={(e) => set('maxResponseTokens', Number(e.target.value))}
                  style={s.numInput} />
              </div>
            </div>
          </div>
          <div style={{ ...s.row, marginTop: 8 }}>
            <span style={s.label}>每次备选重复回复</span>
            <input type="number" value={form.alternativeReplies} onChange={(e) => set('alternativeReplies', Number(e.target.value))}
              min={1} max={10} style={{ ...s.numInput, width: 60 }} />
          </div>
        </div>

        {/* Parameter area */}
        <div style={s.section}>
          <div style={s.sectionTitle}>参数调节区</div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ ...s.checkLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={viewStream} onChange={(e) => setViewStream(e.target.checked)}
                style={{ accentColor: 'var(--gold)' }} />
              流式传输
            </label>
            <div style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', marginTop: 2, marginLeft: 22, lineHeight: 1.5 }}>
              随着回复生成逐字显示结果<br />
              关闭此项时，回复将在完成后一次性显示。
            </div>
          </div>
          {[
            { k: 'temperature' as FK, label: '温度 (Temperature)', min: 0, max: 2.00, step: 0.05, d: 1.00 },
            { k: 'frequencyPenalty' as FK, label: '频率惩罚 (Frequency Penalty)', min: -2.00, max: 2.00, step: 0.05, d: 0.00 },
            { k: 'presencePenalty' as FK, label: '存在惩罚 (Presence Penalty)', min: -2.00, max: 2.00, step: 0.05, d: 0.00 },
            { k: 'topP' as FK, label: 'Top P', min: 0, max: 1.00, step: 0.05, d: 1.00 },
          ].map((item) => (
            <div key={item.k} style={s.fieldCol}>
              <span style={s.label}>{item.label}</span>
              <div style={s.sliderRow}>
                <input type="range" min={item.min} max={item.max} step={item.step} value={Number(form[item.k])}
                  onChange={(e) => set(item.k, Number(e.target.value))} style={s.slider} />
                <input type="number" value={Number(form[item.k])}
                  onChange={(e) => set(item.k, Number(e.target.value))}
                  min={item.min} max={item.max} step={item.step} style={s.numInput} />
              </div>
            </div>
          ))}
          {/* Quick prompt edit */}
          <div style={{ marginTop: 10 }}>
            <Collapse title="快速提示词编辑">
              <div style={s.fieldCol}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={s.label}>主要</span>
                  <button onClick={() => set('mainPrompt', DEFAULT_DATA.p1.mainPrompt)} style={resetBtn}>重置</button>
                </div>
                <textarea value={form.mainPrompt} onChange={(e) => set('mainPrompt', e.target.value)} style={s.textarea} />
              </div>
              <div style={{ ...s.fieldCol, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={s.label}>辅助</span>
                  <button onClick={() => set('auxiliaryPrompt', DEFAULT_DATA.p1.auxiliaryPrompt)} style={resetBtn}>重置</button>
                </div>
                <textarea value={form.auxiliaryPrompt} onChange={(e) => set('auxiliaryPrompt', e.target.value)} style={s.textarea} />
              </div>
              <div style={{ ...s.fieldCol, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={s.label}>历史后置指令</span>
                  <button onClick={() => set('postHistoryPrompt', DEFAULT_DATA.p1.postHistoryPrompt)} style={resetBtn}>重置</button>
                </div>
                <textarea value={form.postHistoryPrompt} onChange={(e) => set('postHistoryPrompt', e.target.value)} style={s.textarea} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={s.fieldCol}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={s.label}>用户前缀</span>
                    <button onClick={() => set('userPrefix', DEFAULT_DATA.p1.userPrefix)} style={resetBtn}>重置</button>
                  </div>
                  <input value={form.userPrefix} onChange={(e) => set('userPrefix', e.target.value)} style={s.input} />
                </div>
                <div style={s.fieldCol}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={s.label}>助手前缀</span>
                    <button onClick={() => set('assistantPrefix', DEFAULT_DATA.p1.assistantPrefix)} style={resetBtn}>重置</button>
                  </div>
                  <input value={form.assistantPrefix} onChange={(e) => set('assistantPrefix', e.target.value)} style={s.input} />
                </div>
              </div>
            </Collapse>
            <Collapse title="实用提示词模块">
              {[
                { k: 'aiAssistPrompt' as FK, label: 'AI 帮答提示词', sub: '用于 AI 帮答功能的提示词' },
                { k: 'worldBookTemplate' as FK, label: '世界书格式模板', sub: '使用 {0} 标记插入内容的位置' },
                { k: 'scenarioTemplate' as FK, label: '场景格式模板', sub: '使用 {{scenario}} 标记插入内容的位置' },
                { k: 'personalityTemplate' as FK, label: '角色设定格式模板', sub: '使用 {{personality}} 标记插入内容的位置' },
                { k: 'groupChatPrompt' as FK, label: '群聊推进提示词模板', sub: '在群聊记录的末尾发送，以强制特定角色回复' },
                { k: 'newChatPrompt' as FK, label: '新聊天', sub: '设置在聊天记录的开头，表示新的聊天即将开始' },
                { k: 'newGroupChatPrompt' as FK, label: '新群聊', sub: '设置在聊天记录的开头，表示新的群聊即将开始' },
                { k: 'newExampleChatPrompt' as FK, label: '新示例聊天', sub: '设置在对话示例的开头，以表明新的示例聊天即将开始' },
                { k: 'continuePrompt' as FK, label: '继续推进', sub: '当按下"续写"按钮时，在聊天记录末尾添加的内容' },
                { k: 'emptyMessagePrompt' as FK, label: '替换空消息', sub: '当输入框为空时发送此文本' },
              ].map((item) => (
                <div key={item.k} style={{ ...s.fieldCol, marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={s.label}>{item.label} <span style={{ color: 'var(--ink-faded)', fontWeight: 'normal' }}>{item.sub}</span></span>
                    <button onClick={() => set(item.k, DEFAULT_DATA.p1[item.k] as string)} title="重置为默认值" style={{
                      padding: '2px 8px', border: '1px solid var(--brass)', borderRadius: 3,
                      background: 'transparent', color: 'var(--ink-subtle)',
                      fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
                    }}>重置</button>
                  </div>
                  {item.k === 'emptyMessagePrompt' ? (
                    <textarea value={form[item.k] as string} onChange={(e) => set(item.k, e.target.value)} placeholder="（留空）" style={{ ...s.textarea, minHeight: 40 }} />
                  ) : (
                    <textarea value={form[item.k] as string} onChange={(e) => set(item.k, e.target.value)} style={{ ...s.textarea, minHeight: 40 }} />
                  )}
                </div>
              ))}
            </Collapse>
          </div>
        </div>

        {/* Reasoning effort */}
        <div style={s.section}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={s.sectionTitle}>推理强度</div>
            <a href="https://docs.sillytavern.app/usage/prompts/reasoning/#reasoning-effort" target="_blank" title="限定模型推理的强度，当前支持低、中、高三种强度，降低推理强度可以让模型更快回复，并节省推理所用的token数。" style={{
              width: 15, height: 15, borderRadius: '50%', border: '1px solid var(--brass)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--ink-subtle)', textDecoration: 'none', lineHeight: '15px',
              fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 'bold', position: 'relative', top: -8,
            }}>?</a>
          </div>
          <Dropdown value="自动" onChange={() => {}} options={[
            { label: '自动', value: '自动' },
            { label: '低', value: '低' },
            { label: '中', value: '中' },
            { label: '高', value: '高' },
          ]} />
        </div>

        {/* Unified prompt list — SillyTavern-style: markers + user prompts in one list */}
        <div style={s.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={s.sectionTitle}>提示词列表</div>
            <span style={{ fontSize: 9, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>
              Token: ~{activeItems.filter((p: any) => (p.kind === 'marker' ? moduleEnabled[p.id] !== false : p.enabled)).reduce((sum: number, p: any) => sum + Math.round((p.content || '').length / 2.5), 0)}
            </span>
          </div>

          {/* Prompt library — dropdown + action buttons outside */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>提示词缓存区</span>
            <div style={{ flex: 1 }}>
              <Dropdown value={selectedLibId} onChange={(v) => setSelectedLibId(v)}
                options={[
                  { label: '选择提示词...', value: '' },
                  ...libraryItems.map((p: any) => ({ label: `${p.name || '(未命名)'} [${p.role}]`, value: p.id })),
                ]} />
            </div>
            <button onClick={() => {
              if (!selectedLibId) return;
              const src = libraryItems.find((p: any) => p.id === selectedLibId);
              if (src) {
                // Check if already inserted — skip if duplicate found
                if (activeItems.some((p: any) => p.kind === 'prompt' && p.name === src.name && p.content === src.content)) return;
                const newItem = { ...src, id: 'pi_' + Date.now(), _library: false, _originalName: src.name };
                set('promptItems', [...allItems, newItem] as unknown as string);
              }
            }} disabled={!selectedLibId} style={{ ...s.miniBtn, color: 'var(--gold)', borderColor: 'var(--gold)', opacity: selectedLibId ? 1 : 0.4 }}>插入</button>
            <button onClick={() => {
              if (!selectedLibId) return;
              const item = libraryItems.find((p: any) => p.id === selectedLibId);
              if (item) setEditingPrompt({ ...item, _originalName: item.name });
            }} disabled={!selectedLibId} style={{ ...s.miniBtn, opacity: selectedLibId ? 1 : 0.4 }}>编辑</button>
            <button onClick={() => {
              if (!selectedLibId) return;
              const src = libraryItems.find((p: any) => p.id === selectedLibId);
              // Remove from library AND any active copies
              set('promptItems', allItems.filter((p: any) => {
                if (p.id === selectedLibId) return false;
                if (src && p.kind === 'prompt' && p.name === src.name && p.content === src.content) return false;
                return true;
              }) as unknown as string);
              setSelectedLibId('');
            }} disabled={!selectedLibId} style={{ ...s.miniBtn, color: 'var(--blood)', opacity: selectedLibId ? 1 : 0.4 }}>删除</button>
            <button onClick={() => {
              setEditingPrompt({ id: '', name: '', role: 'system', trigger: 'normal', position: 'relative', depth: 4, order: 100, content: '', enabled: true, kind: 'prompt', _originalName: '' });
            }} style={{ ...s.miniBtn, color: 'var(--gold)', borderColor: 'var(--gold)' }}>+ 新建</button>
          </div>

          {/* Prompt editor modal */}
          {editingPrompt && (
            <div style={{ border: '1px solid var(--gold)', borderRadius: 4, padding: 10, marginBottom: 8, background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--gold)' }}>名称</span>
                  <input value={editingPrompt.name} onChange={(e) => setEditingPrompt({ ...editingPrompt, name: e.target.value })} style={{ ...s.input, fontSize: 10 }} />
                </div>
                <div style={{ flex: '1 1 80px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--gold)' }}>身份</span>
                  <Dropdown value={editingPrompt.role} onChange={(v) => setEditingPrompt({ ...editingPrompt, role: v as PromptItem['role'] })}
                    options={[{ label: '系统', value: 'system' }, { label: '用户', value: 'user' }, { label: 'AI助手', value: 'assistant' }]} />
                </div>
                <div style={{ flex: '1 1 80px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--gold)' }}>触发器</span>
                  <Dropdown value={editingPrompt.trigger} onChange={(v) => setEditingPrompt({ ...editingPrompt, trigger: v as PromptItem['trigger'] })}
                    options={[
                      { label: '正常', value: 'normal' }, { label: '续写', value: 'continue' }, { label: 'AI帮答', value: 'ai_assist' },
                      { label: '备选回复', value: 'alt_reply' }, { label: '重新生成', value: 'regenerate' }, { label: '静默', value: 'silent' },
                    ]} />
                </div>
                <div style={{ flex: '1 1 80px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--gold)' }}>位置</span>
                  <Dropdown value={editingPrompt.position} onChange={(v) => setEditingPrompt({ ...editingPrompt, position: v as 'relative' | 'depth' })}
                    options={[{ label: '相对', value: 'relative' }, { label: '插入深度', value: 'depth' }]} />
                </div>
              </div>
              {editingPrompt.position === 'depth' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 80 }}>
                    <span style={{ fontSize: 9, color: 'var(--gold)' }}>深度</span>
                    <input type="number" value={editingPrompt.depth} onChange={(e) => setEditingPrompt({ ...editingPrompt, depth: Number(e.target.value) || 0 })} min={0} style={{ ...s.numInput, width: '100%' }} />
                    <div style={{ fontSize: 7, color: 'var(--ink-faded)' }}>"0"在最后一条消息之后,"1"在最后一条消息之前,等等</div>
                  </div>
                  <div style={{ width: 80 }}>
                    <span style={{ fontSize: 9, color: 'var(--gold)' }}>排序</span>
                    <input type="number" value={editingPrompt.order} onChange={(e) => setEditingPrompt({ ...editingPrompt, order: Number(e.target.value) || 100 })} min={0} style={{ ...s.numInput, width: '100%' }} />
                    <div style={{ fontSize: 7, color: 'var(--ink-faded)' }}>从低到高排序,相同顺序:助手→用户→系统,默认100</div>
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 9, color: 'var(--gold)' }}>提示词内容</span>
                <textarea value={editingPrompt.content} onChange={(e) => setEditingPrompt({ ...editingPrompt, content: e.target.value })} style={{ ...s.textarea, minHeight: 60 }} />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => {
                  const isExisting = editingPrompt.id && libraryItems.some((p: any) => p.id === editingPrompt.id);
                  if (isExisting) {
                    // Update library item + any active copies with same name
                    const updated = allItems.map((p: any) => {
                      if (p.id === editingPrompt.id) return { ...editingPrompt, id: p.id, _library: true };
                      if (p.kind === 'prompt' && p.name === editingPrompt._originalName) return { ...p, name: editingPrompt.name, role: editingPrompt.role, trigger: editingPrompt.trigger, position: editingPrompt.position, depth: editingPrompt.depth, order: editingPrompt.order, content: editingPrompt.content };
                      return p;
                    });
                    set('promptItems', updated as unknown as string);
                  } else {
                    const id = editingPrompt.id || 'pi_' + Date.now();
                    set('promptItems', [...form.promptItems, { ...editingPrompt, id, kind: 'prompt', _library: true }] as unknown as string);
                  }
                  setEditingPrompt(null);
                }} style={s.btn}>保存</button>
                <button onClick={() => setEditingPrompt(null)} style={{ ...s.btn, color: 'var(--ink-subtle)' }}>取消</button>
              </div>
            </div>
          )}

          {/* Unified list — all items (markers + prompts) in one combined array */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 280, overflowY: 'auto' }}>
            {activeItems.map((item: any, idx: number) => {
              const isMarker = item.kind === 'marker';
              const isReadOnly = item.readOnly === true;
              const enabled = isMarker ? (moduleEnabled[item.id] !== false) : item.enabled;
              return (
                <div key={item.id} draggable onDragStart={() => handleDragStart(item.id)} onDragOver={handleDragOver}
                  onDrop={() => handleDrop(item.id)}
                  onDragEnter={() => setDragOverId(item.id)} onDragLeave={() => setDragOverId((prev) => prev === item.id ? null : prev)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', cursor: 'grab',
                    border: dragOverId === item.id ? '2px dashed var(--gold)'
                      : isMarker ? '1px solid rgba(196,168,85,0.06)' : '1px solid rgba(196,168,85,0.12)',
                    borderLeft: isMarker ? undefined : '2px solid var(--gold)',
                    borderRadius: 3,
                    background: dragId === item.id ? 'rgba(196,168,85,0.12)'
                      : isMarker ? 'rgba(0,0,0,0.08)' : 'rgba(196,168,85,0.03)',
                    opacity: enabled ? (dragId === item.id ? 0.6 : 1) : 0.4 }}>
                  <span style={{ fontSize: 8, color: isMarker ? 'var(--gold)' : 'var(--ink-faded)', fontFamily: 'var(--font-ui)', width: 42, flexShrink: 0 }}>
                    {isMarker ? 'System' : 'Prompt'}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                    {item.name || '(未命名)'}
                    {!isMarker && <span style={{ fontSize: 8, color: 'var(--ink-faded)', marginLeft: 4 }}>[{item.role}]</span>}
                  </span>
                  {!isMarker && (
                    <button onClick={() => { set('promptItems', allItems.filter((_: any, i: number) => i !== allItems.indexOf(item)) as unknown as string); }} title="删除" style={{ ...s.iconBtn, color: 'var(--blood)', fontSize: 10 }}>✕</button>
                  )}
                  {!isReadOnly && (
                    <button onClick={() => { if (isMarker) { /* edit marker */ } else { setEditingPrompt({ ...item, _originalName: item._originalName || item.name }); } }} title="编辑" style={{ ...s.iconBtn, color: 'var(--ink-subtle)', fontSize: 10 }}>✎</button>
                  )}
                  <button onClick={() => {
                    if (isReadOnly) return;
                    if (isMarker) { setModuleEnabled((p) => ({ ...p, [item.id]: !(p[item.id] !== false) })); return; }
                    const items: any[] = [...allItems]; const targetIdx = items.findIndex((p: any) => p.id === item.id); items[targetIdx] = { ...items[targetIdx], enabled: !items[targetIdx].enabled };
                    set('promptItems', items as unknown as string);
                  }} disabled={isReadOnly} style={{ minWidth: 30, padding: '1px 0', borderRadius: 2, border: '1px solid', textAlign: 'center', lineHeight: '14px', borderColor: enabled ? 'var(--success)' : 'var(--ink-faded)', background: enabled ? 'rgba(58,107,90,0.1)' : 'rgba(0,0,0,0.2)', color: enabled ? 'var(--success)' : 'var(--ink-faded)', fontFamily: 'var(--font-ui)', fontSize: 8, cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}>{enabled ? 'ON' : 'OFF'}</button>
                  <span style={{ fontSize: 8, color: 'var(--ink-faded)', fontFamily: 'var(--font-mono)', width: 32, textAlign: 'right', flexShrink: 0 }}>
                    {isMarker ? '-' : ((item.content || '').length > 0 ? `~${Math.round(item.content.length / 2.5)}t` : '-')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <button style={{
          width: '100%', marginTop: 20, padding: '10px 0',
          border: '1px solid var(--gold)', borderRadius: 4,
          background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
          fontFamily: 'var(--font-ui)', fontSize: 13, letterSpacing: 3, cursor: 'pointer',
        }}>保存预设</button>
      </div>
    </div>
  );
}

function Dropdown({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value)?.label ?? value;
  return (
    <div style={{ position: 'relative', minWidth: 90 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', padding: '6px 8px', border: '1px solid var(--brass)', borderRadius: 3,
        background: 'rgba(0,0,0,0.3)', color: 'var(--parchment)',
        fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', outline: 'none',
      }}>
        <span>{selected}</span>
        <span style={{ fontSize: 8, color: 'var(--brass)' }}>▼</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div className="dropdown-scroll" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, background: 'var(--leather)', border: '1px solid var(--gold)', borderRadius: 3, marginTop: 2, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.6)', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)' }}>
            <style>{`.dropdown-scroll::-webkit-scrollbar{width:5px}.dropdown-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.15);border-radius:3px}.dropdown-scroll::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}.dropdown-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}`}</style>
            {options.map((opt) => {
              if (opt.value.startsWith('__sep')) {
                return <div key={opt.value} style={{ padding: '4px 8px', fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', borderBottom: '1px solid rgba(196,168,85,0.08)', cursor: 'default' }}>{opt.label}</div>;
              }
              return (
                <div key={opt.value} onClick={() => { if (opt.value) { onChange(opt.value); setOpen(false); } }} style={{
                  padding: '6px 8px', cursor: opt.value ? 'pointer' : 'default',
                  background: opt.value === value ? 'rgba(196,168,85,0.15)' : 'transparent',
                  color: opt.value === value ? 'var(--gold)' : 'var(--text-light)',
                  fontFamily: 'var(--font-ui)', fontSize: 11,
                  borderBottom: '1px solid rgba(196,168,85,0.06)',
                }} onMouseEnter={(e) => { if (opt.value !== value && opt.value) e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                  onMouseLeave={(e) => { if (opt.value !== value && opt.value) e.currentTarget.style.background = 'transparent'; }}
                >{opt.label}</div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Collapse({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', textAlign: 'left', padding: '6px 10px',
        border: '1px solid rgba(196,168,85,0.12)', borderRadius: 3,
        background: 'rgba(0,0,0,0.15)', color: 'var(--text-light)',
        fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between',
      }}>{title} <span>{open ? '▲' : '▼'}</span></button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

const s = {
  header: { display: 'flex' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: 16, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12 },
  title: { fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold)', letterSpacing: 3, margin: 0 },
  closeBtn: { width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid transparent', borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-ui)' } as React.CSSProperties,
  section: { border: '1px solid rgba(196,168,85,0.1)', borderRadius: 4, padding: 12, marginBottom: 10, background: 'rgba(0,0,0,0.08)' },
  sectionTitle: { fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' as const },
  row: { display: 'flex' as const, alignItems: 'center' as const, gap: 8 },
  rowWrap: { display: 'flex' as const, gap: 10, flexWrap: 'wrap' as const, marginTop: 8 },
  fieldCol: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 4, minWidth: 120 },
  label: { fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' },
  checkLabel: { fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' },
  sliderRow: { display: 'flex' as const, gap: 8, alignItems: 'center' as const },
  slider: { flex: 1, accentColor: 'var(--gold)' },
  numInput: { width: 70, padding: '4px 6px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'center' as const, outline: 'none' },
  input: { width: '100%', padding: '6px 8px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: 11, outline: 'none' },
  select: { padding: '6px 8px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: 11, outline: 'none', cursor: 'pointer', minWidth: 100 },
  textarea: { width: '100%', padding: '6px 8px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-body)', fontSize: 11, minHeight: 50, resize: 'vertical' as const, outline: 'none' },
  btn: { padding: '6px 14px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer' },
  miniBtn: { padding: '3px 8px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer' },
  iconBtn: { width: 24, height: 24, display: 'inline-flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, border: '1px solid transparent', borderRadius: 3, background: 'transparent', fontSize: 12, cursor: 'pointer', opacity: 0.5 } as React.CSSProperties,
} as const;

const resetBtn: React.CSSProperties = {
  padding: '2px 8px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'transparent', color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
};

const arrowBtnStyle: React.CSSProperties = {
  width: 18, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid rgba(196,168,85,0.15)', borderRadius: 2,
  background: 'transparent', color: 'var(--ink-subtle)',
  fontSize: 8, cursor: 'pointer', padding: 0, opacity: 0.6,
};

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' };
const panel: React.CSSProperties = { background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)', border: '1px solid var(--gold)', borderRadius: 8, padding: '24px 28px', maxWidth: 660, width: '90%', boxShadow: '0 0 80px rgba(0,0,0,0.6)' };
