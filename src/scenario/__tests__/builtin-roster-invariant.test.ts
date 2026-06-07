// 内置剧本主角阵容硬约束 — 防 v1.13.0+ 关系系统出现「主角间敌对」漂移。
// 任何 protagonist 之间若被写出 enemy / rival 边，canJoinParty 会直接拒绝入队，
// 玩家选完角色组队就崩；此守护把约束钉在 CI 上而非运行时。
import { describe, it, expect } from 'vitest';
import { BUILTIN_SCENARIOS } from '../../data/builtin-scenarios';
import { hasHostileEdge } from '../relation-graph';

describe('builtin scenarios — protagonist roster invariant', () => {
  for (const scn of BUILTIN_SCENARIOS) {
    // __free 是兜底剧本，characters=[]，不参与守护
    if (scn.id === '__free') continue;

    describe(`${scn.id} (${scn.meta.name})`, () => {
      const protagonists = scn.characters.filter((c) => c.role === 'protagonist');
      const optionals = scn.characters.filter((c) => c.role === 'optional');

      it('至少 2 名 protagonist（让主角间关系图成立）', () => {
        expect(protagonists.length, `${scn.id} 主角数 ${protagonists.length}`).toBeGreaterThanOrEqual(2);
      });

      it('至少 1 名 optional（让玩家有越界可玩配角）', () => {
        expect(optionals.length, `${scn.id} 配角数 ${optionals.length}`).toBeGreaterThanOrEqual(1);
      });

      it('任意两 protagonist 之间不能有 enemy/rival 边', () => {
        for (let i = 0; i < protagonists.length; i++) {
          for (let j = i + 1; j < protagonists.length; j++) {
            const a = protagonists[i];
            const b = protagonists[j];
            const hostile = hasHostileEdge(scn, a.id, b.id);
            expect(hostile, `${scn.id}: protagonist ${a.id} ↔ ${b.id} 出现 enemy/rival 边（会让 canJoinParty 拒绝入队）`).toBe(false);
          }
        }
      });

      it('每对 protagonist 之间至少有一条白名单 relation（任一方向）', () => {
        // R1: canJoinParty 要求候选与队内任一成员有至少一条非敌对边
        // 用 hasHostileEdge 反推：每对主角之间必须有边但不能是敌对边
        const friendly = new Set(['family', 'lover', 'friend', 'colleague', 'mentor', 'acquaintance']);
        for (let i = 0; i < protagonists.length; i++) {
          for (let j = i + 1; j < protagonists.length; j++) {
            const a = protagonists[i];
            const b = protagonists[j];
            const aToB = a.relations?.some((r) => r.targetId === b.id && friendly.has(r.type)) ?? false;
            const bToA = b.relations?.some((r) => r.targetId === a.id && friendly.has(r.type)) ?? false;
            expect(aToB || bToA, `${scn.id}: protagonist ${a.id} 与 ${b.id} 之间缺少友好 relation 边（主角间必须能组队）`).toBe(true);
          }
        }
      });

      it('每个 optional 配角与至少一名 protagonist 有友好 relation', () => {
        const friendly = new Set(['family', 'lover', 'friend', 'colleague', 'mentor', 'acquaintance']);
        const protoIds = new Set(protagonists.map((p) => p.id));
        for (const opt of optionals) {
          const outgoing = opt.relations?.some((r) => protoIds.has(r.targetId) && friendly.has(r.type)) ?? false;
          const incoming = protagonists.some((p) =>
            p.relations?.some((r) => r.targetId === opt.id && friendly.has(r.type)) ?? false,
          );
          expect(outgoing || incoming, `${scn.id}: optional ${opt.id} 与任何 protagonist 都没有友好 relation 边（canJoinParty 会判 stranger）`).toBe(true);
        }
      });
    });
  }
});
