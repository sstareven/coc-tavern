// src/sillytavern/json-output-mode-prompt.ts
//
// SillyTavern MVU 风格的 JSON Object 输出模式参考模板。
//
// 设计动机：用户提供的一份在外部 SillyTavern 部署里验证有效的 JSON Object
// 强约束 system prompt——把"剧情分析 / 正文 / 角色卡额外格式 / 变量.TimePassed"
// 锚定为顶层字段，模型必须严格输出单一 JSON 对象、不允许 Markdown / XML / 注释
// 等任何 JSON 外文本。
//
// 当前使用情况：
//   - 项目现有主回合 JSON 字段（sceneInfo/leftContent/choices/...）与该模板不兼容,
//     主回合**不**接入此模板。
//   - 子调用（generateStartingItems / extractLocationElements / integrateClues / ...）
//     本就只输出纯 JSON，依赖 callDsSubagent 的 response_format: json_object 模式
//     已经能让模型严格返回 JSON 对象，不需要再叠这套模板的字段约定。
//   - 该模板作为参考存档，供后续若新增需要 MVU 风格输出的独立调用直接复用。
//   - 当前不挂进任何 prompt 流程；解析器走 strict-json-parser.ts。

/**
 * MVU 风格 JSON Object 输出模式 system prompt 模板原文。
 *
 * 用法（若未来需要接入某个新独立调用时）：
 *   const messages = [
 *     { role: 'system', content: JSON_OUTPUT_MODE_PROMPT },
 *     { role: 'user', content: 业务输入 },
 *   ];
 *   const resp = await callDsSubagent({ ..., messages, jsonObject: true });
 *
 * 字段约束（顶层 4 个，固定）：
 *   - 剧情分析: 1-3 句简短局势概括，禁详细思维链。
 *   - 正文: 第三人称有限视角，{{user}} 可见可闻可接触视角，≥800 字，禁心理直叙。
 *   - 角色卡额外格式: 形如「[CE]类型|名称|详情」；无内容时输出 ""。
 *   - 变量.TimePassed: 时间推进描述；无推进时输出 "未推进"。
 *
 * 配套要求：response_format: { type: 'json_object' } + 不输出 JSON 外文本。
 */
export const JSON_OUTPUT_MODE_PROMPT = `<json_output_mode>
当前启用 JSON Object 输出模式。

最终回复必须是一个合法 JSON 对象，不得输出 JSON 外文本。

唯一允许的顶层结构如下：

{
  "剧情分析": "字符串",
  "正文": "字符串",
  "角色卡额外格式": "字符串",
  "变量": {
    "TimePassed": "字符串"
  }
}

严格规则：
- 顶层字段必须且只能包含：剧情分析、正文、角色卡额外格式、变量。
- "变量" 必须且只能包含：TimePassed。
- 所有字段都必须存在。
- 没有角色卡额外格式时，"角色卡额外格式" 输出空字符串 ""。
- 没有时间推进时，"变量.TimePassed" 输出 "未推进"。
- 所有给用户阅读的故事内容只能写入 "正文" 字段。
- 所有叙事规划只能写入 "剧情分析" 字段。
- 所有事件补充只能写入 "角色卡额外格式" 字段。
- 所有变量更新只能写入 "变量" 字段。
- 禁止输出 Markdown、代码块、XML 标签、HTML 注释。
- 禁止在 JSON 前后添加任何说明。
- 输出完整 JSON 后立即停止。

"剧情分析" 要求：
- 只写 1 到 3 句话。
- 简短概括局势、角色目标、冲突点和下一步剧情方向。
- 不输出详细思维链。
- 不写推理过程。

"正文" 要求：
- 第三人称有限视角。
- 以 {{user}} 可见、可闻、可接触的信息为主。
- 不替 {{user}} 做重大决定。
- 写到需要 {{user}} 选择或回应的位置，自然停在该节点。
- 正文不少于 800 个中文字符。
- 对白使用中文引号「」或『』。
- 避免使用英文双引号。
- 禁止出现：心中、想到、感到、觉得、暗道、意识到。
- 如果需要表达心理变化，用动作、对话、表情、现场线索替代。

"角色卡额外格式" 要求：
- 有内容时使用：[CE]类型|名称|详情
- 没有内容时输出 ""。
- 禁止在该字段中使用英文双引号。

输出前暗中检查：
- JSON 是否可解析。
- 是否只有指定字段。
- 是否存在 JSON 外文本。
- "正文" 是否包含禁词。
- 字符串内部是否有未转义英文双引号。
</json_output_mode>`;
