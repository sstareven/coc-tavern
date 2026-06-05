import { useState } from 'react';
import { useCharSheetStore } from '../../stores/useCharSheetStore';

export function BackgroundSettings() {
  const sheet = useCharSheetStore((s) => s.sheet);
  const setSheet = useCharSheetStore((s) => s.setSheet);
  const [local, setLocal] = useState({ ...sheet });

  const save = (partial: Partial<typeof sheet>) => {
    const next = { ...local, ...partial };
    setLocal(next);
    setSheet(next);
  };

  return (
    <div>
      {/* 开场白 / Greeting */}
      <div style={fieldStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={labelStyle}>开场白 (Greeting)</span>
          <span style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>
            角色发送的第一条消息
          </span>
        </div>
        <textarea name="bg-greeting" value={local.greeting} onChange={(e) => save({ greeting: e.target.value })}
          placeholder="角色出场时对玩家说的话..." style={textareaStyle} rows={4} />
      </div>

      {/* 角色描述 / Description */}
      <div style={fieldStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={labelStyle}>角色描述 (Description)</span>
          <span style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>
            注入提示词的 Char Description
          </span>
        </div>
        <textarea name="bg-description" value={local.description} onChange={(e) => save({ description: e.target.value })}
          placeholder="角色的外貌、背景、身份等描述..." style={textareaStyle} rows={3} />
      </div>

      {/* 角色性格 / Personality */}
      <div style={fieldStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={labelStyle}>角色性格 (Personality)</span>
          <span style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>
            注入提示词的 Char Personality
          </span>
        </div>
        <textarea name="bg-personality" value={local.personality} onChange={(e) => save({ personality: e.target.value })}
          placeholder="角色的性格特征、说话风格、行为模式..." style={textareaStyle} rows={3} />
      </div>

      {/* 场景设定 / Scenario */}
      <div style={fieldStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={labelStyle}>场景设定 (Scenario)</span>
          <span style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>
            注入提示词的 Scenario 场景描述
          </span>
        </div>
        <textarea name="bg-scenario" value={local.scenario} onChange={(e) => save({ scenario: e.target.value })}
          placeholder="当前场景的环境、氛围、背景故事..." style={textareaStyle} rows={3} />
      </div>

      {/* 用户设定描述 / Persona */}
      <div style={fieldStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={labelStyle}>用户设定描述 (Persona)</span>
          <span style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>
            注入提示词的 Persona Description
          </span>
        </div>
        <textarea name="bg-persona-description" value={local.personaDescription} onChange={(e) => save({ personaDescription: e.target.value })}
          placeholder="玩家角色的设定、背景..." style={textareaStyle} rows={3} />
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1, marginBottom: 6, display: 'block',
};

const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-body)',
  fontSize: 11, minHeight: 60, resize: 'vertical', outline: 'none', caretColor: 'var(--gold)',
};
