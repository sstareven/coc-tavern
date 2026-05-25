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
  const [activeItems, setActiveItems] = useState<PromptItem[]>([]);

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

        {/* Advanced options */}
        <div style={s.section}>
          <div style={s.sectionTitle}>高级选项区</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
            {['角色名称行为', '梦写预填充', '压缩系统指令', '启用角色识别'].map((label) => (
              <label key={label} style={{ ...s.checkLabel, display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                <input type="checkbox" style={{ accentColor: 'var(--gold)' }} />
                {label}
              </label>
            ))}
          </div>
          <div style={s.rowWrap}>
            <div style={s.fieldCol}>
              <span style={s.label}>交错输出</span>
              <select style={s.select}><option>None</option></select>
            </div>
            <div style={s.fieldCol}>
              <span style={s.label}>声音输出</span>
              <button style={{ ...s.btn, padding: '6px 10px' }}>♫</button>
            </div>
            <div style={s.fieldCol}>
              <span style={s.label}>图片尺寸</span>
              <select style={s.select}><option>1024×1024</option></select>
            </div>
            <div style={s.fieldCol}>
              <span style={s.label}>请求温维值</span>
              <select style={s.select}><option>Default</option></select>
            </div>
          </div>
          <div style={{ ...s.rowWrap, marginTop: 8 }}>
            <div style={s.fieldCol}>
              <span style={s.label}>推理强度</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {['低', '中', '高'].map((lvl) => (
                  <button key={lvl} style={{ ...s.miniBtn, background: 'transparent', color: 'var(--ink-subtle)' }}>{lvl}</button>
                ))}
              </div>
            </div>
            <div style={s.fieldCol}>
              <span style={s.label}>长度</span>
              <select style={s.select}><option>自动</option><option>手动</option></select>
            </div>
            <div style={s.fieldCol}>
              <span style={s.label}>Logit 位置</span>
              <input type="number" style={{ ...s.numInput, width: 70 }} />
            </div>
          </div>
        </div>

        {/* Preset area */}
        <div style={s.section}>
          <div style={s.sectionTitle}>查看/参数偏置预设</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select style={{ ...s.select, flex: 1 }}>
              <option>Default (none)</option>
            </select>
            <button style={s.btn}>SPreset Editor</button>
          </div>
        </div>

        {/* Fixed modules */}
        <div style={s.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={s.sectionTitle}>提示词列表</div>
            <span style={{ fontSize: 9, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>
              Token: ~{(() => {
                const modTokens = MODULE_ITEMS.filter((m) => moduleEnabled[m.key]).reduce((sum, m) => sum + Math.round(m.content.length / 2.5), 0);
                const itemTokens = activeItems.filter((p) => p.enabled).reduce((sum, p) => sum + Math.round(p.content.length / 2.5), 0);
                return modTokens + itemTokens;
              })()}
            </span>
          </div>

          {/* Fixed modules — always present */}
          {MODULE_ITEMS.map((mod) => {
            const enabled = moduleEnabled[mod.key];
            const readOnly = mod.key === 'chat_examples' || mod.key === 'chat_history';
            return (
              <div key={mod.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: '1px solid rgba(196,168,85,0.08)', borderRadius: 3, background: 'rgba(0,0,0,0.1)', opacity: enabled ? 1 : 0.45, marginBottom: 3 }}>
                <button onClick={() => { if (!readOnly) setModuleEnabled((p) => ({ ...p, [mod.key]: !p[mod.key] })); }} disabled={readOnly} style={{ minWidth: 32, padding: '2px 0', borderRadius: 2, border: '1px solid', textAlign: 'center', borderColor: enabled ? 'var(--success)' : 'var(--ink-faded)', background: enabled ? 'rgba(58,107,90,0.1)' : 'rgba(0,0,0,0.2)', color: enabled ? 'var(--success)' : 'var(--ink-faded)', fontFamily: 'var(--font-ui)', fontSize: 8, cursor: readOnly ? 'not-allowed' : 'pointer', opacity: readOnly ? 0.5 : 1 }}>{enabled ? 'ON' : 'OFF'}</button>
                <span style={{ flex: 1, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>{mod.label}{readOnly && <span style={{ fontSize: 8, color: 'var(--ink-faded)', marginLeft: 4 }}>只读</span>}</span>
                <span style={{ fontSize: 8, color: 'var(--ink-faded)', fontFamily: 'var(--font-mono)' }}>~{Math.round(mod.content.length / 2.5)}t</span>
              </div>
            );
          })}
        </div>

        {/* Prompt library — saved items with full editing */}
        <div style={s.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={s.sectionTitle}>提示词清单（预备队列）</div>
            <button onClick={() => setEditingPrompt({ id: '', name: '', role: 'system', trigger: 'normal', position: 'relative', depth: 4, order: 100, content: '', enabled: true })} style={s.miniBtn}>+ 新建</button>
          </div>

          {/* Prompt editor modal */}
          {editingPrompt && (
            <div style={{ border: '1px solid var(--gold)', borderRadius: 4, padding: 10, marginBottom: 10, background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--gold)' }}>名称</span>
                  <input value={editingPrompt.name} onChange={(e) => setEditingPrompt({ ...editingPrompt, name: e.target.value })} style={{ ...s.input, fontSize: 10 }} placeholder="提示词名称" />
                </div>
                <div style={{ flex: '1 1 100px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--gold)' }}>身份</span>
                  <select value={editingPrompt.role} onChange={(e) => setEditingPrompt({ ...editingPrompt, role: e.target.value as PromptItem['role'] })} style={s.select}>
                    <option value="system">系统</option><option value="user">用户</option><option value="assistant">AI助手</option>
                  </select>
                </div>
                <div style={{ flex: '1 1 100px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--gold)' }}>触发器</span>
                  <select value={editingPrompt.trigger} onChange={(e) => setEditingPrompt({ ...editingPrompt, trigger: e.target.value as PromptItem['trigger'] })} style={s.select}>
                    <option value="normal">正常</option><option value="continue">续写</option><option value="ai_assist">AI帮答</option><option value="alt_reply">备选回复</option><option value="regenerate">重新生成</option><option value="silent">静默</option>
                  </select>
                </div>
                <div style={{ flex: '1 1 100px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--gold)' }}>位置</span>
                  <select value={editingPrompt.position} onChange={(e) => setEditingPrompt({ ...editingPrompt, position: e.target.value as 'relative' | 'depth' })} style={s.select}>
                    <option value="relative">相对</option><option value="depth">插入深度</option>
                  </select>
                </div>
              </div>
              {editingPrompt.position === 'depth' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 80 }}>
                    <span style={{ fontSize: 9, color: 'var(--gold)' }}>深度</span>
                    <input type="number" value={editingPrompt.depth} onChange={(e) => setEditingPrompt({ ...editingPrompt, depth: Number(e.target.value) || 0 })} min={0} style={{ ...s.numInput, width: '100%' }} />
                    <span style={{ fontSize: 7, color: 'var(--ink-faded)', lineHeight: 1.2 }}>"0"为最后一条消息之后,"1"为最后一条消息之前,等等</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 80 }}>
                    <span style={{ fontSize: 9, color: 'var(--gold)' }}>排序</span>
                    <input type="number" value={editingPrompt.order} onChange={(e) => setEditingPrompt({ ...editingPrompt, order: Number(e.target.value) || 100 })} min={0} style={{ ...s.numInput, width: '100%' }} />
                    <span style={{ fontSize: 7, color: 'var(--ink-faded)', lineHeight: 1.2 }}>从低到高排序,相同顺序：助手→用户→系统,默认100</span>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                <span style={{ fontSize: 9, color: 'var(--gold)' }}>提示词内容</span>
                <textarea value={editingPrompt.content} onChange={(e) => setEditingPrompt({ ...editingPrompt, content: e.target.value })} style={{ ...s.textarea, minHeight: 60 }} placeholder="提示词内容..." />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => {
                  const id = editingPrompt.id || 'pi_' + Date.now();
                  set('promptItems', [...form.promptItems, { ...editingPrompt, id }] as unknown as string);
                  setEditingPrompt(null);
                }} style={s.btn}>保存到清单</button>
                <button onClick={() => setEditingPrompt(null)} style={{ ...s.btn, color: 'var(--ink-subtle)' }}>取消</button>
              </div>
            </div>
          )}

          {/* Library items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
            {form.promptItems.map((item, idx) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: '1px solid rgba(196,168,85,0.08)', borderRadius: 3, background: 'rgba(0,0,0,0.1)' }}>
                <span style={{ flex: 1, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                  {item['name'] || '(未命名)'}
                  <span style={{ fontSize: 8, color: 'var(--ink-faded)', marginLeft: 6 }}>[{item['role']}] [{item['trigger']}]</span>
                </span>
                <span style={{ fontSize: 8, color: 'var(--ink-faded)', fontFamily: 'var(--font-mono)' }}>~{Math.round((item['content'] || '').length / 2.5)}t</span>
                <button onClick={() => { setEditingPrompt({ ...item } as unknown as PromptItem); }} style={{ ...s.miniBtn, fontSize: 9, padding: '1px 6px' }}>编辑</button>
                <button onClick={() => { setActiveItems([...activeItems, { ...item } as unknown as PromptItem]); }} style={{ ...s.miniBtn, fontSize: 9, padding: '1px 6px', color: 'var(--gold)', borderColor: 'var(--gold)' }}>插入</button>
                <button onClick={() => { set('promptItems', form.promptItems.filter((_, i) => i !== idx) as unknown as string); }} title="删除" style={{ ...s.iconBtn, color: 'var(--blood)', fontSize: 11 }}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Active list */}
        <div style={s.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={s.sectionTitle}>活跃提示词（已注入）</div>
            <button onClick={() => setActiveItems([])} style={s.miniBtn}>清空</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {activeItems.map((item, idx) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: '1px solid rgba(196,168,85,0.15)', borderLeft: '2px solid var(--gold)', borderRadius: 3, background: 'rgba(196,168,85,0.04)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <button onClick={() => { if (idx === 0) return; const items = [...activeItems]; [items[idx-1], items[idx]] = [items[idx], items[idx-1]]; setActiveItems(items); }} disabled={idx === 0} style={arrowBtnStyle}>▲</button>
                  <button onClick={() => { if (idx === activeItems.length - 1) return; const items = [...activeItems]; [items[idx], items[idx+1]] = [items[idx+1], items[idx]]; setActiveItems(items); }} disabled={idx === activeItems.length - 1} style={arrowBtnStyle}>▼</button>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                    {item['name'] || '(未命名)'}
                    <span style={{ fontSize: 8, color: 'var(--ink-faded)', marginLeft: 6 }}>[{item['role']}] [{(item as any).trigger || 'normal'}]</span>
                  </span>
                </div>
                <button onClick={() => { setActiveItems(activeItems.filter((_, i) => i !== idx)); }} title="移出" style={{ ...s.iconBtn, color: 'var(--ink-subtle)', fontSize: 11 }}>✕</button>
              </div>
            ))}
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
