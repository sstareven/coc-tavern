// src/components/Settings/ApiManagementTab.tsx —— SettingsPanel「API 管理」tab 主体
// 设计:
//   - 顶部:添加 API 表单(识别名/地址/Key)+ 单一「保存」按钮(无独立连接测试)
//          保存时同步做连通性校验:fetchModelList 失败/拉到 0 模型 → 错误显示在按钮右侧
//   - 中部:已保存 API 配置列表 — 横向滚动表格(overflowX:auto + 全局铜版风滚动条)
//   - 编辑:点行内「编辑」icon → motion.div 浮层弹出表单
//          apiKey 输入框留空=不覆盖原值(决策点 3),旁有「显示原 Key」眼睛 icon
//          保存逻辑同上(无独立连接测试)
//   - 删除:点「删除」icon → inline 二次确认气泡(原地确认/取消)
//   - 脱敏:列表的 apiKey 不显示明文,只显「****abcd」(maskApiKey)
//   - v1.14.1:三段 API 配置(主/MVU/补写)从 SettingsPanel 搬来,在「已保存列表」下方

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApiProfilesStore } from '../../stores/useApiProfilesStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { usePromptViewerStore } from '../../stores/usePromptViewerStore';
import { summarizeExtraParamsRules } from '../../api/api-extra-params-engine';
import {
  type ApiProfile,
  type ApiProfileForm,
  validateApiProfileForm,
} from '../../api/api-profiles-engine';
import { maskApiKey, displayHostFromUrl } from '../../api/api-models-engine';
import { fetchModelList } from '../../sillytavern/api-router';
import { ApiModelPicker } from './ApiModelPicker';
import { ImageApiSection } from './ImageApiSection';
import {
  CategoryBar, rowStyle, labelStyle, Toggle, HelpIcon, SliderRow,
} from './_shared';

/** 提示词后处理预设清单(原 SettingsPanel 顶部,v1.14.1 随三段一并迁来本 tab)。 */
const PP_OPTIONS = [
  { label: '未选择 (DS 推荐)', value: '' },
  { label: 'With Tools', value: '__sep_with_tools' },
  { label: '合并相同角色连续的发言(含工具)', value: 'merge_with_tools' },
  { label: '半严格 (强制对话角色交替) (含工具) (Claude/Gemini 推荐)', value: 'semi_strict_with_tools' },
  { label: '严格 (强制对话角色交替、用户最先)(含工具) (Claude/Gemini 推荐)', value: 'strict_with_tools' },
  { label: 'No Tools', value: '__sep_no_tools' },
  { label: '合并相同角色连续的发言', value: 'merge' },
  { label: '半严格 (强制对话角色交替) (Claude/Gemini 推荐)', value: 'semi_strict' },
  { label: '严格(强制对话角色交替、用户最先) (Claude/Gemini 推荐)', value: 'strict' },
  { label: '单一用户消息 (无工具) (Claude/Gemini 推荐)', value: 'single_user' },
];

/** v1.14.x:textarea placeholder 文案,教用户语法。 */
const EXTRA_PARAMS_PLACEHOLDER = `每行一条规则(# 开头为注释,空行忽略)

- top_p              移除字段
+ top_p 0.9          添加或覆盖(自动识别数字/布尔/JSON)
+ stream_options.include_usage true   支持点号嵌套
# DeepSeek:禁用 top_p 避免 400 冲突`;

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

  // v1.14.1:三段 API 配置(主/MVU/补写)从 SettingsPanel 搬来,需要 useSettingsStore 的所有相关字段
  const promptPostProcessing = useSettingsStore((s) => s.promptPostProcessing);
  const setPromptPostProcessing = useSettingsStore((s) => s.setPromptPostProcessing);
  const mvuUseIndependentApi = useSettingsStore((s) => s.mvuUseIndependentApi);
  const setMvuUseIndependentApi = useSettingsStore((s) => s.setMvuUseIndependentApi);
  const mvuForceAlways = useSettingsStore((s) => s.mvuForceAlways);
  const setMvuForceAlways = useSettingsStore((s) => s.setMvuForceAlways);
  const mvuSelfCorrectEnabled = useSettingsStore((s) => s.mvuSelfCorrectEnabled);
  const setMvuSelfCorrectEnabled = useSettingsStore((s) => s.setMvuSelfCorrectEnabled);
  const mvuSelfCorrectRetries = useSettingsStore((s) => s.mvuSelfCorrectRetries);
  const setMvuSelfCorrectRetries = useSettingsStore((s) => s.setMvuSelfCorrectRetries);
  const forceJsonObject = useSettingsStore((s) => s.forceJsonObject);
  const setForceJsonObject = useSettingsStore((s) => s.setForceJsonObject);
  const mvuTemperature = useSettingsStore((s) => s.mvuTemperature);
  const setMvuTemperature = useSettingsStore((s) => s.setMvuTemperature);
  const mvuRetryCount = useSettingsStore((s) => s.mvuRetryCount);
  const setMvuRetryCount = useSettingsStore((s) => s.setMvuRetryCount);
  const mvuMaxTokens = useSettingsStore((s) => s.mvuMaxTokens);
  const setMvuMaxTokens = useSettingsStore((s) => s.setMvuMaxTokens);
  const rewriteUseIndependentApi = useSettingsStore((s) => s.rewriteUseIndependentApi);
  const setRewriteUseIndependentApi = useSettingsStore((s) => s.setRewriteUseIndependentApi);
  const rewriteLite = useSettingsStore((s) => s.rewriteLite);
  const setRewriteLite = useSettingsStore((s) => s.setRewriteLite);
  const rewriteLiteIncludeMatchedLore = useSettingsStore((s) => s.rewriteLiteIncludeMatchedLore);
  const setRewriteLiteIncludeMatchedLore = useSettingsStore((s) => s.setRewriteLiteIncludeMatchedLore);
  const lastRewriteSaving = usePromptViewerStore((s) => s.lastRewriteSaving);

  // 添加表单 state
  const [addLabel, setAddLabel] = useState('');
  const [addUrl, setAddUrl] = useState('https://api.deepseek.com');
  const [addKey, setAddKey] = useState('');
  const [addExtraParams, setAddExtraParams] = useState('');
  /** 保存按钮态:idle / saving / ok / failed。failed 时 errorText 显示在按钮右边。 */
  const [addSaveStatus, setAddSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'failed'>('idle');
  const [addError, setAddError] = useState<string | null>(null);
  // 提示词后处理下拉
  const [ppDropdownOpen, setPpDropdownOpen] = useState(false);

  // 删除二确气泡
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // 编辑模态
  const [editingId, setEditingId] = useState<string | null>(null);

  /**
   * 保存:先 validate 表单 → 尝试 fetchModelList(同时充当连通性校验) →
   *   成功 → addProfile + setProfileAvailableModels(拉到的模型列表) + 清表单
   *   失败 → 在保存按钮右边显示错误,不写 store。
   * 不再有独立「连接测试」按钮 — 保存即测试。
   */
  const handleAddSave = async () => {
    setAddError(null);
    const form: ApiProfileForm = { label: addLabel, apiBaseUrl: addUrl, apiKey: addKey, extraParams: addExtraParams };
    const v = validateApiProfileForm(form);
    if (!v.ok) {
      setAddError(v.error ?? '表单无效');
      setAddSaveStatus('failed');
      return;
    }
    setAddSaveStatus('saving');
    let models: string[] = [];
    try {
      models = await fetchModelList(addUrl.trim(), addKey);
    } catch {
      setAddError('连接失败,请检查地址和 Key');
      setAddSaveStatus('failed');
      return;
    }
    if (models.length === 0) {
      setAddError('已连接但未拉到任何模型,请检查 API');
      setAddSaveStatus('failed');
      return;
    }
    const newProfile = addProfile(form);
    setProfileAvailableModels(newProfile.id, models);
    // 重置表单
    setAddLabel('');
    setAddUrl('https://api.deepseek.com');
    setAddKey('');
    setAddExtraParams('');
    setAddSaveStatus('ok');
    // 短暂显示「已保存」,1.5s 后回 idle
    window.setTimeout(() => setAddSaveStatus('idle'), 1500);
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
          <span style={{ color: 'var(--gold)', letterSpacing: 1.5 }}>v1.14.1 重构</span> ·
          API 管理改为多 profile 模式;原「主 API / MVU / 补写」三套独立配置已合并清空,请在下方重新添加配置后,
          在本页主 API/MVU/补写 三段就地选择对应 profile 与模型。
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
        {/* 额外参数 — 整行,跨满 grid */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelInForm}>额外参数(可选)</label>
          <textarea
            value={addExtraParams}
            onChange={(e) => setAddExtraParams(e.target.value)}
            placeholder={EXTRA_PARAMS_PLACEHOLDER}
            spellCheck={false}
            style={{
              ...inputStyle,
              minHeight: 110,
              lineHeight: 1.55,
              resize: 'vertical',
              whiteSpace: 'pre',
              overflowX: 'auto',
            }}
          />
          <ExtraParamsHint text={addExtraParams} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={handleAddSave} disabled={addSaveStatus === 'saving'}
          style={{
            ...miniBtnBase,
            borderColor: 'var(--gold)', color: 'var(--gold)',
            background: 'rgba(196,168,85,0.1)',
            opacity: addSaveStatus === 'saving' ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (addSaveStatus === 'saving') return;
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
        >{addSaveStatus === 'saving' ? '保存中...' : '保 存'}</button>

        {addSaveStatus === 'ok' && (
          <span style={{ fontSize: 'calc(10px * var(--system-ratio,1))', color: 'var(--success)', letterSpacing: 1, fontFamily: 'var(--font-ui)' }}>
            已保存
          </span>
        )}
        {addSaveStatus === 'failed' && addError && (
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

      {/* ────────── v1.14.1:三段 API 配置(主/MVU/补写)从基本设置搬来 ────────── */}

      {/* 主 API */}
      <div style={{ marginTop: 22 }}>
        <CategoryBar label="主 API" />

        <ApiModelPicker channel="main" />

        {/* Prompt Post-Processing */}
        <div style={rowStyle}>
          <span style={labelStyle}>
            提示词后处理
            <HelpIcon text={`未选择 — 原样发送,不动 messages(DS 推荐:前缀缓存按字面前缀匹配,任何重排/合并都会破坏命中)
合并相同角色连续的发言 — 多半无效,仅在预设乱拼出大量同 role 碎片时考虑
半严格 — 合并角色 + 只允许一条系统消息(Claude/Gemini 等需要严格交替的 API 推荐)
严格 — 半严格 + 强制用户消息在最前(Claude/Gemini 推荐)
单一用户消息 — 所有消息合并成一条 user(仅特殊严格 API 用,DS 上会让缓存几乎全 miss)`} />
          </span>
          <div style={{ position: 'relative', width: 240, maxWidth: '100%' }}>
            <button onClick={() => setPpDropdownOpen(!ppDropdownOpen)} style={{
              width: '100%', padding: '6px 8px', border: '1px solid var(--brass)', borderRadius: 3,
              background: 'rgba(0,0,0,0.3)', color: 'var(--parchment)',
              fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', outline: 'none',
            }}>
              <span>{PP_OPTIONS.find((o) => o.value === promptPostProcessing)?.label ?? '未选择'}</span>
              <span style={{ fontSize: 'calc(8px * var(--system-ratio, 1))', color: 'var(--brass)' }}>▼</span>
            </button>
            {ppDropdownOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setPpDropdownOpen(false)} />
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, background: 'var(--leather)', border: '1px solid var(--gold)', borderRadius: 3, marginTop: 2, maxHeight: 320, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.6)', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)' }}>
                  <style>{`.pp-scroll::-webkit-scrollbar{width:5px}.pp-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.15);border-radius:3px}.pp-scroll::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}.pp-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}`}</style>
                  <div className="pp-scroll">
                    {PP_OPTIONS.map((opt) => {
                      if (opt.value.startsWith('__sep')) {
                        return <div key={opt.value} style={{ padding: '5px 10px', fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 1, borderBottom: '1px solid rgba(196,168,85,0.08)', background: 'rgba(196,168,85,0.06)' }}>{opt.label}</div>;
                      }
                      return (
                        <div key={opt.value} onClick={() => { setPromptPostProcessing(opt.value); setPpDropdownOpen(false); }} style={{
                          padding: '6px 10px', cursor: 'pointer',
                          background: opt.value === promptPostProcessing ? 'rgba(196,168,85,0.15)' : 'transparent',
                          color: opt.value === promptPostProcessing ? 'var(--gold)' : 'var(--text-light)',
                          fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))',
                          borderBottom: '1px solid rgba(196,168,85,0.06)',
                        }} onMouseEnter={(e) => { if (opt.value !== promptPostProcessing) e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                          onMouseLeave={(e) => { if (opt.value !== promptPostProcessing) e.currentTarget.style.background = 'transparent'; }}
                        >{opt.label}</div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* MVU 变量引擎 API */}
      <div style={{ marginTop: 22 }}>
        <CategoryBar label="MVU 变量引擎 API" />

        <div style={rowStyle}>
          <span style={labelStyle}>独立通道</span>
          <Toggle on={mvuUseIndependentApi} onChange={() => setMvuUseIndependentApi(!mvuUseIndependentApi)} onLabel="独立" offLabel="跟随全局" />
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>
            始终用 LLM 提取
            <HelpIcon text={'关闭（智能）：仅当回复有「叙事暗示的数值变化」（如「感到眩晕」暗示SAN降）且缺少显式 <var>/{{set:}} 标签时才调用 LLM 提取——纯标签回复由本地正则处理，省下一次 API 调用。\n\n打开（始终）：每回合都调用 LLM 提取，最大化提取保真度（更费 token）。\n\n注意：本开关仅在「独立通道」开启且已配置 API Key 时生效。'} />
          </span>
          <Toggle on={mvuForceAlways} onChange={() => setMvuForceAlways(!mvuForceAlways)} onLabel="始终" offLabel="智能" />
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>
            变量更新自纠
            <HelpIcon text={'关闭（默认）：变量更新若未通过校验（如 HP 跌破 0、天气填了非法值）则丢弃该条并记入调试日志，回合照常推进（零额外 LLM 调用）。\n\n打开：把未通过的更新回灌给 AI，要求其只重输出修正后的合法值。每次修正额外发起一次「MVU 通道」请求——严格走 MVU 的 RPM 桶并受下方重试预算硬上限约束（达上限即排队，绝不超出每分钟限制），失败数不再下降时提前停止。'} />
          </span>
          <Toggle on={mvuSelfCorrectEnabled} onChange={() => setMvuSelfCorrectEnabled(!mvuSelfCorrectEnabled)} onLabel="开启" offLabel="关闭" />
        </div>
        {mvuSelfCorrectEnabled && (
          <SliderRow
            indent
            label="↳ 自纠重试预算"
            help={'每回合最多向 AI 请求修正变量更新的次数（0–3，默认 1）。这是 RPM 死线的硬上限——无论失败多少项，本回合自纠请求数都不超过此值，且每次都走 MVU 桶排队限流。设为 0 等价于关闭自纠。'}
            value={mvuSelfCorrectRetries} onChange={setMvuSelfCorrectRetries}
            min={0} max={3}
          />
        )}

        <div style={rowStyle}>
          <span style={labelStyle}>
            严格 JSON 模式
            <HelpIcon text={'开启(默认):为所有子调用 API 请求附加 response_format: { type: "json_object" } 参数,让模型严格返回单一合法 JSON 对象,降低解析失败率。\n\n关闭:不附加该参数,子调用解析走启发式兜底修复(coerceJsonObject)。\n\n自动 fallback:若模型不支持该参数,首次探测失败后自动切回常规模式,该 model 本会话剩余子调用直接跳过(避免重复浪费 RTT)。'} />
          </span>
          <Toggle on={forceJsonObject} onChange={() => setForceJsonObject(!forceJsonObject)} onLabel="开启" offLabel="关闭" />
        </div>

        {mvuUseIndependentApi && (
          <>
            <ApiModelPicker channel="mvu" />

            <SliderRow
              label="温度"
              value={mvuTemperature} onChange={setMvuTemperature}
              min={0} max={2} step={0.1}
              formatValue={(v) => v.toFixed(1)}
            />

            <SliderRow
              label="重试次数"
              value={mvuRetryCount} onChange={setMvuRetryCount}
              min={1} max={5}
            />

            <SliderRow
              label="最大回复长度 (Token)"
              help={'MVU 子调用单次最大回复 token 数。低于 20000 容易让 thinking 模型在思考链占满预算后 JSON 截断,默认 32768 是安全起点。'}
              value={mvuMaxTokens} onChange={setMvuMaxTokens}
              min={20000} max={65536} step={1024}
            />
          </>
        )}
      </div>

      {/* 行动补写 API */}
      <div style={{ marginTop: 22 }}>
        <CategoryBar label="行动补写 API" />
        <div style={rowStyle}>
          <span style={labelStyle}>独立通道</span>
          <Toggle on={rewriteUseIndependentApi} onChange={() => setRewriteUseIndependentApi(!rewriteUseIndependentApi)} onLabel="独立" offLabel="跟随全局" />
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>
            轻量补写模式
            <HelpIcon text={'关闭（完整,默认）：行动补写复用主叙事的完整上下文(系统提示+全量匹配世界书+角色卡+页面+摘要+暗线+注入)生成 4 个候选选项。\n\n打开（轻量）：补写仅发送 当前场景(当前页) + 角色卡(技能/HP/SAN) + 常驻设定(constant 世界书) + 补写指令,跳过摘要/暗线/注入/关键词匹配世界书。大幅省 token,但选项可能略降对「仅靠匹配世界书才知道的设定」的感知。\n\n建议先用 5-10 个真实回合 A/B 验证选项质量不降后再常开。'} />
          </span>
          <Toggle on={rewriteLite} onChange={() => setRewriteLite(!rewriteLite)} onLabel="轻量" offLabel="完整" />
        </div>
        {rewriteLite && (
          <>
            <div style={{ ...rowStyle, paddingLeft: 16 }}>
              <span style={labelStyle}>
                ↳ 保留匹配世界书
                <HelpIcon text={'轻量补写默认连「关键词匹配世界书」也跳过(最大节省)。\n\n打开此项：保留匹配世界书,仅跳过摘要/暗线/注入——当补写选项需要引用「只有匹配世界书才知道的设定」时使用,在「最大节省」与「设定感知」之间取中间档。'} />
              </span>
              <Toggle on={rewriteLiteIncludeMatchedLore} onChange={() => setRewriteLiteIncludeMatchedLore(!rewriteLiteIncludeMatchedLore)} onLabel="保留" offLabel="跳过" />
            </div>
            <div style={{ ...rowStyle, paddingLeft: 16 }}>
              <span style={{ ...labelStyle, opacity: 0.75 }}>上次节省</span>
              <span style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
                {lastRewriteSaving > 0 ? `~${lastRewriteSaving} tokens` : '— (尚未补写)'}
              </span>
            </div>
          </>
        )}
        {rewriteUseIndependentApi && (
          <ApiModelPicker channel="rewrite" />
        )}
      </div>

      <ImageApiSection />

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
  onSave: (patch: { label?: string; apiBaseUrl?: string; apiKey?: string; extraParams?: string }) => void;
  onTestAndSaveModels: (url: string, key: string) => Promise<string[]>;
}

function EditProfileModal({ profile, onClose, onSave, onTestAndSaveModels }: EditModalProps) {
  const [label, setLabel] = useState(profile.label);
  const [url, setUrl] = useState(profile.apiBaseUrl);
  // apiKey 输入框默认是空 — 留空=保持原值(决策点 3:防误清空)
  const [keyInput, setKeyInput] = useState('');
  const [extraParamsInput, setExtraParamsInput] = useState(profile.extraParams ?? '');
  const [revealOriginal, setRevealOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'failed'>('idle');

  /**
   * 保存:validate → fetchModelList(连通性校验同时拉模型) → 成功才 onSave + 写 store。
   * 失败时把错误显示在保存按钮右边,不关闭模态。
   * 不再有独立「连接测试」按钮。
   */
  const handleSave = async () => {
    setError(null);
    const labelTrim = label.trim();
    const urlTrim = url.trim();
    if (!labelTrim) { setError('识别名不能为空'); setSaveStatus('failed'); return; }
    if (!urlTrim) { setError('API 地址不能为空'); setSaveStatus('failed'); return; }
    try {
      const u = new URL(urlTrim);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        setError('API 地址必须以 http(s) 开头'); setSaveStatus('failed'); return;
      }
    } catch { setError('API 地址格式无效'); setSaveStatus('failed'); return; }

    setSaveStatus('saving');
    const effectiveKey = keyInput.length > 0 ? keyInput : profile.apiKey;
    let models: string[] = [];
    try {
      models = await onTestAndSaveModels(urlTrim, effectiveKey);
    } catch {
      setError('连接失败,请检查地址和 Key');
      setSaveStatus('failed');
      return;
    }
    if (models.length === 0) {
      setError('已连接但未拉到任何模型,请检查 API');
      setSaveStatus('failed');
      return;
    }

    onSave({
      label: labelTrim,
      apiBaseUrl: urlTrim,
      // keyInput 留空 → 不传 apiKey → updateApiProfile 保持原值
      ...(keyInput.length > 0 ? { apiKey: keyInput } : null),
      extraParams: extraParamsInput,
    });
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

        <div>
          <label style={labelInForm}>额外参数(可选)</label>
          <textarea
            value={extraParamsInput}
            onChange={(e) => setExtraParamsInput(e.target.value)}
            placeholder={EXTRA_PARAMS_PLACEHOLDER}
            spellCheck={false}
            style={{
              ...inputStyle,
              minHeight: 110,
              lineHeight: 1.55,
              resize: 'vertical',
              whiteSpace: 'pre',
              overflowX: 'auto',
            }}
          />
          <ExtraParamsHint text={extraParamsInput} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          <button onClick={handleSave} disabled={saveStatus === 'saving'}
            style={{
              ...miniBtnBase, borderColor: 'var(--gold)', color: 'var(--gold)',
              background: 'rgba(196,168,85,0.1)',
              opacity: saveStatus === 'saving' ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (saveStatus === 'saving') return;
              e.currentTarget.style.background = 'rgba(196,168,85,0.2)';
              e.currentTarget.style.filter = 'brightness(1.2)';
              e.currentTarget.style.transform = 'scale(1.04)';
            }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.1)'; e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={miniBtnPress} onMouseUp={miniBtnRelease}
          >{saveStatus === 'saving' ? '保存中...' : '保 存'}</button>

          <button onClick={onClose}
            style={{ ...miniBtnBase }}
            onMouseEnter={miniBtnHover} onMouseLeave={miniBtnLeave}
            onMouseDown={miniBtnPress} onMouseUp={miniBtnRelease}
          >取 消</button>

          {saveStatus === 'failed' && error && (
            <span style={{ fontSize: 'calc(10px * var(--system-ratio,1))', color: 'var(--blood)', letterSpacing: 1, fontFamily: 'var(--font-ui)' }}>{error}</span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ────────── 额外参数提示 ──────────

/** 实时展示 extraParams 已识别/跳过条目数。无内容时不渲染。 */
function ExtraParamsHint({ text }: { text: string }) {
  if (!text.trim()) return null;
  const { ok, skipped, firstError } = summarizeExtraParamsRules(text);
  if (ok === 0 && skipped === 0) return null;
  const color = skipped > 0 ? 'var(--blood)' : 'var(--gold)';
  return (
    <div style={{
      marginTop: 4,
      fontFamily: 'var(--font-ui)', fontSize: 'calc(9.5px * var(--system-ratio,1))',
      color, letterSpacing: 1, opacity: 0.85,
    }}>
      已识别 {ok} 条规则{skipped > 0 ? ` · 跳过 ${skipped} 条(${firstError ?? '坏行'})` : ''}
    </div>
  );
}
