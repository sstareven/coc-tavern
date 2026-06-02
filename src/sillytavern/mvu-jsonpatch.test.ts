import { describe, it, expect, vi } from 'vitest';
import {
  extractJsonPatchBlocks,
  applyMvuPatch,
  applyMvuPatchCollect,
  hasUpdateVariableMarker,
  type MvuOp,
  type ApplyOpts,
} from './mvu-jsonpatch';

/* ============================== hasUpdateVariableMarker ============================== */

describe('hasUpdateVariableMarker（静默截断嗅探）', () => {
  it('完整补丁块 → true', () => {
    expect(hasUpdateVariableMarker('正文\n<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>')).toBe(true);
  });
  it('被截断、只剩开标签（无闭合）→ 仍 true（正是要告警的场景）', () => {
    expect(hasUpdateVariableMarker('正文\n<UpdateVariable><JSONPatch>[{"op":"replace"')).toBe(true);
    // 截断态下 extractJsonPatchBlocks 抽不出 op，调用方据 marker=true && op=0 告警
    expect(extractJsonPatchBlocks('正文\n<UpdateVariable><JSONPatch>[{"op":"replace"')).toEqual([]);
  });
  it('大小写不敏感', () => {
    expect(hasUpdateVariableMarker('<updatevariable>')).toBe(true);
  });
  it('本就无状态变化（无开标签）→ false（不误告警）', () => {
    expect(hasUpdateVariableMarker('只有纯叙事，本回合无变量变化')).toBe(false);
  });
});

/* ============================== extractJsonPatchBlocks ============================== */

describe('extractJsonPatchBlocks', () => {
  it('提取单个 <UpdateVariable><JSONPatch> 块', () => {
    const text = `narration before
<UpdateVariable>
<JSONPatch>
[{"op":"replace","path":"/hp","value":10}]
</JSONPatch>
</UpdateVariable>
narration after`;
    expect(extractJsonPatchBlocks(text)).toEqual([
      { op: 'replace', path: '/hp', value: 10 },
    ]);
  });

  it('提取多个块并合并', () => {
    const text = `
<UpdateVariable><JSONPatch>[{"op":"replace","path":"/a","value":1}]</JSONPatch></UpdateVariable>
some text
<UpdateVariable><JSONPatch>[{"op":"delta","path":"/b","value":2}]</JSONPatch></UpdateVariable>`;
    expect(extractJsonPatchBlocks(text)).toEqual([
      { op: 'replace', path: '/a', value: 1 },
      { op: 'delta', path: '/b', value: 2 },
    ]);
  });

  it('容忍标签大小写变体 <JsonPatch>', () => {
    const text = `<UpdateVariable><JsonPatch>[{"op":"replace","path":"/x","value":5}]</JsonPatch></UpdateVariable>`;
    expect(extractJsonPatchBlocks(text)).toEqual([
      { op: 'replace', path: '/x', value: 5 },
    ]);
  });

  it('容忍 <json_patch> 变体', () => {
    const text = `<UpdateVariable><json_patch>[{"op":"remove","path":"/y"}]</json_patch></UpdateVariable>`;
    expect(extractJsonPatchBlocks(text)).toEqual([{ op: 'remove', path: '/y' }]);
  });

  it('剥离内部 ```json 围栏', () => {
    const text = `<UpdateVariable><JSONPatch>
\`\`\`json
[{"op":"replace","path":"/z","value":"hi"}]
\`\`\`
</JSONPatch></UpdateVariable>`;
    expect(extractJsonPatchBlocks(text)).toEqual([
      { op: 'replace', path: '/z', value: 'hi' },
    ]);
  });

  it('剥离无语言标记的 ``` 围栏', () => {
    const text = `<UpdateVariable><JSONPatch>
\`\`\`
[{"op":"replace","path":"/z","value":1}]
\`\`\`
</JSONPatch></UpdateVariable>`;
    expect(extractJsonPatchBlocks(text)).toEqual([
      { op: 'replace', path: '/z', value: 1 },
    ]);
  });

  it('解析失败返回 []', () => {
    const text = `<UpdateVariable><JSONPatch>not json at all</JSONPatch></UpdateVariable>`;
    expect(extractJsonPatchBlocks(text)).toEqual([]);
  });

  it('无块返回 []', () => {
    expect(extractJsonPatchBlocks('plain text without any tags')).toEqual([]);
  });

  it('空字符串返回 []', () => {
    expect(extractJsonPatchBlocks('')).toEqual([]);
  });

  it('一个块解析失败不影响其它块', () => {
    const text = `
<UpdateVariable><JSONPatch>garbage</JSONPatch></UpdateVariable>
<UpdateVariable><JSONPatch>[{"op":"replace","path":"/ok","value":1}]</JSONPatch></UpdateVariable>`;
    expect(extractJsonPatchBlocks(text)).toEqual([
      { op: 'replace', path: '/ok', value: 1 },
    ]);
  });
  it('畸形块会 console.warn（不静默吞错）', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    extractJsonPatchBlocks(`<UpdateVariable><JSONPatch>not json</JSONPatch></UpdateVariable>`);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

/* ============================== applyMvuPatch: replace ============================== */

describe('applyMvuPatch replace', () => {
  it('存在路径设值', () => {
    const tree: Record<string, unknown> = { hp: 10 };
    applyMvuPatch(tree, [{ op: 'replace', path: '/hp', value: 20 }]);
    expect(tree.hp).toBe(20);
  });

  it('不存在路径跳过 + onError', () => {
    const tree: Record<string, unknown> = { hp: 10 };
    const errors: string[] = [];
    applyMvuPatch(tree, [{ op: 'replace', path: '/mp', value: 5 }], {
      onError: (m) => errors.push(m),
    });
    expect(tree.mp).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('数值字符串强转 number（旧值是 number）', () => {
    const tree: Record<string, unknown> = { hp: 10 };
    applyMvuPatch(tree, [{ op: 'replace', path: '/hp', value: '25' }]);
    expect(tree.hp).toBe(25);
  });

  it('旧值是 number 允许被 null 覆盖', () => {
    const tree: Record<string, unknown> = { hp: 10 };
    applyMvuPatch(tree, [{ op: 'replace', path: '/hp', value: null }]);
    expect(tree.hp).toBeNull();
  });

  it('VWD 元组只更新 [0] 保留描述', () => {
    const tree: Record<string, unknown> = { 力量: [50, '强壮的体魄'] };
    applyMvuPatch(tree, [{ op: 'replace', path: '/力量', value: 70 }]);
    expect(tree.力量).toEqual([70, '强壮的体魄']);
  });

  it('VWD 元组数值字符串强转', () => {
    const tree: Record<string, unknown> = { 力量: [50, '描述'] };
    applyMvuPatch(tree, [{ op: 'replace', path: '/力量', value: '80' }]);
    expect(tree.力量).toEqual([80, '描述']);
  });

  it('嵌套路径 replace', () => {
    const tree: Record<string, unknown> = { stats: { hp: 10 } };
    applyMvuPatch(tree, [{ op: 'replace', path: '/stats/hp', value: 30 }]);
    expect((tree.stats as Record<string, unknown>).hp).toBe(30);
  });

  it('path 为空 → Object.assign(tree, value)', () => {
    const tree: Record<string, unknown> = { a: 1 };
    applyMvuPatch(tree, [{ op: 'replace', path: '', value: { b: 2 } }]);
    expect(tree).toEqual({ a: 1, b: 2 });
  });
});

/* ============================== applyMvuPatch: delta ============================== */

describe('applyMvuPatch delta', () => {
  it('数值 +delta', () => {
    const tree: Record<string, unknown> = { 测试: 10 };
    applyMvuPatch(tree, [{ op: 'delta', path: '/测试', value: 10 }]);
    expect(tree.测试).toBe(20);
  });

  it('负 delta', () => {
    const tree: Record<string, unknown> = { hp: 10 };
    applyMvuPatch(tree, [{ op: 'delta', path: '/hp', value: -3 }]);
    expect(tree.hp).toBe(7);
  });

  it('不存在路径跳过（不当 0+delta）', () => {
    const tree: Record<string, unknown> = {};
    const errors: string[] = [];
    applyMvuPatch(tree, [{ op: 'delta', path: '/hp', value: 5 }], {
      onError: (m) => errors.push(m),
    });
    expect(tree.hp).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('非 number 旧值 → onError', () => {
    const tree: Record<string, unknown> = { name: 'foo' };
    const errors: string[] = [];
    applyMvuPatch(tree, [{ op: 'delta', path: '/name', value: 5 }], {
      onError: (m) => errors.push(m),
    });
    expect(tree.name).toBe('foo');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('VWD 元组 delta 更新 [0]', () => {
    const tree: Record<string, unknown> = { 理智: [60, '心智状态'] };
    applyMvuPatch(tree, [{ op: 'delta', path: '/理智', value: -10 }]);
    expect(tree.理智).toEqual([50, '心智状态']);
  });
});

/* ============================== applyMvuPatch: insert/add ============================== */

describe('applyMvuPatch insert', () => {
  it('对象新键', () => {
    const tree: Record<string, unknown> = { obj: {} };
    applyMvuPatch(tree, [{ op: 'insert', path: '/obj/key', value: 1 }]);
    expect((tree.obj as Record<string, unknown>).key).toBe(1);
  });

  it('add 等同 insert', () => {
    const tree: Record<string, unknown> = { obj: {} };
    applyMvuPatch(tree, [{ op: 'add', path: '/obj/key', value: 2 }]);
    expect((tree.obj as Record<string, unknown>).key).toBe(2);
  });

  it('数组 /- append', () => {
    const tree: Record<string, unknown> = { list: [1, 2] };
    applyMvuPatch(tree, [{ op: 'insert', path: '/list/-', value: 3 }]);
    expect(tree.list).toEqual([1, 2, 3]);
  });

  it('数组数字索引 splice', () => {
    const tree: Record<string, unknown> = { list: [1, 3] };
    applyMvuPatch(tree, [{ op: 'insert', path: '/list/1', value: 2 }]);
    expect(tree.list).toEqual([1, 2, 3]);
  });

  it('创建中间路径（末段非数字 → 对象）', () => {
    const tree: Record<string, unknown> = {};
    applyMvuPatch(tree, [{ op: 'insert', path: '/a/b/c', value: 5 }]);
    expect(tree).toEqual({ a: { b: { c: 5 } } });
  });

  it('创建中间路径（末段是 - → 数组）', () => {
    const tree: Record<string, unknown> = {};
    applyMvuPatch(tree, [{ op: 'insert', path: '/items/-', value: 'sword' }]);
    expect(tree).toEqual({ items: ['sword'] });
  });

  it('容器是标量 → onError', () => {
    const tree: Record<string, unknown> = { scalar: 5 };
    const errors: string[] = [];
    applyMvuPatch(tree, [{ op: 'insert', path: '/scalar/key', value: 1 }], {
      onError: (m) => errors.push(m),
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

/* ============================== applyMvuPatch: remove ============================== */

describe('applyMvuPatch remove', () => {
  it('删对象键', () => {
    const tree: Record<string, unknown> = { a: 1, b: 2 };
    applyMvuPatch(tree, [{ op: 'remove', path: '/a' }]);
    expect(tree).toEqual({ b: 2 });
  });

  it('删数组元素（splice）', () => {
    const tree: Record<string, unknown> = { list: [1, 2, 3] };
    applyMvuPatch(tree, [{ op: 'remove', path: '/list/1' }]);
    expect(tree.list).toEqual([1, 3]);
  });

  it('不存在跳过', () => {
    const tree: Record<string, unknown> = { a: 1 };
    const errors: string[] = [];
    applyMvuPatch(tree, [{ op: 'remove', path: '/nope' }], {
      onError: (m) => errors.push(m),
    });
    expect(tree).toEqual({ a: 1 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('删嵌套键', () => {
    const tree: Record<string, unknown> = { stats: { hp: 1, mp: 2 } };
    applyMvuPatch(tree, [{ op: 'remove', path: '/stats/hp' }]);
    expect(tree.stats).toEqual({ mp: 2 });
  });
});

/* ============================== applyMvuPatch: move ============================== */

describe('applyMvuPatch move', () => {
  it('from → to', () => {
    const tree: Record<string, unknown> = { a: 5, dest: {} };
    applyMvuPatch(tree, [{ op: 'move', from: '/a', to: '/dest/a' }]);
    expect(tree.a).toBeUndefined();
    expect((tree.dest as Record<string, unknown>).a).toBe(5);
  });

  it('from → path (path 别名)', () => {
    const tree: Record<string, unknown> = { a: 5, dest: {} };
    applyMvuPatch(tree, [{ op: 'move', from: '/a', path: '/dest/a' }]);
    expect(tree.a).toBeUndefined();
    expect((tree.dest as Record<string, unknown>).a).toBe(5);
  });

  it('from 不存在跳过', () => {
    const tree: Record<string, unknown> = { dest: {} };
    const errors: string[] = [];
    applyMvuPatch(tree, [{ op: 'move', from: '/missing', to: '/dest/x' }], {
      onError: (m) => errors.push(m),
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

/* ============================== applyMvuPatch: 校验 & 只读 ============================== */

describe('applyMvuPatch validation', () => {
  it('非对象 op 跳过 + onError', () => {
    const tree: Record<string, unknown> = { a: 1 };
    const errors: string[] = [];
    applyMvuPatch(tree, [null, 'str', 42], { onError: (m) => errors.push(m) });
    expect(tree).toEqual({ a: 1 });
    expect(errors.length).toBe(3);
  });

  it('缺 op 跳过', () => {
    const tree: Record<string, unknown> = { a: 1 };
    const errors: string[] = [];
    applyMvuPatch(tree, [{ path: '/a', value: 2 }], {
      onError: (m) => errors.push(m),
    });
    expect(tree.a).toBe(1);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('缺 path（非 move）跳过', () => {
    const tree: Record<string, unknown> = { a: 1 };
    const errors: string[] = [];
    applyMvuPatch(tree, [{ op: 'replace', value: 2 }], {
      onError: (m) => errors.push(m),
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('_ 开头路径只读跳过', () => {
    const tree: Record<string, unknown> = { _meta: 1 };
    const errors: string[] = [];
    applyMvuPatch(tree, [{ op: 'replace', path: '/_meta', value: 2 }], {
      onError: (m) => errors.push(m),
    });
    expect(tree._meta).toBe(1);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('$ 开头路径只读跳过', () => {
    const tree: Record<string, unknown> = { $x: 1 };
    const errors: string[] = [];
    applyMvuPatch(tree, [{ op: 'replace', path: '/$x', value: 2 }], {
      onError: (m) => errors.push(m),
    });
    expect(tree.$x).toBe(1);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('嵌套段 _ 开头只读跳过', () => {
    const tree: Record<string, unknown> = { a: { _hidden: 1 } };
    const errors: string[] = [];
    applyMvuPatch(tree, [{ op: 'replace', path: '/a/_hidden', value: 2 }], {
      onError: (m) => errors.push(m),
    });
    expect((tree.a as Record<string, unknown>)._hidden).toBe(1);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('容忍缺失首 / 的路径', () => {
    const tree: Record<string, unknown> = { hp: 10 };
    applyMvuPatch(tree, [{ op: 'replace', path: 'hp', value: 20 }]);
    expect(tree.hp).toBe(20);
  });
});

/* ============================== applyMvuPatch: redirect ============================== */

describe('applyMvuPatch redirect', () => {
  it('redirect 返回 true 时该 op 不改 tree', () => {
    const tree: Record<string, unknown> = { 调查员: { hp: 10 } };
    const seen: Array<[string, string, unknown]> = [];
    const redirect: ApplyOpts['redirect'] = (dotPath, op, value) => {
      seen.push([dotPath, op, value]);
      return dotPath.startsWith('调查员');
    };
    applyMvuPatch(
      tree,
      [{ op: 'replace', path: '/调查员/hp', value: 99 }],
      { redirect },
    );
    expect((tree.调查员 as Record<string, unknown>).hp).toBe(10);
    expect(seen).toEqual([['调查员.hp', 'replace', 99]]);
  });

  it('redirect 返回 false 时正常处理', () => {
    const tree: Record<string, unknown> = { hp: 10 };
    applyMvuPatch(tree, [{ op: 'replace', path: '/hp', value: 20 }], {
      redirect: () => false,
    });
    expect(tree.hp).toBe(20);
  });
  it('未传 onError 时默认 console.warn（不静默吞校验错）', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tree: Record<string, unknown> = { hp: 10 };
    applyMvuPatch(tree, [{ op: 'replace', path: '/missing', value: 1 }]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

/* ============================== 综合 ============================== */

describe('applyMvuPatch integration', () => {
  it('批量混合操作', () => {
    const tree: Record<string, unknown> = {
      hp: 10,
      理智: [60, '心智'],
      list: [1, 2],
      tmp: 'x',
    };
    const ops: MvuOp[] = [
      { op: 'replace', path: '/hp', value: 15 },
      { op: 'delta', path: '/理智', value: -5 },
      { op: 'insert', path: '/list/-', value: 3 },
      { op: 'remove', path: '/tmp' },
    ];
    applyMvuPatch(tree, ops);
    expect(tree).toEqual({
      hp: 15,
      理智: [55, '心智'],
      list: [1, 2, 3],
    });
  });
});

/* ============================== applyMvuPatchCollect + schema ============================== */

describe('applyMvuPatchCollect — 结构化失败收集', () => {
  it('成功的 op 不产生错误，畸形/未知 op 收进清单', () => {
    const tree: Record<string, unknown> = { hp: 10 };
    const errors = applyMvuPatchCollect(tree, [
      { op: 'replace', path: '/hp', value: 20 }, // ok
      { op: 'frobnicate', path: '/hp' },          // unknown op
      'not-an-object',                             // 畸形
      { op: 'replace' },                           // missing path
    ]);
    expect(tree.hp).toBe(20);
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.op)).toEqual(['frobnicate', '?', 'replace']);
    // 每条错误都带 reason
    for (const e of errors) expect(typeof e.reason).toBe('string');
  });

  it('path 不存在 / delta 非数值 → 结构化错误且 tree 不变', () => {
    const tree: Record<string, unknown> = { hp: 10 };
    const errors = applyMvuPatchCollect(tree, [
      { op: 'replace', path: '/nope', value: 1 },
      { op: 'delta', path: '/hp', value: 'abc' },
    ]);
    expect(tree).toEqual({ hp: 10 });
    expect(errors).toHaveLength(2);
    expect(errors[0].path).toBe('nope');
  });

  it('合法 insert 新建动态路径不报错（不误杀自由扩展树）', () => {
    const tree: Record<string, unknown> = {};
    const errors = applyMvuPatchCollect(tree, [
      { op: 'insert', path: '/剧情/暗线/邪教/线索', value: '血字' },
    ]);
    expect(errors).toHaveLength(0);
    expect(tree).toEqual({ 剧情: { 暗线: { 邪教: { 线索: '血字' } } } });
  });

  it('数字串 replace 不误报（与 coerceNumeric 一致）', () => {
    const tree: Record<string, unknown> = { hp: 10 };
    const errors = applyMvuPatchCollect(tree, [{ op: 'replace', path: '/hp', value: '42' }]);
    expect(errors).toHaveLength(0);
    expect(tree.hp).toBe(42);
  });
});

describe('schema 校验 — replace 越界拒绝 / delta 越界饱和 / 枚举拒绝', () => {
  const schema = {
    rules: {
      '世界.时间.小时': { kind: 'number' as const, min: 0, max: 23 },
      '世界.天气': { kind: 'enum' as const, values: ['晴', '阴', '雨'] },
      hp: { kind: 'number' as const, min: 0 },
    },
  };

  it('replace 越界被拒绝并记错误，tree 不变', () => {
    const tree: Record<string, unknown> = { 世界: { 时间: { 小时: 12 } } };
    const errors = applyMvuPatchCollect(
      tree,
      [{ op: 'replace', path: '/世界/时间/小时', value: 25 }],
      { schema },
    );
    expect((tree as any).世界.时间.小时).toBe(12);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('range');
  });

  it('delta 越界饱和到边界（HP -100 → 夹到 min 0，不再整条丢弃）', () => {
    const tree: Record<string, unknown> = { hp: 10 };
    const errors = applyMvuPatchCollect(tree, [{ op: 'delta', path: '/hp', value: -100 }], { schema });
    expect(tree.hp).toBe(0);
    expect(errors).toHaveLength(0);
  });

  it('delta 越界饱和到上界（有 max 时夹到 max）', () => {
    const tree: Record<string, unknown> = { 世界: { 时间: { 小时: 20 } } };
    const errors = applyMvuPatchCollect(tree, [{ op: 'delta', path: '/世界/时间/小时', value: 10 }], { schema });
    expect((tree as any).世界.时间.小时).toBe(23);
    expect(errors).toHaveLength(0);
  });

  it('枚举非法值被拒绝', () => {
    const tree: Record<string, unknown> = { 世界: { 天气: '晴' } };
    const errors = applyMvuPatchCollect(tree, [{ op: 'replace', path: '/世界/天气', value: '冰雹' }], { schema });
    expect((tree as any).世界.天气).toBe('晴');
    expect(errors[0].reason).toContain('enum');
  });

  it('合法值通过；未受控路径放行', () => {
    const tree: Record<string, unknown> = { 世界: { 时间: { 小时: 12 }, 天气: '晴' }, 自由字段: 1 };
    const errors = applyMvuPatchCollect(
      tree,
      [
        { op: 'replace', path: '/世界/时间/小时', value: 8 },
        { op: 'replace', path: '/世界/天气', value: '雨' },
        { op: 'replace', path: '/自由字段', value: 999 },
      ],
      { schema },
    );
    expect(errors).toHaveLength(0);
    expect(tree).toEqual({ 世界: { 时间: { 小时: 8 }, 天气: '雨' }, 自由字段: 999 });
  });
});
