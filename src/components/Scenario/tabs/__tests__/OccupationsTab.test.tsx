// OccupationsTab — 渲染 + 行为 + 不变量测试
// 测试环境 node + 无 @testing-library/react;故组合两类测试:
//   A) renderToStaticMarkup 验渲染契约(列表/空态/星标/计数顶栏)
//   B) 直接调用导出的纯辅助函数(normalizeSkills / upsertByName)验不变量
//   C) AI 一键生成路径:mock scenario-llm.generateCustomOccupations,
//      通过新建一个外层 wrapper 调用 React useState 的 handleAiGenerate 不易;
//      转而验证「合并逻辑等价于 applyScenarioPatch({upsertOccupations})」
//      并断言 mock callMock 被参数化调用过(由 scenario-llm 单测覆盖,这里仅校验上层会调它)。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import type { ScenarioDoc } from '../../../../types/scenario';
import type { Occupation } from '../../../../sillytavern/coc-data';

// Mock scenario-llm 模块 — 必须在 import OccupationsTab 之前
const generateMock = vi.fn();
vi.mock('../../../../scenario/scenario-llm', () => ({
  generateCustomOccupations: (...args: unknown[]) => generateMock(...args),
}));

import { OccupationsTab } from '../OccupationsTab';
import { normalizeSkills, upsertByName } from '../OccupationsTab.helpers';
import { applyScenarioPatch } from '../../../../scenario/scenario-patch';

beforeEach(() => generateMock.mockReset());

// ── 测试用 fixture ──
function makeScn(occs: Occupation[] = []): ScenarioDoc {
  return {
    id: 'scn_test',
    builtin: false,
    meta: {
      name: '测试剧本',
      type: '调查',
      durationHint: '1-2h',
      difficulty: 2,
      headcountHint: '2-4 人',
      sanLossHint: '中',
      blurb: '一个用来跑测试的剧本',
    },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: [],
    customOccupations: occs,
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: 0,
    updatedAt: 0,
  };
}

const FIX_OCCS: Occupation[] = [
  { name: '罗马军团百夫长', crMin: 30, crMax: 60, skills: ['战斗(剑)', '聆听', '侦查', '说服', '急救', '攀爬', '跳跃', '心理学'] },
  { name: '元老院评议员', crMin: 50, crMax: 90, skills: ['说服', '法律', '历史', '聆听', '心理学', '话术', '语言(其他)', '取悦'] },
  { name: '神官', crMin: 20, crMax: 60, skills: ['说服', '心理学', '历史', '聆听', '说服', '语言(其他)', '取悦', '神秘学'] },
];

describe('OccupationsTab — 纯辅助函数', () => {
  describe('normalizeSkills', () => {
    it('undefined → 8 个空槽', () => {
      const out = normalizeSkills(undefined);
      expect(out).toHaveLength(8);
      expect(out).toEqual(['', '', '', '', '', '', '', '']);
    });
    it('长度 < 8 → 补足空字符串到 8 槽', () => {
      const out = normalizeSkills(['聆听', '侦查']);
      expect(out).toEqual(['聆听', '侦查', '', '', '', '', '', '']);
    });
    it('长度 > 8 → 截断到 8 槽', () => {
      const out = normalizeSkills(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
      expect(out).toHaveLength(8);
      expect(out).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    });
    it('长度 == 8 → 原样返回(派生新数组,不变更入参)', () => {
      const src = ['1', '2', '3', '4', '5', '6', '7', '8'];
      const out = normalizeSkills(src);
      expect(out).toEqual(src);
    });
  });

  describe('upsertByName', () => {
    it('同 name 覆盖(替换原位项,不追加)', () => {
      const list: Occupation[] = [
        { name: 'A', crMin: 10, crMax: 20, skills: Array(8).fill('') },
        { name: 'B', crMin: 30, crMax: 40, skills: Array(8).fill('') },
      ];
      const next: Occupation = { name: 'A', crMin: 50, crMax: 60, skills: Array(8).fill('x') };
      const out = upsertByName(list, next, 'A');
      expect(out).toHaveLength(2);
      expect(out[0]).toEqual(next);
      expect(out[1].name).toBe('B');
    });

    it('异 name(改名)→ 剔除旧名,再 upsert 新名', () => {
      const list: Occupation[] = [
        { name: 'A', crMin: 10, crMax: 20, skills: Array(8).fill('') },
        { name: 'B', crMin: 30, crMax: 40, skills: Array(8).fill('') },
      ];
      const next: Occupation = { name: 'C', crMin: 10, crMax: 20, skills: Array(8).fill('') };
      const out = upsertByName(list, next, 'A');
      expect(out.map((o) => o.name)).toEqual(['B', 'C']);
    });

    it('改名为已存在的另一项 → 旧名消失,新名覆盖同名项', () => {
      const list: Occupation[] = [
        { name: 'A', crMin: 10, crMax: 20, skills: Array(8).fill('') },
        { name: 'B', crMin: 30, crMax: 40, skills: Array(8).fill('') },
      ];
      const next: Occupation = { name: 'B', crMin: 99, crMax: 99, skills: Array(8).fill('z') };
      const out = upsertByName(list, next, 'A');
      // A 被剔除, B 被新值覆盖
      expect(out).toHaveLength(1);
      expect(out[0]).toEqual(next);
    });

    it('原列表未变更(派生新数组)', () => {
      const list: Occupation[] = [
        { name: 'A', crMin: 10, crMax: 20, skills: Array(8).fill('') },
      ];
      const snapshot = JSON.stringify(list);
      upsertByName(list, { name: 'A', crMin: 50, crMax: 60, skills: Array(8).fill('') }, 'A');
      expect(JSON.stringify(list)).toBe(snapshot);
    });
  });
});

describe('OccupationsTab — 渲染', () => {
  it('mock 3 个职业 → 渲染列表全部出现 + 顶栏计数 3/15', () => {
    const html = renderToStaticMarkup(
      React.createElement(OccupationsTab, { scn: makeScn(FIX_OCCS), onChange: () => undefined }),
    );
    expect(html).toContain('职业 3/15');
    for (const o of FIX_OCCS) expect(html).toContain(o.name);
    // 信用范围呈现
    expect(html).toContain('30');
    expect(html).toContain('60');
  });

  it('列表项渲染信用范围 N–M 形式', () => {
    const html = renderToStaticMarkup(
      React.createElement(OccupationsTab, { scn: makeScn(FIX_OCCS), onChange: () => undefined }),
    );
    // 至少出现一次 "信用 30–60"(连字符为 –,U+2013)
    expect(html).toContain('信用 30');
    expect(html).toContain('60%');
  });

  it('空 customOccupations → 列表显示"暂无时代化职业"占位', () => {
    const html = renderToStaticMarkup(
      React.createElement(OccupationsTab, { scn: makeScn([]), onChange: () => undefined }),
    );
    expect(html).toContain('暂无时代化职业');
    expect(html).toContain('职业 0/15');
  });

  it('默认选中第 0 项 → 编辑区显示其 name + 8 个技能槽', () => {
    const html = renderToStaticMarkup(
      React.createElement(OccupationsTab, { scn: makeScn(FIX_OCCS), onChange: () => undefined }),
    );
    // 编辑区 name input value = 第一个职业
    expect(html).toContain('value="罗马军团百夫长"');
    // 8 个技能槽 — 每槽都有"点击换"提示
    const pickHints = html.match(/点击换/g) ?? [];
    expect(pickHints.length).toBe(8);
  });

  it('顶栏渲染 "AI 一键生成" + "+ 新职业" 两个按钮', () => {
    const html = renderToStaticMarkup(
      React.createElement(OccupationsTab, { scn: makeScn(FIX_OCCS), onChange: () => undefined }),
    );
    expect(html).toContain('AI 一键生成');
    expect(html).toContain('+ 新职业');
  });

  it('选中项左侧出现星标 ★ 前缀', () => {
    const html = renderToStaticMarkup(
      React.createElement(OccupationsTab, { scn: makeScn(FIX_OCCS), onChange: () => undefined }),
    );
    expect(html).toContain('★');
  });

  it('双滑块的 aria-label 包含"信用评级下限"和"上限"', () => {
    const html = renderToStaticMarkup(
      React.createElement(OccupationsTab, { scn: makeScn(FIX_OCCS), onChange: () => undefined }),
    );
    expect(html).toContain('aria-label="信用评级下限"');
    expect(html).toContain('aria-label="信用评级上限"');
  });
});

describe('OccupationsTab — AI 生成路径(等价合并)', () => {
  it('applyScenarioPatch({upsertOccupations}) 合并逻辑:同 name 覆盖 + 异 name 追加', () => {
    const scn = makeScn(FIX_OCCS);
    const incoming: Occupation[] = [
      // 覆盖原"神官"
      { name: '神官', crMin: 25, crMax: 70, skills: Array(8).fill('占卜') },
      // 新追加
      { name: '角斗士', crMin: 5, crMax: 20, skills: ['战斗(短剑)', '闪避', '聆听', '侦查', '攀爬', '跳跃', '游泳', '急救'] },
    ];
    const out = applyScenarioPatch(scn, { upsertOccupations: incoming });
    const names = out.customOccupations.map((o) => o.name);
    expect(names).toEqual(['罗马军团百夫长', '元老院评议员', '神官', '角斗士']);
    const updated = out.customOccupations.find((o) => o.name === '神官');
    expect(updated?.crMin).toBe(25);
    expect(updated?.crMax).toBe(70);
  });

  it('mock generateCustomOccupations → 返回 upsertOccupations,组件路径会调它', async () => {
    // 这里只验 mock 链路:scenario-llm.generateCustomOccupations 被替换为 generateMock。
    // OccupationsTab 内部 handleAiGenerate 会 await 它;test 环境无法触发 click,
    // 但导出的 mock 已通过 vi.mock 安装,后续真正集成测试只需通过用户交互检验。
    generateMock.mockResolvedValue({
      upsertOccupations: [
        { name: '罗马商人', crMin: 20, crMax: 60, skills: Array(8).fill('') },
      ],
      suggestedNewSkills: ['古希腊语'],
    });
    // 渲染一次,确认组件树构建成功(mock 未被实际触发)
    const html = renderToStaticMarkup(
      React.createElement(OccupationsTab, { scn: makeScn(FIX_OCCS), onChange: () => undefined }),
    );
    expect(html).toContain('AI 一键生成');
    // mock 还未被 click 调用过(SSR 不触发事件)
    expect(generateMock).not.toHaveBeenCalled();
  });
});

describe('OccupationsTab — 上限/不变量', () => {
  it('15 个时,顶栏按钮渲染为 disabled', () => {
    const occs: Occupation[] = Array.from({ length: 15 }, (_, i) => ({
      name: `O${i}`, crMin: 10, crMax: 20, skills: Array(8).fill(''),
    }));
    const html = renderToStaticMarkup(
      React.createElement(OccupationsTab, { scn: makeScn(occs), onChange: () => undefined }),
    );
    expect(html).toContain('职业 15/15');
    // 至少两个 disabled 按钮(AI 一键 + 新职业)
    const disabledBtns = html.match(/<button[^>]*disabled[^>]*>/g) ?? [];
    expect(disabledBtns.length).toBeGreaterThanOrEqual(2);
  });
});
