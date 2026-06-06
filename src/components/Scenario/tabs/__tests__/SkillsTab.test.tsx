// SkillsTab — Section 4 §5.5
// 测试覆盖:
//   1) computeSkillStats / dedupCustomSkillsByName / cleanBlacklist / mergeAiCustomSkills /
//      applyAiBlacklistProposal / filterSkillsByCat 纯逻辑单测
//   2) SSR 渲染:统计正确 / 自定义技能 tag 渲染 / 黑名单勾选状态 / AI 按钮可见 / 搜索框存在
//
// 测试环境为 node 无 jsdom,所有交互验证靠纯逻辑 + SSR 快照,
// 不在 DOM 中触发实际 click 事件(项目惯例,见 RecommendedSkillsChips.test.tsx)。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ScenarioDoc, ScenarioCustomSkill } from '../../../../types/scenario';
import { ALL_SKILLS } from '../../../../sillytavern/coc-data';

// 必须先 mock scenario-llm 再 import SkillsTab(SkillsTab 顶层 import 它)
const generateMock = vi.fn();
const proposeMock = vi.fn();
vi.mock('../../../../scenario/scenario-llm', () => ({
  generateCustomSkills: (...a: unknown[]) => generateMock(...a),
  proposeSkillBlacklist: (...a: unknown[]) => proposeMock(...a),
}));

// 再 mock 上游 store(避免 SkillsTab → scenario-llm → settingsStore 误触)
vi.mock('../../../../stores/useSettingsStore', () => ({
  useSettingsStore: { getState: () => ({ apiBaseUrl: '', apiKey: '', apiModel: '' }) },
}));

// scenario-llm 同样依赖 subagent-call 与 dynamic-markers
vi.mock('../../../../sillytavern/subagent-call', () => ({
  callDsSubagent: vi.fn(),
  DsSubagentHttpError: class extends Error {},
}));
vi.mock('../../../../sillytavern/dynamic-markers', () => ({
  hasDynamicMarker: () => false,
}));

import {
  SkillsTab,
  computeSkillStats,
  dedupCustomSkillsByName,
  cleanBlacklist,
  mergeAiCustomSkills,
  applyAiBlacklistProposal,
  filterSkillsByCat,
} from '../SkillsTab';

const blankScn = (over: Partial<ScenarioDoc> = {}): ScenarioDoc => ({
  id: 'sc_test',
  meta: {
    name: '罗马夜行',
    type: '调查',
    durationHint: '3-5h',
    difficulty: 3,
    headcountHint: '3-4 人',
    sanLossHint: '中',
    blurb: '罗马帝国晚期黄昏下的奥秘',
  },
  prologueSeed: '',
  recommendedSkills: [],
  recommendedOccupations: [],
  characters: [],
  customOccupations: [],
  customSkills: [],
  skillBlacklist: [],
  entries: [],
  darkTimeline: [],
  badEndings: [],
  authorNotes: '',
  schemaVersion: 1,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

beforeEach(() => {
  generateMock.mockReset();
  proposeMock.mockReset();
});

// ════════════════════ 纯逻辑单测 ════════════════════

describe('computeSkillStats', () => {
  it('无黑名单 + 无自定义 → 当前 = 原 ALL_SKILLS', () => {
    const s = computeSkillStats([], []);
    expect(s.orig).toBe(ALL_SKILLS.length);
    expect(s.bl).toBe(0);
    expect(s.custom).toBe(0);
    expect(s.current).toBe(ALL_SKILLS.length);
  });

  it('黑名单 9 + 自定义 4 → 当前 = 56 - 9 + 4 = 51', () => {
    const bl = ['汽车驾驶', '电气维修', '电子学', '射击(手枪)', '射击(步枪)', '射击(霰弹枪)',
                '操作重型机械', '计算机使用', '科学(物理学)'];
    const cs: ScenarioCustomSkill[] = [
      { name: '骑马', base: 5, cat: '运动系' },
      { name: '驾驶马车', base: 5, cat: '运动系' },
      { name: '咒语吟唱', base: 10, cat: '生活系' },
      { name: '古文献抄写', base: 10, cat: '侦查系' },
    ];
    const s = computeSkillStats(bl, cs);
    expect(s.orig).toBe(ALL_SKILLS.length); // 应为 56
    expect(s.bl).toBe(9);
    expect(s.custom).toBe(4);
    expect(s.current).toBe(ALL_SKILLS.length - 9 + 4);
  });
});

describe('dedupCustomSkillsByName', () => {
  it('同名以后入为准(覆盖)', () => {
    const out = dedupCustomSkillsByName([
      { name: '骑马', base: 5, cat: '运动系' },
      { name: '骑马', base: 20, cat: '运动系', desc: '后入版' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].base).toBe(20);
    expect(out[0].desc).toBe('后入版');
  });

  it('异名追加', () => {
    const out = dedupCustomSkillsByName([
      { name: '骑马', base: 5, cat: '运动系' },
      { name: '驾驶马车', base: 5, cat: '运动系' },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('cleanBlacklist', () => {
  it('去重 + 过滤非 ALL_SKILLS 名', () => {
    const out = cleanBlacklist(['汽车驾驶', '汽车驾驶', '不存在的技能', '电气维修']);
    expect(out.sort()).toEqual(['汽车驾驶', '电气维修'].sort());
  });

  it('空数组合法', () => {
    expect(cleanBlacklist([])).toEqual([]);
  });
});

describe('mergeAiCustomSkills', () => {
  it('已有 + 新增 → 合并;同名 AI 覆盖', () => {
    const existing: ScenarioCustomSkill[] = [
      { name: '骑马', base: 5, cat: '运动系' },
    ];
    const incoming: ScenarioCustomSkill[] = [
      { name: '骑马', base: 20, cat: '运动系', desc: 'AI 重写' },
      { name: '咒语吟唱', base: 10, cat: '生活系' },
    ];
    const out = mergeAiCustomSkills(existing, incoming);
    expect(out).toHaveLength(2);
    const ride = out.find((s) => s.name === '骑马');
    expect(ride?.base).toBe(20);
    expect(ride?.desc).toBe('AI 重写');
  });
});

describe('applyAiBlacklistProposal', () => {
  it('双向 add/remove 都生效;非 ALL_SKILLS 名被过滤', () => {
    const out = applyAiBlacklistProposal(
      ['汽车驾驶', '游泳'],
      ['电气维修', '不存在'],
      ['游泳'],
    );
    expect(out.includes('汽车驾驶')).toBe(true);
    expect(out.includes('电气维修')).toBe(true);
    expect(out.includes('游泳')).toBe(false);
    expect(out.includes('不存在')).toBe(false);
  });
});

describe('filterSkillsByCat', () => {
  it('空 term → 全集按 6 类分组,所有技能可见', () => {
    const g = filterSkillsByCat('');
    const total = Object.values(g).reduce((acc, list) => acc + list.length, 0);
    expect(total).toBe(ALL_SKILLS.length);
  });

  it('搜索 "射击" → 仅命中 3 条射击技能', () => {
    const g = filterSkillsByCat('射击');
    const total = Object.values(g).reduce((acc, list) => acc + list.length, 0);
    expect(total).toBe(3);
    expect(g['战斗系'].some((s) => s.name === '射击(手枪)')).toBe(true);
  });

  it('大小写无关 / trim', () => {
    const a = filterSkillsByCat('  侦查 ');
    const b = filterSkillsByCat('侦查');
    expect(Object.values(a).flat().length).toBe(Object.values(b).flat().length);
  });
});

// ════════════════════ SSR 渲染快照 ════════════════════

describe('SkillsTab (SSR 渲染)', () => {
  it('顶栏统计:无黑名单 + 无自定义 → "当前 56"', () => {
    const scn = blankScn();
    const html = renderToStaticMarkup(
      <SkillsTab scn={scn} onChange={() => undefined} />,
    );
    // 数字应是 ALL_SKILLS.length(基线 56;若 coc-data 调整数量 stats 也跟着变)
    const N = ALL_SKILLS.length;
    expect(html).toContain(`>${N}</strong>`); // 出现至少一次原数字
    // 当前可见 = N(无黑名单 + 无自定义),应至少出现 2 次相同 N 的标签(orig & current)
    const matches = html.match(new RegExp(`>${N}</strong>`, 'g'));
    expect(matches && matches.length >= 2).toBe(true);
  });

  it('黑名单 9 + 自定义 4 → 顶栏显示 "当前 51"(假定 ALL_SKILLS = 56)', () => {
    const bl = ['汽车驾驶', '电气维修', '电子学', '射击(手枪)', '射击(步枪)', '射击(霰弹枪)',
                '操作重型机械', '计算机使用', '科学(物理学)'];
    const cs: ScenarioCustomSkill[] = [
      { name: '骑马', base: 5, cat: '运动系' },
      { name: '驾驶马车', base: 5, cat: '运动系' },
      { name: '咒语吟唱', base: 10, cat: '生活系' },
      { name: '古文献抄写', base: 10, cat: '侦查系' },
    ];
    const scn = blankScn({ skillBlacklist: bl, customSkills: cs });
    const html = renderToStaticMarkup(
      <SkillsTab scn={scn} onChange={() => undefined} />,
    );
    const N = ALL_SKILLS.length;
    expect(html).toContain(`>${N}</strong>`); // 原数
    expect(html).toContain('>9</strong>'); // 黑名单
    expect(html).toContain('>4</strong>'); // 自定义
    expect(html).toContain(`>${N - 9 + 4}</strong>`); // 当前
  });

  it('自定义技能渲染为 tag(★ 前缀)', () => {
    const cs: ScenarioCustomSkill[] = [
      { name: '骑马', base: 5, cat: '运动系' },
      { name: '咒语吟唱', base: 10, cat: '生活系' },
    ];
    const scn = blankScn({ customSkills: cs });
    const html = renderToStaticMarkup(
      <SkillsTab scn={scn} onChange={() => undefined} />,
    );
    expect(html).toContain('★');
    expect(html).toContain('骑马');
    expect(html).toContain('咒语吟唱');
  });

  it('黑名单中的技能 → checkbox checked;不在黑名单 → 未 checked', () => {
    const scn = blankScn({ skillBlacklist: ['汽车驾驶'] });
    const html = renderToStaticMarkup(
      <SkillsTab scn={scn} onChange={() => undefined} />,
    );
    // 汽车驾驶 行存在
    expect(html).toContain('汽车驾驶');
    // 至少出现一个 checked checkbox
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked[^>]*data-testid="bl-checkbox-汽车驾驶"|<input[^>]*data-testid="bl-checkbox-汽车驾驶"[^>]*checked/);
    // 游泳行未勾选(SSR 中无 checked 属性)
    const swimMatch = html.match(/<input[^>]*data-testid="bl-checkbox-游泳"[^>]*>/);
    expect(swimMatch).not.toBeNull();
    expect(swimMatch![0]).not.toContain('checked');
  });

  it('AI 一键生成 + AI 推荐黑名单 按钮均渲染', () => {
    const scn = blankScn();
    const html = renderToStaticMarkup(
      <SkillsTab scn={scn} onChange={() => undefined} />,
    );
    expect(html).toContain('AI 一键生成时代技能');
    expect(html).toContain('AI 推荐黑名单');
  });

  it('搜索框存在 + 初始展示全部 56 个 checkbox', () => {
    const scn = blankScn();
    const html = renderToStaticMarkup(
      <SkillsTab scn={scn} onChange={() => undefined} />,
    );
    expect(html).toContain('data-testid="skills-search"');
    // 计 checkbox 数量
    const checkboxes = html.match(/data-testid="bl-checkbox-/g);
    expect(checkboxes?.length).toBe(ALL_SKILLS.length);
  });

  it('选中状态 reasonMap 不渲染(初始无 reason)', () => {
    const scn = blankScn({ skillBlacklist: ['汽车驾驶'] });
    const html = renderToStaticMarkup(
      <SkillsTab scn={scn} onChange={() => undefined} />,
    );
    // 没调用 AI → reasonMap 为空 → 不会出现 "←" 尾注
    // (其他位置可能出现 ← 字符,但 italic 小灰字结构特征性强)
    expect(html).not.toContain('font-style:italic');
  });
});
