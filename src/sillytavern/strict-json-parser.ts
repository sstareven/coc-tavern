// src/sillytavern/strict-json-parser.ts
//
// 严格 JSON 解析器（不做启发式修复）。
//
// 配套使用场景：callDsSubagent 启用 response_format: { type: 'json_object' } 后,
// 模型 API 保证返回合法 JSON 对象——此时解析器只需 JSON.parse 直通，不需要
// coerceJsonObject 那套启发式修复（缺外层 { / 字符串内换行转义 / 中文标点归一化 /
// 三次重试...）。
//
// 失败时立即返回结构化错误（含位置上下文），由调用方决定是否重试。
//
// 与 coerceJsonObject 的关系：
//   - coerceJsonObject 是给"脏" LLM 文本兜底用的——主回合输出含 <UpdateVariable>
//     补丁块、思考链、Markdown 围栏等多种污染源,必须靠启发式修复。
//   - strictJsonParse 是给"已经过 json_object 模式约束"的输出用的——失败即失败,
//     不要兜底修复,因为修复反而可能掩盖配置问题（如 jsonObject toggle 没生效）。

import type { JsonCoercion } from './llm-response-parser';

/**
 * 严格解析 LLM 输出为 JSON 对象。
 *
 * 处理顺序：
 *   1) trim 首尾空白
 *   2) 剥 `<think>...</think>` / `<thinking>...</thinking>` 思考块（COC 思考链 + 双人成行 Subtext_think 注释）
 *   3) 剥 ```json ... ``` 或 ``` ... ``` 代码围栏（若有）
 *   4) JSON.parse 直接尝试
 *   5) 校验顶层是 object（非 array / 非 primitive）
 *
 * 任何一步失败 → parsed=null + error 携带诊断。不做任何启发式修复
 * （不补 {/} / 不转义字符串内换行 / 不归一化标点）——这些修复属于
 * coerceJsonObject 的职责领域。
 *
 * 注：剥思考块 + 围栏是"明显边界标记"的轻量预处理，与"启发式修复"边界不同；
 * 模型即便在 json_object 模式下也可能在 JSON 前后挂这类元数据。
 */
export function strictJsonParse(raw: string): JsonCoercion {
  if (!raw || !raw.trim()) {
    return { parsed: null, jsonStr: raw, error: '输入为空 (empty input)' };
  }

  let jsonStr = raw
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/<!--\s*begin_of_Subtext_think[\s\S]*?end_of_Subtext_think\s*-->/gi, '')
    .trim();

  // 剥代码围栏（``` 或 ```json）
  const fenceMatch = jsonStr.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    // 顶层必须是对象（非 array / 非 primitive）
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        parsed: null,
        jsonStr,
        error: `顶层不是对象 (top-level is not an object, got ${Array.isArray(parsed) ? 'array' : typeof parsed})`,
      };
    }
    return { parsed: parsed as Record<string, unknown>, jsonStr, error: '' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // 附加位置上下文便于诊断
    const posMatch = msg.match(/position\s+(\d+)/i);
    let error = `SyntaxError: ${msg}`;
    if (posMatch) {
      const pos = parseInt(posMatch[1]);
      const ctx = jsonStr.substring(Math.max(0, pos - 30), Math.min(jsonStr.length, pos + 30));
      error += ` | 上下文: ...${ctx}...`;
    }
    return { parsed: null, jsonStr, error };
  }
}
