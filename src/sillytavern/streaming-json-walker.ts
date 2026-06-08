// 流式 JSON 字段过滤器 — 只关心 leftHeader / leftContent 两个顶层字段的字符串值里的字符。
// 不解析完整 JSON 树:这是一个"过滤器",不是 parser。其他字段的字符全部丢弃,结构字符(`{}[],"`)也丢。
//
// 状态机:
//   outside    — 还没进入 JSON 对象 / 在两字段之间的结构字符里
//   inKey      — 正在读 key 字符串("..." 之间)
//   afterKey   — 读完 key 等冒号
//   inValueTarget    — 在某个目标字段的 value 字符串里(activeField 记录是哪个)
//   inValueNonTarget — 在非目标字段的 value 字符串里(只是为了正确识别字符串结束)
//
// 转义处理:value 字符串里遇 `\` 把下一字符按 JSON 转义规则解码后 emit(若仍在目标字段)。

export type WalkerEvent =
  | { kind: 'enterField'; field: 'leftHeader' | 'leftContent' }
  | { kind: 'exitField' }
  | { kind: 'narrativeChar'; ch: string }
  | { kind: 'streamDone' };

type State =
  | 'outside'
  | 'inKey'
  | 'afterKey'
  | 'inValueTarget'
  | 'inValueNonTarget';

const TARGET_FIELDS = new Set(['leftHeader', 'leftContent']);

export class StreamingJsonWalker {
  private state: State = 'outside';
  private keyBuf = '';
  private activeField: 'leftHeader' | 'leftContent' | null = null;
  private escape = false; // 上一字符是 `\`

  feed(chunk: string): WalkerEvent[] {
    const out: WalkerEvent[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      if (this.state === 'outside') {
        if (ch === '"') {
          this.state = 'inKey';
          this.keyBuf = '';
        }
        continue;
      }

      if (this.state === 'inKey') {
        if (this.escape) { this.keyBuf += ch; this.escape = false; continue; }
        if (ch === '\\') { this.escape = true; continue; }
        if (ch === '"') {
          this.state = 'afterKey';
          continue;
        }
        this.keyBuf += ch;
        continue;
      }

      if (this.state === 'afterKey') {
        if (ch === ':') continue;
        if (/\s/.test(ch)) continue;
        if (ch === '"') {
          // value 是字符串
          if (TARGET_FIELDS.has(this.keyBuf)) {
            this.state = 'inValueTarget';
            this.activeField = this.keyBuf as 'leftHeader' | 'leftContent';
            out.push({ kind: 'enterField', field: this.activeField });
          } else {
            this.state = 'inValueNonTarget';
          }
          continue;
        }
        // value 不是字符串(数字/对象/数组/布尔)— 直接回外面,等下一个 key
        this.state = 'outside';
        continue;
      }

      if (this.state === 'inValueTarget' || this.state === 'inValueNonTarget') {
        if (this.escape) {
          if (this.state === 'inValueTarget') {
            const decoded = decodeJsonEscape(ch);
            out.push({ kind: 'narrativeChar', ch: decoded });
          }
          this.escape = false;
          continue;
        }
        if (ch === '\\') { this.escape = true; continue; }
        if (ch === '"') {
          if (this.state === 'inValueTarget') {
            out.push({ kind: 'exitField' });
            this.activeField = null;
          }
          this.state = 'outside';
          continue;
        }
        if (this.state === 'inValueTarget') {
          out.push({ kind: 'narrativeChar', ch });
        }
      }
    }
    return out;
  }

  end(): WalkerEvent[] {
    return [{ kind: 'streamDone' }];
  }
}

/** JSON 字符串转义:\" → " / \\ → \ / \n → 换行 / \t → tab / \r → \r / 其他原样。
 *  Unicode `\uXXXX` 这里不处理(主推进 LLM 用中文,极少触发;万一触发会显示 4 字符,可接受)。 */
function decodeJsonEscape(ch: string): string {
  switch (ch) {
    case '"': return '"';
    case '\\': return '\\';
    case '/': return '/';
    case 'n': return '\n';
    case 't': return '\t';
    case 'r': return '\r';
    case 'b': return '\b';
    case 'f': return '\f';
    default: return ch;
  }
}
