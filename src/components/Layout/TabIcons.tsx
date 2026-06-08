// src/components/Layout/TabIcons.tsx
// 古典铜版线描风格：统一 24×24 viewBox，stroke=currentColor，由父级 color 控制金/暗。

interface IconProps { size?: number }

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
});

/** 库存：钱袋/背包 */
export function IconInventory({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><path d="M5 9h14l-1.2 10.5H6.2L5 9z" /><path d="M9 9V6.5a3 3 0 016 0V9" /></svg>);
}
/** 角色卡：卷轴/记录页 */
export function IconCharSheet({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><rect x="5" y="3.5" width="14" height="17" rx="1.2" /><path d="M8 8h8M8 11.5h8M8 15h5" /></svg>);
}
/** 目录：摊开的古书 */
export function IconToc({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><path d="M12 6c-2-1.5-5-1.5-7 0v12c2-1.5 5-1.5 7 0 2-1.5 5-1.5 7 0V6c-2-1.5-5-1.5-7 0z" /><path d="M12 6v12" /></svg>);
}
/** 骰子：多面骰(d20 轮廓) */
export function IconDice({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 3v18M4 7.5l8 4.5 8-4.5" /></svg>);
}
/** NPC：人物半身剪影 */
export function IconNpc({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0113 0" /></svg>);
}
/** 地图：折叠地图 + 路径节点 */
export function IconMap({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><path d="M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>);
}
/** 线索：放大镜 */
export function IconClue({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><circle cx="10.5" cy="10.5" r="6" /><path d="M20 20l-5.3-5.3" /></svg>);
}
/** 关键线索：钥匙（bow + 齿） */
export function IconKey({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><circle cx="7.5" cy="7.5" r="3.6" /><path d="M10.1 10.1L19 19M15.5 15.5l2.2-2.2M18 18l1.8-1.8" /></svg>);
}
/** 幸运：四芒星轮廓（A1.5 DicePanel 幸运扣点徽章） */
export function IconLuck({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><path d="M12 3l2.2 6.3 6.6.4-5.1 4.2 1.7 6.4L12 16.8 6.6 20.3l1.7-6.4L3.2 9.7l6.6-.4L12 3z" /></svg>);
}
/** 推骰：圆中循环箭头（A1.5 DicePanel 推骰徽章） */
export function IconPush({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><circle cx="12" cy="12" r="8" /><path d="M9 9h-3v-3M15 15h3v3M8 14.5a5 5 0 008 1.5M16 9.5a5 5 0 00-8-1.5" /></svg>);
}
/** 难度星：五芒星轮廓；filled 时以 currentColor 实心 */
export function IconStar({ size = 12, filled = false }: IconProps & { filled?: boolean }) {
  const props = base(size);
  return (<svg {...props} fill={filled ? 'currentColor' : 'none'}><path d="M12 3l2.6 6.1 6.6.5-5 4.4 1.5 6.5L12 17.3 5.3 20.5l1.5-6.5-5-4.4 6.6-.5L12 3z" /></svg>);
}
/** 关闭：斜十字 ×（铜版线描，替代字符 ×） */
export function IconClose({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>);
}
/** 勾选：对勾 ✓（替代字符 ✓） */
export function IconCheck({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><path d="M5 12.5l4.5 4.5L19 7" /></svg>);
}
/** 闪光：四芒星火花（替代 emoji ✨，标识 LLM 生成） */
export function IconSparkle({ size = 12 }: IconProps) {
  return (<svg {...base(size)}><path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3" /></svg>);
}
/** 刷新/清空：循环箭头（替代 emoji ♻） */
export function IconRefresh({ size = 12 }: IconProps) {
  return (<svg {...base(size)}><path d="M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5" /></svg>);
}
/** 图片占位：相框 + 山岭 + 小太阳(铜版线描,用于 PageBanner 加载骨架) */
export function IconImage({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M3 17l5-5 4 4 3-3 6 6" /></svg>);
}
/** 警示三角(用于失败兜底) */
export function IconAlert({ size = 18 }: IconProps) {
  return (<svg {...base(size)}><path d="M12 4l10 17H2L12 4z" /><path d="M12 10v5M12 18v0.01" /></svg>);
}
/** 邀请入队：人像 + 加号（铜版线描，与 IconNpc 同语言） */
export function IconUserPlus({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><path d="M17 6v6M14 9h6" /></svg>);
}
/** 请求退队：人像 + 减号 */
export function IconUserMinus({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><path d="M14 9h6" /></svg>);
}

/** 齿轮：通用「设置」（替代 emoji ⚙） */
export function IconGear({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M22 12h-3M5 12H2M19.07 4.93l-2.12 2.12M7.05 16.95l-2.12 2.12M19.07 19.07l-2.12-2.12M7.05 7.05L4.93 4.93" /></svg>);
}

/** 正则脚本：< / > 斜杠 + 中点（替代 ✧；体现「匹配模式」语义） */
export function IconRegex({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><path d="M8 5l-4 7 4 7M16 5l4 7-4 7" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /></svg>);
}

/** 扩展管理：拼图块（替代 emoji ⊞） */
export function IconExtension({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><path d="M4 7h3.5a2 2 0 104 0H15v3.5a2 2 0 100 4V18H4v-3.5a2 2 0 100-4V7z" /></svg>);
}

/** 酒馆助手：经典酒馆酒壶轮廓（替代 emoji 🍶） */
export function IconFlask({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><path d="M9 3h6v3l2.5 4.2A6 6 0 0112 21a6 6 0 01-5.5-10.8L9 6V3z" /><path d="M9 6h6" /></svg>);
}

/** 背景设定：卷轴（替代 emoji 📜；与 IconCharSheet 直线笔记区分用卷边波浪） */
export function IconScroll({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><path d="M6 4h11a2 2 0 012 2v0a2 2 0 01-2 2H7v10a2 2 0 002 2h11" /><path d="M6 4a2 2 0 00-2 2v12a2 2 0 002 2h0" /><path d="M10 10h7M10 14h5" /></svg>);
}

/** 提示词模板：鹅毛笔（替代 emoji 📝） */
export function IconQuill({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><path d="M3 21l5-5" /><path d="M20 4c-5 0-9 3-11 8a6 6 0 015 5c5-2 8-6 8-11l-2-2z" /><path d="M8 16l3-3" /></svg>);
}

/** 文件夹：经典文件夹轮廓（替代 emoji 📁） */
export function IconFolder({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><path d="M3 6.5a1.5 1.5 0 011.5-1.5h4l2 2.5h10A1.5 1.5 0 0122 9v9a1.5 1.5 0 01-1.5 1.5h-17A1.5 1.5 0 013 18V6.5z" /></svg>);
}

/** 脚本/文件：折角文档（替代 emoji 📄） */
export function IconScript({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><path d="M6 3h8l4 4v14H6V3z" /><path d="M14 3v4h4M9 12h6M9 15.5h6M9 9h3" /></svg>);
}

/** 编辑：铅笔（替代 emoji ✎） */
export function IconPencil({ size = 12 }: IconProps) {
  return (<svg {...base(size)}><path d="M14.5 3.5l6 6L9 21l-6 1 1-6 10.5-12.5z" /><path d="M13 5l6 6" /></svg>);
}

/** 下三角箭头：dropdown 触发器（替代字符 ▼） */
export function IconChevronDown({ size = 10 }: IconProps) {
  return (<svg {...base(size)}><path d="M6 9l6 6 6-6" /></svg>);
}
