import { describe, it, expect } from 'vitest';
import { CURRENT_VERSION, RELEASES } from '../ChangelogModal';

describe('ChangelogModal version invariant', () => {
  it('CURRENT_VERSION 必须等于 RELEASES[0].version（否则升级用户不会弹窗）', () => {
    expect(RELEASES[0].version).toBe(CURRENT_VERSION);
  });

  it('CURRENT_VERSION 必须是 vX.Y.Z 形式', () => {
    expect(CURRENT_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('RELEASES 版本号倒序（新版本在前）', () => {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < RELEASES.length - 1; i++) {
      const cur = parse(RELEASES[i].version);
      const next = parse(RELEASES[i + 1].version);
      // 任一位严格大即可（不强制单调递减某一位）
      let cmp = 0;
      for (let j = 0; j < Math.max(cur.length, next.length); j++) {
        const a = cur[j] ?? 0;
        const b = next[j] ?? 0;
        if (a > b) { cmp = 1; break; }
        if (a < b) { cmp = -1; break; }
      }
      expect(cmp, `RELEASES[${i}]=${RELEASES[i].version} 应该 > RELEASES[${i + 1}]=${RELEASES[i + 1].version}`).toBe(1);
    }
  });
});
