import { buildAndDamageBonus } from './combat-engine';
import type { NpcProfile } from '../types';

export interface NpcDerived {
  hp?: number;
  san?: number;
  mp?: number;
  db?: string;
  mov?: number;
  build?: number;
}

/**
 * 解析/推算 NPC 衍生属性，供记录面板展示。
 * 优先从 `npc.derived` 自由文本正则解析（兼容「HP 12 / SAN 55 / DB +1D4 / MOV 8」等写法），
 * 解析不到的从 characteristics 推算（COC7e：HP=⌊(CON+SIZ)/10⌋、MP=⌊POW/5⌋、SAN=POW、DB/Build 按 STR+SIZ）。
 * 都拿不到则该项 undefined（面板显「未知」）。
 */
export function parseNpcDerived(npc: NpcProfile): NpcDerived {
  const d = npc.derived ?? '';
  const c = npc.characteristics ?? {};
  const numAfter = (re: RegExp): number | undefined => {
    const m = d.match(re);
    return m ? parseInt(m[1], 10) : undefined;
  };
  let hp = numAfter(/(?:HP|生命值|生命|体力)\s*[:：]?\s*(\d+)/i);
  let san = numAfter(/(?:SAN|理智值|理智|San)\s*[:：]?\s*(\d+)/i);
  let mp = numAfter(/(?:MP|魔法值|魔法)\s*[:：]?\s*(\d+)/i);
  let mov = numAfter(/(?:MOV|移动力|移动)\s*[:：]?\s*(\d+)/i);
  const dbMatch = d.match(/(?:DB|伤害加值|伤害奖励)\s*[:：]?\s*([+\-]?\d*[dD]\d+|[+\-]?\d+)/);
  let db = dbMatch ? dbMatch[1].toUpperCase().replace(/^\+/, '') : undefined; // 规范化：去掉前导 +（保留负号），与 buildAndDamageBonus 一致，避免拼式出现双号

  // 推算兜底
  if (hp == null && c.CON != null && c.SIZ != null) hp = Math.floor((c.CON + c.SIZ) / 10);
  if (mp == null && c.POW != null) mp = Math.floor(c.POW / 5);
  if (san == null && c.POW != null) san = c.POW;
  let build: number | undefined;
  if (c.STR != null && c.SIZ != null) {
    const bd = buildAndDamageBonus(c.STR, c.SIZ);
    build = bd.build;
    if (db == null) db = bd.db;
  }
  if (mov == null) mov = 8;
  return { hp, san, mp, db, mov, build };
}
