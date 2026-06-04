import type { COC7Characteristic } from '../../../types';
import { sectionTitle } from '../styles';
import {
  CHAR_ORDER,
  ALL_SKILLS,
} from '../../../sillytavern/coc-data';
import { resolveSkillBase } from '../../../sillytavern/coc-rules';

interface Props {
  charValues: Record<COC7Characteristic, number>;
  derived: { hpMax: number; sanMax: number; mpMax: number; db: string; build: number };
  luckValue: number | null;
  name: string;
  player: string;
  occupation: string;
  customOccupation: string;
  age: number;
  sex: string;
  residence: string;
  birthplace: string;
  occSkills: string[];
  interestSkills: string[];
  occPoints: Record<string, number>;
  interestPoints: Record<string, number>;
  creditRating: number;
  description: string;
  beliefs: string;
  significantPeople: string;
  meaningfulLocations: string;
  treasuredPossessions: string;
  traits: string;
  injuries: string;
  backgroundFears: string;
  onSavePreset: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, fontSize: 12 }}>
      <span style={{ color: 'var(--ink-subtle)', flexShrink: 0 }}>{label}:</span>
      <span style={{ color: 'var(--text-light)' }}>{value}</span>
    </div>
  );
}

export function StepReview({
  charValues,
  derived,
  luckValue,
  name,
  player,
  occupation,
  customOccupation,
  age,
  sex,
  residence,
  birthplace,
  occSkills,
  interestSkills,
  occPoints,
  interestPoints,
  creditRating,
  description,
  beliefs,
  significantPeople,
  meaningfulLocations,
  treasuredPossessions,
  traits,
  injuries,
  backgroundFears,
  onSavePreset,
}: Props) {
  const c = (k: COC7Characteristic) => charValues[k] ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={sectionTitle}>确认创建 REVIEW</div>

      {/* Preset save */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={onSavePreset} style={{ padding: '4px 12px', border: '1px solid var(--gold)', borderRadius: 3, background: 'rgba(196,168,85,0.1)', color: 'var(--gold)', fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer', letterSpacing: 2 }}>保存为预设</button>
      </div>

      {/* Identity summary */}
      <div style={{
        border: '1px solid rgba(196,168,85,0.15)',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.1)',
        padding: 12,
      }}>
        <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
          身份信息
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12 }}>
          <Row label="姓名" value={name || '--'} />
          <Row label="玩家" value={player || '--'} />
          <Row label="职业" value={occupation === '__custom__' ? (customOccupation || '--') : (occupation || '--')} />
          <Row label="年龄" value={String(age)} />
          <Row label="性别" value={sex || '--'} />
          <Row label="居住地" value={residence || '--'} />
          <Row label="出生地" value={birthplace || '--'} />
        </div>
      </div>

      {/* Characteristics summary */}
      <div style={{
        border: '1px solid rgba(196,168,85,0.15)',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.1)',
        padding: 12,
      }}>
        <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
          基础属性
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px 12px', fontSize: 12 }}>
          {CHAR_ORDER.map(({ key, zh }) => {
            const val = c(key);
            return (
              <div key={key} style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-light)' }}>
                <span style={{ color: 'var(--ink-subtle)', fontSize: 10 }}>{zh} </span>
                <span style={{ color: 'var(--gold)' }}>{val}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Derived summary */}
      <div style={{
        border: '1px solid rgba(196,168,85,0.15)',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.1)',
        padding: 12,
      }}>
        <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
          衍生属性
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          <div>HP: <span style={{ color: 'var(--success)' }}>{derived.hpMax}/{derived.hpMax}</span></div>
          <div>SAN: <span style={{ color: 'var(--blood)' }}>{derived.sanMax}/{derived.sanMax}</span></div>
          <div>MP: <span style={{ color: 'var(--gold)' }}>{derived.mpMax}/{derived.mpMax}</span></div>
          <div>LUCK: <span style={{ color: 'var(--gold-bright)' }}>{luckValue ?? '--'}</span></div>
          <div>MOV: 8</div>
          <div>DB: {derived.db} (Build {derived.build >= 0 ? '+' : ''}{derived.build})</div>
        </div>
      </div>

      {/* Skills summary */}
      <div style={{
        border: '1px solid rgba(196,168,85,0.15)',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.1)',
        padding: 12,
      }}>
        <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
          技能 ({occSkills.length + interestSkills.length + 1} 项)
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-subtle)', marginBottom: 6 }}>
          信用评级: <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{creditRating}%</span>
        </div>
        {occSkills.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--ink-subtle)', marginBottom: 4 }}>职业技能:</div>
            {occSkills.map((sn) => {
              const spec = ALL_SKILLS.find((s) => s.name === sn);
              const base = spec ? resolveSkillBase(spec.base, charValues as Record<COC7Characteristic, number>) : 0;
              const occA = occPoints[sn] ?? 0;
              const intA = interestPoints[sn] ?? 0;
              return (
                <div key={sn} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-light)', marginLeft: 8 }}>
                  {sn}: {base}% {occA > 0 ? `+${occA}%` : ''}{intA > 0 ? ` +${intA}%` : ''} = <span style={{ color: 'var(--gold)' }}>{Math.min(99, base + occA + intA)}%</span>
                </div>
              );
            })}
          </div>
        )}
        {interestSkills.filter((sn) => !occSkills.includes(sn)).length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-subtle)', marginBottom: 4 }}>兴趣技能:</div>
            {interestSkills.filter((sn) => !occSkills.includes(sn)).map((sn) => {
              const spec = ALL_SKILLS.find((s) => s.name === sn);
              const base = spec ? resolveSkillBase(spec.base, charValues as Record<COC7Characteristic, number>) : 0;
              const intA = interestPoints[sn] ?? 0;
              return (
                <div key={sn} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-light)', marginLeft: 8 }}>
                  {sn}: {base}% {intA > 0 ? `+${intA}%` : ''} = <span style={{ color: 'var(--gold)' }}>{Math.min(99, base + intA)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Background summary */}
      <div style={{
        border: '1px solid rgba(196,168,85,0.15)',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.1)',
        padding: 12,
      }}>
        <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
          背景故事
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          {description && <Row label="个人描述" value={description} />}
          {beliefs && <Row label="思想/信念" value={beliefs} />}
          {significantPeople && <Row label="重要之人" value={significantPeople} />}
          {meaningfulLocations && <Row label="重要场所" value={meaningfulLocations} />}
          {treasuredPossessions && <Row label="珍贵之物" value={treasuredPossessions} />}
          {traits && <Row label="特质" value={traits} />}
          {injuries && <Row label="伤口/伤痕" value={injuries} />}
          {backgroundFears && <Row label="恐惧症/狂躁症" value={backgroundFears} />}
        </div>
      </div>
    </div>
  );
}
