import { useEffect, useState } from 'react';
import { kvGet, kvSet } from '../../db/kv';

const CHANGELOG_KEY = 'coc-changelog-seen';
const CURRENT_VERSION = 'v1.0.0';

interface Release {
  version: string;
  label: string;
  items: string[];
}

// 版本倒序：最新在最前。新增版本时在数组顶部插入，并同步更新 CURRENT_VERSION。
const RELEASES: Release[] = [
  {
    version: 'v1.0.0',
    label: '正式发布',
    items: [
      '检定记录优化 — 骰子结果改在剧情真正推进后才计入检定历史；点了选项却未提交、或重新选择时不再误记',
      '关键词提示增强 — 修复部分关键词（尤其音译地名）悬停无释义的问题，现可容忍拼写变体匹配',
      '骰子判定统一 — 五档成功/失败判定逻辑归一，普通检定、奖励/惩罚骰与对抗检定结果更一致',
      '行动补写可中断 — 补写推演过程中可随时取消，不再误报失败',
      '稳定性加固 — 角色创建属性派生、变量系统、错误日志与渲染规范等多项底层修复',
    ],
  },
  {
    version: 'v0.1.0',
    label: '首次发布',
    items: [
      '双页故事书阅读系统 — 仿古籍翻页体验',
      '骰子检定与历史记录 — 完整 COC 7th 规则支持',
      '角色卡管理系统 — 调查员属性与技能编辑',
      '世界书知识库 — 人物、地点、事件词条',
      'AI 对话引擎 — 多会话、预设、流式输出',
      '预设编辑器 — 自定义 AI 参数与提示词',
      '环境音效与背景音乐系统',
      '数据持久化 — IndexedDB 本地存储',
    ],
  },
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
        maxHeight: '82vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 60px rgba(0,0,0,0.5)',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold)',
          letterSpacing: 6, textAlign: 'center', marginBottom: 20, flexShrink: 0,
        }}>
          更新日志
        </h2>

        <div style={{
          overflowY: 'auto', flex: 1, minHeight: 0,
          scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) transparent',
        }}>
          {RELEASES.map((rel, ri) => (
            <div key={rel.version} style={{ marginBottom: ri === RELEASES.length - 1 ? 0 : 26 }}>
              <p style={{
                fontSize: 11, textAlign: 'center', letterSpacing: 4,
                color: ri === 0 ? 'var(--gold)' : 'var(--ink-subtle)',
                opacity: ri === 0 ? 1 : 0.7,
                marginTop: 0, marginBottom: 14,
                paddingBottom: 8, borderBottom: '1px solid rgba(196,168,85,0.15)',
              }}>
                {rel.version} — {rel.label}
              </p>
              <ul style={{
                listStyle: 'none', padding: 0, margin: 0,
                display: 'flex', flexDirection: 'column', gap: 8,
                opacity: ri === 0 ? 1 : 0.78,
              }}>
                {rel.items.map((f, i) => (
                  <li key={i} style={{
                    fontSize: 13, color: 'var(--text-light)',
                    fontFamily: 'var(--font-ui)', lineHeight: 1.55,
                    paddingLeft: 18, position: 'relative',
                  }}>
                    <span style={{
                      position: 'absolute', left: 0, color: 'var(--gold)',
                      fontSize: 10, lineHeight: '20px',
                    }}>&#9733;</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <button onClick={close} style={{
          display: 'block', margin: '24px auto 0', padding: '12px 48px', flexShrink: 0,
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
