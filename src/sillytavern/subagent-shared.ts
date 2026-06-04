/**
 * Subagent 共享前缀（借鉴 claude-code-best 的 subagent 设计：fresh + small context + 共享前缀）。
 *
 * 背景：本项目有 11+ 个独立 LLM 子调用（坏结局/起始物品/地点元素抽取/地图自检/线索整合/剧情锚点等），
 * 每个都用各自不同的 system prompt 直接 fetch。它们之间 prompt 前缀完全不同 → 任何 prefix cache
 * (DeepSeek 隐式 / Anthropic ephemeral / OpenAI auto-prefix) 都无法跨子调用复用。
 *
 * 优化：让所有子调用共用同一个【短而稳定】的 `SUBAGENT_SHARED_SYSTEM`，原各自 system 内容下沉到 user
 * 消息头部并加上 `[子任务: xxx]` 标签。同回合内多个子调用之间 messages[0] 字节完全相同 →
 * 任意 API 的 prefix cache 都可在子调用之间命中。跨回合（重复同样任务时）也能命中。
 *
 * 跨 API 通用性：不再受限于 DeepSeek。任何 OpenAI 兼容端点（DS/Claude 中转/GPT/Gemini 等）
 * 都受益于前缀稳定——只要服务端有任何形式的 prompt cache。
 *
 * Trade-off:
 *   - 收益：子调用之间共享 ~200 tokens 前缀；多子调用回合（如开局生成坏结局+起始物品+地点元素+地图自检）
 *           能节省 ~600-1000 tokens 的 cache write
 *   - 风险：原 system 被通用化 → LLM 任务理解能力可能略下降；通过把任务说明置于 user 头部部分抵消
 */

import { useSettingsStore } from '../stores/useSettingsStore';

export const SUBAGENT_SHARED_SYSTEM = [
  '你是 Call of Cthulhu 7e 跑团的守秘人(KP)助手，专责完成调用者指派的【单一子任务】。',
  '',
  '【通用要求】',
  '1. 严格按【任务】块指定的输出格式输出（通常是 JSON），仅输出该格式本身——不要任何前后缀文字、markdown 围栏、解释或思考过程。',
  '2. JSON 字符串值内如需引用，统一用「」或『』，严禁未转义双引号——会破坏 JSON 结构导致解析失败。',
  '3. 子任务的具体角色定位、输入数据、输出格式细节都在随附的【子任务: xxx】块内，以那为准。',
  '4. 不要把当前任务以外的内容（如其他子任务、玩家叙事正文）混入输出。',
].join('\n');

export interface SubagentMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 包装 subagent 调用的 messages 数组。
 *
 * 启用条件：dsCache.subagentSharedSystem === true（注意 store 字段名为兼容老存档仍保留
 * `experimentalSubagentSharedSystem`，由 useSettingsStore 暴露 getter 兜底）。
 *
 * 包装规则：
 *   - 首个 system 消息 → 替换为 SUBAGENT_SHARED_SYSTEM
 *   - 首个 user 消息 → content 改写为 `[子任务: ${taskTag}]\n\n${原 system content}\n\n--- 任务输入 ---\n${原 user content}`
 *   - 其他 messages（如 assistant prefill）保持原顺序追加在末尾
 *
 * 无 system 或无 user 时返回原数组（边界保守）。
 */
export function wrapSubagentMessages(
  messages: readonly SubagentMessage[],
  taskTag: string,
): SubagentMessage[] {
  const s = useSettingsStore.getState();
  const dsCfg = s.dsCache;
  // store 字段名沿用 experimentalSubagentSharedSystem 兼容老存档；功能已正式化默认开启。
  if (dsCfg?.experimentalSubagentSharedSystem === false) return messages.slice();

  const firstSystemIdx = messages.findIndex((m) => m.role === 'system');
  const firstUserIdx = messages.findIndex((m) => m.role === 'user');
  if (firstSystemIdx < 0 || firstUserIdx < 0) return messages.slice();

  const origSystem = messages[firstSystemIdx].content;
  const origUser = messages[firstUserIdx].content;
  const wrappedUserContent = `[子任务: ${taskTag}]\n\n${origSystem}\n\n--- 任务输入 ---\n${origUser}`;

  const rest = messages.filter((_, i) => i !== firstSystemIdx && i !== firstUserIdx);
  return [
    { role: 'system', content: SUBAGENT_SHARED_SYSTEM },
    { role: 'user', content: wrappedUserContent },
    ...rest,
  ];
}
