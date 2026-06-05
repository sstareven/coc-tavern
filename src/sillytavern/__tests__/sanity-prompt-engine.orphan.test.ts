import { describe, it, expect } from 'vitest';
import { patchOrphanSanityTags } from '../sanity-prompt-engine';
import type { SanityCheckPrompt } from '../../types';

function makePrompt(id: string): SanityCheckPrompt {
  return {
    id,
    trigger: 'test trigger',
    checkType: 'POW',
    difficulty: 'normal',
    sanLossSuccess: '0',
    sanLossFail: '1D3',
  };
}

describe('patchOrphanSanityTags', () => {
  it('叙事里已有 <san id="p1"/> → leftContent 不动，无孤儿', () => {
    const left = '触摸笔记的瞬间——<san id="p1"/>化石嗡鸣';
    const right = '余震尚未消退';
    const r = patchOrphanSanityTags(left, right, [makePrompt('p1')]);
    expect(r.leftContent).toBe(left);
    expect(r.rightContent).toBe(right);
    expect(r.orphanIds).toEqual([]);
  });

  it('叙事里无 <san id="p1"/> → 追加到 leftContent 末尾，标 orphan', () => {
    const left = '完全没有标签的叙事';
    const right = '右页也没有';
    const r = patchOrphanSanityTags(left, right, [makePrompt('p1')]);
    expect(r.leftContent).toBe('完全没有标签的叙事<san id="p1"/>');
    expect(r.rightContent).toBe(right);
    expect(r.orphanIds).toEqual(['p1']);
  });

  it('部分匹配——p1 有标签、p2 无 → 仅 p2 被补', () => {
    const left = '前段叙事<san id="p1"/>中段';
    const right = '右页';
    const r = patchOrphanSanityTags(left, right, [makePrompt('p1'), makePrompt('p2')]);
    expect(r.leftContent).toBe('前段叙事<san id="p1"/>中段<san id="p2"/>');
    expect(r.orphanIds).toEqual(['p2']);
  });

  it('标签在 rightContent 也算找到 → 不补', () => {
    const left = '左页没有';
    const right = '余震<san id="p1"/>之后';
    const r = patchOrphanSanityTags(left, right, [makePrompt('p1')]);
    expect(r.leftContent).toBe(left);
    expect(r.rightContent).toBe(right);
    expect(r.orphanIds).toEqual([]);
  });

  it('多个孤儿 → 多个标签连续追加，按 prompts 顺序', () => {
    const left = '叙事';
    const right = '右';
    const r = patchOrphanSanityTags(left, right, [
      makePrompt('p1'),
      makePrompt('p2'),
      makePrompt('p3'),
    ]);
    expect(r.leftContent).toBe('叙事<san id="p1"/><san id="p2"/><san id="p3"/>');
    expect(r.orphanIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('空 prompts → 全无操作', () => {
    const left = '不动';
    const right = '不动';
    const r = patchOrphanSanityTags(left, right, []);
    expect(r.leftContent).toBe(left);
    expect(r.rightContent).toBe(right);
    expect(r.orphanIds).toEqual([]);
  });

  it('单引号写法的 <san id=\'p1\'/> 也算找到', () => {
    const left = "前段<san id='p1'/>后段";
    const right = '';
    const r = patchOrphanSanityTags(left, right, [makePrompt('p1')]);
    expect(r.orphanIds).toEqual([]);
  });

  it('id 含正则元字符（理论畸形） → 严格按字面匹配不应误判', () => {
    // id 通常是 p1/p2，但若模型给了 "a.b" 这种 → 不能让 . 匹配任意字符
    const left = '叙事<san id="axb"/>';
    const right = '';
    const r = patchOrphanSanityTags(left, right, [makePrompt('a.b')]);
    // 'axb' 不应该被当成匹配 'a.b' → 视为孤儿，追加
    expect(r.orphanIds).toEqual(['a.b']);
    expect(r.leftContent).toContain('<san id="a.b"/>');
  });
});
