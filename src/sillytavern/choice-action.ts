import type { NpcAction } from './npc-actions';
import type { NpcProfile } from '../types';

export interface NpcActionRequest {
  /** 提交给主管线的纯叙事文本（玩家对 NPC 做了什么）。 */
  text: string;
  /** 供 fillInputBar 解析检定标记的文本（含「进行XX检定(难度)」+ 叙事）；非检定动作与 text 相同。 */
  checkText: string;
}

/** 各 check 动作的叙事措辞（{n}=NPC 名）；缺省回落「对{n}{label}」。 */
const PHRASING: Record<string, (n: string) => string> = {
  talk: (n) => `与${n}话术周旋，试探其口风`,
  steal: (n) => `趁${n}不备，试图偷走其随身的财物`,
  persuade: (n) => `试图以言语说服${n}`,
  charm: (n) => `试图取悦、博取${n}的好感`,
  intimidate: (n) => `出言恐吓${n}`,
  psychology: (n) => `暗中揣摩${n}的真实意图`,
  psychoanalysis: (n) => `尝试安抚、疏导${n}的情绪`,
  spot: (n) => `仔细观察${n}的神情与随身之物`,
  listen: (n) => `留神聆听${n}的言语与周遭动静`,
  sneak: (n) => `悄然尾随${n}，不被其察觉`,
  firstaid: (n) => `为${n}进行急救`,
  medicine: (n) => `以医学知识为${n}诊治`,
};

/**
 * 据 NPC 名 + check 动作构造【提交文本】与【检定标记文本】（纯函数，便于测试）。
 * checkText 形如「进行话术检定(普通)，与XX话术周旋」，可被 RightPage.parseCheckAction(Format2) 识别；
 * 提交给 LLM 的 text 保持纯叙事（不含检定标记，符合 format-instruction 约定）。
 */
export function buildNpcActionRequest(npcName: string, action: NpcAction): NpcActionRequest {
  const narrative = PHRASING[action.id]?.(npcName) ?? `对${npcName}${action.label}`;
  if (action.kind !== 'check' || !action.skill) return { text: narrative, checkText: narrative };
  const diff = action.difficulty ?? '普通';
  return { text: narrative, checkText: `进行${action.skill}检定(${diff})，${narrative}` };
}

/**
 * 触发与「点选项」同一条【掷骰→提交】通道：派发 `npc-action` 事件，
 * 由 RightPage 监听并调用其私有 fillInputBar（DOM/掷骰机器不外泄，复用现有管线）。
 */
export function dispatchNpcAction(npcName: string, action: NpcAction): void {
  const req = buildNpcActionRequest(npcName, action);
  document.dispatchEvent(new CustomEvent('npc-action', { detail: req }));
}

/** NPC 是否已失能（重伤/昏迷/濒死，活着但几无抵抗）——对其再发起攻击应走「处决直叙」而非战斗面板。 */
export function isHelplessNpc(npc: Pick<NpcProfile, 'status'>): boolean {
  return /重伤|昏迷|濒死/.test(npc.status ?? '');
}

/** 据失能 NPC 与所选战斗动作构造「处决/制伏」纯叙事文本（无掷骰、不开战斗面板，交主管线出正文+选项）。 */
export function buildExecutionNarrative(npcName: string, statusText: string, action: NpcAction): string {
  const st = /昏迷/.test(statusText) ? '昏迷倒地' : /濒死/.test(statusText) ? '濒死' : '身负重伤';
  if (action.maneuver === 'disarm') return `${npcName}已${st}、再无招架之力，调查员上前夺下其手中武器，彻底解除威胁`;
  if (action.maneuver) return `${npcName}已${st}、再无招架之力，调查员上前将其制伏控制，使其无从反抗`;
  return `${npcName}已${st}、几无抵抗之力，调查员上前补上决定性的一击，了结这场对峙`;
}

/** 处决/纯叙事动作：把一句叙事文本塞进输入栏（无检定标记），玩家按推进即走主管线生成正文+选项。 */
export function dispatchNpcNarrative(text: string): void {
  document.dispatchEvent(new CustomEvent('npc-action', { detail: { text, checkText: text } }));
}
