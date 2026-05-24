import { extractAllVariables, parseStatChanges } from './variables';

const EXTRACTOR_PROMPT = `你是一个MVU（Model-View-Update）变量提取引擎。从以下COC跑团叙事文本中提取所有游戏状态变量。

提取规则：
1. 识别所有 <var name="变量名" value="变量值" /> 标签
2. 识别所有 {{set:变量名=变量值}} 命令
3. 从叙事中识别属性变化（HP、SAN、幸运、MP等数值变化）
4. 识别场景状态（地点变化、时间推移、天气变化等）

请以严格的JSON格式回复，不要包含其他文字：
{
  "variables": [
    {"name": "变量名1", "value": "变量值1"},
    {"name": "变量名2", "value": "变量值2"}
  ]
}

以下是需要分析的文本：`;

/**
 * Use an independent LLM API to extract variables from the response text.
 * Returns the extracted variables and the cleaned text (with markup stripped).
 */
export async function extractVariablesWithLLM(
  text: string,
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  temperature = 1,
  retries = 1,
): Promise<{ variables: Record<string, string>; cleanedText: string }> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: EXTRACTOR_PROMPT },
            { role: 'user', content: text },
          ],
          temperature,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        throw new Error(`MVU API error ${response.status}`);
      }

      const json = await response.json();
      const content: string = json.choices?.[0]?.message?.content ?? '';

      // Try to parse the LLM's JSON response
      let variables: Record<string, string> = {};
      try {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed.variables)) {
            for (const v of parsed.variables) {
              if (v.name && v.value !== undefined) {
                variables[v.name] = String(v.value);
              }
            }
          }
        }
      } catch {
        // Fallback to regex extraction
      }

      // Always run regex extraction as fallback/complement
      const regexVars = extractAllVariables(text);
      const statVars = parseStatChanges(text);
      variables = { ...variables, ...regexVars, ...statVars };

      // Strip variable markup from text
      const cleanedText = text
        .replace(/<var\s+name="[^"]+"\s+value="[^"]*"\s*\/>/gi, '')
        .replace(/\{\{set:[a-zA-Z_一-鿿][a-zA-Z0-9_一-鿿]*=[^}]*\}\}/gi, '');

      return { variables, cleanedText };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries - 1) {
        // Wait briefly before retry
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  throw lastError ?? new Error('MVU extraction failed');
}
