// 世界 Memory 子调用(2026-06-10):
// 主 API done 之后跑一次,根据「当前 WorldMemory 快照 + 最近回合 narrative」抽 WorldMemory 增量,
// 写入 useWorldMemoryStore.applyUpdate。
//
// 设计要点(per spec 2026-06-10-npc-world-agent-memory-design.md):
//  - 不入主 JSON(规避「主 JSON 加字段会截断末尾」)
//  - 静态 SYSTEM_PROMPT 前置(提示缓存命中)
//  - rpmLane='rewrite'(与 NPC 立卡共桶,fire-and-forget)
//  - 永不 throw,失败回退 null(fail-open)
//  - bootstrap=true 时全字段输出;bootstrap=false 时只输出本回合发生变化的字段

import { callDsSubagent } from './subagent-call';
import { useSettingsStore } from '../stores/useSettingsStore';
import type {
  WorldMemoryUpdate,
  WorldMemoryUpdateInput,
  WorldMemoryUpdateResult,
} from '../types/npc-world-memory';

const SYSTEM_PROMPT = `你是 COC 守秘人的助手。你的任务:维护「世界整体心思」(WorldMemory),一份贯穿整个剧本的世界状态档案。

字段说明:
- darkThread: 暗线推进(玩家未必察觉的幕后线索/势力动向),≤200 字
- keywordMeaningsUpsert: 重要词的真实含义(Record<string, string>),例 {"红色山脉": "邪教仪式坐标"}
- atmosphere: 当前氛围/紧张度,≤80 字
- unrevealedReplace: 已铺好但还未触发的剧情提示(整段替换,数组形式)
- prose: 世界整体心思散文(以全知守秘人视角,≤500 字)

输入会给你:
- current: 当前 WorldMemory 快照(让你知道现在的状态)
- recentNarrative: 上一回合 / 本回合主回合 narrative
- scenarioCtx: 剧本背景(首次 bootstrap 时填)
- bootstrap: 是否首次 bootstrap

输出规则:
1. bootstrap=true 时:给世界一个开局心思,输出全部字段(darkThread/keywordMeaningsUpsert/atmosphere/unrevealedReplace/prose)
2. bootstrap=false 时:仅输出本回合发生变化的字段,其他字段省略(保持原值)
3. keywordMeaningsUpsert 是增量 upsert(同 key 覆盖,新 key 追加),不要重复输出已存在且未变的词
4. unrevealedReplace 是整段替换:输出当前还未触发的提示数组(老的已经触发了就不要再放进去)
5. darkThread/atmosphere/prose 非空时整段覆盖

严格返回 JSON:{
  "darkThread"?: string,
  "keywordMeaningsUpsert"?: { [keyword: string]: string },
  "atmosphere"?: string,
  "unrevealedReplace"?: string[],
  "prose"?: string
}
不得输出 JSON 之外的任何文本,不要使用 markdown 代码围栏。`;

function buildUserPayload(input: WorldMemoryUpdateInput): string {
  // 稳定段(scenarioCtx/bootstrap)前置, 动态段(current 含每回合 updatedAt, recentNarrative) 后置
  // current.updatedAt 每回合都变, 放在 stable 与 dynamic 分界后, 让 user 前缀仍可命中 cache.
  const payload = {
    scenarioCtx: (input.scenarioCtx ?? '').trim(),
    bootstrap: !!input.bootstrap,
    _separator: '--- 本回合动态 ---',
    current: input.current,
    recentNarrative: (input.recentNarrative ?? '').trim(),
  };
  return JSON.stringify(payload, null, 2);
}

export async function runWorldMemoryUpdate(
  input: WorldMemoryUpdateInput,
  signal?: AbortSignal,
): Promise<WorldMemoryUpdateResult> {
  if (signal?.aborted) return null;
  const api = useSettingsStore.getState().getEffectiveRewriteApi();
  if (!api.baseUrl || !api.apiKey || !api.model) return null;

  const userPayload = buildUserPayload(input);

  try {
    // 注意: 不在此处提前调 wrapSubagentMessages — callDsSubagent 内部已 wrap 一次,
    // 双重 wrap 会把 SUBAGENT_SHARED_SYSTEM 复写到 user 段, 破坏前缀缓存.
    // label 固定 'world-memory-update' (bootstrap 状态进 user payload, 不污染 label 前缀).
    const resp = await callDsSubagent({
      apiBaseUrl: api.baseUrl,
      apiKey: api.apiKey,
      model: api.model,
      extraParams: api.extraParams,
      label: 'world-memory-update',
      rpmLane: 'rewrite',
      jsonObject: true,
      maxTokens: 32768,
      signal,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPayload },
      ],
    });

    const parsed = resp.parsed as
      | {
          darkThread?: unknown;
          keywordMeaningsUpsert?: unknown;
          atmosphere?: unknown;
          unrevealedReplace?: unknown;
          prose?: unknown;
        }
      | null;
    if (!parsed) return null;

    const out: WorldMemoryUpdate = {};

    if (typeof parsed.darkThread === 'string' && parsed.darkThread.trim()) {
      out.darkThread = parsed.darkThread;
    }
    if (typeof parsed.atmosphere === 'string' && parsed.atmosphere.trim()) {
      out.atmosphere = parsed.atmosphere;
    }
    if (typeof parsed.prose === 'string' && parsed.prose.trim()) {
      out.prose = parsed.prose;
    }
    if (
      parsed.keywordMeaningsUpsert
      && typeof parsed.keywordMeaningsUpsert === 'object'
      && !Array.isArray(parsed.keywordMeaningsUpsert)
    ) {
      const upsert: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.keywordMeaningsUpsert)) {
        upsert[String(k)] = String(v);
      }
      out.keywordMeaningsUpsert = upsert;
    }
    if (Array.isArray(parsed.unrevealedReplace) && parsed.unrevealedReplace.length > 0) {
      // 空数组视为"LLM 没说" — 否则 LLM 不确定时输出 [] 会让已铺好的提示一次清空
      out.unrevealedReplace = parsed.unrevealedReplace.map((v) => String(v));
    }

    return out;
  } catch {
    return null;
  }
}
