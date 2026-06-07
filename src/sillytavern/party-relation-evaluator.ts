/**
 * party-relation-evaluator — Post-Settle 关系演化评估器 (spec §8 / §4.2 R4)。
 *
 * 流程:
 *   1. 取当前 scenarioDoc + 关系图渲染当前关系一览
 *   2. 调 callDsSubagent (rpmLane='main', maxTokens=20000) 让 LLM 输出 relationDelta[]
 *   3. 失败/超时 → console.warn 跳过, 不阻塞主流程 (永不 throw)
 *   4. applyRelationDelta 到 useScenarioStore (M3 lorebook 副作用会自动重生成 entries)
 *   5. detectPartyConflicts 扫小队当下敌对边
 *   6. 冲突 → useNpcStore.leaveParty(脱队者) + useNarrationStore.append(旁白)
 *   7. 统计追加进 page.genStats.subCalls (label='关系评估')
 *
 * 永不 throw —— 调用方 useChatPipeline 走 fire-and-forget, 异常只 console.warn。
 */

import { callDsSubagent } from './subagent-call';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useNpcStore } from '../stores/useNpcStore';
import { useNarrationStore } from '../stores/useNarrationStore';
import { useBookStore } from '../stores/useBookStore';
import { detectPartyConflicts } from '../scenario/relation-graph';
import type { ScenarioCharacter, RelationType } from '../types/scenario';

export interface EvaluatePartyRelationsCtx {
  scenarioId: string;
  narrative: string;
  sessionId: string;
  playerId: string;
}

interface RelationDelta {
  sourceId: string;
  targetId: string;
  newType: RelationType | 'stranger';
  reason?: string;
}

const STATIC_PREFIX =
  '你是关系演化评估器。读本回合叙事, 判断角色之间的关系是否发生变化。\n' +
  '严格返回 JSON: {"deltas":[{"sourceId":string,"targetId":string,"newType":"family|lover|friend|colleague|mentor|rival|enemy|acquaintance|stranger","reason"?:string}]}\n' +
  '规则:\n' +
  '- 仅返回真实发生变化的边; 无变化返回 {"deltas":[]}\n' +
  '- 不允许凭空新增"陌生→友好"等关系, 除非叙事中明确互动改变了他们\n' +
  '- "newType":"stranger" 表示删除该边(变回陌生)\n' +
  '- 不要修改本回合未参与叙事的角色\n' +
  '- 不得输出 JSON 以外的任何文本';

function renderCurrentRelations(chars: ScenarioCharacter[], playerId: string): string {
  const nameById = new Map(chars.map((c) => [c.id, c.sheet?.identity?.name || c.id]));
  const lines: string[] = [];
  for (const c of chars) {
    if (!c.relations?.length) continue;
    const src = nameById.get(c.id) ?? c.id;
    for (const r of c.relations) {
      const tgt = nameById.get(r.targetId) ?? r.targetId;
      const tag = c.id === playerId ? '玩家' : '';
      lines.push(`- ${tag}${src}(${c.id}) → ${tgt}(${r.targetId}): ${r.type}${r.note ? `(${r.note})` : ''}`);
    }
  }
  if (lines.length === 0) return '(当前关系图为空)';
  return lines.join('\n');
}

function isValidDelta(d: unknown): d is RelationDelta {
  if (!d || typeof d !== 'object') return false;
  const x = d as Record<string, unknown>;
  return typeof x.sourceId === 'string' && typeof x.targetId === 'string' && typeof x.newType === 'string';
}

export async function evaluatePartyRelations(ctx: EvaluatePartyRelationsCtx): Promise<void> {
  const { scenarioId, narrative, playerId } = ctx;
  const doc = useScenarioStore.getState().getById(scenarioId);
  if (!doc) {
    console.warn('[party-relation-evaluator] scenarioDoc 不存在, 跳过', { scenarioId });
    return;
  }

  const s = useSettingsStore.getState().getEffectiveMainApi();

  const dynamic = [
    '【当前关系图】',
    renderCurrentRelations(doc.characters, playerId),
    '',
    '【本回合叙事】',
    narrative.trim() || '(无)',
  ].join('\n');

  let parsed: { deltas?: unknown } | null = null;
  let usage: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number } | undefined;
  try {
    const resp = await callDsSubagent({
      apiBaseUrl: s.baseUrl,
      apiKey: s.apiKey,
      model: s.model,
      label: 'party-relation-eval',
      maxTokens: 20000,
      temperature: 0.4,
      rpmLane: 'main',
      messages: [
        { role: 'system', content: STATIC_PREFIX },
        { role: 'user', content: dynamic },
      ],
    });
    parsed = resp.parsed as { deltas?: unknown } | null;
    usage = resp.usage as typeof usage;
  } catch (err) {
    console.warn('[party-relation-evaluator] LLM 子调用失败, 跳过本回合:', err);
    return;
  }

  // 统计: 即便后续步骤跳过也要追加一次子调用记录
  try {
    const pageIdx = useBookStore.getState().pages.length - 1;
    if (pageIdx >= 0 && usage) {
      useBookStore.getState().addPageSubCallStat(pageIdx, {
        label: '关系评估',
        model: s.model,
        hit: usage.prompt_cache_hit_tokens,
        miss: usage.prompt_cache_miss_tokens,
        promptTokens: usage.prompt_tokens,
        output: usage.completion_tokens,
        at: Date.now(),
      });
    }
  } catch {
    // 老存档/test 环境 book store 形状差异容错
  }

  if (!parsed || !Array.isArray(parsed.deltas)) {
    console.warn('[party-relation-evaluator] 解析失败或缺 deltas 字段, 跳过应用');
    return;
  }

  const rawDeltas = parsed.deltas.filter(isValidDelta);
  if (rawDeltas.length === 0) return;

  useScenarioStore.getState().applyRelationDelta(scenarioId, rawDeltas);

  // 扫小队冲突 —— 用最新 doc
  const freshDoc = useScenarioStore.getState().getById(scenarioId);
  if (!freshDoc) return;
  const party = useNpcStore.getState().getParty();
  const partyIds = party.map((p) => p.id);
  const conflicts = detectPartyConflicts(freshDoc, partyIds);
  for (const { kickedId, hostileWithId } of conflicts) {
    const kicked = party.find((p) => p.id === kickedId);
    const hostile = party.find((p) => p.id === hostileWithId) ?? { name: hostileWithId };
    useNpcStore.getState().leaveParty(kickedId);
    useNarrationStore.getState().append(
      `${kicked?.name ?? kickedId} 因与 ${hostile.name} 反目，离队而去。`,
    );
  }
}
