import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSanInlineTags,
  rollSanCheck,
  rollSanLoss,
  buildSanityOps,
  readCheckTarget,
  applyDifficulty,
  type RollD100,
  type RollDice,
} from '../sanity-prompt-engine';
import { useSanityBubbleStore } from '../../stores/useSanityBubbleStore';
import { migrateSheet } from '../../stores/useCharSheetStore';
import type { CharacterSheet, SanityCheckPrompt } from '../../types';

// ─── 测试用基础角色卡: POW 50 / INT 70 / 克苏鲁神话 30 ───
function baseSheet(over: Partial<CharacterSheet> = {}): CharacterSheet {
  return migrateSheet({
    identity: { name: '田中', occupation: '记者', age: 30, gender: '男', birthplace: '', residence: '', id: '' },
    characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 70, EDU: 50 },
    secondary: {
      hp: { current: 12, max: 12 }, san: { current: 60, max: 80 }, mp: { current: 10, max: 10 },
      luck: 50, mov: 8, db: '0', build: 0,
    },
    skills: {
      '克苏鲁神话': { base: 0, current: 30, occupation: 0, personal: 30, ticked: false } as never,
    } as never,
    ...over,
  });
}

const PROMPT_POW_NORMAL: SanityCheckPrompt = {
  id: 'p1', trigger: '目睹神像扭动', checkType: 'POW', difficulty: 'normal',
  sanLossSuccess: '0', sanLossFail: '1D6',
};

describe('parseSanInlineTags — 解叙事里 <san id="N"/> 标签', () => {
  it('无标签 → 空数组', () => {
    expect(parseSanInlineTags('普通叙事文字')).toEqual([]);
  });
  it('空串 → 空数组', () => {
    expect(parseSanInlineTags('')).toEqual([]);
  });
  it('单标签 → 返回 id + start/end 偏移', () => {
    const text = '你看见<san id="p1"/>怪物从墙里渗出';
    const tags = parseSanInlineTags(text);
    expect(tags).toHaveLength(1);
    expect(tags[0].id).toBe('p1');
    expect(text.slice(tags[0].start, tags[0].end)).toBe('<san id="p1"/>');
  });
  it('多标签按出现顺序返回', () => {
    const text = 'a<san id="p1"/>b<san id="p2"/>c';
    const tags = parseSanInlineTags(text);
    expect(tags.map((t) => t.id)).toEqual(['p1', 'p2']);
    expect(tags[0].start).toBeLessThan(tags[1].start);
  });
  it('容忍单引号 / 大小写 / 多空白', () => {
    const text = `开始<SAN  id = 'p1' />结束`;
    const tags = parseSanInlineTags(text);
    expect(tags).toHaveLength(1);
    expect(tags[0].id).toBe('p1');
  });
});

describe('readCheckTarget — 读检定基础目标值', () => {
  it('checkType=POW → sheet.characteristics.POW', () => {
    expect(readCheckTarget(baseSheet(), PROMPT_POW_NORMAL)).toBe(50);
  });
  it('checkType=INT → sheet.characteristics.INT', () => {
    const p: SanityCheckPrompt = { ...PROMPT_POW_NORMAL, checkType: 'INT' };
    expect(readCheckTarget(baseSheet(), p)).toBe(70);
  });
  it('checkType=skill + checkSkill 命中 → sheet.skills[checkSkill].current', () => {
    const p: SanityCheckPrompt = { ...PROMPT_POW_NORMAL, checkType: 'skill', checkSkill: '克苏鲁神话' };
    expect(readCheckTarget(baseSheet(), p)).toBe(30);
  });
  it('skill 无 checkSkill / 找不到技能 → 0(必败)', () => {
    const p1: SanityCheckPrompt = { ...PROMPT_POW_NORMAL, checkType: 'skill' };
    expect(readCheckTarget(baseSheet(), p1)).toBe(0);
    const p2: SanityCheckPrompt = { ...PROMPT_POW_NORMAL, checkType: 'skill', checkSkill: '不存在' };
    expect(readCheckTarget(baseSheet(), p2)).toBe(0);
  });
});

describe('applyDifficulty — 难度衰减目标值', () => {
  it('normal → 原值', () => {
    expect(applyDifficulty(50, 'normal')).toBe(50);
  });
  it('hard → floor(原值/2)', () => {
    expect(applyDifficulty(51, 'hard')).toBe(25);
  });
  it('extreme → floor(原值/5)', () => {
    expect(applyDifficulty(52, 'extreme')).toBe(10);
  });
});

describe('rollSanCheck — d100 vs effectiveTarget', () => {
  const fixedRoll = (n: number): RollD100 => () => n;

  it('POW 50 normal · d100=30 → 通过(30<=50)', () => {
    const r = rollSanCheck(baseSheet(), PROMPT_POW_NORMAL, fixedRoll(30));
    expect(r.passed).toBe(true);
    expect(r.d100).toBe(30);
    expect(r.effectiveTarget).toBe(50);
  });
  it('POW 50 normal · d100=51 → 失败', () => {
    const r = rollSanCheck(baseSheet(), PROMPT_POW_NORMAL, fixedRoll(51));
    expect(r.passed).toBe(false);
  });
  it('POW 50 hard · d100=26 → 失败(超过 floor(50/2)=25)', () => {
    const p: SanityCheckPrompt = { ...PROMPT_POW_NORMAL, difficulty: 'hard' };
    const r = rollSanCheck(baseSheet(), p, fixedRoll(26));
    expect(r.passed).toBe(false);
    expect(r.effectiveTarget).toBe(25);
  });
  it('POW 50 extreme · d100=10 → 通过(10<=floor(50/5)=10)', () => {
    const p: SanityCheckPrompt = { ...PROMPT_POW_NORMAL, difficulty: 'extreme' };
    const r = rollSanCheck(baseSheet(), p, fixedRoll(10));
    expect(r.passed).toBe(true);
    expect(r.effectiveTarget).toBe(10);
  });
});

describe('rollSanLoss — 骰子表达式', () => {
  // 每次掷骰返回最大值,便于断言累加
  const maxRoll: RollDice = (sides) => sides;
  // 固定骰值
  const fixedRoll = (n: number): RollDice => () => n;

  it('"0" → 0', () => { expect(rollSanLoss('0', maxRoll)).toBe(0); });
  it('"5" → 5(纯整数)', () => { expect(rollSanLoss('5', maxRoll)).toBe(5); });
  it('空串 → 0', () => { expect(rollSanLoss('', maxRoll)).toBe(0); });
  it('"1D6" · 每骰=6 → 6', () => { expect(rollSanLoss('1D6', maxRoll)).toBe(6); });
  it('"2D4" · 每骰=4 → 8', () => { expect(rollSanLoss('2D4', maxRoll)).toBe(8); });
  it('小写 d / 空白容忍 — "  1 d 6  " → trim 后等价 1D6', () => {
    expect(rollSanLoss('1d6', maxRoll)).toBe(6);
    expect(rollSanLoss(' 1D6 ', maxRoll)).toBe(6);
  });
  it('"1D6+2" → 1D6 + 2 = 8', () => { expect(rollSanLoss('1D6+2', maxRoll)).toBe(8); });
  it('"1D6+1D4" → 6+4 = 10', () => { expect(rollSanLoss('1D6+1D4', maxRoll)).toBe(10); });
  it('无法解析的部分 → 跳过, 不抛(fail-open)', () => {
    expect(rollSanLoss('1D6+!!!', maxRoll)).toBe(6);
    expect(rollSanLoss('完全乱码', maxRoll)).toBe(0);
  });
  it('"2D6" 用 fixed=3 → 6 (两次掷骰累加)', () => {
    expect(rollSanLoss('2D6', fixedRoll(3))).toBe(6);
  });
});

describe('buildSanityOps — 把 SAN loss 转 MvuOp', () => {
  it('loss=0 → 空数组(无 corrective 一轮浪费)', () => {
    expect(buildSanityOps(0)).toEqual([]);
  });
  it('loss<0 → 空数组(保护性)', () => {
    expect(buildSanityOps(-1)).toEqual([]);
  });
  it('loss=5 → [{op:delta, path:/调查员/理智值/当前, value:-5}]', () => {
    expect(buildSanityOps(5)).toEqual([
      { op: 'delta', path: '/调查员/理智值/当前', value: -5 },
    ]);
  });
});

describe('useSanityBubbleStore — pending/resolved 状态机', () => {
  beforeEach(() => {
    useSanityBubbleStore.getState().reset();
  });

  it('初始: pending 空 / resolved 空 / allClicked → true', () => {
    const s = useSanityBubbleStore.getState();
    expect(s.pending).toEqual([]);
    expect(s.allClicked()).toBe(true);
  });

  it('setPending 后未点 → allClicked=false', () => {
    useSanityBubbleStore.getState().setPending(['p1', 'p2']);
    expect(useSanityBubbleStore.getState().allClicked()).toBe(false);
  });

  it('markResolved 全部 → allClicked=true', () => {
    useSanityBubbleStore.getState().setPending(['p1', 'p2']);
    useSanityBubbleStore.getState().markResolved('p1');
    expect(useSanityBubbleStore.getState().allClicked()).toBe(false);
    useSanityBubbleStore.getState().markResolved('p2');
    expect(useSanityBubbleStore.getState().allClicked()).toBe(true);
  });

  it('markResolved 幂等', () => {
    useSanityBubbleStore.getState().setPending(['p1']);
    useSanityBubbleStore.getState().markResolved('p1');
    useSanityBubbleStore.getState().markResolved('p1');
    expect(useSanityBubbleStore.getState().resolved.size).toBe(1);
  });

  it('reset → 全清', () => {
    useSanityBubbleStore.getState().setPending(['p1', 'p2']);
    useSanityBubbleStore.getState().markResolved('p1');
    useSanityBubbleStore.getState().reset();
    const s = useSanityBubbleStore.getState();
    expect(s.pending).toEqual([]);
    expect(s.resolved.size).toBe(0);
    expect(s.allClicked()).toBe(true);
  });
});
