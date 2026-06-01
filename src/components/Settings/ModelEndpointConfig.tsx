import { useState } from 'react';
import { DarkSelect } from '../Shared/DarkSelect';
import { fetchModelList } from '../../sillytavern/api-router';

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

const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.02)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1,
};

const inputStyle: React.CSSProperties = {
  width: 200, maxWidth: '100%', padding: '7px 9px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)',
  fontSize: 11, outline: 'none', caretColor: 'var(--gold)',
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
        <input type="password" value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..." style={inputStyle}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
        />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>API 地址</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ ...inputStyle, width: 160 }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
          <button onClick={handleTest} disabled={connStatus === 'testing'}
            style={{
              padding: '5px 10px', border: '1px solid var(--brass)', borderRadius: 3,
              background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)',
              fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: 1, cursor: 'pointer',
              opacity: connStatus === 'testing' ? 0.5 : 1,
            }}>
            {connStatus === 'testing' ? '...' : '连接'}
          </button>
          {connStatus === 'connected' && (
            <span style={{ fontSize: 9, color: 'var(--success)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>已连接</span>
          )}
          {connStatus === 'failed' && (
            <span style={{ fontSize: 9, color: 'var(--blood)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>失败</span>
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
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faded)', padding: '7px 9px' }}>
              {modelsLoading ? '加载中...' : '请先连接'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
