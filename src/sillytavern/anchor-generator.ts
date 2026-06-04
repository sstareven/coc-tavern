import { callDsSubagent } from './subagent-call';
import type { PlotAnchors } from '../types';

/**
 * 开局「剧情蓝图」生成提示词：据开场情境 + 已生成的坏结局/真相支柱，产出本局必经骨架节点 +
 * 全局硬约束 + 威胁可瓦解依赖。内嵌 5 个开局母题「规律模板」——只在此生成阶段使用，运行期绝不注入。
 */
const ANCHOR_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人，正在为本局编排「剧情骨架」。下面给出开场情境、本局注定的坏结局（守秘人机密）、以及 3 个真相支柱（守秘人机密）。请据此产出本局的剧情蓝图，让剧情既不漫无目的地乱跑，又能容纳玩家的合理创意。

请先判断本局最贴近以下哪种开局母题，按其「规律」编排骨架（也可融合）：
1. 禁书诅咒型（导师急信/密大残籍）：单点深挖、解谜驱动、阅读禁书伴随理智流失；骨架围绕同一核心场景层层揭密。
2. 封闭敌镇型（海风遗产/印斯茅斯）：敌意小镇、时限压迫（如天黑/末班车）、全镇合谋；骨架=入镇→探秘→暴露血统/真相→逃出或反抗。
3. 不可见威胁型（山丘委托/敦威治）：乡村孤立、威胁初期不可见只由环境异变间接呈现、家族秘密；骨架=入村→揭异常→威胁显形→反制仪式。
4. 线性探险型（极地邀约/疯狂山脉）：地理纵深、场景线性递进不可跳跃、真相是衰落文明而非小镇人心；骨架=起疑→抵达目的地→深入→撤离/封存。
5. 多线收束型（镇上异变/阿卡姆）：开放主场、多条怪事并行、调查员是本地人；骨架=多线并起→串联→指向同一真相核心→阻止。

要求：
1. nodes：产出 3-6 个【有序】必经节点，每个含 title（简短节点名）与 description（1-2 句该节点应发生什么）。节点应与坏结局、3 真相支柱连贯（节点推进 ≈ 逐步逼近真相）。
2. constraints：3-5 条全局硬约束——「若剧情按默认推进」须遵守的地理/因果保证（如「暗线威胁必在极地爆发」「核心场景在极地不在出发港」）。
3. threatDependencies：列出威胁要达成上述坏结局所【依赖】之物（资金、法器、信众集结、秘密性、某关键人物、补给、仪式材料等）——这是玩家日后可用合理手段瓦解的关键靶子。

只输出严格 JSON，不要任何额外文字、解释或代码围栏：
{
  "nodes": [ {"title": "……", "description": "……"} ],
  "constraints": ["……"],
  "threatDependencies": ["……"]
}`;

export async function generateAnchors(
  openingCtx: string,
  badEnding: string,
  pillars: { title: string; secret: string }[],
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
  temperature = 0.9,
  maxTokens = 20000, // 思考型模型防截断（项目硬下限 ≥20000）
  retries = 3,
): Promise<PlotAnchors | null> {
  const pillarText = pillars.length
    ? pillars.map((p, i) => `${i + 1}. ${p.title}：${p.secret}`).join('\n')
    : '（暂无）';
  const userContent = `开场情境：\n${openingCtx}\n\n本局注定的坏结局（机密）：${badEnding || '（暂无）'}\n\n3 真相支柱（机密）：\n${pillarText}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    if (signal?.aborted) return null;
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    if (signal?.aborted) return null;
    const { parsed } = await callDsSubagent({
      apiBaseUrl, apiKey, model, signal, temperature, maxTokens, rpmLane: 'main',
      label: '剧情锚点生成',
      messages: [
        { role: 'system', content: ANCHOR_PROMPT },
        { role: 'user', content: userContent },
      ],
    });
    if (parsed) {
      const rawNodes = Array.isArray(parsed.nodes) ? (parsed.nodes as Record<string, unknown>[]) : [];
      const nodes = rawNodes
        .filter((x) => x && (typeof x.title === 'string' || typeof x.description === 'string'))
        .map((x) => ({
          id: crypto.randomUUID(),
          title: typeof x.title === 'string' && x.title.trim() ? x.title.trim() : '节点',
          description: typeof x.description === 'string' ? x.description.trim() : '',
        }))
        .slice(0, 6);
      const constraints = (Array.isArray(parsed.constraints) ? parsed.constraints : [])
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        .map((c) => c.trim())
        .slice(0, 5);
      const threatDependencies = (Array.isArray(parsed.threatDependencies) ? parsed.threatDependencies : [])
        .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
        .map((d) => d.trim())
        .slice(0, 8);
      if (nodes.length > 0) return { nodes, constraints, threatDependencies };
    }
    // parsed 为 null 或无有效 nodes → 继续重试。
  }
  return null;
}
