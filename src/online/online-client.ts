// ===== 联机网络层：REST 房间服务 + WebSocket 客户端（零 store 依赖，纯网络） =====
// 复用内容无关的公共中继协议：
//   GET  {base}/rooms            列表
//   POST {base}/rooms            建房 → { id, ... }
//   POST {base}/rooms/:id/join   校验密码 → ok
//   ws   {base→ws}/ws/room/:id   房间广播通道
// 每条 WS 消息为 Envelope，中继原样转发给同房间其他成员。

import { deriveWsUrl, generateId, type Envelope, type OnlineMessageType } from './protocol';

const APP_TITLE = 'coc-tavern-abyss';

async function requestWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw new Error('请求超时，请检查网络或稍后重试');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface RoomInfo {
  id: string;
  name: string;
  hasPassword?: boolean;
  maxUsers?: number;
  currentUsers?: number;
  [k: string]: unknown;
}

export const RoomApiService = {
  async fetchRooms(baseUrl: string): Promise<RoomInfo[]> {
    const res = await requestWithTimeout(`${baseUrl.replace(/\/+$/, '')}/rooms`, { headers: { 'X-Title': APP_TITLE } });
    if (!res.ok) throw new Error('获取房间列表失败');
    return ((await res.json()) as { rooms?: RoomInfo[] }).rooms ?? [];
  },

  async createRoom(
    baseUrl: string,
    params: { name: string; password?: string; maxUsers?: number; creatorName?: string },
  ): Promise<{ id: string; [k: string]: unknown }> {
    const res = await requestWithTimeout(`${baseUrl.replace(/\/+$/, '')}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Title': APP_TITLE },
      body: JSON.stringify(params),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !data.id) throw new Error(data.error || '创建房间失败');
    return data as { id: string };
  },

  /** 校验并返回 WS 地址。失败时抛出带 status 的错误。 */
  async verifyAndJoin(baseUrl: string, roomId: string, password: string): Promise<string> {
    const res = await requestWithTimeout(`${baseUrl.replace(/\/+$/, '')}/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Title': APP_TITLE },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const err = new Error(data.error || (res.status === 404 ? '房间不存在或已关闭' : '加入房间失败')) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return deriveWsUrl(baseUrl, roomId);
  },
};

export interface OnlineHandlers {
  onConnectionChange?: (connected: boolean) => void;
  onMessage?: (msg: Envelope) => void;
  onError?: (message: string) => void;
}

/**
 * 单房间 WebSocket 客户端：连接 + 心跳 + 发送。重连由上层 store 编排
 * （onConnectionChange(false) 时决定是否重连）。
 */
export class OnlineClient {
  ws: WebSocket | null = null;
  userId = generateId();
  userName = '';
  isHost = false;
  private handlers: OnlineHandlers = {};

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pendingPong = false;
  private missedPongs = 0;
  private readonly HEARTBEAT_INTERVAL = 5000;
  private readonly MAX_MISSED_PONGS = 8;
  private readonly CONNECT_TIMEOUT_MS = 10000;

  init(handlers: OnlineHandlers): void {
    this.handlers = handlers;
  }

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let connectTimer: ReturnType<typeof setTimeout> | null = null;
      const safeReject = (err: Error) => { if (settled) return; settled = true; if (connectTimer) clearTimeout(connectTimer); reject(err); };
      const safeResolve = () => { if (settled) return; settled = true; if (connectTimer) clearTimeout(connectTimer); resolve(); };

      try {
        this.ws = new WebSocket(url);
        connectTimer = setTimeout(() => {
          this.handlers.onError?.('连接超时，请重试');
          try { this.ws?.close(); } catch { /* noop */ }
          safeReject(new Error('连接超时'));
        }, this.CONNECT_TIMEOUT_MS);

        this.ws.onopen = () => {
          this.missedPongs = 0;
          this.pendingPong = false;
          this.startHeartbeat();
          this.send('join', { name: this.userName, isHost: this.isHost });
          this.handlers.onConnectionChange?.(true);
          safeResolve();
        };

        this.ws.onclose = () => {
          this.stopHeartbeat();
          this.handlers.onConnectionChange?.(false);
          if (!settled) safeReject(new Error('连接已关闭'));
        };

        this.ws.onerror = () => {
          this.handlers.onError?.('WebSocket 错误');
          safeReject(new Error('WebSocket 错误'));
        };

        this.ws.onmessage = (e: MessageEvent) => {
          this.pendingPong = false;
          this.missedPongs = 0;
          let msg: Envelope | null = null;
          try {
            msg = typeof e.data === 'string' ? (JSON.parse(e.data) as Envelope) : (e.data as Envelope);
          } catch {
            return;
          }
          if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
          if (msg.type === 'pong') return;
          this.handlers.onMessage?.(msg);
        };
      } catch (e) {
        safeReject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  send(type: OnlineMessageType, data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data, from: this.userId, fromName: this.userName, timestamp: Date.now() }));
    }
  }

  /** 与 send 等价（语义上向房间广播），便于阅读。 */
  broadcast(type: OnlineMessageType, data: unknown): void {
    this.send(type, data);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pendingPong = false;
    this.heartbeatTimer = setInterval(() => {
      if (this.pendingPong) {
        this.missedPongs++;
        if (this.missedPongs >= this.MAX_MISSED_PONGS) {
          this.handlers.onError?.('网络不稳定，连接已断开');
          try { this.ws?.close(); } catch { /* noop */ }
          return;
        }
      }
      this.pendingPong = true;
      this.send('ping', { t: Date.now() });
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.pendingPong = false;
    this.missedPongs = 0;
  }

  disconnect(): void {
    this.stopHeartbeat();
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
  }
}
