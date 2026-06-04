/**
 * A2.7 — StateChips 描述符纯函数:把姿态/状态条件/疯狂三态转成一组 {key,label,color,title}。
 *
 * 为何分离:项目 vitest 是 node 环境,没有 jsdom/RTL,无法直接 render <StatusBar/>。
 * 把 chip 生成逻辑剥到无 React 的纯函数后,既能在 node 单测覆盖,也让 StatusBar 的 JSX
 * 退化成 "调一次 helper 把数组 map 成 span"——降低 JSX 中条件链的可读性负担。
 *
 * 同 A1.5 dice-panel-state.ts 的相同拆分套路。
 */

/** 状态条件严重度配色(与 StatusBar SEVERITY_COLOR 保持同步)。 */
const SEVERITY_COLOR: Record<string, string> = {
  minor: '#b7a35a',
  moderate: 'var(--gold)',
  severe: '#d88a4a',
  critical: '#ff6a5a',
};

export interface ChipDescriptor {
  /** React key —— 'posture'/'ti'/'ii'/'pi' 或 `c${index}` 走索引避免名称碰撞。 */
  key: string;
  /** 徽章显示文字。 */
  label: string;
  /** 描边/文字色 —— CSS color (var(--blood) 或 #xxxxxx 皆可)。 */
  color: string;
  /** title 属性 (鼠标悬浮提示)。 */
  title?: string;
}

export interface DeriveStateChipsInput {
  /** 姿态字符串 —— 非'站立'/非空才出 chip。 */
  posture: string;
  /** 状态条件列表 —— 按 severity 着色,缺失走 moderate 兜底。 */
  conditions: { name: string; severity: string; description: string }[];
  /** 临时疯狂 —— Table VII,active=true 时红色 chip。 */
  temporaryInsanity?: { active: boolean };
  /** 不定性疯狂 —— 日级恢复,active=true 时紫色 chip。 */
  indefiniteInsanity?: { active: boolean };
  /** 永久疯狂 —— 调查员退场,true 时暗红 chip。 */
  permanentInsanity?: boolean;
}

/**
 * 把当前角色卡片段转成一组 chip 描述符,保持顺序: 姿态 > 临时 > 不定 > 永久 > 状态条件。
 *
 * 无任何 chip 时返回空数组,渲染层据此跳过容器。
 */
export function deriveStateChips(input: DeriveStateChipsInput): ChipDescriptor[] {
  const chips: ChipDescriptor[] = [];
  if (input.posture && input.posture !== '站立') {
    chips.push({ key: 'posture', label: input.posture, color: 'var(--gold-bright)', title: '当前姿态' });
  }
  if (input.temporaryInsanity?.active === true) {
    chips.push({ key: 'ti', label: '临时疯狂', color: 'var(--blood)', title: '临时性疯狂 — Table VII' });
  }
  if (input.indefiniteInsanity?.active === true) {
    chips.push({ key: 'ii', label: '不定性疯狂', color: '#a978d6', title: '不定性疯狂 — 日级恢复' });
  }
  if (input.permanentInsanity === true) {
    chips.push({ key: 'pi', label: '永久疯狂', color: '#7a1f1f', title: '永久疯狂 — 调查员退场' });
  }
  for (let i = 0; i < input.conditions.length; i++) {
    const c = input.conditions[i];
    chips.push({
      key: `c${i}`,
      label: c.name,
      color: SEVERITY_COLOR[c.severity] ?? SEVERITY_COLOR.moderate,
      title: c.description,
    });
  }
  return chips;
}
