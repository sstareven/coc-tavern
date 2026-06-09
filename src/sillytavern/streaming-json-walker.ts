// 流式 JSON 字段过滤器 v2 — 支持顶层多字段 + 嵌套 choices[i].text/num
//
// 监听字段(只有这些字段的字符串值字符会作为 narrativeChar emit):
//   顶层: leftHeader / leftContent / rightHeader / rightContent / summary
//   choices 数组项: choices[i].text(field='choiceText') / choices[i].num(field='choiceNum')
//
// enterField event 带 choiceIdx(仅当 field='choiceText'/'choiceNum')。
//
// 其他字符(JSON 结构 `{}[],"` / 非 target 字段值 / sceneInfo 等嵌套对象内容)全部丢弃。
//
// 状态机两层:topLevel(JSON 根) / inChoiceObj(choices[i] 对象里)。
// 顶层遇 "choices" + `[` 进入 inChoices,遇 `{` 进 inChoiceObj(choiceIdx++),
// inChoiceObj 内部用独立的 mini 状态机识别 text/num key,其他 key 的 value 全跳过。
//
// 缺陷:非 choices 的顶层对象/数组(如 sceneInfo 嵌套对象)用 depth counter 跳过结构字符。

export type FieldName =
  | 'leftHeader' | 'leftContent'
  | 'rightHeader' | 'rightContent'
  | 'summary'
  | 'choiceText' | 'choiceNum';

export type WalkerEvent =
  | { kind: 'enterField'; field: FieldName; choiceIdx?: number }
  | { kind: 'exitField' }
  | { kind: 'narrativeChar'; ch: string }
  | { kind: 'streamDone' };

type TopState =
  | 'outside'         // 在 JSON 根的结构字符之间
  | 'inKey'           // 读顶层 key 字符串
  | 'afterKey'        // 读完顶层 key 等冒号 → value
  | 'inValueTarget'   // 在某顶层 target 字段值字符串里
  | 'inValueNonTarget'// 在某顶层非 target 字段值字符串里(只是识别字符串结束)
  | 'inSkipObject'    // 在非 target 顶层字段的对象/数组值里(用 depth 跳过)
  | 'inChoicesArray'  // 在 "choices": [ ... ] 数组里
  | 'inChoiceObj';    // 在 choices[i] 对象里(切到 choice 子状态机)

type ChoiceState =
  | 'outside'         // choices[i] 对象内的结构字符之间
  | 'inKey'           // 读 choice key 字符串
  | 'afterKey'        // 读完 choice key 等冒号
  | 'inValueText'     // 在 choices[i].text 值字符串里(target)
  | 'inValueNum'      // 在 choices[i].num 值字符串里(target)
  | 'inValueOther';   // 在 choices[i] 其他字段(action 等)值字符串里

const TOP_TARGET_FIELDS = new Set<FieldName>([
  'leftHeader', 'leftContent',
  'rightHeader', 'rightContent',
  'summary',
]);

const CHOICE_TARGET_KEYS: Record<string, 'choiceText' | 'choiceNum'> = {
  text: 'choiceText',
  num: 'choiceNum',
};

export class StreamingJsonWalker {
  // 顶层状态
  private topState: TopState = 'outside';
  private topKeyBuf = '';
  private topEscape = false;
  private topActiveField: FieldName | null = null;
  // skip object/array 深度跟踪(进入 sceneInfo 等嵌套)
  private skipDepth = 0;
  private skipInString = false;
  private skipStringEscape = false;
  // choices 数组层
  private choiceIdx = -1;       // 还没进任何 choice 时是 -1,进入第一个 { 时变 0
  // choice 对象内状态
  private choiceState: ChoiceState = 'outside';
  private choiceKeyBuf = '';
  private choiceEscape = false;

  feed(chunk: string): WalkerEvent[] {
    const out: WalkerEvent[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      // ── 在跳过对象/数组里(顶层非 target 字段的复杂值) ──
      if (this.topState === 'inSkipObject') {
        if (this.skipInString) {
          if (this.skipStringEscape) { this.skipStringEscape = false; continue; }
          if (ch === '\\') { this.skipStringEscape = true; continue; }
          if (ch === '"') { this.skipInString = false; }
          continue;
        }
        if (ch === '"') { this.skipInString = true; continue; }
        if (ch === '{' || ch === '[') { this.skipDepth++; continue; }
        if (ch === '}' || ch === ']') {
          this.skipDepth--;
          if (this.skipDepth === 0) {
            this.topState = 'outside';
          }
          continue;
        }
        continue;
      }

      // ── 在 choices 数组里(等下一个 { 或 ]) ──
      if (this.topState === 'inChoicesArray') {
        if (ch === '{') {
          this.choiceIdx++;
          this.topState = 'inChoiceObj';
          this.choiceState = 'outside';
          this.choiceKeyBuf = '';
          continue;
        }
        if (ch === ']') {
          this.topState = 'outside';
          continue;
        }
        // 结构字符(逗号/空白)忽略
        continue;
      }

      // ── 在 choices[i] 对象里 ──
      if (this.topState === 'inChoiceObj') {
        this.feedChoice(ch, out);
        continue;
      }

      // ── 顶层 outside ──
      if (this.topState === 'outside') {
        if (ch === '"') {
          this.topState = 'inKey';
          this.topKeyBuf = '';
        }
        continue;
      }

      // ── 顶层 inKey ──
      if (this.topState === 'inKey') {
        if (this.topEscape) { this.topKeyBuf += ch; this.topEscape = false; continue; }
        if (ch === '\\') { this.topEscape = true; continue; }
        if (ch === '"') {
          this.topState = 'afterKey';
          continue;
        }
        this.topKeyBuf += ch;
        continue;
      }

      // ── 顶层 afterKey ── 等冒号 → 看 value 类型
      if (this.topState === 'afterKey') {
        if (ch === ':' || /\s/.test(ch)) continue;
        if (ch === '"') {
          // value 是字符串
          if ((TOP_TARGET_FIELDS as Set<string>).has(this.topKeyBuf)) {
            this.topState = 'inValueTarget';
            this.topActiveField = this.topKeyBuf as FieldName;
            out.push({ kind: 'enterField', field: this.topActiveField });
          } else {
            this.topState = 'inValueNonTarget';
          }
          continue;
        }
        if (ch === '[') {
          if (this.topKeyBuf === 'choices') {
            this.topState = 'inChoicesArray';
            this.choiceIdx = -1; // 重置:下一个 { 起,choiceIdx 变 0
            continue;
          }
          // 其他数组:跳过整段
          this.topState = 'inSkipObject';
          this.skipDepth = 1;
          continue;
        }
        if (ch === '{') {
          // 嵌套对象(如 sceneInfo / mapUpdates):跳过
          this.topState = 'inSkipObject';
          this.skipDepth = 1;
          continue;
        }
        // 数字 / true / false / null:不是 target,等回 outside
        this.topState = 'outside';
        continue;
      }

      // ── 顶层 inValueTarget / inValueNonTarget ──
      if (this.topState === 'inValueTarget' || this.topState === 'inValueNonTarget') {
        if (this.topEscape) {
          if (this.topState === 'inValueTarget') {
            const decoded = decodeJsonEscape(ch);
            out.push({ kind: 'narrativeChar', ch: decoded });
          }
          this.topEscape = false;
          continue;
        }
        if (ch === '\\') { this.topEscape = true; continue; }
        if (ch === '"') {
          if (this.topState === 'inValueTarget') {
            out.push({ kind: 'exitField' });
            this.topActiveField = null;
          }
          this.topState = 'outside';
          continue;
        }
        if (this.topState === 'inValueTarget') {
          out.push({ kind: 'narrativeChar', ch });
        }
      }
    }
    return out;
  }

  /** 处理 choices[i] 对象里的字符。 */
  private feedChoice(ch: string, out: WalkerEvent[]): void {
    if (this.choiceState === 'outside') {
      if (ch === '"') {
        this.choiceState = 'inKey';
        this.choiceKeyBuf = '';
        return;
      }
      if (ch === '}') {
        // 退出此 choice 对象,回 inChoicesArray
        this.topState = 'inChoicesArray';
        return;
      }
      return; // 结构字符(逗号/空白)忽略
    }
    if (this.choiceState === 'inKey') {
      if (this.choiceEscape) { this.choiceKeyBuf += ch; this.choiceEscape = false; return; }
      if (ch === '\\') { this.choiceEscape = true; return; }
      if (ch === '"') {
        this.choiceState = 'afterKey';
        return;
      }
      this.choiceKeyBuf += ch;
      return;
    }
    if (this.choiceState === 'afterKey') {
      if (ch === ':' || /\s/.test(ch)) return;
      if (ch === '"') {
        const targetField = CHOICE_TARGET_KEYS[this.choiceKeyBuf];
        if (targetField) {
          this.choiceState = targetField === 'choiceText' ? 'inValueText' : 'inValueNum';
          out.push({ kind: 'enterField', field: targetField, choiceIdx: this.choiceIdx });
        } else {
          this.choiceState = 'inValueOther';
        }
        return;
      }
      // 不是字符串值(对象/数组/数字)— 不刻印,但要正确跳过
      if (ch === '{' || ch === '[') {
        // itemGain 可能是嵌套对象 — 简单处理:进 skip object 模式,但在 choice 层级
        // 这里用 skipDepth 跟踪然后回 outside
        this.topState = 'inSkipObject';
        this.skipDepth = 1;
        return;
      }
      this.choiceState = 'outside';
      return;
    }
    if (this.choiceState === 'inValueText' || this.choiceState === 'inValueNum' || this.choiceState === 'inValueOther') {
      if (this.choiceEscape) {
        if (this.choiceState !== 'inValueOther') {
          const decoded = decodeJsonEscape(ch);
          out.push({ kind: 'narrativeChar', ch: decoded });
        }
        this.choiceEscape = false;
        return;
      }
      if (ch === '\\') { this.choiceEscape = true; return; }
      if (ch === '"') {
        if (this.choiceState !== 'inValueOther') {
          out.push({ kind: 'exitField' });
        }
        this.choiceState = 'outside';
        return;
      }
      if (this.choiceState !== 'inValueOther') {
        out.push({ kind: 'narrativeChar', ch });
      }
    }
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
