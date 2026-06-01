// ===== 联机状态层：连接编排 + 输入池 + 房主镜像 =====
// 房主镜像架构：只有房主本地跑 AI 生成，生成完把整页+状态广播给全员镜像。
// 客户端把提议行动提交进输入池；房主合并后用现有管线生成。
// 中继是哑的，房主/客户端身份与回合逻辑全在此 store。

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';
import { useBookStore } from './useBookStore';
import { useVariableStore } from './useVariableStore';
import { useCharSheetStore, defaultSheet } from './useCharSheetStore';
import type { CharacterSheet, BookPage } from '../types';
import { pushLog } from './useLogStore';
import {
  OnlineClient,
  RoomApiService,
} from '../online/online-client';
import {
  combinePoolToText,
  generateId,
  pickNextHost,
  type Envelope,
  type OnlineUser,
  type PendingInput,
  type RoundPayload,
  type SnapshotPayload,
} from '../online/protocol';

const DEFAULT_SERVER = 'http://localhost:8787';

type OnlineMode = 'disconnected' | 'host' | 'client';

interface OnlinePersisted {
  serverUrl: string;
  userName: string;
}

interface OnlineState extends OnlinePersisted {
  isConnected: boolean;
  isHost: boolean;
  mode: OnlineMode;
  currentRoomId: string;
  users: OnlineUser[];
  pendingInputs: Record<string, PendingInput>;
  statusText: string;

  setServerUrl: (v: string) => void;
  setUserName: (v: string) => void;

  createRoom: (name: string, password: string, maxUsers: number) => Promise<void>;
  joinRoom: (roomId: string, password: string) => Promise<void>;
  disconnect: () => void;

  submitProposal: (text: string) => void;
  revokeProposal: () => void;
  clearPool: () => void;
  /** 房主生成完一回合后调用：广播整页+状态供客户端镜像。 */
  sendRound: (payload: RoundPayload) => void;
}

// 客户端实例存模块级，不进 store 状态（不可序列化）。
let client: OnlineClient | null = null;
let joinSeed = 0;

export const useOnlineStore = create<OnlineState>()(
  persist(
    (set, get) => {
      const myId = () => client?.userId ?? '';

      const setStatus = (text: string) => set({ statusText: text });

      const log = (type: 'info' | 'error', msg: string) =>
        pushLog(type, `[联机] ${msg}`, 'system');

      const replacePool = (pool: PendingInput[]) => {
        const rec: Record<string, PendingInput> = {};
        for (const p of pool) rec[p.userId] = p;
        set({ pendingInputs: rec });
      };

      /** 房主权威广播：当前成员列表 + 输入池。客户端据此镜像。 */
      const broadcastState = () => {
        if (!get().isHost || !client) return;
        client.broadcast('sync_user_state', {
          users: get().users,
          pool: Object.values(get().pendingInputs),
        });
      };

      const applyRound = (payload: RoundPayload) => {
        if (!payload?.page) return;
        // 整页镜像：appendPage 内嵌全部派生快照；statData / 角色卡整体替换。
        useBookStore.getState().appendPage(payload.page as BookPage);
        useBookStore.getState().autoFlipForward();
        if (payload.statData && typeof payload.statData === 'object') {
          useVariableStore.getState().setStatData(payload.statData);
        }
        if (payload.sheet && typeof payload.sheet === 'object') {
          useCharSheetStore.getState().setSheet(payload.sheet as CharacterSheet);
        }
      };

      const applySnapshot = (snap: SnapshotPayload) => {
        if (Array.isArray(snap?.pages)) useBookStore.getState().setPages(snap.pages as BookPage[]);
        if (snap?.statData && typeof snap.statData === 'object') useVariableStore.getState().setStatData(snap.statData);
        if (snap?.sheet && typeof snap.sheet === 'object') useCharSheetStore.getState().setSheet(snap.sheet as CharacterSheet);
        log('info', '已同步房主当前进度');
      };

      const handleMessage = (msg: Envelope) => {
        const me = myId();
        if (msg.from === me) return; // 忽略自己的回声

        switch (msg.type) {
          case 'join': {
            // 房主维护成员列表并广播；新成员会自行 request_snapshot。
            if (get().isHost) {
              const exists = get().users.some((u) => u.id === msg.from);
              if (!exists) {
                set({ users: [...get().users, { id: msg.from, name: msg.fromName || '匿名', isHost: false, joinOrder: ++joinSeed }] });
              }
              broadcastState();
              log('info', `${msg.fromName || '玩家'} 加入了房间`);
            }
            break;
          }
          case 'leave': {
            const leaving = get().users.find((u) => u.id === msg.from);
            const remaining = get().users.filter((u) => u.id !== msg.from);
            const pool = { ...get().pendingInputs };
            delete pool[msg.from];
            set({ users: remaining, pendingInputs: pool });
            if (leaving?.isHost) {
              // 房主离开：各端确定性选举（pickNextHost），被选中者接管并广播。
              const next = pickNextHost(remaining);
              if (next && next.id === me) {
                set({ isHost: true, mode: 'host', users: remaining.map((u) => ({ ...u, isHost: u.id === me })) });
                log('info', '房主已离开，你成为新房主');
                client?.broadcast('host_change', { hostId: me });
                broadcastState();
              }
            } else if (get().isHost) {
              broadcastState();
            }
            break;
          }
          case 'sync_user_state': {
            if (get().isHost) break; // 房主是权威，不被覆盖
            const d = msg.data as { users?: OnlineUser[]; pool?: PendingInput[] };
            if (Array.isArray(d?.users)) set({ users: d.users });
            if (Array.isArray(d?.pool)) replacePool(d.pool);
            break;
          }
          case 'host_change': {
            const d = msg.data as { hostId?: string };
            const amHost = d?.hostId === me;
            set({
              isHost: amHost,
              mode: amHost ? 'host' : 'client',
              users: get().users.map((u) => ({ ...u, isHost: u.id === d?.hostId })),
            });
            if (amHost) { log('info', '你已成为新房主'); broadcastState(); }
            break;
          }
          case 'user_input': {
            if (!get().isHost) break;
            const d = msg.data as { content?: string };
            const content = (d?.content ?? '').toString();
            if (!content.trim()) break;
            set({
              pendingInputs: {
                ...get().pendingInputs,
                [msg.from]: { userId: msg.from, userName: msg.fromName || '匿名', content, submittedAt: msg.timestamp || Date.now() },
              },
            });
            broadcastState();
            break;
          }
          case 'revoke_input': {
            if (!get().isHost) break;
            const pool = { ...get().pendingInputs };
            delete pool[msg.from];
            set({ pendingInputs: pool });
            broadcastState();
            break;
          }
          case 'reset_input': {
            if (!get().isHost) set({ pendingInputs: {} });
            break;
          }
          case 'host_round': {
            if (!get().isHost) applyRound(msg.data as RoundPayload);
            break;
          }
          case 'request_snapshot': {
            if (get().isHost && client) {
              client.send('snapshot', {
                targetId: msg.from,
                pages: useBookStore.getState().pages,
                statData: useVariableStore.getState().statData,
                sheet: useCharSheetStore.getState().sheet,
              });
            }
            break;
          }
          case 'snapshot': {
            const d = msg.data as SnapshotPayload & { targetId?: string };
            if (!get().isHost && d?.targetId === me) applySnapshot(d);
            break;
          }
        }
      };

      const wireClient = (assumeHost: boolean): OnlineClient => {
        client?.disconnect();
        client = new OnlineClient();
        client.userId = `${(get().userName || 'u').trim()}_${generateId()}`;
        client.userName = (get().userName || '匿名').trim() || '匿名';
        client.isHost = assumeHost;
        client.init({
          onConnectionChange: (connected) => {
            set({ isConnected: connected });
            if (!connected) {
              setStatus('已断开');
              set({ mode: 'disconnected', isHost: false, users: [], pendingInputs: {}, currentRoomId: '' });
            }
          },
          onError: (m) => { log('error', m); setStatus(m); },
          onMessage: handleMessage,
        });
        return client;
      };

      return {
        // persisted
        serverUrl: DEFAULT_SERVER,
        userName: '',
        // runtime
        isConnected: false,
        isHost: false,
        mode: 'disconnected',
        currentRoomId: '',
        users: [],
        pendingInputs: {},
        statusText: '未连接',

        setServerUrl: (v) => set({ serverUrl: (v || '').trim() }),
        setUserName: (v) => set({ userName: (v || '').trim() }),

        createRoom: async (name, password, maxUsers) => {
          const base = get().serverUrl || DEFAULT_SERVER;
          const creatorName = (get().userName || '匿名').trim() || '匿名';
          setStatus('正在创建房间…');
          const room = await RoomApiService.createRoom(base, { name, password: password || undefined, maxUsers: maxUsers || 8, creatorName });
          const c = wireClient(true);
          const wsUrl = await RoomApiService.verifyAndJoin(base, room.id, password || '');
          await c.connect(wsUrl);
          joinSeed = 0;
          set({
            mode: 'host',
            isHost: true,
            currentRoomId: room.id,
            users: [{ id: c.userId, name: creatorName, isHost: true, joinOrder: ++joinSeed }],
            pendingInputs: {},
          });
          setStatus(`房间已创建（房主）`);
          log('info', `房间「${name}」已创建，你是房主`);
        },

        joinRoom: async (roomId, password) => {
          const base = get().serverUrl || DEFAULT_SERVER;
          setStatus('正在加入房间…');
          const c = wireClient(false);
          const wsUrl = await RoomApiService.verifyAndJoin(base, roomId, password || '');
          await c.connect(wsUrl);
          set({ mode: 'client', isHost: false, currentRoomId: roomId, pendingInputs: {} });
          setStatus('已加入房间（客户端）');
          log('info', '已加入房间，正在同步房主进度…');
          // 向房主拉全量快照追平当前进度
          c.send('request_snapshot', {});
        },

        disconnect: () => {
          if (client && get().isConnected) {
            client.broadcast('leave', {});
          }
          client?.disconnect();
          client = null;
          set({ isConnected: false, isHost: false, mode: 'disconnected', currentRoomId: '', users: [], pendingInputs: {}, statusText: '已断开' });
        },

        submitProposal: (text) => {
          const content = (text || '').trim();
          if (!content || !client) return;
          const me = client.userId;
          if (get().isHost) {
            set({ pendingInputs: { ...get().pendingInputs, [me]: { userId: me, userName: client.userName, content, submittedAt: Date.now() } } });
            broadcastState();
          } else {
            client.send('user_input', { content });
            // 乐观本地反馈
            set({ pendingInputs: { ...get().pendingInputs, [me]: { userId: me, userName: client.userName, content, submittedAt: Date.now() } } });
          }
        },

        revokeProposal: () => {
          if (!client) return;
          const me = client.userId;
          const pool = { ...get().pendingInputs };
          delete pool[me];
          set({ pendingInputs: pool });
          if (get().isHost) broadcastState();
          else client.send('revoke_input', {});
        },

        clearPool: () => {
          if (!get().isHost) return;
          set({ pendingInputs: {} });
          client?.broadcast('reset_input', {});
          broadcastState();
        },

        sendRound: (payload) => {
          if (!get().isHost || !client) return;
          client.broadcast('host_round', payload);
        },
      };
    },
    {
      name: 'coc_online_v1',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions({ serverUrl: state.serverUrl, userName: state.userName }) as OnlinePersisted,
    },
  ),
);

/** 便捷：客户端只读态（已连接且非房主）。 */
export const selectIsClientMirror = (s: OnlineState): boolean => s.isConnected && !s.isHost;

/** 房主合并输入池为生成文本（供面板「发送本轮」调用，pipeline 实际生成）。 */
export function buildCombinedProposalText(): string {
  return combinePoolToText(Object.values(useOnlineStore.getState().pendingInputs));
}

export { defaultSheet };
