import { useState } from 'react';
import type { Extension } from '../../types';

const DEFAULT_EXTS: Extension[] = [
  {
    id: 'ext-1', name: '深渊角色生成器', version: '1.2.0', author: 'Abyssal Team',
    description: '随机生成COC 7版调查员角色卡，支持自定义参数与种族选项。',
    enabled: true, entryPoint: 'ext_char_gen.js',
  },
  {
    id: 'ext-2', name: '骰子特效包', version: '0.8.1', author: 'DiceMaster',
    description: '为骰子检定结果添加自定义视觉效果，支持主题切换。',
    enabled: false, entryPoint: 'ext_dice_fx.js',
  },
  {
    id: 'ext-3', name: '剧情树编辑器', version: '2.0.0', author: 'StoryForge',
    description: '可视化编辑COC模组的剧情分支与选择节点。',
    enabled: true, entryPoint: 'ext_story_tree.js',
  },
];

interface Props {
  onClose: () => void;
}

export function ExtManager({ onClose }: Props) {
  const [exts, setExts] = useState(DEFAULT_EXTS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importPath, setImportPath] = useState('');

  const handleImport = () => {
    if (!importPath.trim()) return;
    const name = importPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '新扩展';
    const newExt: Extension = {
      id: 'ext-' + Date.now(),
      name,
      version: '0.1.0',
      author: '未知',
      description: '从 ' + importPath.trim() + ' 导入',
      enabled: false,
      entryPoint: importPath.trim(),
    };
    setExts((prev) => [...prev, newExt]);
    setImportPath('');
    setShowImport(false);
  };

  const toggleExt = (id: string) => {
    setExts((prev) => prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)));
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        border: '1px solid var(--gold)', borderRadius: 8,
        padding: '24px 28px', minWidth: 500, maxWidth: 640, width: '90%',
        boxShadow: '0 0 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12,
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>
            扩展管理 / EXTENSIONS
          </h3>
          <button onClick={onClose} style={closeBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >✕</button>
        </div>

        {/* Extension list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--ink-faded) transparent', marginBottom: 14 }}>
          {exts.map((ext) => {
            const expanded = expandedId === ext.id;
            return (
              <div key={ext.id} style={{
                border: expanded ? '1px solid rgba(196,168,85,0.2)' : '1px solid rgba(196,168,85,0.08)',
                borderRadius: 4, background: 'rgba(0,0,0,0.15)', overflow: 'hidden',
                transition: 'var(--transition-smooth)',
              }}>
                {/* Header row */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', cursor: 'pointer',
                }} onClick={() => setExpandedId(expanded ? null : ext.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Enable toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleExt(ext.id); }}
                      style={{
                        width: 14, height: 14, borderRadius: '50%', border: ext.enabled ? '2px solid var(--success)' : '2px solid var(--ink-faded)',
                        background: ext.enabled ? 'var(--success)' : 'transparent',
                        cursor: 'pointer', padding: 0, flexShrink: 0,
                        transition: 'var(--transition-smooth)',
                      }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
                        {ext.name}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>
                        v{ext.version} · {ext.author}
                      </span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, color: 'var(--ink-subtle)',
                    transition: 'transform 0.3s',
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}>
                    ▼
                  </span>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{
                    padding: '0 14px 14px', borderTop: '1px solid rgba(196,168,85,0.08)',
                  }}>
                    <p style={{ fontSize: 11, color: 'var(--ink-subtle)', fontFamily: 'var(--font-body)', lineHeight: 1.6, margin: '10px 0' }}>
                      {ext.description}
                    </p>
                    <div style={{ fontSize: 10, color: 'var(--ink-faded)', fontFamily: 'var(--font-mono)' }}>
                      入口: {ext.entryPoint}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Import button */}
        <button onClick={() => setShowImport(true)} style={{
          width: '100%', padding: '10px 0',
          border: '1px dashed var(--brass)', borderRadius: 4,
          background: 'transparent', color: 'var(--ink-subtle)',
          fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 3, cursor: 'pointer',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.color = 'var(--ink-subtle)'; }}
        >
          导入扩展...
        </button>

        {/* Import modal */}
        {showImport && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
          }} onClick={() => setShowImport(false)}>
            <div style={{
              background: 'var(--leather)', border: '1px solid var(--gold)',
              borderRadius: 6, padding: '20px 24px', maxWidth: 400, width: '90%',
            }} onClick={(e) => e.stopPropagation()}>
              <h4 style={{ fontSize: 14, color: 'var(--gold)', fontFamily: 'var(--font-display)', letterSpacing: 3, margin: '0 0 16px' }}>
                导入扩展
              </h4>
              <input value={importPath} onChange={(e) => setImportPath(e.target.value)}
                placeholder="扩展文件路径或URL..."
                style={{
                  width: '100%', padding: '8px 10px', border: '1px solid var(--brass)', borderRadius: 3,
                  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
                  fontFamily: 'var(--font-ui)', fontSize: 12, outline: 'none', caretColor: 'var(--gold)',
                  marginBottom: 14,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowImport(false)} style={{
                  padding: '6px 16px', border: '1px solid var(--brass)', borderRadius: 3,
                  background: 'transparent', color: 'var(--ink-subtle)',
                  fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
                }}>取消</button>
                <button onClick={handleImport} style={{
                  padding: '6px 16px', border: '1px solid var(--gold)', borderRadius: 3,
                  background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
                  fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
                }}>导入</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const closeBtnStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: 3, background: 'transparent',
  color: 'var(--ink-subtle)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};
