import { useState } from 'react';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { usePanelStore } from '../../stores/usePanelStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  onReturnToMenu: () => void;
}

export function SettingsPanel({ visible, onClose, onReturnToMenu }: Props) {
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const toggleSound = useSettingsStore((s) => s.toggleSound);
  const tooltipDelay = useSettingsStore((s) => s.tooltipDelay);
  const setTooltipDelay = useSettingsStore((s) => s.setTooltipDelay);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const setMusicVolume = useSettingsStore((s) => s.setMusicVolume);
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const apiModel = useSettingsStore((s) => s.apiModel);
  const apiKey = useSettingsStore((s) => s.apiKey);
  const setApiKey = useSettingsStore((s) => s.setApiKey);

  const [localApiUrl, setLocalApiUrl] = useState(apiBaseUrl);
  const [localApiModel, setLocalApiModel] = useState(apiModel);
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [connStatus, setConnStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');

  const handleReturnToMenu = () => {
    onClose();
    usePanelStore.getState().closeAll();
    onReturnToMenu();
  };

  const testConnection = () => {
    if (!localApiUrl.trim()) return;
    setConnStatus('testing');
    fetch(localApiUrl.trim(), { method: 'GET', headers: { 'Accept': 'application/json' } })
      .then(() => setConnStatus('connected'))
      .catch(() => setConnStatus('failed'));
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
          border: '1px solid var(--gold)',
          borderRadius: 8,
          padding: '28px 32px',
          minWidth: 420,
          maxWidth: 520,
          width: '90%',
          boxShadow: '0 0 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Title */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 24, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 14,
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>
            设置 / SETTINGS
          </h3>
          <button onClick={onClose} style={closeBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >✕</button>
        </div>

        {/* Sound toggle */}
        <div style={rowStyle}>
          <span style={labelStyle}>环境音效</span>
          <button onClick={toggleSound} style={{
            padding: '6px 20px', border: soundEnabled ? '1px solid var(--success)' : '1px solid var(--ink-faded)',
            borderRadius: 3, background: soundEnabled ? 'rgba(58,107,90,0.15)' : 'rgba(0,0,0,0.2)',
            color: soundEnabled ? 'var(--success)' : 'var(--ink-faded)', fontFamily: 'var(--font-ui)',
            fontSize: 12, letterSpacing: 2, cursor: 'pointer', transition: 'var(--transition-smooth)',
          }}>
            {soundEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Music volume */}
        <div style={rowStyle}>
          <span style={labelStyle}>音乐音量</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min={0} max={100} value={musicVolume}
              onChange={(e) => setMusicVolume(Number(e.target.value))}
              style={{ width: 120, accentColor: 'var(--gold)' }}
            />
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 30 }}>{musicVolume}%</span>
          </div>
        </div>

        {/* Tooltip delay */}
        <div style={rowStyle}>
          <span style={labelStyle}>提示延迟</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min={200} max={2000} step={100} value={tooltipDelay}
              onChange={(e) => setTooltipDelay(Number(e.target.value))}
              style={{ width: 120, accentColor: 'var(--gold)' }}
            />
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 40 }}>{tooltipDelay}ms</span>
          </div>
        </div>

        {/* API section */}
        <div style={{ marginTop: 20, borderTop: '1px solid rgba(196,168,85,0.12)', paddingTop: 18 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)', letterSpacing: 3, marginBottom: 12, textTransform: 'uppercase' }}>
            API 配置
          </div>

          {/* API Key */}
          <div style={rowStyle}>
            <span style={labelStyle}>API Key</span>
            <input type="password" value={localApiKey}
              onChange={(e) => { setLocalApiKey(e.target.value); setApiKey(e.target.value); }}
              placeholder="sk-..."
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
            />
          </div>

          {/* API Base URL with connection test */}
          <div style={rowStyle}>
            <span style={labelStyle}>API 地址</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input value={localApiUrl}
                onChange={(e) => setLocalApiUrl(e.target.value)}
                style={{ ...inputStyle, width: 180 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
              />
              <button onClick={testConnection} disabled={connStatus === 'testing'}
                style={{
                  padding: '6px 12px', border: '1px solid var(--brass)', borderRadius: 3,
                  background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)',
                  fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: 1, cursor: 'pointer',
                  opacity: connStatus === 'testing' ? 0.5 : 1,
                }}
              >
                {connStatus === 'testing' ? '...' : '测试连接'}
              </button>
              {connStatus === 'connected' && (
                <span style={{ fontSize: 10, color: 'var(--success)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
                  已连接
                </span>
              )}
              {connStatus === 'failed' && (
                <span style={{ fontSize: 10, color: 'var(--blood)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
                  连接失败
                </span>
              )}
            </div>
          </div>

          <div style={rowStyle}>
            <span style={labelStyle}>模型</span>
            <input value={localApiModel}
              onChange={(e) => setLocalApiModel(e.target.value)}
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
            />
          </div>
        </div>

        {/* Extensions section */}
        <div style={{ marginTop: 20, borderTop: '1px solid rgba(196,168,85,0.12)', paddingTop: 18 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)', letterSpacing: 3, marginBottom: 12, textTransform: 'uppercase' }}>
            扩展管理
          </div>
          <button onClick={() => usePanelStore.getState().open('extManager')} style={{
            width: '100%', padding: '10px 0', border: '1px solid var(--brass)',
            borderRadius: 3, background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)',
            fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 3, cursor: 'pointer',
          }}>
            管理扩展程序
          </button>
        </div>

        {/* Return to menu */}
        <button onClick={handleReturnToMenu} style={{
          width: '100%', marginTop: 24, padding: '10px 0',
          border: '1px solid var(--blood)', borderRadius: 3,
          background: 'rgba(139,58,58,0.08)', color: 'var(--blood)',
          fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 4, cursor: 'pointer',
          transition: 'var(--transition-smooth)',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,58,58,0.18)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,58,58,0.08)'; }}
        >
          返回主菜单
        </button>
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1,
};

const closeBtnStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: 3, background: 'transparent',
  color: 'var(--ink-subtle)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};

const inputStyle: React.CSSProperties = {
  width: 240, padding: '8px 10px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)',
  fontSize: 12, outline: 'none', caretColor: 'var(--gold)',
};
