import { useState, useId } from 'react';
import { DarkSelect } from '../Shared/DarkSelect';
import { fetchModelList } from '../../sillytavern/api-router';
import { rowStyle, labelStyle } from './_shared';

interface Props {
  apiKey: string;
  setApiKey: (k: string) => void;
  url: string;
  setUrl: (u: string) => void;
  model: string;
  setModel: (m: string) => void;
  availableModels: string[];
  setAvailableModels: (models: string[]) => void;
}

const inputStyle: React.CSSProperties = {
  width: 200, maxWidth: '100%', padding: '7px 9px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)',
  fontSize: 'calc(11px * var(--system-ratio, 1))', outline: 'none', caretColor: 'var(--gold)',
};

/**
 * 共享的 API 端点配置三件套：API Key + API 地址（带「测试」按钮拉取模型列表）+ 模型选择器。
 * main / mvu / rewrite 三通道复用——模型一律「测试连接 → 获取列表 → 下拉点选」，不再手填。
 * 连接/加载态为组件本地 useState（每实例独立，随通道 toggle 卸载自动重置，杜绝陈旧徽标）。
 * 持久化字段（key/url/model/availableModels）经 props 的 store setter 写入，刷新后仍保留。
 */
export function ModelEndpointConfig({
  apiKey, setApiKey, url, setUrl, model, setModel, availableModels, setAvailableModels,
}: Props) {
  const [connStatus, setConnStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [modelsLoading, setModelsLoading] = useState(false);
  // 复用组件在不同通道（main / mvu / rewrite）多次渲染—— useId() 让每实例 input.name 唯一,避免冲突。
  const uid = useId();

  const handleTest = () => {
    if (!url.trim()) return;
    setConnStatus('testing');
    setModelsLoading(true);
    fetchModelList(url, apiKey)
      .then((models) => {
        setAvailableModels(models);
        setConnStatus('connected');
      })
      .catch(() => {
        setAvailableModels([]);
        setConnStatus('failed');
      })
      .finally(() => setModelsLoading(false));
  };

  return (
    <>
      <div style={rowStyle}>
        <span style={labelStyle}>API Key</span>
        <input type="password" name={`${uid}-api-key`} value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..." style={inputStyle}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
        />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>API 地址</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input name={`${uid}-api-url`} value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ ...inputStyle, width: 160 }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
          <button onClick={handleTest} disabled={connStatus === 'testing'}
            style={{
              padding: '5px 10px', border: '1px solid var(--brass)', borderRadius: 3,
              background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)',
              fontFamily: 'var(--font-ui)', fontSize: 'calc(10px * var(--system-ratio, 1))', letterSpacing: 1, cursor: 'pointer',
              opacity: connStatus === 'testing' ? 0.5 : 1,
              transition: 'var(--transition-smooth)',
            }}
            onMouseEnter={(e) => {
              if (connStatus === 'testing') return;
              e.currentTarget.style.borderColor = 'var(--gold)';
              e.currentTarget.style.color = 'var(--gold)';
              e.currentTarget.style.background = 'rgba(196,168,85,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--brass)';
              e.currentTarget.style.color = 'var(--text-light)';
              e.currentTarget.style.background = 'rgba(0,0,0,0.2)';
            }}
            onMouseDown={(e) => { if (connStatus !== 'testing') e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {connStatus === 'testing' ? '...' : '连接'}
          </button>
          {connStatus === 'connected' && (
            <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--success)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>已连接</span>
          )}
          {connStatus === 'failed' && (
            <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--blood)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>失败</span>
          )}
        </div>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>模型</span>
        <div style={{ width: 200, maxWidth: '100%' }}>
          {availableModels.length > 0 ? (
            <DarkSelect compact value={model}
              onChange={(v) => setModel(v)}
              options={availableModels.map((m) => ({ value: m, label: m }))} />
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink-faded)', padding: '7px 9px' }}>
              {modelsLoading ? '加载中...' : '请先连接'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
