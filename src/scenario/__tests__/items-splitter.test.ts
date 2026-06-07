import { describe, it, expect } from 'vitest';
import { splitInitialItems } from '../items-splitter';

describe('splitInitialItems', () => {
  it('happy path：顿号分隔的纯净物品列表', () => {
    expect(splitInitialItems('青铜护身符、镶宝石短刀、火漆封信')).toEqual([
      '青铜护身符',
      '镶宝石短刀',
      '火漆封信',
    ]);
  });

  it('英文括号内的顿号不被切（防 `放血用细刀)` bug）', () => {
    expect(
      splitInitialItems('皮质药囊(含药草、亚麻绷带、小铜针、放血用细刀)、希腊文版《希波克拉底文集》一卷、小铜油灯'),
    ).toEqual([
      '皮质药囊(含药草、亚麻绷带、小铜针、放血用细刀)',
      '希腊文版《希波克拉底文集》一卷',
      '小铜油灯',
    ]);
  });

  it('全角括号同样不被切', () => {
    expect(splitInitialItems('皮质药囊（含药草、亚麻绷带）、油灯')).toEqual([
      '皮质药囊（含药草、亚麻绷带）',
      '油灯',
    ]);
  });

  it('嵌套括号正确平衡', () => {
    expect(splitInitialItems('军囊(含口粮(火石、燧石))、短剑')).toEqual([
      '军囊(含口粮(火石、燧石))',
      '短剑',
    ]);
  });

  it('未关括号降级为朴素切（避免作者漏右括号让整个背包变一项）', () => {
    expect(splitInitialItems('皮质药囊(含药草、绷带、油灯')).toEqual([
      '皮质药囊(含药草',
      '绷带',
      '油灯',
    ]);
  });

  it('混合分隔符 + 换行 + 全角逗号都能切', () => {
    expect(splitInitialItems('短剑，护腕；火绒\n铜油灯、皮带')).toEqual([
      '短剑',
      '护腕',
      '火绒',
      '铜油灯',
      '皮带',
    ]);
  });

  it('空串与全空白返回 []', () => {
    expect(splitInitialItems('')).toEqual([]);
    expect(splitInitialItems('   ')).toEqual([]);
    expect(splitInitialItems('、、、')).toEqual([]);
  });

  it('单项不切，前后空白去除', () => {
    expect(splitInitialItems('  唯一物品  ')).toEqual(['唯一物品']);
  });
});
