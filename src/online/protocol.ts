// ===== 联机协议层：消息类型 + 纯函数 helper（零副作用，可单测） =====
// 架构：房主镜像 + 输入池协作。建在内容无关的公共中继之上——中继只把
// 一条 {type,data,from,fromName,timestamp} JSON 原样转发给同房间其他成员，
// 不理解内容；房主/客户端身份与回合逻辑全在客户端侧。

import type { BookPage } from '../types';

/** 房间内一名成员。 */
export interface OnlineUser {
  id: string;
  name: string;
  isHost: boolean;
  /** 加入顺序，用于房主迁移时确定性选举（越小越早）。 */
  joinOrder: number;
}

/** 客户端提交进输入池的一条「提议行动」。 */
export interface PendingInput {
  userId: string;
  userName: string;
  content: string;
  submittedAt: number;
}

/** 房主一回合生成完成后广播的镜像负载。 */
export interface RoundPayload {
  page: BookPage;
  statData: Record<string, unknown>;
  sheet: unknown; // CharacterSheet，避免本层强耦合角色卡类型
}

/** 迟到者追平用的全量快照。 */
export interface SnapshotPayload {
  pages: BookPage[];
  statData: Record<string, unknown>;
  sheet: unknown;
}

/** WS 消息信封（中继转发的最小结构）。 */
export interface Envelope<T = unknown> {
  type: OnlineMessageType;
  data: T;
  from: string;
  fromName: string;
  timestamp: number;
}

export type OnlineMessageType =
  | 'ping'
  | 'pong'
  | 'join'
  | 'leave'
  | 'sync_user_state'
  | 'host_change'
  | 'user_input'
  | 'revoke_input'
  | 'reset_input'
  | 'host_round'
  | 'request_snapshot'
  | 'snapshot';

/** 生成随机短 id（用户 id / 房间内标识）。 */
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * 把输入池合并成喂给生成管线的一段文本。每条一行：`[名字]: 行动`，段间空行分隔。
 * 按提交时间升序、同刻按 userId 稳定排序，保证各端合并结果一致。
 */
export function combinePoolToText(inputs: PendingInput[]): string {
  return [...inputs]
    .filter((i) => (i.content ?? '').trim().length > 0)
    .sort((a, b) => {
      if (a.submittedAt !== b.submittedAt) return a.submittedAt - b.submittedAt;
      return String(a.userId).localeCompare(String(b.userId), 'zh-CN');
    })
    .map((i) => `[${(i.userName ?? '').trim() || '匿名'}]: ${i.content.trim()}`)
    .join('\n\n');
}

/**
 * 房主迁移：在成员中选下一任房主——按 joinOrder 升序取最早者（确定性，各端一致）。
 * 返回 null 表示房间已空。
 */
export function pickNextHost(users: OnlineUser[]): OnlineUser | null {
  if (users.length === 0) return null;
  return [...users].sort((a, b) => {
    if (a.joinOrder !== b.joinOrder) return a.joinOrder - b.joinOrder;
    return String(a.id).localeCompare(String(b.id), 'zh-CN');
  })[0];
}

/** WS URL 由 REST base 推导：http(s) → ws(s)，挂到房间路径。 */
export function deriveWsUrl(baseUrl: string, roomId: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base.replace(/^http/, 'ws')}/ws/room/${roomId}`;
}
