import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FUSION_MENU } from './fusion-menu';

// 「接线」回归保护：菜单每个选项的 name 必须能匹配到 DS 或向斜阳预设里的真实条目名，
// 否则悬浮窗里点了没反应（exists=false 被隐藏或开关无效）。
describe('FUSION_MENU 接线与不变量', () => {
  const names = (f: string) =>
    new Set((JSON.parse(readFileSync(`public/presets/${f}`, 'utf-8')).prompts ?? []).map((p: { name: string }) => p.name));
  const ds = names('shuangren-ds.json');
  const xy = names('shuangren-v6.json');
  const opts = FUSION_MENU.flatMap((g) => g.subs).flatMap((s) => s.options);

  it('每个选项 name 都匹配到 DS 或向斜阳预设条目（已接线）', () => {
    const miss = opts.filter((o) => !ds.has(o.name) && !xy.has(o.name)).map((o) => o.name);
    expect(miss, `未接线选项: ${miss.join(', ')}`).toHaveLength(0);
  });

  it('每个选项都有 displayName（菜单显示名）', () => {
    const miss = opts.filter((o) => !o.displayName).map((o) => o.name);
    expect(miss, `缺 displayName: ${miss.join(', ')}`).toHaveLength(0);
  });

  it('唯一的 exclusive 组是特色文风滤镜库', () => {
    expect(FUSION_MENU.filter((g) => g.exclusive).map((g) => g.title)).toEqual(['特色文风滤镜库']);
  });

  it('默认洛夫克拉夫特文风条目在文风库内', () => {
    const styleNames = new Set(
      FUSION_MENU.find((g) => g.exclusive)!.subs.flatMap((s) => s.options).map((o) => o.name),
    );
    expect(styleNames.has('洛夫克拉夫特文风')).toBe(true);
  });
});
