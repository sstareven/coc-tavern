import { rpmAcquire } from './rpm-limiter';
import { appIdHeaders } from './api-router';
import { coerceJsonObject } from './llm-response-parser';
import { pushLog } from '../stores/useLogStore';
import type { MapLocation, MapEdge } from '../types';
import type { TokenUsage } from './stream-parser';

/**
 * 地图自检（拓扑校对）提示词：仅依据【地点描述与连线描述中明确陈述的空间关系】，
 * 找出三类错误并给出最小纠正——缺失连线 / 错挂连线 / 重复地点。
 * 与线索整合(clue-integrator)、地点元素整合同款「保守、不臆造」原则：拿不准就不动。
 */
const RECONCILE_PROMPT = `你是克苏鲁的呼唤(COC)跑团的【地图拓扑校对助手】。下面给出当前地图的【全部地点】（含描述）与【全部连线】。请仅依据【地点描述与连线描述中明确陈述的空间关系】，找出并最小化地纠正拓扑错误。绝不臆造描述里没有的关系。

请检查三类问题：
1. 缺失连线（addEdges）：若地点 A 的描述明确说它【通往/连接/可达/直通】另一地点 B（B 也在列表中），但 A 与 B 之间当前【没有连线】，则补一条 A—B 连线。type 取 bidirectional（可往返）或 oneway（单向不可逆）。
2. 错挂连线（removeEdges）：若存在一条 A—B 连线，但依据各地点描述判断 A、B 其实【并不直接相邻】（该通路实际属于另一对地点，例如某条"小径"的真正端点是别的地点），则移除这条错误连线。
3. 重复地点（merges）：若两个地点其实是【同一处地方】的不同叫法（描述指向同一实体），选信息更全/更具体的名字为 canonical，其余填入 aliases 合并过去。

【保守原则·务必遵守】只在描述【明确支持】时才增/删/并；任何拿不准的一律不动。绝不发明地点列表里不存在的地点名；addEdges / removeEdges / merges 中出现的名字必须【逐字】来自上面给出的地点名。

只输出严格 JSON，不要任何额外文字、解释或代码围栏。无需改动的类别给空数组：
{
  "addEdges": [{"from":"碎石小径入口","to":"印斯茅斯·码头区","type":"bidirectional","description":"沿隐蔽小径可下行至码头区"}],
  "removeEdges": [{"from":"印斯茅斯镇口","to":"印斯茅斯·码头区"}],
  "merges": [{"canonical":"印斯茅斯·码头区","aliases":["印斯茅斯码头"]}]
}`;

export interface MapReconcileResult {
  addEdges: { from: string; to: string; type: 'bidirectional' | 'oneway'; description?: string }[];
  removeEdges: { from: string; to: string }[];
  merges: { canonical: string; aliases: string[] }[];
  usage?: TokenUsage;
}

const EMPTY: MapReconcileResult = { addEdges: [], removeEdges: [], merges: [] };

/** 把 LLM 给出的 from/to 名字校验为「逐字命中现有地点名」，过滤幻觉地点名。 */
function validPair(x: unknown, names: Set<string>): { from: string; to: string } | null {
  const o = x as Record<string, unknown> | null;
  const from = typeof o?.from === 'string' ? o.from.trim() : '';
  const to = typeof o?.to === 'string' ? o.to.trim() : '';
  if (!from || !to || from === to || !names.has(from) || !names.has(to)) return null;
  return { from, to };
}

/**
 * 地图自检：用独立 LLM 调用校对当前地图拓扑，返回需补的缺失连线、需删的错挂连线、需并的重复地点。
 * 仅基于传入地点/连线的描述判断，不臆造；所有地点名经「逐字命中现有地点」校验，过滤幻觉。
 * 复用 clue-integrator/location-element-integrator 同款独立调用范式
 * （rpmAcquire + appIdHeaders + 容错 JSON 解析 + 仅对截断/空响应重试）。
 */
export async function reconcileMap(
  locations: MapLocation[],
  edges: MapEdge[],
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  temperature = 0.4, // 校对偏确定性，温度压低减少臆造
  maxTokens = 20000, // 思考型模型预算耗在 reasoning，给足余量防 JSON 截断（用户要求 max_tokens≥20000）
  retries = 3,
): Promise<MapReconcileResult> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  const names = new Set(locations.map((l) => l.name.trim()));
  const idToName = new Map(locations.map((l) => [l.id, l.name]));

  // 列出地点（名 + 描述）与连线（端点名 + 类型 + 描述），喂给校对模型。
  const locList = locations
    .map((l, i) => `${i + 1}. ${l.name}：${l.description?.trim() || '（无描述）'}`)
    .join('\n');
  const edgeList = edges
    .map((e) => {
      const a = idToName.get(e.fromId) ?? '?';
      const b = idToName.get(e.toId) ?? '?';
      const arrow = e.type === 'oneway' ? '→（单向）' : '↔（双向）';
      return `- ${a} ${arrow} ${b}${e.description ? `：${e.description}` : ''}`;
    })
    .join('\n');

  pushLog('info', `[地图自检] 开始：${locations.length} 地点 / ${edges.length} 连线，模型=${model}`, 'api');

  let lastError = '';
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    await rpmAcquire('main');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...appIdHeaders(),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: RECONCILE_PROMPT },
          { role: 'user', content: `当前全部地点：\n${locList}\n\n当前全部连线：\n${edgeList || '（暂无连线）'}` },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      pushLog('error', `[地图自检] API 返回错误 ${response.status}`, 'api');
      throw new Error(`地图自检 API 错误 ${response.status}`);
    }

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content ?? '';
    const usage: TokenUsage | undefined = json.usage;

    const { parsed, error } = coerceJsonObject(content);
    const pObj = parsed as Record<string, unknown> | null;

    if (pObj) {
      const rawAdd = Array.isArray(pObj.addEdges) ? (pObj.addEdges as unknown[]) : [];
      const rawRemove = Array.isArray(pObj.removeEdges) ? (pObj.removeEdges as unknown[]) : [];
      const rawMerge = Array.isArray(pObj.merges) ? (pObj.merges as unknown[]) : [];

      const addEdges: MapReconcileResult['addEdges'] = [];
      for (const x of rawAdd) {
        const pair = validPair(x, names);
        if (!pair) continue;
        const t = (x as Record<string, unknown>).type;
        const type = t === 'oneway' ? 'oneway' : 'bidirectional';
        const d = (x as Record<string, unknown>).description;
        addEdges.push({ ...pair, type, description: typeof d === 'string' ? d : undefined });
      }

      const removeEdges = rawRemove
        .map((x) => validPair(x, names))
        .filter((p): p is { from: string; to: string } => p !== null);

      const merges: MapReconcileResult['merges'] = [];
      for (const x of rawMerge) {
        const o = x as Record<string, unknown> | null;
        const canonical = typeof o?.canonical === 'string' ? o.canonical.trim() : '';
        const aliasesRaw = Array.isArray(o?.aliases) ? (o!.aliases as unknown[]) : [];
        // canonical 与每个 alias 都必须逐字命中现有地点名，且 alias≠canonical。
        if (!canonical || !names.has(canonical)) continue;
        const aliases = aliasesRaw
          .map((a) => (typeof a === 'string' ? a.trim() : ''))
          .filter((a) => a && a !== canonical && names.has(a));
        if (aliases.length > 0) merges.push({ canonical, aliases });
      }

      pushLog(
        'info',
        `[地图自检] 第 ${attempt + 1}/${retries} 次成功：补 ${addEdges.length} 边 / 删 ${removeEdges.length} 边 / 并 ${merges.length} 组重复`,
        'api',
      );
      return { addEdges, removeEdges, merges, usage };
    }

    lastError = error || '解析为空';
    const retryable = !content.trim() || parsed === null;
    pushLog(
      attempt + 1 < retries && retryable ? 'warn' : 'info',
      `[地图自检] 解析失败：${lastError}（第 ${attempt + 1}/${retries} 次，${retryable ? '空/截断/畸形，将重试' : '停止重试'}）`,
      'api',
    );
    if (!retryable) return { ...EMPTY, usage };
  }

  pushLog('error', `[地图自检] ${retries} 次重试后仍失败（${lastError}），本回合不纠正`, 'api');
  return EMPTY;
}
