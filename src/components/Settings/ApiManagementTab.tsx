// src/components/Settings/ApiManagementTab.tsx —— SettingsPanel「API 管理」tab 主体
// 设计:
//   - 顶部:添加 API 表单(识别名/地址/Key + 连接测试 + 保存)
//   - 中部:已保存 API 配置列表 — 横向滚动表格(overflowX:auto + 全局铜版风滚动条)
//   - 编辑:点行内「编辑」icon → motion.div 浮层弹出表单
//          apiKey 输入框留空=不覆盖原值(决策点 3),旁有「显示原 Key」眼睛 icon
//   - 删除:点「删除」icon → inline 二次确认气泡(原地确认/取消)
//   - 脱敏:列表的 apiKey 不显示明文,只显「****abcd」(maskApiKey)
//   - 全局已生效铜版风滚动条,无需手套类

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApiProfilesStore } from '../../stores/useApiProfilesStore';
import {
  type ApiProfile,
  type ApiProfileForm,
  validateApiProfileForm,
} from '../../api/api-profiles-engine';
import { maskApiKey, displayHostFromUrl } from '../../api/api-models-engine';
import { fetchModelList } from '../../sillytavern/api-router';
import { CategoryBar } from './_shared';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 9px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)',
  fontSize: 'calc(11px * var(--system-ratio, 1))', outline: 'none', caretColor: 'var(--gold)',
  boxSizing: 'border-box',
};

const labelInForm: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))',
  color: 'var(--gold)', letterSpacing: 2, marginBottom: 4, display: 'block',
};

const miniBtnBase: React.CSSProperties = {
  padding: '6px 12px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)',
  fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))',
  letterSpacing: 1.5, cursor: 'pointer',
  transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
  transform: 'scale(1)', filter: 'brightness(1)',
};

function miniBtnHover(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.borderColor = 'var(--gold)';
  e.currentTarget.style.color = 'var(--gold)';
  e.currentTarget.style.background = 'rgba(196,168,85,0.08)';
  e.currentTarget.style.filter = 'brightness(1.15)';
  e.currentTarget.style.transform = 'scale(1.04)';
}
function miniBtnLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.borderColor = 'var(--brass)';
  e.currentTarget.style.color = 'var(--text-light)';
  e.currentTarget.style.background = 'rgba(0,0,0,0.2)';
  e.currentTarget.style.filter = 'brightness(1)';
  e.currentTarget.style.transform = 'scale(1)';
}
function miniBtnPress(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.transform = 'scale(0.96)';
  e.currentTarget.style.filter = 'brightness(0.92)';
}
function miniBtnRelease(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.transform = 'scale(1.04)';
  e.currentTarget.style.filter = 'brightness(1.15)';
}

/** SVG icon: 编辑(笔/羊皮卷) */
function IconEdit() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
/** SVG icon: 删除(垃圾桶) */
function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function ApiManagementTab() {
  const profiles = useApiProfilesStore((s) => s.apiProfiles);
  const addProfile = useApiProfilesStore((s) => s.addProfile);
  const updateProfile = useApiProfilesStore((s) => s.updateProfileById);
  const deleteProfile = useApiProfilesStore((s) => s.deleteProfileById);
  const setProfileAvailableModels = useApiProfilesStore((s) => s.setProfileAvailableModels);

  // 添加表单 state
  const [addLabel, setAddLabel] = useState('');
  const [addUrl, setAddUrl] = useState('https://api.deepseek.com');
  const [addKey, setAddKey] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addTestStatus, setAddTestStatus] = useState<'idle' | 'testing' | 'ok' | 'failed'>('idle');
  const [addTestModels, setAddTestModels] = useState<string[]>([]);

  // 删除二确气泡
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // 编辑模态
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAddTest = async () => {
    setAddError(null);
    const v = validateApiProfileForm({ label: addLabel, apiBaseUrl: addUrl, apiKey: addKey });
    if (!v.ok) { setAddError(v.error ?? '表单无效'); return; }
    setAddTestStatus('testing');
    try {
      const list = await fetchModelList(addUrl.trim(), addKey);
      setAddTestModels(list);
      setAddTestStatus(list.length > 0 ? 'ok' : 'failed');
    } catch {
      setAddTestModels([]);
      setAddTestStatus('failed');
    }
  };

  const handleAddSave = () => {
    setAddError(null);
    const form: ApiProfileForm = { label: addLabel, apiBaseUrl: addUrl, apiKey: addKey };
    const v = validateApiProfileForm(form);
    if (!v.ok) { setAddError(v.error ?? '表单无效'); return; }
    const newProfile = addProfile(form);
    if (addTestModels.length > 0) {
      setProfileAvailableModels(newProfile.id, addTestModels);
    }
    // 重置表单
    setAddLabel('');
    setAddUrl('https://api.deepseek.com');
    setAddKey('');
    setAddTestStatus('idle');
    setAddTestModels([]);
  };

  return (
    <div style={{ padding: '4px 4px 20px' }}>
      {/* v1.14.0 升级警示 — 老存档的旧 API 三件套字段已删除,提醒用户在此重新填写 */}
      {profiles.length === 0 && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'rgba(196,168,85,0.06)',
          border: '1px solid rgba(196,168,85,0.25)', borderRadius: 4,
          fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio,1))',
          color: 'var(--ink-subtle)', lineHeight: 1.7,
        }}>
          <span style={{ color: 'var(--gold)', letterSpacing: 1.5 }}>v1.14.0 重构</span> ·
          API 管理改为多 profile 模式;原「主 API / MVU / 补写」三套独立配置已合并清空,请在下方重新添加配置后,
          回到基本设置选择对应 profile 与模型。
        </div>
      )}

      {/* ────────── 添加 API ────────── */}
      <CategoryBar label="添加 API" first />
      <div style={{
        display: 'grid', gap: 10, padding: '10px 0 14px',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      }}>
        <div>
          <label style={labelInForm}>识别名</label>
          <input
            type="text" value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            placeholder="如 DeepSeek 官方"
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
        </div>
        <div>
          <label style={labelInForm}>API 地址</label>
          <input
            type="text" value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            placeholder="https://api.deepseek.com"
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
        </div>
        <div>
          <label style={labelInForm}>API Key</label>
          <input
            type="password" value={addKey}
            onChange={(e) => setAddKey(e.target.value)}
            placeholder="留空表示无鉴权代理"
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={handleAddTest} disabled={addTestStatus === 'testing'}
          style={{ ...miniBtnBase, opacity: addTestStatus === 'testing' ? 0.5 : 1 }}
          onMouseEnter={miniBtnHover} onMouseLeave={miniBtnLeave}
          onMouseDown={miniBtnPress} onMouseUp={miniBtnRelease}
        >
          {addTestStatus === 'testing' ? '测试中...' : '连接测试'}
        </button>
        <button onClick={handleAddSave}
          style={{
            ...miniBtnBase,
            borderColor: 'var(--gold)', color: 'var(--gold)',
            background: 'rgba(196,168,85,0.1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(196,168,85,0.2)';
            e.currentTarget.style.filter = 'brightness(1.2)';
            e.currentTarget.style.transform = 'scale(1.04)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(196,168,85,0.1)';
            e.currentTarget.style.filter = 'brightness(1)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseDown={miniBtnPress} onMouseUp={miniBtnRelease}
        >保 存</button>

        {addTestStatus === 'ok' && (
          <span style={{ fontSize: 'calc(10px * var(--system-ratio,1))', color: 'var(--success)', letterSpacing: 1, fontFamily: 'var(--font-ui)' }}>
            已连接 · 拉到 {addTestModels.length} 个模型
          </span>
        )}
        {addTestStatus === 'failed' && (
          <span style={{ fontSize: 'calc(10px * var(--system-ratio,1))', color: 'var(--blood)', letterSpacing: 1, fontFamily: 'var(--font-ui)' }}>
            连接失败,请检查地址和 Key
          </span>
        )}
        {addError && (
          <span style={{ fontSize: 'calc(10px * var(--system-ratio,1))', color: 'var(--blood)', letterSpacing: 1, fontFamily: 'var(--font-ui)' }}>
            {addError}
          </span>
        )}
      </div>

      {/* ────────── 已保存列表 ────────── */}
      <div style={{ marginTop: 22 }}>
        <CategoryBar label={`已保存的 API 配置 (${profiles.length})`} />
      </div>

      {profiles.length === 0 ? (
        <div style={{
          padding: '20px 16px', textAlign: 'center',
          fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio, 1))',
          color: 'var(--ink-faded)', letterSpacing: 2,
          border: '1px dashed rgba(196,168,85,0.2)', borderRadius: 4,
          marginTop: 10,
        }}>
          尚未添加任何 API 配置
        </div>
      ) : (
        <div style={{
          marginTop: 10, overflowX: 'auto',
          border: '1px solid rgba(196,168,85,0.15)', borderRadius: 4,
        }}>
          <table style={{
            width: '100%', minWidth: 720, borderCollapse: 'collapse',
            fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio, 1))',
            color: 'var(--text-light)',
          }}>
            <thead>
              <tr style={{ background: 'rgba(196,168,85,0.06)', borderBottom: '1px solid rgba(196,168,85,0.15)' }}>
                <th style={thStyle}>识别名</th>
                <th style={thStyle}>API 地址</th>
                <th style={thStyle}>API Key</th>
                <th style={{ ...thStyle, textAlign: 'center', width: 70 }}>模型数</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <ProfileRow
                  key={p.id}
                  profile={p}
                  confirmDelete={confirmDeleteId === p.id}
                  onAskDelete={() => setConfirmDeleteId(p.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onConfirmDelete={() => { deleteProfile(p.id); setConfirmDeleteId(null); }}
                  onEdit={() => setEditingId(p.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ────────── 编辑模态 ────────── */}
      <AnimatePresence>
        {editingId && (
          <EditProfileModal
            profile={profiles.find((p) => p.id === editingId)!}
            onClose={() => setEditingId(null)}
            onSave={(patch) => {
              updateProfile(editingId, patch);
              setEditingId(null);
            }}
            onTestAndSaveModels={async (url, key) => {
              const list = await fetchModelList(url, key);
              setProfileAvailableModels(editingId, list);
              return list;
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left',
  fontSize: 'calc(10px * var(--system-ratio, 1))',
  color: 'var(--gold)', letterSpacing: 2, fontWeight: 'normal',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', borderTop: '1px solid rgba(196,168,85,0.08)',
  fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
};

interface RowProps {
  profile: ApiProfile;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onEdit: () => void;
}

function ProfileRow({ profile, confirmDelete, onAskDelete, onCancelDelete, onConfirmDelete, onEdit }: RowProps) {
  return (
    <tr style={{
      transition: 'background 150ms',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.04)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <td style={tdStyle}><span style={{ color: 'var(--gold)' }}>{profile.label}</span></td>
      <td style={tdStyle}>{displayHostFromUrl(profile.apiBaseUrl)}</td>
      <td style={{ ...tdStyle, color: 'var(--ink-faded)' }}>{maskApiKey(profile.apiKey)}</td>
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px',
          background: 'rgba(196,168,85,0.1)',
          border: '1px solid rgba(196,168,85,0.25)', borderRadius: 10,
          fontSize: 'calc(10px * var(--system-ratio,1))',
          color: profile.availableModels.length > 0 ? 'var(--gold)' : 'var(--ink-faded)',
        }}>{profile.availableModels.length}</span>
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {confirmDelete ? (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 'calc(9px * var(--system-ratio,1))', color: 'var(--blood)', letterSpacing: 1 }}>确认删除?</span>
            <button onClick={onConfirmDelete}
              style={{ ...miniBtnBase, padding: '3px 8px', borderColor: 'var(--blood)', color: 'var(--blood)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,80,80,0.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
            >删除</button>
            <button onClick={onCancelDelete}
              style={{ ...miniBtnBase, padding: '3px 8px' }}
              onMouseEnter={miniBtnHover} onMouseLeave={miniBtnLeave}
            >取消</button>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <button onClick={onEdit} title="编辑"
              style={{ ...miniBtnBase, padding: '4px 7px', color: 'var(--gold)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.12)'; e.currentTarget.style.filter = 'brightness(1.2)'; e.currentTarget.style.transform = 'scale(1.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseDown={miniBtnPress} onMouseUp={miniBtnRelease}
            ><IconEdit /></button>
            <button onClick={onAskDelete} title="删除"
              style={{ ...miniBtnBase, padding: '4px 7px', color: 'var(--blood)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,80,80,0.12)'; e.currentTarget.style.filter = 'brightness(1.2)'; e.currentTarget.style.transform = 'scale(1.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseDown={miniBtnPress} onMouseUp={miniBtnRelease}
            ><IconTrash /></button>
          </span>
        )}
      </td>
    </tr>
  );
}

// ────────── 编辑模态 ──────────

interface EditModalProps {
  profile: ApiProfile;
  onClose: () => void;
  onSave: (patch: { label?: string; apiBaseUrl?: string; apiKey?: string }) => void;
  onTestAndSaveModels: (url: string, key: string) => Promise<string[]>;
}

function EditProfileModal({ profile, onClose, onSave, onTestAndSaveModels }: EditModalProps) {
  const [label, setLabel] = useState(profile.label);
  const [url, setUrl] = useState(profile.apiBaseUrl);
  // apiKey 输入框默认是空 — 留空=保持原值(决策点 3:防误清空)
  const [keyInput, setKeyInput] = useState('');
  const [revealOriginal, setRevealOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'failed'>('idle');
  const [testCount, setTestCount] = useState(0);

  const handleSave = () => {
    setError(null);
    const labelTrim = label.trim();
    const urlTrim = url.trim();
    if (!labelTrim) { setError('识别名不能为空'); return; }
    if (!urlTrim) { setError('API 地址不能为空'); return; }
    try {
      const u = new URL(urlTrim);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') { setError('API 地址必须以 http(s) 开头'); return; }
    } catch { setError('API 地址格式无效'); return; }

    onSave({
      label: labelTrim,
      apiBaseUrl: urlTrim,
      // keyInput 留空 → 不传 apiKey → updateApiProfile 保持原值
      ...(keyInput.length > 0 ? { apiKey: keyInput } : null),
    });
  };

  const handleTest = async () => {
    setError(null);
    const effectiveKey = keyInput.length > 0 ? keyInput : profile.apiKey;
    setTestStatus('testing');
    try {
      const list = await onTestAndSaveModels(url.trim(), effectiveKey);
      setTestCount(list.length);
      setTestStatus(list.length > 0 ? 'ok' : 'failed');
    } catch {
      setTestStatus('failed');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 92vw)', padding: '22px 24px',
          background: 'radial-gradient(ellipse at top, #221a10 0%, var(--void) 95%)',
          border: '1px solid var(--gold)', borderRadius: 6,
          boxShadow: '0 16px 56px rgba(0,0,0,0.55), 0 0 32px rgba(196,168,85,0.08)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: 'calc(16px * var(--system-ratio,1))',
            color: 'var(--gold)', letterSpacing: 4, margin: 0,
          }}>编辑 API 配置</h3>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--ink-faded)',
            fontSize: 'calc(14px * var(--system-ratio,1))', cursor: 'pointer', padding: 4,
          }}>✕</button>
        </div>

        <div>
          <label style={labelInForm}>识别名</label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }} />
        </div>
        <div>
          <label style={labelInForm}>API 地址</label>
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }} />
        </div>
        <div>
          <label style={labelInForm}>
            API Key <span style={{ color: 'var(--ink-faded)', letterSpacing: 1 }}>(留空则保持原值 · 原 Key {maskApiKey(profile.apiKey) || '空'})</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type={revealOriginal ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="留空则保持原值"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
            />
            <button onClick={() => setRevealOriginal((v) => !v)}
              style={{ ...miniBtnBase, padding: '5px 10px', whiteSpace: 'nowrap' }}
              onMouseEnter={miniBtnHover} onMouseLeave={miniBtnLeave}
            >{revealOriginal ? '隐藏' : '显示'}</button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          <button onClick={handleTest} disabled={testStatus === 'testing'}
            style={{ ...miniBtnBase, opacity: testStatus === 'testing' ? 0.5 : 1 }}
            onMouseEnter={miniBtnHover} onMouseLeave={miniBtnLeave}
            onMouseDown={miniBtnPress} onMouseUp={miniBtnRelease}
          >{testStatus === 'testing' ? '测试中...' : '连接测试'}</button>

          <button onClick={handleSave}
            style={{ ...miniBtnBase, borderColor: 'var(--gold)', color: 'var(--gold)', background: 'rgba(196,168,85,0.1)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.2)'; e.currentTarget.style.filter = 'brightness(1.2)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.1)'; e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={miniBtnPress} onMouseUp={miniBtnRelease}
          >保 存</button>

          <button onClick={onClose}
            style={{ ...miniBtnBase }}
            onMouseEnter={miniBtnHover} onMouseLeave={miniBtnLeave}
            onMouseDown={miniBtnPress} onMouseUp={miniBtnRelease}
          >取 消</button>

          {testStatus === 'ok' && (
            <span style={{ fontSize: 'calc(10px * var(--system-ratio,1))', color: 'var(--success)', letterSpacing: 1, fontFamily: 'var(--font-ui)' }}>已连接 · {testCount} 个模型</span>
          )}
          {testStatus === 'failed' && (
            <span style={{ fontSize: 'calc(10px * var(--system-ratio,1))', color: 'var(--blood)', letterSpacing: 1, fontFamily: 'var(--font-ui)' }}>连接失败</span>
          )}
          {error && (
            <span style={{ fontSize: 'calc(10px * var(--system-ratio,1))', color: 'var(--blood)', letterSpacing: 1, fontFamily: 'var(--font-ui)' }}>{error}</span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
