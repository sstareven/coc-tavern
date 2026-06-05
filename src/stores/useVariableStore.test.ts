import { describe, it, expect, beforeEach } from 'vitest';
import { useVariableStore } from './useVariableStore';
import { useCharSheetStore, migrateSheet } from './useCharSheetStore';

beforeEach(() => {
  useVariableStore.getState().clearAll();
  useCharSheetStore.getState().setSheet(
    migrateSheet({
      skills: { 侦查: { base: 25, current: 50 } },
      secondary: {
        hp: { current: 10, max: 12 },
        san: { current: 60, max: 80 },
        mp: { current: 8, max: 8 },
        luck: 55,
        mov: 8,
        db: '0',
        build: 0,
      },
    } as never),
  );
});

describe('applyMvuOpsToTree — G2 closure: unknown 调查员.* paths', () => {
  it('未知 调查员.foobar.* 路径推入 patchReport.failed 而不是静默吞掉', () => {
    // 构造一段含 UpdateVariable+JSONPatch 标记的文本，让 processResponse 走 JSON Patch 路径
    const text = `narrative...
<UpdateVariable>
<JSONPatch>
[
  {"op": "replace", "path": "/调查员/foobar/something", "value": 42}
]
</JSONPatch>
</UpdateVariable>
`;
    const { patchReport } = useVariableStore.getState().processResponse(text);
    expect(patchReport.failed).toHaveLength(1);
    expect(patchReport.failed[0].path).toBe('调查员.foobar.something');
    expect(patchReport.failed[0].reason).toMatch(/unknown charsheet path/);
  });

  it('身份字段(known-optional)不报错——白名单容忍', () => {
    const text = `<UpdateVariable><JSONPatch>[{"op": "replace", "path": "/调查员/姓名", "value": "新名字"}]</JSONPatch></UpdateVariable>`;
    const { patchReport } = useVariableStore.getState().processResponse(text);
    expect(patchReport.failed).toHaveLength(0);
  });
});

describe('applyMvuOpsToTree — 回归保护：所有已认识路径仍干净消费', () => {
  it.each([
    ['调查员.生命值.当前', 'replace', 8],
    ['调查员.生命值.最大', 'replace', 12],
    ['调查员.理智值.当前', 'delta', -3],
    ['调查员.理智值.最大', 'replace', 80],
    ['调查员.魔法值.当前', 'replace', 5],
    ['调查员.魔法值.最大', 'replace', 8],
    ['调查员.幸运', 'replace', 70],
    ['调查员.姿态', 'replace', '蹲伏'],
    ['调查员.技能.侦查', 'delta', 5],
    ['调查员.技能.攀爬', 'replace', 40],
  ])('%s %s %s 不报错', (path, op, value) => {
    const jsonPath = '/' + (path as string).replace(/\./g, '/');
    const text = `<UpdateVariable><JSONPatch>[{"op": "${op}", "path": "${jsonPath}", "value": ${JSON.stringify(value)}}]</JSONPatch></UpdateVariable>`;
    const { patchReport } = useVariableStore.getState().processResponse(text);
    expect(patchReport.failed).toEqual([]);
  });

  it('状态条件数组 replace 不报错', () => {
    const text = `<UpdateVariable><JSONPatch>[{"op": "replace", "path": "/调查员/状态条件", "value": [{"name":"骨折","severity":"severe","description":"右臂"}]}]</JSONPatch></UpdateVariable>`;
    const { patchReport } = useVariableStore.getState().processResponse(text);
    expect(patchReport.failed).toEqual([]);
    expect(useCharSheetStore.getState().sheet.statusConditions[0].name).toBe('骨折');
  });

  it('调查员 根路径(没有点号子路径)被视作未知 — 防 全树替换 误用', () => {
    const text = `<UpdateVariable><JSONPatch>[{"op": "replace", "path": "/调查员", "value": {}}]</JSONPatch></UpdateVariable>`;
    const { patchReport } = useVariableStore.getState().processResponse(text);
    expect(patchReport.failed).toHaveLength(1);
    expect(patchReport.failed[0].path).toBe('调查员');
  });
});
