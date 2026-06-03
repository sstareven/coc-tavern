/**
 * 剥除中文字符后【紧贴】(中间无空格)的英文释义/原文串。
 *
 * LLM 有时把世界书里的英文释义照搬进正文，写成「借书台circulation desk」「阿卡姆Arkham」
 * 这类中英黏连——污染上下文（会被摘要/历史回灌）。本函数把这种黏连的英文剥掉。
 *
 * 触发条件（刻意保守，避免误删合法英文）：
 *  - 必须是【中文字符紧贴(无空格)≥2 个英文字母】才触发——合法中文叙事几乎不会把英文直接黏在汉字上，
 *    通常会有空格/引号分隔（如「他说 Hello」「『Necronomicon』」），这些都【不】触发。
 *  - 触发后，连同其后以空格分隔的后续英文单词一并剥除（如「借书台circulation desk」整段）。
 * 保留：汉字后单个字母（维生素C、X 等）、标点/空格后的英文、纯英文段、汉字前的英文（X光）。
 */
export function stripCjkGluedEnglish(text: string): string {
  if (!text) return text;
  return text.replace(/([一-鿿])[A-Za-z]{2,}(?:[ \t]+[A-Za-z]+)*/g, '$1');
}

/**
 * 折叠【连续重复的同一个中文标点】为一个（如「。。」→「。」「，，」→「，」「！！！」→「！」），
 * 防止 LLM 误打出重复标点污染显示与上下文。
 * 仅作用于句末/分隔标点 。！？，、；：——【不】触碰省略号「…」(「……」是合法的中文省略号)，
 * 也不折叠不同标点的组合(如「！？」保留)。
 */
export function collapseRepeatedPunctuation(text: string): string {
  if (!text) return text;
  return text.replace(/([。！？，、；：])\1+/g, '$1');
}

/**
 * 归一化关键词高亮花括号 `{{...}}`，修复 LLM 产出的嵌套/引号黏连畸形（如 `{{「{{南极}}」}}`、孤儿 `」}}`）。
 * 关键词高亮约定是单层 `{{词}}`；本函数：
 *  - 去掉与花括号【内侧黏连】的中文引号外壳：`{{「`→`{{`、`」}}`→`}}`（保留 `「{{词}}」` 这种引号在外的合法写法）。
 *  - 折叠连续/嵌套花括号：多个 `{{` 折为一个、多个 `}}` 折为一个。
 * 例：`{{「{{南极}}」}}` → `{{南极}}`。
 */
export function normalizeKeywordBraces(text: string): string {
  if (!text) return text;
  return text
    .replace(/\{\{\s*[「『]/g, '{{')
    .replace(/[」』]\s*\}\}/g, '}}')
    .replace(/\{\{(?:\s*\{\{)+/g, '{{')
    .replace(/(?:\}\}\s*)+\}\}/g, '}}');
}

/** 正文/选项统一净化：剥中英黏连 + 折叠重复标点 + 归一化关键词花括号。 */
export function sanitizeNarrative(text: string): string {
  return normalizeKeywordBraces(collapseRepeatedPunctuation(stripCjkGluedEnglish(text)));
}
