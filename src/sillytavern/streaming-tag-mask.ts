// 流式标签遮罩 — 在 walker 输出的叙事字符流上叠一层:
//   - <kw>...</kw>: emit openKw/closeKw, 标签字符不可见, 内部字符正常 visibleChar
//   - <san id="..."/>: 自闭合, emit sanBubble{id}, 标签字符不可见
//   - <thinking>...</thinking>: 进入后所有字符隐藏,直到 </thinking>
//   - <UpdateVariable>...</UpdateVariable>: 同上
//   - 孤立 </kw>(无配对 <kw>): 静默吞掉(对齐 stripOrphanKwTags 的精神)
//   - 未识别标签: 原文透传为 visibleChar(保守)
//
// 边界硬约束(spec § 6):
//   - kw 段累积超过 KW_SEGMENT_MAX_CHARS 字符仍未遇 </kw> → 强行 emit closeKw + 警告日志(防 LLM 漏闭合吞后文)
//
// 设计:逐字符喂入【支持跨多次调用】。所有状态(inTagBuf/tagBuf/hiddenBlock/kwOpenCount/kwCharsSinceOpen)
// 都是 instance 字段,walker 的 narrativeChar 流可以一字一字喂进来,不必担心 chunk 边界。
// 缓冲超长(>64 字符)视为非标签,把 < 与缓冲内容当 visibleChar 吐(防 LLM 漏写 > 把后面正文全吞)。

export type MaskEvent =
  | { kind: 'visibleChar'; ch: string }
  | { kind: 'openKw' }
  | { kind: 'closeKw' }
  | { kind: 'sanBubble'; id: string }
  | { kind: 'enterHiddenBlock'; block: 'thinking' | 'updateVar' }
  | { kind: 'exitHiddenBlock' };

type HiddenBlock = 'thinking' | 'updateVar' | null;

const KW_SEGMENT_MAX_CHARS = 30;

export class StreamingTagMask {
  private inTagBuf = false;
  private tagBuf = '';
  private hiddenBlock: HiddenBlock = null;
  private kwOpenCount = 0;
  private kwCharsSinceOpen = 0; // 已 open 后累积的可见字符数(开新 kw 时清零)

  feed(ch: string): MaskEvent[] {
    const out: MaskEvent[] = [];

    if (this.hiddenBlock) {
      if (!this.inTagBuf && ch === '<') {
        this.inTagBuf = true;
        this.tagBuf = '';
        return out;
      }
      if (this.inTagBuf) {
        if (ch === '>') {
          const tag = this.tagBuf;
          this.inTagBuf = false;
          this.tagBuf = '';
          if (
            (this.hiddenBlock === 'thinking' && tag === '/thinking') ||
            (this.hiddenBlock === 'updateVar' && tag === '/UpdateVariable')
          ) {
            out.push({ kind: 'exitHiddenBlock' });
            this.hiddenBlock = null;
          }
          return out;
        }
        this.tagBuf += ch;
        if (this.tagBuf.length > 64) {
          this.inTagBuf = false;
          this.tagBuf = '';
        }
        return out;
      }
      return out;
    }

    if (this.inTagBuf) {
      if (ch === '>') {
        const tag = this.tagBuf;
        this.inTagBuf = false;
        this.tagBuf = '';
        this.decideTag(tag, out);
        return out;
      }
      this.tagBuf += ch;
      if (this.tagBuf.length > 64) {
        out.push({ kind: 'visibleChar', ch: '<' });
        for (const c of this.tagBuf) out.push({ kind: 'visibleChar', ch: c });
        this.inTagBuf = false;
        this.tagBuf = '';
      }
      return out;
    }

    if (ch === '<') {
      this.inTagBuf = true;
      this.tagBuf = '';
      return out;
    }

    // 普通可见字符 — 如果在 kw 段里,累计并检查上限
    out.push({ kind: 'visibleChar', ch });
    if (this.kwOpenCount > 0) {
      this.kwCharsSinceOpen++;
      if (this.kwCharsSinceOpen >= KW_SEGMENT_MAX_CHARS) {
        // LLM 漏写 </kw> 防护 — 强行闭合 + 日志(用 console.warn,避免引入 pushLog 循环依赖)
        console.warn(`[streaming-tag-mask] kw 段超过 ${KW_SEGMENT_MAX_CHARS} 字仍未闭合,强行 closeKw`);
        this.kwOpenCount--;
        this.kwCharsSinceOpen = 0;
        out.push({ kind: 'closeKw' });
      }
    }
    return out;
  }

  private decideTag(tag: string, out: MaskEvent[]): void {
    const t = tag.trim();

    if (t === 'kw') {
      this.kwOpenCount++;
      this.kwCharsSinceOpen = 0;
      out.push({ kind: 'openKw' });
      return;
    }
    if (t === '/kw') {
      if (this.kwOpenCount > 0) {
        this.kwOpenCount--;
        this.kwCharsSinceOpen = 0;
        out.push({ kind: 'closeKw' });
      }
      return;
    }
    if (t === 'thinking') {
      out.push({ kind: 'enterHiddenBlock', block: 'thinking' });
      this.hiddenBlock = 'thinking';
      return;
    }
    if (t === 'UpdateVariable') {
      out.push({ kind: 'enterHiddenBlock', block: 'updateVar' });
      this.hiddenBlock = 'updateVar';
      return;
    }
    const sanMatch = /^san\s+id\s*=\s*"([^"]+)"\s*\/?$/.exec(t);
    if (sanMatch) {
      out.push({ kind: 'sanBubble', id: sanMatch[1] });
      return;
    }
    out.push({ kind: 'visibleChar', ch: '<' });
    for (const c of tag) out.push({ kind: 'visibleChar', ch: c });
    out.push({ kind: 'visibleChar', ch: '>' });
  }
}
