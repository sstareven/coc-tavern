import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { RegexScript, RegexPlacement } from '../../types';
import { useRegexStore } from '../../stores/useRegexStore';
import { RegexProvider, runRegexScript } from '../../sillytavern/regex-engine';

const PLACEMENT_OPTIONS: { value: RegexPlacement; label: string }[] = [
  { value: 1, label: '用户输入' },
  { value: 2, label: 'AI 输出' },
  { value: 3, label: '斜杠命令' },
  { value: 5, label: '世界信息' },
  { value: 6, label: '推理' },
];

function uid(): string {
  return `regex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function RegexEditor() {
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
  const [placement, setPlacement] = useState<RegexPlacement[]>([1]);
  const [disabled, setDisabled] = useState(false);
  const [markdownOnly, setMarkdownOnly] = useState(true);
  const [promptOnly, setPromptOnly] = useState(false);
  const [runOnEdit, setRunOnEdit] = useState(true);
  const [substituteRegex, setSubstituteRegex] = useState<0 | 1 | 2>(0);
  const [minDepth, setMinDepth] = useState('');
  const [maxDepth, setMaxDepth] = useState('');

  // Test mode
  const [testMode, setTestMode] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [regexInfo, setRegexInfo] = useState('');

  useEffect(() => {
    if (editingScript) {
      setScriptName(editingScript.scriptName);
      setFindRegex(editingScript.findRegex);
      setReplaceString(editingScript.replaceString);
      setTrimStrings(editingScript.trimStrings?.join('\n') ?? '');
      setPlacement(editingScript.placement);
      setDisabled(editingScript.disabled ?? false);
      setMarkdownOnly(editingScript.markdownOnly ?? true);
      setPromptOnly(editingScript.promptOnly ?? false);
      setRunOnEdit(editingScript.runOnEdit ?? true);
      setSubstituteRegex(editingScript.substituteRegex ?? 0);
      setMinDepth(editingScript.minDepth != null ? String(editingScript.minDepth) : '');
      setMaxDepth(editingScript.maxDepth != null ? String(editingScript.maxDepth) : '');
    } else {
      setScriptName('');
      setFindRegex('');
      setReplaceString('');
      setTrimStrings('');
      setPlacement([1]);
      setDisabled(false);
      setMarkdownOnly(true);
      setPromptOnly(false);
      setRunOnEdit(true);
      setSubstituteRegex(0);
      setMinDepth('');
      setMaxDepth('');
    }
    setTestInput('');
    setTestOutput('');
    setRegexInfo('');
  }, [editingScript, isOpen]);

  const updateTest = () => {
    if (!findRegex) {
      setRegexInfo('查找正则不能为空');
      return;
    }
    setRegexInfo('');
    try {
      const testScript: RegexScript = {
        id: uid(),
        scriptName: scriptName || '测试',
        findRegex,
        replaceString,
        trimStrings: trimStrings.split('\n').filter(Boolean),
        placement: [],
        disabled: false,
        markdownOnly: false,
        promptOnly: false,
        runOnEdit: false,
        substituteRegex,
        minDepth: null,
        maxDepth: null,
      };
      const result = runRegexScript(testScript, testInput);
      setTestOutput(result);

      // Info about the regex
      try {
        const regex = RegexProvider.instance.get(findRegex);
        if (regex) {
          const infos: string[] = [];
          infos.push(regex.global ? '匹配全部' : '仅第一个');
          infos.push(regex.ignoreCase ? '忽略大小写' : '区分大小写');
          setRegexInfo(infos.join(' · '));
        }
      } catch {
        // ignore
      }
    } catch (e) {
      setRegexInfo(`错误: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const togglePlacement = (p: RegexPlacement) => {
    setPlacement((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const handleSave = () => {
    if (!scriptName.trim()) return;

    const script: RegexScript = {
      id: editingScript?.id ?? uid(),
      scriptName: scriptName.trim(),
      findRegex,
      replaceString,
      trimStrings: trimStrings.split('\n').filter(Boolean),
      placement,
      disabled,
      markdownOnly,
      promptOnly,
      runOnEdit,
      substituteRegex,
      minDepth: minDepth ? parseInt(minDepth, 10) : null,
      maxDepth: maxDepth ? parseInt(maxDepth, 10) : null,
    };

    if (editingScript) {
      updateScript(editingScript.id, editingType, script);
    } else {
      addScript(script, editingType);
    }
    closeEditor();
  };

  if (!isOpen) return null;

  return (
    <div className="panel-overlay" onClick={closeEditor}>
      <motion.div
        className="panel regex-editor-panel"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--parchment)',
          color: 'var(--ink)',
          borderRadius: 12,
          padding: 24,
          width: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          fontFamily: 'var(--font-ui)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--leather)', fontFamily: 'var(--font-display)' }}>
            {editingScript ? '编辑正则脚本' : '新建正则脚本'}
            <span style={{ fontSize: 12, marginLeft: 8, color: 'var(--ink-subtle)' }}>
              ({editingType === 'global' ? '全局' : editingType === 'scoped' ? '角色' : '预设'})
            </span>
          </h3>
          <button
            onClick={() => setTestMode(!testMode)}
            style={{
              background: 'var(--brass)',
              color: 'var(--parchment)',
              border: 'none',
              borderRadius: 6,
              padding: '4px 12px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {testMode ? '关闭测试' : '测试模式'}
          </button>
        </div>

        {/* Script Name */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--ink-subtle)', display: 'block', marginBottom: 3 }}>脚本名称</label>
          <input
            value={scriptName}
            onChange={(e) => setScriptName(e.target.value)}
            placeholder="输入脚本名称..."
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--brass)',
              fontFamily: 'var(--font-ui)', fontSize: 13, background: 'var(--parchment-deep)',
            }}
          />
        </div>

        {/* Find Regex */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--ink-subtle)', display: 'block', marginBottom: 3 }}>
            查找正则 {regexInfo && <span style={{ color: 'var(--success)', marginLeft: 6 }}>{regexInfo}</span>}
          </label>
          <input
            value={findRegex}
            onChange={(e) => setFindRegex(e.target.value)}
            placeholder='/pattern/gim 或 直接输入正则...'
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--brass)',
              fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--parchment-deep)',
            }}
          />
        </div>

        {/* Replace With */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--ink-subtle)', display: 'block', marginBottom: 3 }}>
            替换为 ($1 $2 捕获组, {'{{match}}'} 全匹配)
          </label>
          <textarea
            value={replaceString}
            onChange={(e) => setReplaceString(e.target.value)}
            placeholder="替换内容..."
            rows={3}
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--brass)',
              fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--parchment-deep)',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Trim Strings */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--ink-subtle)', display: 'block', marginBottom: 3 }}>
            裁剪字符串 (每行一个)
          </label>
          <textarea
            value={trimStrings}
            onChange={(e) => setTrimStrings(e.target.value)}
            placeholder="要移除的前后文本..."
            rows={2}
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--brass)',
              fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--parchment-deep)',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Two-column layout for options */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 10 }}>
          {/* Placement */}
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--ink-subtle)', display: 'block', marginBottom: 4 }}>影响范围</label>
            {PLACEMENT_OPTIONS.map((opt) => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 2 }}>
                <input
                  type="checkbox"
                  checked={placement.includes(opt.value)}
                  onChange={() => togglePlacement(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>

          {/* Other Options */}
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--ink-subtle)', display: 'block', marginBottom: 4 }}>其他选项</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 3 }}>
              <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
              禁用
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 3 }}>
              <input type="checkbox" checked={runOnEdit} onChange={(e) => setRunOnEdit(e.target.checked)} />
              编辑时运行
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 3 }}>
              <input type="checkbox" checked={markdownOnly} onChange={(e) => setMarkdownOnly(e.target.checked)} />
              仅格式化显示
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 3 }}>
              <input type="checkbox" checked={promptOnly} onChange={(e) => setPromptOnly(e.target.checked)} />
              仅格式化提示词
            </label>

            {/* Macro substitution */}
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--ink-subtle)', display: 'block', marginBottom: 2 }}>
                查找正则中的宏替换
              </label>
              <select
                value={substituteRegex}
                onChange={(e) => setSubstituteRegex(Number(e.target.value) as 0 | 1 | 2)}
                style={{
                  fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--brass)',
                  background: 'var(--parchment-deep)',
                }}
              >
                <option value={0}>不替换</option>
                <option value={1}>替换 (原始)</option>
                <option value={2}>替换 (转义)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Depth */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--ink-subtle)' }}>最小深度</label>
            <input
              type="number"
              value={minDepth}
              onChange={(e) => setMinDepth(e.target.value)}
              placeholder="不限"
              style={{
                width: 80, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--brass)',
                fontSize: 12, background: 'var(--parchment-deep)', marginLeft: 6,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--ink-subtle)' }}>最大深度</label>
            <input
              type="number"
              value={maxDepth}
              onChange={(e) => setMaxDepth(e.target.value)}
              placeholder="不限"
              style={{
                width: 80, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--brass)',
                fontSize: 12, background: 'var(--parchment-deep)', marginLeft: 6,
              }}
            />
          </div>
        </div>

        {/* Test Mode */}
        {testMode && (
          <div style={{ marginBottom: 12, padding: 12, background: 'var(--abyss)', borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--text-light)', display: 'block', marginBottom: 3 }}>测试输入</label>
                <textarea
                  value={testInput}
                  onChange={(e) => { setTestInput(e.target.value); }}
                  rows={3}
                  style={{
                    width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--brass)',
                    fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--leather)', color: 'var(--parchment)',
                    resize: 'vertical',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--text-light)', display: 'block', marginBottom: 3 }}>测试输出</label>
                <textarea
                  value={testOutput}
                  readOnly
                  rows={3}
                  style={{
                    width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--brass)',
                    fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--leather)', color: 'var(--gold)',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>
            <button
              onClick={updateTest}
              style={{
                marginTop: 8, background: 'var(--gold)', color: 'var(--abyss)', border: 'none',
                borderRadius: 4, padding: '4px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
              }}
            >
              运行测试
            </button>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={closeEditor}
            style={{
              background: 'transparent', color: 'var(--ink-faded)', border: '1px solid var(--ink-faded)',
              borderRadius: 6, padding: '6px 20px', cursor: 'pointer', fontSize: 13,
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!scriptName.trim()}
            style={{
              background: scriptName.trim() ? 'var(--gold)' : 'var(--ink-subtle)',
              color: 'var(--abyss)', border: 'none', borderRadius: 6, padding: '6px 20px',
              cursor: scriptName.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 'bold',
            }}
          >
            保存
          </button>
        </div>
      </motion.div>
    </div>
  );
}
