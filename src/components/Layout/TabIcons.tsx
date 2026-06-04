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
