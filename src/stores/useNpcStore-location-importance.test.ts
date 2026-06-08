import { describe, it, expect, beforeEach } from 'vitest';
import { useNpcStore } from './useNpcStore';

function reset() { useNpcStore.getState().clearAll(); }

describe('NPC importance/locationName 扩展字段', () => {
  beforeEach(reset);

  it('新建 NPC 默认 importance="重要" 与 locationName=""', () => {
    useNpcStore.getState().applyUpdates([{ name: '陌生人', identity: '路过的医生' }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.importance).toBe('重要');
    expect(p.locationName).toBe('');
  });

  it('新建 NPC: u.importance 与 u.locationName 直传', () => {
    useNpcStore.getState().applyUpdates([{
      name: '艾莉丝', identity: '女酒保', importance: '核心', locationName: '海豚酒馆',
    }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.importance).toBe('核心');
    expect(p.locationName).toBe('海豚酒馆');
  });

  it('importance normalize: "主要/关键"→核心, "次要/常驻/支线"→重要, "群众/过客/普通"→路人', () => {
    useNpcStore.getState().applyUpdates([
      { name: 'A', importance: '主要' as never },
      { name: 'B', importance: '关键' as never },
      { name: 'C', importance: '次要' as never },
      { name: 'D', importance: '常驻' as never },
      { name: 'E', importance: '支线' as never },
      { name: 'F', importance: '群众' as never },
      { name: 'G', importance: '过客' as never },
      { name: 'H', importance: '普通' as never },
    ]);
    const ps = Object.values(useNpcStore.getState().profiles);
    const byName = (n: string) => ps.find((p) => p.name === n)!;
    expect(byName('A').importance).toBe('核心');
    expect(byName('B').importance).toBe('核心');
    expect(byName('C').importance).toBe('重要');
    expect(byName('D').importance).toBe('重要');
    expect(byName('E').importance).toBe('重要');
    expect(byName('F').importance).toBe('路人');
    expect(byName('G').importance).toBe('路人');
    expect(byName('H').importance).toBe('路人');
  });

  it('importance 钳制: 未知值保留原值不静默回退', () => {
    useNpcStore.getState().applyUpdates([{ name: '甲', importance: '核心' }]);
    const before = Object.values(useNpcStore.getState().profiles)[0];
    expect(before.importance).toBe('核心');
    // 后续 npcUpdate 传入非标准词不应破坏已有 importance
    useNpcStore.getState().applyUpdates([{ name: '甲', importance: 'random' as never }]);
    const after = Object.values(useNpcStore.getState().profiles)[0];
    expect(after.importance).toBe('核心'); // 保留
  });

  it('locationName 通过 SET_FIELDS 被 applyUpdates 后续更新', () => {
    useNpcStore.getState().applyUpdates([{ name: '甲', identity: 'X', locationName: '酒馆' }]);
    let p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.locationName).toBe('酒馆');
    useNpcStore.getState().applyUpdates([{ name: '甲', locationName: '码头' }]);
    p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.locationName).toBe('码头');
  });

  it('buildContextInjection 分层: 重要 NPC 含完整字段;路人 仅简略身份+位置', () => {
    useNpcStore.getState().applyUpdates([
      {
        name: '核心 NPC', identity: '幕后黑手', personality: '冷酷',
        innerThoughts: '掌控全局', memorySummary: '与调查员对峙过两次',
        isPresent: false, importance: '核心', locationName: '废弃教堂',
      },
      {
        name: '路人 NPC', identity: '酒馆老板',
        isPresent: true, importance: '路人', locationName: '海豚酒馆',
      },
    ]);
    const ctx = useNpcStore.getState().buildContextInjection('海豚酒馆');
    // 重要桶: 完整字段
    expect(ctx).toContain('[重要NPC');
    expect(ctx).toContain('核心 NPC');
    expect(ctx).toContain('冷酷'); // personality
    expect(ctx).toContain('掌控全局'); // innerThoughts
    expect(ctx).toContain('与调查员对峙过两次'); // memorySummary
    expect(ctx).toContain('所在地点:废弃教堂'); // location 标注
    // 路人桶: 简略,且与当前地点关联
    expect(ctx).toContain('过路 NPC');
    expect(ctx).toContain('海豚酒馆');
    expect(ctx).toContain('路人 NPC');
  });

  it('buildContextInjection: 路人 NPC 在其它地点时不出现', () => {
    useNpcStore.getState().applyUpdates([
      { name: '此地路人', isPresent: true, importance: '路人', locationName: '酒馆' },
      { name: '他处路人', isPresent: true, importance: '路人', locationName: '码头' },
    ]);
    const ctx = useNpcStore.getState().buildContextInjection('酒馆');
    expect(ctx).toContain('此地路人');
    expect(ctx).not.toContain('他处路人');
  });

  it('buildContextInjection: 路人 NPC locationName 缺失(老数据) 仍兼容显示', () => {
    useNpcStore.getState().applyUpdates([
      { name: '老路人', isPresent: true, importance: '路人' }, // locationName 空
    ]);
    const ctx = useNpcStore.getState().buildContextInjection('酒馆');
    expect(ctx).toContain('老路人'); // 兼容空 locationName
  });

  it('renameLocation: 把所有匹配 from 的 NPC 改挂到 to', () => {
    useNpcStore.getState().applyUpdates([
      { name: 'A', locationName: '旧名' },
      { name: 'B', locationName: '旧名' },
      { name: 'C', locationName: '其它' },
    ]);
    useNpcStore.getState().renameLocation('旧名', '新名');
    const ps = Object.values(useNpcStore.getState().profiles);
    expect(ps.find((p) => p.name === 'A')?.locationName).toBe('新名');
    expect(ps.find((p) => p.name === 'B')?.locationName).toBe('新名');
    expect(ps.find((p) => p.name === 'C')?.locationName).toBe('其它'); // 不动
  });

  it('renameLocation: from/to 空或相等不改', () => {
    useNpcStore.getState().applyUpdates([{ name: 'A', locationName: '酒馆' }]);
    const before = useNpcStore.getState().profiles;
    useNpcStore.getState().renameLocation('', '新名');
    useNpcStore.getState().renameLocation('酒馆', '');
    useNpcStore.getState().renameLocation('酒馆', '酒馆');
    expect(useNpcStore.getState().profiles).toEqual(before);
  });

  it('全是路人但当前地点没人时,返回空串(分层注入彻底跳过)', () => {
    useNpcStore.getState().applyUpdates([
      { name: '此地路人', isPresent: true, importance: '路人', locationName: '酒馆' },
    ]);
    const ctx = useNpcStore.getState().buildContextInjection('码头');
    expect(ctx).toBe('');
  });
});
