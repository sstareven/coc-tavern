// 共享动态 marker 检测 — 用于剧本/世界书缓存策略判定
// 命中即视为含运行期分支(EJS/变量读写/数值解析),挂载阶段无法静态缓存
// 与 deepseek-cache-restructure.ts 的 hasDynamicMarker 不同：
//   此处用于剧本编辑器(scenario)与作者侧缓存策略,只看字面 substring,不剥 ST 静态宏
//   deepseek-cache-restructure 的 hasDynamicMarker 用正则 + ST 静态宏剥离,服务于运行期 lore 重组
//
// 至少包含以下 marker(按出现频次排序):
export const DYNAMIC_MARKERS = [
  '<%',          // EJS 代码/输出/转义块开头
  'getvar(',     // EJS API：读 MVU 变量
  'setvar(',     // EJS API：写 MVU 变量
  'getval(',     // 旧版别名/兼容
  'setval(',     // 旧版别名/兼容
  '_.get(',      // lodash 路径读取(MVU stat_data 深路径常用)
  'parseInt(',   // 数值解析,通常伴随分支
  'parseFloat(', // 同上
] as const;

export function hasDynamicMarker(content: string): boolean {
  if (!content) return false;
  return DYNAMIC_MARKERS.some((m) => content.includes(m));
}
