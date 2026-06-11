import { callDsSubagent } from './subagent-call';
import type { TokenUsage } from './stream-parser';
import type {
  CharacterSheet, Chase, ChaseParticipant, ChaseLocation,
} from '../types';

// ── Keyword heuristic (cheap pre-filter) ──

const CHASE_CUES = [
  '追赶', '追逐', '追了上', '追过来', '追过去',
  '逃跑', '逃离', '逃走', '逃命', '拼命跑', '狂奔', '飞奔', '夺路',
  '拔腿就跑', '撒腿', '落荒而逃', '仓皇逃',
  '撤退', '快跑', '赶紧跑',
];

/** 触发追逐检测的廉价启发式：叙事含追逐/逃跑线索才值得调 LLM（省 token，宁漏检不误检）。 */
export function shouldDetectChase(narrative: string): boolean {
  if (!narrative) return false;
  return CHASE_CUES.some((c) => narrative.includes(c));
}

// ── Helpers ──

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' && v.trim() ? v.trim() : d);

// ── LLM detection prompt ──

const DETECT_PROMPT = `你是 COC7e 跑团守秘人的追逐裁判。下面给出本回合叙事与调查员信息。判断本回合是否【进入了需要逐回合结算的追逐场景】（有人追赶调查员 / 调查员追赶目标 / 多方追逐等）。

若进入追逐，返回严格 JSON：
{
  "inChase": true,
  "locations": [
    {"name": "地点名", "description": "简短描述", "hazard"?: {"skill": "技能名", "difficulty": "normal"|"hard"|"extreme", "failConsequence": "fall"|"trapped"|"damage", "damage"?: "1D6"}},
    {"name": "地点名", "description": "简短描述", "barrier"?: {"skill": "技能名", "difficulty": "normal"|"hard"|"extreme", "breakThrough": true}}
  ],
  "participants": [
    {"name": "名字", "role": "pursuer"|"quarry", "mov": 8, "con": 50, "dex": 50, "skills": {"攀爬": 40, "跳跃": 30}}
  ],
  "initialGap": 2,
  "opener": "追逐起因的简短描述"
}

规则：
- locations 生成 5-8 个，形成穿越叙事场景的线性路径
- 约 1/3 的 location 应含 hazard（危险物）或 barrier（障碍物），不要同时有两者
- hazard.failConsequence: "fall"=跌倒(失去动作点), "trapped"=被困(需下回合脱困), "damage"=受伤(掷伤害骰)
- barrier: breakThrough=true 表示可强行突破
- 调查员默认是被追者(quarry)，除非叙事明确是调查员在追人
- participants 仅列 NPC（调查员由系统单独构建）
- NPC 的 MOV/CON/DEX 据生物/人类类型设：普通人 MOV 8/CON 50/DEX 50，快速生物更高
- initialGap 通常 1-3 个位置

若【未进入追逐】，只输出：{"inChase": false}`;

// ── Build Chase from LLM response ──

/** 从 LLM JSON 响应构建 Chase 对象。导出供测试。 */
export function buildChaseFromLlmResponse(
  data: Record<string, unknown>,
  sheet: CharacterSheet,
): Chase | null {
  // Parse locations
  const rawLocs = Array.isArray(data.locations) ? (data.locations as Record<string, unknown>[]) : [];
  const locations: ChaseLocation[] = rawLocs.map((loc) => {
    const hazardRaw = loc.hazard as Record<string, unknown> | undefined;
    const barrierRaw = loc.barrier as Record<string, unknown> | undefined;
    return {
      name: str(loc.name, '未知地点'),
      description: typeof loc.description === 'string' ? loc.description : undefined,
      hazard: hazardRaw ? {
        skill: str(hazardRaw.skill, '运动'),
        difficulty: (['normal', 'hard', 'extreme'] as const).includes(hazardRaw.difficulty as 'normal' | 'hard' | 'extreme')
          ? (hazardRaw.difficulty as 'normal' | 'hard' | 'extreme') : 'normal',
        failConsequence: (['fall', 'trapped', 'damage'] as const).includes(hazardRaw.failConsequence as 'fall' | 'trapped' | 'damage')
          ? (hazardRaw.failConsequence as 'fall' | 'trapped' | 'damage') : 'fall',
        damage: typeof hazardRaw.damage === 'string' ? hazardRaw.damage : undefined,
      } : undefined,
      barrier: barrierRaw ? {
        skill: str(barrierRaw.skill, '力量'),
        difficulty: (['normal', 'hard', 'extreme'] as const).includes(barrierRaw.difficulty as 'normal' | 'hard' | 'extreme')
          ? (barrierRaw.difficulty as 'normal' | 'hard' | 'extreme') : 'normal',
        breakThrough: barrierRaw.breakThrough !== false,
      } : undefined,
    };
  });

  if (locations.length < 3) return null;

  // Build player participant from character sheet
  const playerMov = sheet.secondary.mov ?? 8;
  const playerCon = sheet.characteristics.CON ?? 50;
  const playerDex = sheet.characteristics.DEX ?? 50;
  const playerSkills: Record<string, number> = {};
  for (const [name, sk] of Object.entries(sheet.skills)) {
    if (sk && typeof sk.current === 'number') playerSkills[name] = sk.current;
  }

  // Determine player role: default quarry, unless LLM says all NPC participants are quarry
  const rawParticipants = Array.isArray(data.participants) ? (data.participants as Record<string, unknown>[]) : [];
  const allNpcsAreQuarry = rawParticipants.length > 0 && rawParticipants.every((p) => p.role === 'quarry');
  const playerRole: 'pursuer' | 'quarry' = allNpcsAreQuarry ? 'pursuer' : 'quarry';

  const initialGap = num(data.initialGap, 2);

  const playerParticipant: ChaseParticipant = {
    id: 'player',
    name: sheet.identity?.name || '调查员',
    role: playerRole,
    controlledBy: 'player',
    mov: playerMov,
    con: playerCon,
    dex: playerDex,
    // Quarry starts ahead; pursuer starts at 0
    position: playerRole === 'quarry' ? initialGap : 0,
    sprintCount: 0,
    conChecksUsed: 0,
    flags: { fallen: false, trapped: false, exhausted: false, escaped: false, caught: false },
    skills: playerSkills,
  };

  // Build NPC participants from LLM data
  const npcParticipants: ChaseParticipant[] = rawParticipants.map((p, i) => {
    const role: 'pursuer' | 'quarry' = p.role === 'quarry' ? 'quarry' : 'pursuer';
    return {
      id: `chase-npc-${i}`,
      name: str(p.name, `追赶者${i + 1}`),
      role,
      controlledBy: 'ai' as const,
      mov: num(p.mov, 8),
      con: num(p.con, 50),
      dex: num(p.dex, 50),
      position: role === 'quarry' ? initialGap : 0,
      sprintCount: 0,
      conChecksUsed: 0,
      flags: { fallen: false, trapped: false, exhausted: false, escaped: false, caught: false },
      skills: (p.skills && typeof p.skills === 'object' && !Array.isArray(p.skills))
        ? (p.skills as Record<string, number>) : {},
    };
  });

  const participants = [playerParticipant, ...npcParticipants];
  // Turn order: sorted by DEX descending — map to IDs (sort a copy to avoid mutating participants)
  const turnOrder = [...participants].sort((a, b) => b.dex - a.dex).map((p) => p.id);

  return {
    active: true,
    round: 1,
    locations,
    participants,
    turnOrder,
    currentIdx: 0,
    log: [{ kind: 'narrative', text: str(data.opener, '追逐开始！') }],
    diceRecords: [],
    status: 'active',
    initialGap,
    opener: typeof data.opener === 'string' ? data.opener : undefined,
  };
}

// ── Main LLM-powered detection ──

export interface ChaseDetectResult { chase: Chase | null; raw?: unknown; }

/** 独立 LLM 调用：检测是否进追逐并建场（追赶者/被追者/位置链）。rewrite lane 不与主 API 争 RPM。 */
export async function detectAndBuildChase(
  narrative: string,
  sheet: CharacterSheet,
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
  temperature = 0.3,
  maxTokens = 20000,
  retries = 2,
): Promise<(Chase & { usage?: TokenUsage }) | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (signal?.aborted) return null;
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    if (signal?.aborted) return null;
    try {
      const { parsed, usage } = await callDsSubagent({
        apiBaseUrl, apiKey, model, signal, temperature, maxTokens,
        rpmLane: 'rewrite',
        label: '追逐检测',
        messages: [
          { role: 'system', content: DETECT_PROMPT },
          { role: 'user', content: `调查员：${sheet.identity?.name || '无名'}（${sheet.identity?.occupation || '职业不详'}）\n本回合叙事：\n${narrative.slice(0, 1000)}` },
        ],
      });
      const p = parsed;
      if (!p) continue; // parse failed -> retry
      if (p.inChase !== true) return null; // explicitly not a chase
      const chase = buildChaseFromLlmResponse(p, sheet);
      if (!chase) continue; // builder failed (e.g. too few locations) -> retry
      return { ...chase, usage };
    } catch {
      // fail-open: swallow errors and retry or return null
      continue;
    }
  }
  return null;
}
