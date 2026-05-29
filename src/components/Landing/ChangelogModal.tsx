import { useEffect, useState } from 'react';
import { kvGet, kvSet } from '../../db/kv';

const CHANGELOG_KEY = 'coc-changelog-seen';
const CURRENT_VERSION = 'v0.1.0';

const features = [
  '双页故事书阅读系统 — 仿古籍翻页体验',
  '骰子检定与历史记录 — 完整 COC 7th 规则支持',
  '角色卡管理系统 — 调查员属性与技能编辑',
  '世界书知识库 — 人物、地点、事件词条',
  'AI 对话引擎 — 多会话、预设、流式输出',
  '预设编辑器 — 自定义 AI 参数与提示词',
  '环境音效与背景音乐系统',
  '数据持久化 — IndexedDB 本地存储',
];

export function ChangelogModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = kvGet(CHANGELOG_KEY);
    if (seen !== CURRENT_VERSION) {
      setVisible(true);
    }

    const handler = () => setVisible(true);
    document.addEventListener('show-changelog', handler);
    return () => document.removeEventListener('show-changelog', handler);
  }, []);

  const close = () => {
    kvSet(CHANGELOG_KEY, CURRENT_VERSION);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--leather)', border: '1px solid var(--gold)',
        borderRadius: 6, padding: '32px 40px', maxWidth: 480, width: '90%',
        boxShadow: '0 0 60px rgba(0,0,0,0.5)',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold)',
          letterSpacing: 6, textAlign: 'center', marginBottom: 4,
        }}>
          更新日志
        </h2>
        <p style={{
          fontSize: 11, color: 'var(--ink-subtle)', textAlign: 'center',
          letterSpacing: 4, marginBottom: 24,
        }}>
          {CURRENT_VERSION} — 首次发布
        </p>
        <ul style={{
          listStyle: 'none', padding: 0, margin: 0,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {features.map((f, i) => (
            <li key={i} style={{
              fontSize: 13, color: 'var(--text-light)',
              fontFamily: 'var(--font-ui)', lineHeight: 1.5,
              paddingLeft: 18, position: 'relative',
            }}>
              <span style={{
                position: 'absolute', left: 0, color: 'var(--gold)',
                fontSize: 10, lineHeight: '19px',
              }}>&#9733;</span>
              {f}
            </li>
          ))}
        </ul>
        <button onClick={close} style={{
          display: 'block', margin: '28px auto 0', padding: '12px 48px',
          border: '1px solid var(--gold)', background: 'rgba(196,168,85,0.1)',
          color: 'var(--gold)', fontFamily: 'var(--font-ui)', fontSize: 14,
          letterSpacing: 4, borderRadius: 3, cursor: 'pointer',
        }}>
          开 始 探 索
        </button>
      </div>
    </div>
  );
}
