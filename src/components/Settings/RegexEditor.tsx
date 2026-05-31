import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { RegexScript, RegexPlacement } from '../../types';
import { useRegexStore } from '../../stores/useRegexStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { RegexProvider, runRegexScript } from '../../sillytavern/regex-engine';

const PLACEMENT_OPTIONS: { value: RegexPlacement; label: string }[] = [
  { value: 1, label: '用户输入' },
  { value: 2, label: 'AI 输出' },
  { value: 3, label: '快捷命令' },
  { value: 5, label: '世界信息' },
  { value: 6, label: '推理' },
];

function uid(): string {
  return `regex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function RegexEditor() {
  const isMobile = useIsMobile();
  const isOpen = useRegexStore((s) => s.isEditorOpen);
  const editingScript = useRegexStore((s) => s.editingScript);
  const editingType = useRegexStore((s) => s.editingType);
  const closeEditor = useRegexStore((s) => s.closeEditor);
  const addScript = useRegexStore((s) => s.addScript);
  const updateScript = useRegexStore((s) => s.updateScript);

  const [scriptName, setScriptName] = useState('');
  const [findRegex, setFindRegex] = useState('');
  const [replaceString, setReplaceString] = useState('');
  const [trimStrings, setTrimStrings] = useState('');
  const [placement, setPlacement] = useState<RegexPlacement[]>([1, 2]);
  const [disabled, setDisabled] = useState(false);
  const [markdownOnly, setMarkdownOnly] = useState(false);
  const [promptOnly, setPromptOnly] = useState(false);
  const [runOnEdit, setRunOnEdit] = useState(true);
  const [substituteRegex, setSubstituteRegex] = useState<0 | 1 | 2>(0);
  const [minDepth, setMinDepth] = useState('');
  const [maxDepth, setMaxDepth] = useState('');
  const [regexInfo, setRegexInfo] = useState('');

  // Test mode
  const [testMode, setTestMode] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');

  useEffect(() => {
    // eslint-disable react-hooks/set-state-in-effect -- intentional form init pattern
    if (editingScript) {
      setScriptName(editingScript.scriptName);
      setFindRegex(editingScript.findRegex);
      setReplaceString(editingScript.replaceString);
      setTrimStrings(editingScript.trimStrings?.join('\n') ?? '');
      setPlacement(editingScript.placement);
      setDisabled(editingScript.disabled ?? false);
      setMarkdownOnly(editingScript.markdownOnly ?? false);
      setPromptOnly(editingScript.promptOnly ?? false);
      setRunOnEdit(editingScript.runOnEdit ?? true);
      setSubstituteRegex(editingScript.substituteRegex ?? 0);
      setMinDepth(editingScript.minDepth != null ? String(editingScript.minDepth) : '');
      setMaxDepth(editingScript.maxDepth != null ? String(editingScript.maxDepth) : '');
    } else {
      setScriptName(''); setFindRegex(''); setReplaceString(''); setTrimStrings('');
      setPlacement([1, 2]); setDisabled(false); setMarkdownOnly(false);
      setPromptOnly(false); setRunOnEdit(true); setSubstituteRegex(0);
      setMinDepth(''); setMaxDepth('');
    }
    // eslint-enable react-hooks/set-state-in-effect
    setTestInput(''); setTestOutput(''); setRegexInfo('');
  }, [editingScript, isOpen]);

  // Real-time regex validation
  useEffect(() => {
    // eslint-disable react-hooks/set-state-in-effect -- intentional live validation
    if (!findRegex) { setRegexInfo(''); return; }
    try {
      const regex = RegexProvider.instance.get(findRegex);
      if (regex) {
        const infos: string[] = [];
        infos.push(regex.global ? '全局匹配' : '仅第一个匹配项');
        infos.push(regex.ignoreCase ? '不区分大小写' : '区分大小写');
        setRegexInfo(infos.join(' · '));
      }
    } catch {
      setRegexInfo('⚠ 正则表达式无效');
    }
    // eslint-enable react-hooks/set-state-in-effect
  }, [findRegex]);

  const updateTest = () => {
    if (!findRegex) return;
    try {
      const testScript: RegexScript = {
        id: uid(), scriptName: scriptName || '测试', findRegex, replaceString,
        trimStrings: trimStrings.split('\n').filter(Boolean), placement: [],
        disabled: false, markdownOnly: false, promptOnly: false,
        runOnEdit: false, substituteRegex, minDepth: null, maxDepth: null,
      };
      setTestOutput(runRegexScript(testScript, testInput));
    } catch (e) {
      setTestOutput(`错误: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const togglePlacement = (p: RegexPlacement) => {
    setPlacement((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const handleSave = () => {
    if (!scriptName.trim()) return;
    const script: RegexScript = {
      id: editingScript?.id ?? uid(),
      scriptName: scriptName.trim(),
      findRegex, replaceString,
      trimStrings: trimStrings.split('\n').filter(Boolean),
      placement, disabled, markdownOnly, promptOnly, runOnEdit, substituteRegex,
      minDepth: minDepth ? parseInt(minDepth, 10) : null,
      maxDepth: maxDepth ? parseInt(maxDepth, 10) : null,
    };
    if (editingScript) updateScript(editingScript.id, editingType, script);
    else addScript(script, editingType);
    closeEditor();
  };

  if (!isOpen) return null;

  return (
    <div onClick={closeEditor} style={{ position: 'fixed', inset: 0, zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)', border: '1px solid var(--gold)', borderRadius: 8, padding: 24, width: 620, maxWidth: '100vw', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'var(--font-ui)', boxShadow: '0 0 80px rgba(0,0,0,0.6)', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)', ...(isMobile ? { width: '100vw', height: '100dvh', maxHeight: '100dvh', borderRadius: 0, border: 'none', padding: 16 } : {}) }}>
        <style>{`.re-scroll::-webkit-scrollbar{width:5px}.re-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.15);border-radius:3px}.re-scroll::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}.re-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}`}</style>

        {/* Title bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: 3 }}>正则脚本编辑器</h3>
            <span style={{ fontSize: 10, color: 'var(--ink-subtle)' }}>({editingType === 'global' ? '全局' : '预设'})</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setTestMode(!testMode)} style={{ ...headerBtn, color: testMode ? 'var(--gold)' : 'var(--ink-subtle)' }}>
              {testMode ? '关闭测试' : '测试'}
            </button>
            <button onClick={closeEditor} style={{ ...headerBtn, fontSize: 16, border: 'none' }}>✕</button>
          </div>
        </div>

        {/* Script name */}
        <div style={fieldGroup}>
          <label style={labelStyle}>脚本名称</label>
          <input value={scriptName} onChange={(e) => setScriptName(e.target.value)} placeholder="输入脚本名称…"
            style={inputStyle} onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--brass)'} />
        </div>

        {/* Find regex */}
        <div style={fieldGroup}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={labelStyle}>查找正则表达式</label>
            {regexInfo && <span style={{ fontSize: 9, color: regexInfo.startsWith('⚠') ? 'var(--blood)' : 'var(--success)', fontFamily: 'var(--font-mono)' }}>{regexInfo}</span>}
          </div>
          <textarea value={findRegex} onChange={(e) => setFindRegex(e.target.value)}
            placeholder="/pattern/flags 或 直接输入正则表达式…" rows={2}
            style={{ ...textareaStyle, fontFamily: 'var(--font-mono)' }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--brass)'} />
        </div>

        {/* Replace with */}
        <div style={fieldGroup}>
          <label style={labelStyle}>替换为 <span style={{ fontWeight: 'normal', fontSize: 9, color: 'var(--ink-faded)' }}>($1 $2 捕获组, $&amp; 全匹配)</span></label>
          <textarea value={replaceString} onChange={(e) => setReplaceString(e.target.value)}
            placeholder="替换内容…" rows={2} style={textareaStyle}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--brass)'} />
        </div>

        {/* Trim strings */}
        <div style={fieldGroup}>
          <label style={labelStyle}>修剪字符串 <span style={{ fontWeight: 'normal', fontSize: 9, color: 'var(--ink-faded)' }}>(每行一个，在替换后全局修剪匹配项)</span></label>
          <textarea value={trimStrings} onChange={(e) => setTrimStrings(e.target.value)}
            placeholder="要移除的前后文本…" rows={2} style={textareaStyle}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--brass)'} />
        </div>

        {/* Scope */}
        <div style={{ ...fieldGroup, marginBottom: 12 }}>
          <label style={{ ...labelStyle, marginBottom: 6 }}>作用范围</label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {PLACEMENT_OPTIONS.map((opt) => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-light)', cursor: 'pointer' }}>
                <input type="checkbox" checked={placement.includes(opt.value)} onChange={() => togglePlacement(opt.value)} style={{ accentColor: 'var(--gold)' }} />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Depth */}
        <div style={{ ...fieldGroup, marginBottom: 12 }}>
          <label style={{ ...labelStyle, marginBottom: 6 }}>深度范围</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--ink-subtle)' }}>最小:</span>
            <input type="number" value={minDepth} onChange={(e) => setMinDepth(e.target.value)}
              placeholder="无限" style={numInput} />
            <span style={{ fontSize: 10, color: 'var(--ink-subtle)' }}>最大:</span>
            <input type="number" value={maxDepth} onChange={(e) => setMaxDepth(e.target.value)}
              placeholder="无限" style={numInput} />
          </div>
        </div>

        {/* Other options */}
        <div style={{ ...fieldGroup, marginBottom: 12 }}>
          <label style={{ ...labelStyle, marginBottom: 6 }}>选项</label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <CheckLabel checked={disabled} onChange={setDisabled} label="已禁用" />
            <CheckLabel checked={runOnEdit} onChange={setRunOnEdit} label="编辑时运行" />
          </div>
        </div>

        {/* Macro substitution */}
        <div style={{ ...fieldGroup, marginBottom: 12 }}>
          <label style={labelStyle}>查找正则中的宏替换</label>
          <select value={substituteRegex} onChange={(e) => setSubstituteRegex(Number(e.target.value) as 0 | 1 | 2)}
            style={{ ...inputStyle, width: 180, marginTop: 4 }}>
            <option value={0}>不替换</option>
            <option value={1}>替换 (原始)</option>
            <option value={2}>替换 (转义)</option>
          </select>
        </div>

        {/* Display options */}
        <div style={{ ...fieldGroup, marginBottom: 12 }}>
          <label style={{ ...labelStyle, marginBottom: 6 }}>显示选项</label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <CheckLabel checked={markdownOnly} onChange={setMarkdownOnly} label="仅影响显示" />
            <CheckLabel checked={promptOnly} onChange={setPromptOnly} label="仅影响后端提示词" />
          </div>
        </div>

        {/* Test Mode */}
        {testMode && (
          <div style={{ marginBottom: 16, padding: 14, background: 'rgba(0,0,0,0.25)', borderRadius: 6, border: '1px solid rgba(196,168,85,0.12)' }}>
            <label style={{ ...labelStyle, marginBottom: 8 }}>测试正则</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <input value={testInput} onChange={(e) => setTestInput(e.target.value)} placeholder="测试输入…" style={{ ...inputStyle, fontSize: 11 }} />
              </div>
              <div style={{ flex: 1 }}>
                <input value={testOutput} readOnly placeholder="测试输出…" style={{ ...inputStyle, fontSize: 11, color: 'var(--gold)', background: 'rgba(196,168,85,0.05)' }} />
              </div>
            </div>
            <button onClick={updateTest} style={{ marginTop: 8, ...headerBtn, color: 'var(--gold)', borderColor: 'var(--gold)' }}>运行测试</button>
          </div>
        )}

        {/* Save/Cancel */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid rgba(196,168,85,0.12)', paddingTop: 14 }}>
          <button onClick={closeEditor} style={{ ...headerBtn, color: 'var(--ink-faded)' }}>取消</button>
          <button onClick={handleSave} disabled={!scriptName.trim()}
            style={{ ...headerBtn, color: scriptName.trim() ? 'var(--gold)' : 'var(--ink-faded)', borderColor: scriptName.trim() ? 'var(--gold)' : 'var(--brass)', opacity: scriptName.trim() ? 1 : 0.4 }}>
            保存
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CheckLabel({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-light)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
      {label}
    </label>
  );
}

const fieldGroup: React.CSSProperties = { marginBottom: 14 };

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--font-ui)',
  letterSpacing: 1, display: 'block', marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-ui)',
  fontSize: 12, outline: 'none', caretColor: 'var(--gold)',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: 'vertical', minHeight: 40,
};

const numInput: React.CSSProperties = {
  width: 70, padding: '4px 6px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)',
  fontSize: 11, textAlign: 'center', outline: 'none',
};

const headerBtn: React.CSSProperties = {
  padding: '4px 12px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'transparent', color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
};
