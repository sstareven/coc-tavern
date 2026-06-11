import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  shouldDetectChase,
  buildChaseFromLlmResponse,
  detectAndBuildChase,
} from '../chase-detector';
import { defaultSheet } from '../../stores/useCharSheetStore';
import { _resetRpm } from '../rpm-limiter';

function mockChat(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }], usage: {} }) };
}
beforeEach(() => _resetRpm());
afterEach(() => vi.unstubAllGlobals());

// ── shouldDetectChase (keyword heuristic) ──

describe('shouldDetectChase', () => {
  it('含追逐线索→true', () => {
    expect(shouldDetectChase('他拔腿就跑，逃离了现场')).toBe(true);
    expect(shouldDetectChase('怪物追赶着你穿过走廊')).toBe(true);
    expect(shouldDetectChase('你拼命跑向出口')).toBe(true);
    expect(shouldDetectChase('他撒腿就跑')).toBe(true);
    expect(shouldDetectChase('你落荒而逃')).toBe(true);
  });
  it('平静叙事→false', () => {
    expect(shouldDetectChase('你仔细检查了房间')).toBe(false);
    expect(shouldDetectChase('你在图书馆安静地翻阅古籍')).toBe(false);
  });
  it('空字符串→false', () => {
    expect(shouldDetectChase('')).toBe(false);
  });
});

// ── buildChaseFromLlmResponse (parser) ──

describe('buildChaseFromLlmResponse', () => {
  const fiveLocs = [
    { name: '街道', description: '繁忙的街道' },
    { name: '小巷', hazard: { skill: '闪避', difficulty: 'normal', failConsequence: 'fall' } },
    { name: '市场', description: '拥挤的市场' },
    { name: '屋顶', barrier: { skill: '攀爬', difficulty: 'hard', breakThrough: true } },
    { name: '码头', description: '空旷的码头' },
  ];

  it('合法 LLM 响应 → 建 Chase（含玩家+NPC+位置+turnOrder）', () => {
    const data = {
      inChase: true,
      locations: fiveLocs,
      participants: [
        { name: '邪教徒', role: 'pursuer', mov: 9, con: 60, dex: 65, skills: { '攀爬': 50 } },
      ],
      initialGap: 3,
      opener: '邪教徒发现了你！',
    };
    const chase = buildChaseFromLlmResponse(data as Record<string, unknown>, defaultSheet);
    expect(chase).not.toBeNull();
    expect(chase!.locations).toHaveLength(5);
    expect(chase!.participants).toHaveLength(2); // player + 1 NPC
    expect(chase!.participants[0].id).toBe('player');
    expect(chase!.participants[0].role).toBe('quarry');
    expect(chase!.participants[0].position).toBe(3); // quarry starts ahead
    expect(chase!.participants[1].role).toBe('pursuer');
    expect(chase!.participants[1].position).toBe(0); // pursuer starts at 0
    expect(chase!.turnOrder).toHaveLength(2);
    expect(chase!.initialGap).toBe(3);
    expect(chase!.opener).toBe('邪教徒发现了你！');
    expect(chase!.status).toBe('active');
    expect(chase!.round).toBe(1);
  });

  it('locations < 3 → null（数据不足）', () => {
    const data = {
      inChase: true,
      locations: [{ name: 'A' }, { name: 'B' }],
      participants: [{ name: 'X', role: 'pursuer' }],
      initialGap: 1,
    };
    expect(buildChaseFromLlmResponse(data as Record<string, unknown>, defaultSheet)).toBeNull();
  });

  it('hazard / barrier 正确解析', () => {
    const data = {
      inChase: true,
      locations: fiveLocs,
      participants: [{ name: 'X', role: 'pursuer' }],
      initialGap: 2,
    };
    const chase = buildChaseFromLlmResponse(data as Record<string, unknown>, defaultSheet);
    expect(chase).not.toBeNull();
    const hazardLoc = chase!.locations.find((l) => l.hazard);
    expect(hazardLoc).toBeDefined();
    expect(hazardLoc!.hazard!.skill).toBe('闪避');
    expect(hazardLoc!.hazard!.difficulty).toBe('normal');
    expect(hazardLoc!.hazard!.failConsequence).toBe('fall');
    const barrierLoc = chase!.locations.find((l) => l.barrier);
    expect(barrierLoc).toBeDefined();
    expect(barrierLoc!.barrier!.skill).toBe('攀爬');
    expect(barrierLoc!.barrier!.difficulty).toBe('hard');
    expect(barrierLoc!.barrier!.breakThrough).toBe(true);
  });

  it('NPC 全是 quarry → 玩家自动成 pursuer', () => {
    const data = {
      inChase: true,
      locations: fiveLocs,
      participants: [{ name: '嫌疑人', role: 'quarry', mov: 8, con: 50, dex: 50 }],
      initialGap: 2,
    };
    const chase = buildChaseFromLlmResponse(data as Record<string, unknown>, defaultSheet);
    expect(chase).not.toBeNull();
    expect(chase!.participants[0].role).toBe('pursuer');
    expect(chase!.participants[0].position).toBe(0); // pursuer at 0
    expect(chase!.participants[1].role).toBe('quarry');
    expect(chase!.participants[1].position).toBe(2); // quarry ahead
  });

  it('turnOrder 按 DEX 降序', () => {
    const data = {
      inChase: true,
      locations: fiveLocs,
      participants: [
        { name: 'A', role: 'pursuer', dex: 80 },
        { name: 'B', role: 'pursuer', dex: 30 },
      ],
      initialGap: 2,
    };
    const chase = buildChaseFromLlmResponse(data as Record<string, unknown>, defaultSheet);
    expect(chase).not.toBeNull();
    // DEX order: A(80) > player(defaultSheet.DEX) or B(30) — A should be first
    expect(chase!.turnOrder[0]).toBe('chase-npc-0'); // A has dex 80
  });

  it('缺省值安全兜底', () => {
    const data = {
      inChase: true,
      locations: [
        { name: 'A' }, { name: 'B' }, { name: 'C' },
      ],
      participants: [{ role: 'pursuer' }], // no name, no stats
    };
    const chase = buildChaseFromLlmResponse(data as Record<string, unknown>, defaultSheet);
    expect(chase).not.toBeNull();
    const npc = chase!.participants.find((p) => p.id.startsWith('chase-npc'));
    expect(npc).toBeDefined();
    expect(npc!.name).toBe('追赶者1');
    expect(npc!.mov).toBe(8);
    expect(npc!.con).toBe(50);
    expect(npc!.dex).toBe(50);
    expect(npc!.skills).toEqual({});
  });
});

// ── detectAndBuildChase (LLM integration) ──

describe('detectAndBuildChase', () => {
  it('inChase:true + 合法数据 → 建 Chase', async () => {
    const payload = JSON.stringify({
      inChase: true,
      locations: [
        { name: '街道', description: '繁忙街道' },
        { name: '小巷', hazard: { skill: '闪避', difficulty: 'normal', failConsequence: 'fall' } },
        { name: '市场', description: '拥挤市场' },
        { name: '屋顶', description: '高处' },
        { name: '码头', description: '终点' },
      ],
      participants: [
        { name: '邪教徒', role: 'pursuer', mov: 9, con: 60, dex: 65, skills: { '攀爬': 50 } },
      ],
      initialGap: 2,
      opener: '追逐开始',
    });
    vi.stubGlobal('fetch', vi.fn(async () => mockChat(payload)));
    const chase = await detectAndBuildChase('邪教徒追赶着你穿过走廊', defaultSheet, 'http://x', 'k', 'm');
    expect(chase).not.toBeNull();
    expect(chase!.participants.some((p) => p.controlledBy === 'player')).toBe(true);
    expect(chase!.participants.some((p) => p.role === 'pursuer' && p.name === '邪教徒')).toBe(true);
    expect(chase!.locations).toHaveLength(5);
    expect(chase!.turnOrder.length).toBe(2);
  });

  it('inChase:false → null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockChat('{"inChase": false}')));
    expect(await detectAndBuildChase('平静的午后', defaultSheet, 'http://x', 'k', 'm')).toBeNull();
  });

  it('inChase:true 但位置不足 → null（重试耗尽）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockChat('{"inChase": true, "locations": [{"name":"A"}], "participants": []}')));
    expect(await detectAndBuildChase('逃跑', defaultSheet, 'http://x', 'k', 'm', undefined, 0.3, 20000, 1)).toBeNull();
  });

  it('fetch 异常 → null（fail-open）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    const abortCtrl = new AbortController();
    // retries=1, abort after short delay to prevent RPM-limiter waits on retry
    expect(await detectAndBuildChase('逃跑', defaultSheet, 'http://x', 'k', 'm', abortCtrl.signal, 0.3, 20000, 1)).toBeNull();
  }, 10000);
});
