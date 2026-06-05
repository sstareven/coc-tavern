import { DarkSelect } from '../../Shared/DarkSelect';
import { inputStyle, labelStyle, sectionTitle } from '../styles';
import type { CharacterPreset } from '../../../stores/useCharacterPresetsStore';

interface Props {
  name: string;
  setName: (v: string) => void;
  player: string;
  setPlayer: (v: string) => void;
  age: number;
  setAge: (v: number) => void;
  sex: string;
  setSex: (v: string) => void;
  residence: string;
  setResidence: (v: string) => void;
  birthplace: string;
  setBirthplace: (v: string) => void;
  presets: CharacterPreset[];
  showPresetLoad: boolean;
  setShowPresetLoad: (v: boolean) => void;
  onLoadPreset: (preset: CharacterPreset) => void;
  onDeletePreset: (name: string) => void;
}

export function StepIdentity({
  name, setName,
  player, setPlayer,
  age, setAge,
  sex, setSex,
  residence, setResidence,
  birthplace, setBirthplace,
  presets, showPresetLoad, setShowPresetLoad,
  onLoadPreset, onDeletePreset,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Preset load */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowPresetLoad(!showPresetLoad)}
            style={{
              padding: '4px 12px', border: '1px solid rgba(196,168,85,0.25)',
              borderRadius: 3, background: 'rgba(196,168,85,0.08)',
              color: 'var(--gold)', fontFamily: 'var(--font-ui)',
              fontSize: 'calc(10px * var(--system-ratio, 1))', cursor: 'pointer', letterSpacing: 1,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >加载预设 {presets.length > 0 ? `(${presets.length})` : ''}</button>
          {showPresetLoad && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: 'var(--abyss)', border: '1px solid rgba(196,168,85,0.25)',
              borderRadius: 4, padding: 4, zIndex: 900,
              minWidth: 180, maxHeight: 200, overflowY: 'auto',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}>
              {presets.length === 0 ? (
                <div style={{ padding: '8px 12px', fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-body)' }}>
                  暂无预设
                </div>
              ) : (
                presets.map((p) => (
                  <div key={p.name} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', cursor: 'pointer', borderRadius: 3,
                    transition: 'var(--transition-smooth)',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span
                      onClick={() => onLoadPreset(p)}
                      style={{
                        flex: 1, fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--text-light)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >{p.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeletePreset(p.name); }}
                      style={{
                        width: 18, height: 18, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', border: 'none', borderRadius: 2,
                        background: 'transparent', color: 'var(--ink-subtle)',
                        fontSize: 'calc(11px * var(--system-ratio, 1))', cursor: 'pointer', fontFamily: 'var(--font-ui)',
                      }}
                    >x</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      <div style={sectionTitle}>身份信息 IDENTITY</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={labelStyle}>姓名 Name</span>
          <input type="text" name="charsheet-identity-name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="调查员姓名" />
        </div>
        {/* Player */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={labelStyle}>玩家 Player</span>
          <input type="text" name="charsheet-identity-player" value={player} onChange={(e) => setPlayer(e.target.value)} style={inputStyle} placeholder="玩家名称" />
        </div>
        {/* Age */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={labelStyle}>年龄 Age</span>
          <input type="number" name="charsheet-identity-age" value={age} onChange={(e) => setAge(Number(e.target.value) || 0)}
            style={inputStyle} min={15} max={99} placeholder="25" />
        </div>
        {/* Sex */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={labelStyle}>性别 Sex</span>
          <DarkSelect value={sex} onChange={setSex}
            options={[{ value: '男', label: '男' }, { value: '女', label: '女' }, { value: '其他', label: '其他' }]} />
        </div>
        {/* Residence */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={labelStyle}>居住地 Residence</span>
          <input type="text" name="charsheet-identity-residence" value={residence} onChange={(e) => setResidence(e.target.value)} style={inputStyle} placeholder="例如：阿卡姆" />
        </div>
        {/* Birthplace */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={labelStyle}>出生地 Birthplace</span>
          <input type="text" name="charsheet-identity-birthplace" value={birthplace} onChange={(e) => setBirthplace(e.target.value)} style={inputStyle} placeholder="例如：马萨诸塞州" />
        </div>
      </div>
    </div>
  );
}
