// 序章扩写器 — 把剧本作者写的 prologueSeed(短种子文本)经一次 LLM 子调用扩写为
// 完整的 BookPage(序章 leftContent + 右页守秘人引导/抉择/4 选项),供 preset 模式
// activateScenario 替换 page[0]。失败抛错由 scenario-engine 捕获回落到 prologueSeed 原文。

import { callDsSubagent, type DsSubagentRequest } from '../sillytavern/subagent-call';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { BookPage, ChoiceItem, SceneInfo } from '../types';
import type { ScenarioDoc } from '../types/scenario';

const SYSTEM_PROMPT = [
  '你是 Call of Cthulhu 7e 跑团的【守秘人】。',
  '剧本作者已给出一份「序章种子」(短),你的工作是把它扩写为一页完整的首回合:左页是氛围渲染的序章正文,右页是承接的现场情境与 4 个互不重复的开场抉择。',
  '',
  '【输出格式】仅输出严格 JSON,不要 markdown 围栏、不要解释。结构:',
  '{',
  '  "sceneInfo": { "date": string, "weekday": string, "time": string, "weather": string, "location": string },',
  '  "leftHeader": "序章",',
  '  "leftContent": string,         // 200-450 字,第三人称限知视角,克苏鲁神话基调,不剧透暗线',
  '  "rightHeader": string,         // 8 字内,如「现场」「邀请」',
  '  "rightContent": string,        // 100-200 字,承接序章把镜头落到调查员当下抉择点',
  '  "rightChoices": [              // 恰好 4 项,num 必须是罗马字 I/II/III/IV',
  '    { "num": "I",   "text": string,  "action": string },',
  '    { "num": "II",  "text": string,  "action": string },',
  '    { "num": "III", "text": string,  "action": string },',
  '    { "num": "IV",  "text": string,  "action": string }',
  '  ]',
  '}',
  '',
  '【规则】',
  '- text 是给玩家看的选项摘要(8-16 字),action 是玩家选后被注入 prompt 的第一人称行动陈述。',
  '- 四个选项必须互不重复、覆盖不同进路(观察/交谈/调查/直接行动等)。',
  '- sceneInfo 优先复用剧本 prologueSeed 已暗示的时间地点;无信息则结合剧本类型自洽生成。',
  '- 字符串值内如需引用,统一用「」或『』,严禁未转义双引号。',
].join('\n');

const ROMAN: ReadonlyArray<string> = ['I', 'II', 'III', 'IV'];

function fallbackSceneInfo(): SceneInfo {
  return { date: '', weekday: '', time: '', weather: '', location: '' };
}

function coerceChoices(raw: unknown): ChoiceItem[] {
  if (!Array.isArray(raw)) throw new Error('rightChoices 缺失或非数组');
  const out: ChoiceItem[] = [];
  for (let i = 0; i < ROMAN.length; i++) {
    const r = raw[i];
    if (!r || typeof r !== 'object') throw new Error(`rightChoices[${i}] 非对象`);
    const rec = r as Record<string, unknown>;
    const text = typeof rec.text === 'string' ? rec.text.trim() : '';
    const action = typeof rec.action === 'string' ? rec.action.trim() : '';
    if (!text || !action) throw new Error(`rightChoices[${i}] text/action 为空`);
    out.push({ num: ROMAN[i], text, action });
  }
  return out;
}

/**
 * 扩写 prologueSeed 为完整 BookPage。
 *
 * 失败抛错(网络/HTTP/JSON/字段缺失) — scenario-engine 调用方负责 catch 后回落
 * 到 prologueSeed 原文 + FALLBACK_CHOICES。
 */
export async function expandPrologueToPage(
  prologueSeed: string,
  scn: ScenarioDoc,
): Promise<BookPage> {
  const s = useSettingsStore.getState();
  const userPayload = [
    `【剧本】${scn.meta.name}(类型:${scn.meta.type} / 难度:${scn.meta.difficulty} / SAN 损失:${scn.meta.sanLossHint})`,
    `【简介】${scn.meta.blurb}`,
    '',
    '【序章种子】',
    prologueSeed.trim(),
  ].join('\n');

  const req: DsSubagentRequest = {
    apiBaseUrl: s.apiBaseUrl,
    apiKey: s.apiKey,
    model: s.apiModel,
    temperature: 0.85,
    maxTokens: 20000,
    rpmLane: 'main',
    label: 'scenario:expand-prologue',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPayload },
    ],
  };

  const { parsed, parseError } = await callDsSubagent(req);
  if (!parsed) throw new Error(`expand-prologue 解析失败: ${parseError ?? 'no JSON'}`);

  const p = parsed as Record<string, unknown>;
  const leftContent = typeof p.leftContent === 'string' ? p.leftContent.trim() : '';
  const rightHeader = typeof p.rightHeader === 'string' ? p.rightHeader.trim() : '';
  const rightContent = typeof p.rightContent === 'string' ? p.rightContent.trim() : '';
  if (!leftContent) throw new Error('expand-prologue leftContent 缺失');
  if (!rightHeader) throw new Error('expand-prologue rightHeader 缺失');
  if (!rightContent) throw new Error('expand-prologue rightContent 缺失');

  const rightChoices = coerceChoices(p.rightChoices);

  // sceneInfo 字段缺失不阻塞 — 给空字符串兜底
  const rawScene = p.sceneInfo;
  const sceneInfo: SceneInfo = (rawScene && typeof rawScene === 'object')
    ? {
        date: typeof (rawScene as SceneInfo).date === 'string' ? (rawScene as SceneInfo).date : '',
        weekday: typeof (rawScene as SceneInfo).weekday === 'string' ? (rawScene as SceneInfo).weekday : '',
        time: typeof (rawScene as SceneInfo).time === 'string' ? (rawScene as SceneInfo).time : '',
        weather: typeof (rawScene as SceneInfo).weather === 'string' ? (rawScene as SceneInfo).weather : '',
        location: typeof (rawScene as SceneInfo).location === 'string' ? (rawScene as SceneInfo).location : '',
      }
    : fallbackSceneInfo();

  return {
    leftHeader: '序章',
    leftContent,
    leftPage: '',
    rightPage: '',
    rightHeader,
    rightContent,
    rightChoices,
    sceneInfo,
    summary: '',
  };
}
