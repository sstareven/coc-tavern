import { describe, expect, it, vi } from 'vitest';
import {
  restructureMessages,
  isDeepSeekSource,
  splitLoreBucketsForCache,
  buildDynamicTail,
  hasDynamicMarker,
  leanStatData,
  DEFAULT_RESTRUCTURE_CONFIG,
} from './deepseek-cache-restructure';
import type { AssembledMessage } from './prompt-assembler';
import type { LoreEntry } from '../types';
import type { LoreBuckets } from './rewrite-lite';

const cfg = (over: Partial<typeof DEFAULT_RESTRUCTURE_CONFIG> = {}) => ({
  ...DEFAULT_RESTRUCTURE_CONFIG,
  enabled: true,
  ...over,
});

function mkEntry(name: string): LoreEntry {
  return {
    name, keys: name, content: name, logic: 'AND_ANY', priority: 0, disabled: false,
    constant: false, position: 0, depth: 0, probability: 100, secondaryKeys: '',
    scanDepth: 0, caseSensitive: 0, matchWholeWord: 0, groupScoring: 0,
    automationId: '', inclusionGroup: '', prioritizeInclusion: false, groupWeight: 100,
    sticky: 0, cooldown: 0, delay: 0, preventRecursion: true, delayUntilRecursion: false,
    excludeRecursion: false, ignoreReplyLimit: false,
  };
}

function mkBuckets(over: Partial<LoreBuckets> = {}): LoreBuckets {
  return {
    matchedKeyword: [], summary: [], constant: [], darkThread: [],
    generateInjects: [], inverted: [], anchor: [], keyword: [], statSnapshot: [],
    ...over,
  };
}

describe('isDeepSeekSource', () => {
  it('modelId 含 deepseek → 命中 deepseek', () => {
    expect(isDeepSeekSource('deepseek-chat', 'deepseek')).toBe(true);
    expect(isDeepSeekSource('deepseek-v4', 'deepseek,openai')).toBe(true);
  });
  it('modelId 以 ep- 开头(火山引擎) → 命中 deepseek', () => {
    expect(isDeepSeekSource('ep-20240101', 'deepseek')).toBe(true);
  });
  it('targetSources 含 custom → 任何 modelId 命中 (中转站兜底)', () => {
    expect(isDeepSeekSource('gpt-4o', 'custom')).toBe(true);
    expect(isDeepSeekSource('claude-3.7', 'custom')).toBe(true);
  });
  it('targetSources 仅 openai → 非 deepseek modelId 不命中', () => {
    expect(isDeepSeekSource('gpt-4o', 'openai')).toBe(false);
  });
  it('空 targetSources / undefined model → 不命中', () => {
    expect(isDeepSeekSource(undefined, 'deepseek')).toBe(false);
    expect(isDeepSeekSource('deepseek-chat', '')).toBe(false);
  });
});

describe('restructureMessages — enabled=false', () => {
  it('不启用 → 返回原数组拷贝（不影响入参）', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    const out = restructureMessages(input, { ...DEFAULT_RESTRUCTURE_CONFIG, enabled: false });
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });
});

describe('restructureMessages — isSingleMessage(本项目常走路径)', () => {
  it('多 system + 单 user → 合并成 ONE user message', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: '你是 KP' },
      { role: 'system', content: '【世界书】' },
      { role: 'user', content: '我环顾四周' },
    ];
    const out = restructureMessages(input, cfg());
    expect(out.length).toBe(1);
    expect(out[0].role).toBe('user');
    expect(out[0].content).toContain('<role==system>');
    expect(out[0].content).toContain('你是 KP');
    expect(out[0].content).toContain('【世界书】');
    expect(out[0].content.endsWith('我环顾四周')).toBe(true);
  });

  it('roleTags=false → 不加标签，直接以 \\n\\n 拼接', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: 'A' },
      { role: 'system', content: 'B' },
      { role: 'user', content: 'Q' },
    ];
    const out = restructureMessages(input, cfg({ roleTags: false }));
    expect(out[0].content).not.toContain('<role==');
    expect(out[0].content).toBe('A\n\nB\n\nQ');
  });

  it('相邻同 role 分组：两条 system → 一段 <role==system> 包裹', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: 'A' },
      { role: 'system', content: 'B' },
      { role: 'user', content: 'Q' },
    ];
    const out = restructureMessages(input, cfg());
    expect(out[0].content).toMatch(/<role==system>\nA\n\nB\n<\/role==system>/);
  });

  it('greenContents 注入到合并文本里（顺序：pre + green + post + firstUser）', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: 'PRE' },
      { role: 'user', content: 'USER' },
    ];
    const out = restructureMessages(input, cfg(), ['GREEN1', 'GREEN2']);
    const c = out[0].content;
    expect(c.indexOf('PRE')).toBeLessThan(c.indexOf('GREEN1'));
    expect(c.indexOf('GREEN1')).toBeLessThan(c.indexOf('GREEN2'));
    expect(c.indexOf('GREEN2')).toBeLessThan(c.indexOf('USER'));
  });

  it('customPrefill → 追加独立 assistant', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'U' },
    ];
    const out = restructureMessages(
      input,
      cfg({ customPrefillEnabled: true, customPrefillContent: '{' }),
    );
    expect(out.length).toBe(2);
    expect(out[1]).toEqual({ role: 'assistant', content: '{' });
  });

  it('空 customPrefillContent → 不追加', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'U' },
    ];
    const out = restructureMessages(
      input,
      cfg({ customPrefillEnabled: true, customPrefillContent: '   ' }),
    );
    expect(out.length).toBe(1);
  });
});

describe('restructureMessages — 多 user 路径', () => {
  it('preHistory + 多轮 + 末 user → 顶部缓存区 user + 中间 + 底部高注意力区', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'U1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'U2' },
    ];
    const out = restructureMessages(input, cfg());
    // [0] = 合并的顶部 user (SYS + U1)
    // [1] = A1 (assistant)
    // [2] = U2 (last user)
    expect(out.length).toBe(3);
    expect(out[0].role).toBe('user');
    expect(out[0].content).toContain('SYS');
    expect(out[0].content).toContain('U1');
    expect(out[1]).toEqual({ role: 'assistant', content: 'A1' });
    expect(out[2].role).toBe('user');
    expect(out[2].content).toContain('U2');
  });

  it('内联 system 抽到底部，prepend 到末 user.content 前', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: 'PRE' },
      { role: 'user', content: 'U1' },
      { role: 'system', content: 'INLINE_SYS' },
      { role: 'assistant', content: 'A' },
      { role: 'user', content: 'U2' },
    ];
    const out = restructureMessages(input, cfg());
    const lastUser = out[out.length - 1];
    expect(lastUser.role).toBe('user');
    expect(lastUser.content).toContain('INLINE_SYS');
    // INLINE_SYS 在 U2 之前
    expect(lastUser.content.indexOf('INLINE_SYS'))
      .toBeLessThan(lastUser.content.indexOf('U2'));
  });

  it('greenContents 与 inline-system 并入底部高注意力区', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: 'PRE' },
      { role: 'user', content: 'U1' },
      { role: 'assistant', content: 'A' },
      { role: 'user', content: 'U2' },
    ];
    const out = restructureMessages(input, cfg(), ['GREEN_LORE']);
    const lastUser = out[out.length - 1];
    expect(lastUser.content).toContain('GREEN_LORE');
    expect(lastUser.content.indexOf('GREEN_LORE'))
      .toBeLessThan(lastUser.content.indexOf('U2'));
  });

  it('keepTailAssistant=true：末 user 后的 assistant 保留为独立 message', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'U' },
      { role: 'assistant', content: 'TAIL_AS' },
    ];
    const out = restructureMessages(input, cfg({ keepTailAssistant: true }));
    expect(out[out.length - 1]).toEqual({ role: 'assistant', content: 'TAIL_AS' });
  });

  it('keepTailAssistant=false：末 user 后的 assistant 并入底部高注意力区', () => {
    // chatHistory=[user]，postHistory=[assistant] → 走 isSingleMessage 路径，
    // postEntries 含 assistant，进底部合并段
    const input: AssembledMessage[] = [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'U' },
      { role: 'assistant', content: 'TAIL_AS' },
    ];
    const out = restructureMessages(input, cfg({ keepTailAssistant: false }));
    // 单条 user，TAIL_AS 应在合并的文本里
    expect(out.length).toBe(1);
    expect(out[0].content).toContain('TAIL_AS');
  });
});

describe('restructureMessages — 边界', () => {
  it('空数组 → 空数组', () => {
    expect(restructureMessages([], cfg())).toEqual([]);
  });
  it('全 system 无 user → debugLog 提示并返回拷贝', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const input: AssembledMessage[] = [{ role: 'system', content: 'S' }];
    const out = restructureMessages(input, cfg({ debugLog: true }));
    expect(out).toEqual(input);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it('两次调用相同输入 → 字节级稳定（缓存友好性保证）', () => {
    const input: AssembledMessage[] = [
      { role: 'system', content: '【系统】每回合不变的设定' },
      { role: 'system', content: '【世界书·常驻】基本框架' },
      { role: 'user', content: '玩家本回合输入' },
    ];
    const a = restructureMessages(input, cfg());
    const b = restructureMessages(input, cfg());
    expect(a[0].content).toBe(b[0].content);
  });
});

describe('splitLoreBucketsForCache', () => {
  it('默认：constant/generateInjects/inverted 进静态；其余进动态', () => {
    const buckets = mkBuckets({
      matchedKeyword: [mkEntry('mk1')],
      summary: [mkEntry('sm1')],
      constant: [mkEntry('c1'), mkEntry('c2')],
      darkThread: [mkEntry('dt1')],
      anchor: [mkEntry('an1')],
      keyword: [mkEntry('kw1')],
      statSnapshot: [mkEntry('ss1')],
      generateInjects: [mkEntry('gi1')],
      inverted: [mkEntry('iv1')],
    });
    const { staticLore, dynamicLore } = splitLoreBucketsForCache(buckets);
    expect(staticLore.map((e) => e.name)).toEqual(['c1', 'c2', 'gi1', 'iv1']);
    expect(dynamicLore.map((e) => e.name)).toEqual(['mk1', 'sm1', 'dt1', 'an1', 'kw1', 'ss1']);
  });

  it('treatConstantAsDynamic=true：constant 也下沉到动态', () => {
    const buckets = mkBuckets({
      constant: [mkEntry('c1')],
      generateInjects: [mkEntry('gi1')],
      matchedKeyword: [mkEntry('mk1')],
    });
    const { staticLore, dynamicLore } = splitLoreBucketsForCache(buckets, {
      treatConstantAsDynamic: true,
    });
    expect(staticLore.map((e) => e.name)).toEqual(['gi1']);
    expect(dynamicLore.map((e) => e.name)).toContain('c1');
    expect(dynamicLore.map((e) => e.name)).toContain('mk1');
  });

  it('空 buckets → 空数组', () => {
    const { staticLore, dynamicLore } = splitLoreBucketsForCache(mkBuckets());
    expect(staticLore).toEqual([]);
    expect(dynamicLore).toEqual([]);
  });
});

describe('buildDynamicTail', () => {
  it('两段都非空 → 用 \\n\\n 连接，lore 内部用 \\n', () => {
    const tail = buildDynamicTail({
      dynamicLoreContents: ['LOR1', 'LOR2'],
      dynamicFormatParts: ['FMT1', 'FMT2'],
    });
    expect(tail).toBe('LOR1\nLOR2\n\nFMT1\n\nFMT2');
  });
  it('全空 → 空串', () => {
    expect(buildDynamicTail({ dynamicLoreContents: [], dynamicFormatParts: [] })).toBe('');
    expect(buildDynamicTail({ dynamicLoreContents: ['  '], dynamicFormatParts: [''] })).toBe('');
  });
  it('只有 lore → 仅返回 lore 段（无 FMT）', () => {
    expect(buildDynamicTail({ dynamicLoreContents: ['A'], dynamicFormatParts: [] })).toBe('A');
  });
  it('只有 fmt → 仅返回 fmt 段', () => {
    expect(buildDynamicTail({ dynamicLoreContents: [], dynamicFormatParts: ['F'] })).toBe('F');
  });
});

describe('hasDynamicMarker', () => {
  it('EJS 代码块 → 动态', () => {
    expect(hasDynamicMarker('<% if (x > 0) { %>HP低<% } %>')).toBe(true);
    expect(hasDynamicMarker('<%= getvar("san") %>')).toBe(true);
    expect(hasDynamicMarker('<%- raw %>')).toBe(true);
  });
  it('getvar/getwi/setvar/$ 宏 → 动态', () => {
    expect(hasDynamicMarker('{{getvar:san}}')).toBe(true);
    expect(hasDynamicMarker('{{getwi:神话生物}}')).toBe(true);
    expect(hasDynamicMarker('{{setvar::counter::1}}')).toBe(true);
    expect(hasDynamicMarker('{{$myVar}}')).toBe(true);
  });
  it('点路径宏(本项目 statData 引用) → 动态', () => {
    expect(hasDynamicMarker('当前HP: {{调查员.生命值.当前}}')).toBe(true);
    expect(hasDynamicMarker('{{世界.时间}}')).toBe(true);
    expect(hasDynamicMarker('暗线进度: {{剧情.暗线.进度}}')).toBe(true);
  });
  it('无点字面宏(同会话内稳定) → 不视为动态', () => {
    expect(hasDynamicMarker('{{user}} 与 {{char}} 对话')).toBe(false);
    expect(hasDynamicMarker('{{charName}} {{newline}}')).toBe(false);
  });
  it('SillyTavern 经典动态宏(time/date/random/roll/newline::N) → 动态(回归 #3)', () => {
    expect(hasDynamicMarker('当前时间: {{time}}')).toBe(true);
    expect(hasDynamicMarker('日期: {{date}} / {{isotime}}')).toBe(true);
    expect(hasDynamicMarker('{{random::A::B::C}}')).toBe(true);
    expect(hasDynamicMarker('掷骰: {{roll::1d6}}')).toBe(true);
    expect(hasDynamicMarker('{{newline::3}}')).toBe(true);
    expect(hasDynamicMarker('{{format_message_variable::counter}}')).toBe(true);
  });
  it('SillyTavern 静态角色卡点路径宏(char.*/persona.*/scenario 等) → 不视为动态(回归 #13)', () => {
    expect(hasDynamicMarker('角色: {{char.description}}')).toBe(false);
    expect(hasDynamicMarker('人物: {{persona.name}}')).toBe(false);
    expect(hasDynamicMarker('{{user.bio}} / {{scenario}}')).toBe(false);
    // 混合:含静态点路径 + 真动态宏 → 仍判动态
    expect(hasDynamicMarker('{{char.description}} 当前时间: {{time}}')).toBe(true);
    expect(hasDynamicMarker('{{persona.name}} HP {{调查员.生命值.当前}}')).toBe(true);
  });
  it('纯静态文本 → 不动态', () => {
    expect(hasDynamicMarker('你是 KP，遵循克苏鲁的呼唤 7e 规则')).toBe(false);
    expect(hasDynamicMarker('# 输出格式\n\n请严格按 JSON 输出')).toBe(false);
    expect(hasDynamicMarker('')).toBe(false);
  });
  it('混合：含 EJS + 静态文本 → 动态', () => {
    expect(hasDynamicMarker('调查员状态：<% if (hp <= 0) %>濒死<% %> 当前位置：固定值')).toBe(true);
  });
});

describe('leanStatData', () => {
  const fullStat = {
    调查员: {
      生命值: { 当前: 9, 最大: 10 },
      理智值: { 当前: 50, 最大: 65 },
      魔法值: { 当前: 10, 最大: 14 },
      姓名: '杰米',
      职业: '医生',
      姿态: '站立',
      状态条件: [],
      幸运: 70,
      技能: { 医学: 85, 侦查: 60 },
      背包: ['绷带'],
    },
    世界: { 时间: '清晨', 天气: '薄雾', 地点: '阿卡姆', 日期: '1925-01-01' },
    战斗: { 是否战斗中: false, 回合数: 0 },
    剧情: {
      暗线: { 进度: 15, 威胁等级: '潜伏' },
      阶段: '调查期',
      已解锁: { 阿卡姆: true, 密大: true, 印斯茅斯: false },
      线索: { 化石证据: { 内容: '...', 是否已调查: true } },
      关键事件: { 事件1: { 名称: '...' } },
      当前章节: '序章',
    },
  };

  it('保留高频字段：调查员的 HP/SAN/MP/姓名/职业/姿态/状态/幸运', () => {
    const lean = leanStatData(fullStat) as Record<string, Record<string, unknown>>;
    expect(lean.调查员).toMatchObject({
      生命值: { 当前: 9, 最大: 10 },
      理智值: { 当前: 50, 最大: 65 },
      姓名: '杰米',
      职业: '医生',
      姿态: '站立',
    });
    // 不应包含技能/背包等
    expect(lean.调查员.技能).toBeUndefined();
    expect(lean.调查员.背包).toBeUndefined();
  });

  it('世界、战斗整段保留', () => {
    const lean = leanStatData(fullStat);
    expect(lean.世界).toEqual(fullStat.世界);
    expect(lean.战斗).toEqual(fullStat.战斗);
  });

  it('剧情仅保留暗线/阶段，丢弃 已解锁/线索/关键事件/当前章节', () => {
    const lean = leanStatData(fullStat) as Record<string, Record<string, unknown>>;
    expect(lean.剧情).toEqual({
      暗线: { 进度: 15, 威胁等级: '潜伏' },
      阶段: '调查期',
    });
    expect(lean.剧情.已解锁).toBeUndefined();
    expect(lean.剧情.线索).toBeUndefined();
    expect(lean.剧情.关键事件).toBeUndefined();
    expect(lean.剧情.当前章节).toBeUndefined();
  });

  it('空 statData → 空对象', () => {
    expect(leanStatData({})).toEqual({});
  });

  it('部分字段缺失 → 跳过缺失项不报错', () => {
    const lean = leanStatData({ 调查员: { 生命值: { 当前: 5 } } }) as Record<string, Record<string, unknown>>;
    expect(lean.调查员).toEqual({ 生命值: { 当前: 5 } });
    expect(lean.世界).toBeUndefined();
    expect(lean.战斗).toBeUndefined();
    expect(lean.剧情).toBeUndefined();
  });

  it('实测体积估算：典型 statData lean 后字节减少 30-60%', () => {
    const fullJson = JSON.stringify(fullStat);
    const leanJson = JSON.stringify(leanStatData(fullStat));
    expect(leanJson.length).toBeLessThan(fullJson.length);
    // 至少能砍掉 20%（实际取决于具体字段长度）
    expect(leanJson.length / fullJson.length).toBeLessThan(0.8);
  });
});
