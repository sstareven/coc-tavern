// src/sillytavern/prologue-megaagent.ts —— 首回合综合调用 B
//
// 设计目标(per memory mvu-api-owns-all-variables-2rpm-target):
//   把 generateBadEnding + generateAnchors 两个原本依赖 DAG 的子调用合并成 1 次综合调用,
//   让 LLM 在同一次输出内顺序推理:坏结局 → 真相支柱 → 剧情锚点。
//   原本 anchors 必须等 badEnding+pillars 落地才能生成,需要跨回合等待。综合 B 内部完成依赖链。
//
// 触发条件(由 useChatPipeline 判定):
//   useKeyClueStore.pillars.length === 0 && !isEpilogue && 主 API 已正常响应
// 一次成功后永久不再触发(三个 store 都已落)。

import { callDsSubagent } from './subagent-call';
import type { PlotAnchors, CausalLink } from '../types';
import type { TokenUsage } from './stream-parser';

const SYSTEM_PROMPT_B = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人,正在为本局编排「真相」与「剧情骨架」。请按以下步骤【在同一次输出内】依序完成:

1. 据开场情境定本局注定的坏结局 badEnding(1-3 句具体描述,紧扣主题与地点)。
2. 据坏结局推 3 个真相支柱 pillars(title + secret),共同构成破局核心。
3. 据上述坏结局+支柱+开场情境,按 5 大开局母题匹配最贴近母题,输出剧情蓝图 anchors:
   - 禁书诅咒型(导师急信/密大残籍):单点深挖、解谜驱动、阅读禁书伴随理智流失。
   - 封闭敌镇型(海风遗产/印斯茅斯):敌意小镇、时限压迫、全镇合谋。
   - 不可见威胁型(山丘委托/敦威治):乡村孤立、威胁初期不可见、家族秘密。
   - 线性探险型(极地邀约/疯狂山脉):地理纵深、场景线性递进、真相是衰落文明。
   - 多线收束型(镇上异变/阿卡姆):开放主场、多条怪事并行、调查员是本地人。
4. 输出本局中心思想 anchors.theme(1 句话,不超过 30 字,KP 用作隐性引导,禁止 NPC 当讲道文说出来)。
5. 输出 anchors.worldFacts 3-6 条 KP 视角世界硬事实(玩家未必发现,但 KP 据此判定一切角色合理性,如「狼人怕银」「社区有三代旧怨」)。
6. 输出 anchors.characterArcs:调查员一条 + 关键 NPC(与 pillars 反映出的人物)各一条,通常共 3-4 条。每条字段 name/from/to 必填,mid 可省。例:{name:'调查员', from:'天真助理', mid:'目击者', to:'清醒的报信者'}。
7. 输出 anchors.causalLinks 把 nodes 两两相邻串起,长度 = nodes.length - 1。每条 {fromTitle, toTitle, hookHint},hookHint 用 1 句话(≤30字)说明「节点 A 走到 B 必须先发生什么 / 玩家行动如何成为 B 的因」,fromTitle/toTitle 用 nodes 里的真实 title。

要求:
- nodes:3-6 个【有序】必经节点。
- constraints:3-5 条全局硬约束。
- threatDependencies:威胁要达成坏结局所依赖之物(资金/法器/信众/补给/仪式材料等)。

坏结局、支柱机密、anchors 都属于守秘人最高机密,禁止露给玩家。

只输出单一 JSON 对象,不要任何额外文字、解释或代码围栏:
{
  "badEnding": { "description": "string" },
  "pillars": [ { "title": "string", "secret": "string" } ],
  "anchors": {
    "nodes": [ { "title": "string", "description": "string" } ],
    "constraints": ["string"],
    "threatDependencies": ["string"],
    "theme": "string",
    "worldFacts": ["string"],
    "characterArcs": [ { "name": "string", "from": "string", "mid": "string?", "to": "string" } ],
    "causalLinks": [ { "fromTitle": "string", "toTitle": "string", "hookHint": "string" } ]
  }
}`;

export interface PrologueMegaAgentResult {
  badEnding: { description: string } | null;
  pillars: { title: string; secret: string }[];
  anchors: PlotAnchors | null;
  usage?: TokenUsage;
}

interface RunOpts {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

const EMPTY: Omit<PrologueMegaAgentResult, 'usage'> = {
  badEnding: null,
  pillars: [],
  anchors: null,
};

/**
 * 综合 B 单次调用。失败时三段全空,下回合 trigger 仍命中会再试。
 * 内部 retries=3(首回合失败影响大且只跑一次,多试一次值得)。
 */
export async function runPrologueMegaAgent(
  openingCtx: string,
  opts: RunOpts,
): Promise<PrologueMegaAgentResult> {
  const userContent = `本局开场情境(序章 + 首回合叙事):
<opening>
${openingCtx}
</opening>

请一次性输出 badEnding + pillars + anchors 三段,遵守上方 Schema。`;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (opts.signal?.aborted) return { ...EMPTY };
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    if (opts.signal?.aborted) return { ...EMPTY };

    try {
      const resp = await callDsSubagent({
        apiBaseUrl: opts.apiBaseUrl,
        apiKey: opts.apiKey,
        model: opts.model,
        signal: opts.signal,
        temperature: 0.9,
        maxTokens: 32768,
        rpmLane: 'mvu',
        label: '首回合大综合',
        jsonObject: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_B },
          { role: 'user', content: userContent },
        ],
      });

      const parsed = resp.parsed;
      if (!parsed) continue; // 解析失败 → 重试

      const result = parsePrologueResponse(parsed, resp.usage);
      // 三段都必须有内容才算成功;有一段空就重试。
      if (result.badEnding && result.pillars.length > 0 && result.anchors) {
        return result;
      }
    } catch {
      // 网络/HTTP 错误 → 继续重试
    }
  }
  return { ...EMPTY };
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function parsePrologueResponse(
  parsed: Record<string, unknown>,
  usage?: TokenUsage,
): PrologueMegaAgentResult {
  let badEnding: PrologueMegaAgentResult['badEnding'] = null;
  const beRaw = asObject(parsed.badEnding);
  if (beRaw && asString(beRaw.description)) {
    badEnding = { description: asString(beRaw.description) };
  }

  const pillars = asArray<Record<string, unknown>>(parsed.pillars)
    .map((p) => ({ title: asString(p?.title), secret: asString(p?.secret) }))
    .filter((p) => p.title && p.secret)
    .slice(0, 3);

  let anchors: PrologueMegaAgentResult['anchors'] = null;
  const anchorsRaw = asObject(parsed.anchors);
  if (anchorsRaw) {
    const nodes = asArray<Record<string, unknown>>(anchorsRaw.nodes)
      .filter((x) => x && (typeof x.title === 'string' || typeof x.description === 'string'))
      .map((x) => ({
        id: crypto.randomUUID(),
        title: asString(x.title, '节点'),
        description: asString(x.description),
      }))
      .slice(0, 6);
    const constraints = asArray<string>(anchorsRaw.constraints)
      .filter((c) => typeof c === 'string' && c.trim())
      .map((c) => c.trim())
      .slice(0, 5);
    const threatDependencies = asArray<string>(anchorsRaw.threatDependencies)
      .filter((d) => typeof d === 'string' && d.trim())
      .map((d) => d.trim())
      .slice(0, 8);

    // 新字段(best-effort 软成功)
    const themeRaw = asString(anchorsRaw.theme).trim();
    const theme = themeRaw ? themeRaw.slice(0, 50) : undefined;

    const worldFactsRaw = asArray<string>(anchorsRaw.worldFacts)
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim())
      .slice(0, 6);
    const worldFacts = worldFactsRaw.length > 0 ? worldFactsRaw : undefined;

    const characterArcsRaw = asArray<Record<string, unknown>>(anchorsRaw.characterArcs)
      .map((a) => ({
        name: asString(a?.name).trim(),
        from: asString(a?.from).trim(),
        mid: asString(a?.mid).trim(),
        to: asString(a?.to).trim(),
      }))
      .filter((a) => a.name && a.from && a.to)
      .map((a) => (a.mid ? a : { name: a.name, from: a.from, to: a.to }))
      .slice(0, 6);
    const characterArcs = characterArcsRaw.length > 0 ? characterArcsRaw : undefined;

    const titleToId = new Map(nodes.map((n) => [n.title, n.id]));
    const causalLinksRaw = asArray<Record<string, unknown>>(anchorsRaw.causalLinks)
      .map((l) => ({
        fromTitle: asString(l?.fromTitle).trim(),
        toTitle: asString(l?.toTitle).trim(),
        hookHint: asString(l?.hookHint).trim(),
      }))
      .filter((l) => l.fromTitle && l.toTitle && l.hookHint)
      .map((l): CausalLink | null => {
        const fromNodeId = titleToId.get(l.fromTitle);
        const toNodeId = titleToId.get(l.toTitle);
        return fromNodeId && toNodeId
          ? { fromNodeId, toNodeId, hookHint: l.hookHint.slice(0, 30) }
          : null;
      })
      .filter((l): l is CausalLink => l !== null)
      .slice(0, Math.max(0, nodes.length - 1));
    const causalLinks = causalLinksRaw.length > 0 ? causalLinksRaw : undefined;

    if (nodes.length > 0) {
      anchors = {
        nodes,
        constraints,
        threatDependencies,
        ...(theme ? { theme } : {}),
        ...(worldFacts ? { worldFacts } : {}),
        ...(characterArcs ? { characterArcs } : {}),
        ...(causalLinks ? { causalLinks } : {}),
      };
    }
  }

  return { badEnding, pillars, anchors, usage };
}
