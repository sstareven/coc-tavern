/**
 * mvu-format.ts — statData 子树 → 易读 YAML 序列化（纯函数，零 store 依赖）
 *
 * inspired by MagicalAstrogy/MagVarUpdate's `{{format_message_variable::stat_data}}` macro.
 * 把 MVU 变量树（statData，或其子树）序列化成对 LLM 友好的 YAML 快照，
 * 供 AI 阅读当前变量状态。不依赖任何第三方 YAML 库（项目未安装），
 * 自带一个最小化、面向可读性的序列化器。
 *
 * 与上游一致：format_message_variable 对**整棵树**做 YAML 序列化，
 * **不塌缩 VWD `[值, 描述]` 元组**——VWD 的塌缩只发生在 getMvuVariable
 * 的单路径叶子查询里。因此这里把 `[60, "理智"]` 原样渲染成 2 元素列表，
 * 把值和描述都呈现给 AI。
 */

const INDENT = '  ';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 标量是否需要加引号（含冒号空格 / 换行 / 前后空白 / 空串等会破坏可读 YAML 的字符）。 */
function needsQuote(s: string): boolean {
  return s.includes('\n') || s.includes(': ') || s !== s.trim() || s === '';
}

/** 把一个标量渲染成 YAML 行内片段。 */
function renderScalar(value: unknown): string {
  if (value === null || value === undefined) return '~';
  if (typeof value === 'string') {
    if (needsQuote(value)) {
      const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/"/g, '\\"');
      return `"${escaped}"`;
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // 其他原始类型（bigint/symbol 等）兜底
  return String(value);
}

function isContainer(value: unknown): boolean {
  return Array.isArray(value) || isPlainObject(value);
}

function isEmptyContainer(value: unknown): boolean {
  return (
    (Array.isArray(value) && value.length === 0) ||
    (isPlainObject(value) && Object.keys(value).length === 0)
  );
}

/**
 * 递归序列化任意节点为 YAML 行数组（不含外层换行拼接）。
 * @param node 当前节点
 * @param indent 当前缩进字符串
 */
function serializeNode(node: unknown, indent: string): string[] {
  // 对象
  if (isPlainObject(node)) {
    const keys = Object.keys(node);
    if (keys.length === 0) return [`${indent}{}`];
    const lines: string[] = [];
    for (const key of keys) {
      const child = node[key];
      if (isContainer(child)) {
        if (isEmptyContainer(child)) {
          lines.push(`${indent}${key}: ${Array.isArray(child) ? '[]' : '{}'}`);
        } else {
          lines.push(`${indent}${key}:`);
          lines.push(...serializeNode(child, indent + INDENT));
        }
      } else {
        lines.push(`${indent}${key}: ${renderScalar(child)}`);
      }
    }
    return lines;
  }

  // 数组
  if (Array.isArray(node)) {
    if (node.length === 0) return [`${indent}[]`];
    const lines: string[] = [];
    for (const el of node) {
      if (isContainer(el) && !isEmptyContainer(el)) {
        // 容器元素：首行与 "- " 同行，其余行对齐缩进
        const childLines = serializeNode(el, indent + INDENT);
        const first = childLines[0].slice((indent + INDENT).length);
        lines.push(`${indent}- ${first}`);
        for (let i = 1; i < childLines.length; i++) {
          lines.push(childLines[i]);
        }
      } else if (isEmptyContainer(el)) {
        lines.push(`${indent}- ${Array.isArray(el) ? '[]' : '{}'}`);
      } else {
        lines.push(`${indent}- ${renderScalar(el)}`);
      }
    }
    return lines;
  }

  // 标量兜底（顶层标量由导出函数处理，这里一般不触发）
  return [`${indent}${renderScalar(node)}`];
}

/**
 * 把一个 statData 子树（对象/数组/标量，可能嵌套）序列化成易读 YAML 字符串。
 *
 * - 对象：`键: 值`，嵌套缩进 2 空格递归。
 * - 数组：`- 值`，缩进；VWD `[值, 描述]` 原样渲染为 2 元素列表（不塌缩）。
 * - null/undefined 标量 → `~`；null/undefined 顶层输入 → `''`。
 * - 空对象/空数组 → `{}` / `[]`。
 * - 含冒号空格/换行/前后空白的字符串自动加引号。
 */
export function formatStatDataYaml(subtree: unknown): string {
  if (subtree === null || subtree === undefined) return '';

  // 顶层标量
  if (!isContainer(subtree)) {
    return renderScalar(subtree);
  }

  // 顶层空容器
  if (Array.isArray(subtree) && subtree.length === 0) return '[]';
  if (isPlainObject(subtree) && Object.keys(subtree).length === 0) return '{}';

  return serializeNode(subtree, '').join('\n');
}
