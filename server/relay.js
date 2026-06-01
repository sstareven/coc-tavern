// ===== 深渊档案馆 · 极简联机中继（哑转发，房主镜像架构用） =====
// 协议对齐 src/online/online-client.ts：
//   GET  /rooms             → { rooms: [{id,name,hasPassword,maxUsers,currentUsers}] }
//   POST /rooms             {name,password?,maxUsers?} → { id, name }
//   POST /rooms/:id/join    {password} → 200 {ok} | 403/404 {error}
//   WS   /ws/room/:id        每条 {type,data,from,fromName,timestamp}，转发给同房间其他成员
//
// 运行：node server/relay.js   （默认端口 8787，可用环境变量 PORT 覆盖）
// 客户端「联机面板 · 服务器地址」填 http://<本机或局域网IP>:8787 即可。
//
// 注意（混合内容）：用 https 部署的网页(如 Vercel)无法连 ws:// 明文中继——
// 浏览器会拦截。本地 http://localhost 开发可直接用；线上需把中继放到 https/wss
// 之后（反向代理 / cloudflared 隧道 / 提供 https 的免费 host）。

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8787;

/** roomId -> { id, name, password, maxUsers, sockets:Set<ws> } */
const rooms = new Map();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Title',
};

const sendJson = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(obj));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });

const broadcast = (room, text, except) => {
  for (const peer of room.sockets) {
    if (peer !== except && peer.readyState === 1) {
      try { peer.send(text); } catch { /* noop */ }
    }
  }
};

// ── REST ──
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && path === '/rooms') {
    const list = [...rooms.values()].map((r) => ({
      id: r.id, name: r.name, hasPassword: !!r.password, maxUsers: r.maxUsers, currentUsers: r.sockets.size,
    }));
    return sendJson(res, 200, { rooms: list });
  }

  if (req.method === 'POST' && path === '/rooms') {
    const body = await readBody(req);
    const name = (body.name || '').toString().trim();
    if (!name) return sendJson(res, 400, { error: '房间名不能为空' });
    const id = randomUUID().slice(0, 8);
    rooms.set(id, {
      id, name,
      password: (body.password || '').toString(),
      maxUsers: Math.max(2, Math.min(50, parseInt(body.maxUsers, 10) || 8)),
      sockets: new Set(),
    });
    console.log(`[relay] 房间已创建 ${id} 「${name}」`);
    return sendJson(res, 200, { id, name });
  }

  const joinMatch = path.match(/^\/rooms\/([^/]+)\/join$/);
  if (req.method === 'POST' && joinMatch) {
    const room = rooms.get(joinMatch[1]);
    if (!room) return sendJson(res, 404, { error: '房间不存在或已关闭' });
    const body = await readBody(req);
    if (room.password && (body.password || '').toString() !== room.password) {
      return sendJson(res, 403, { error: '房间密码错误' });
    }
    if (room.sockets.size >= room.maxUsers) return sendJson(res, 403, { error: '房间已满' });
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && path === '/') return sendJson(res, 200, { ok: true, service: 'abyss-relay', rooms: rooms.size });

  sendJson(res, 404, { error: 'not found' });
});

// ── WebSocket（房间广播） ──
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const m = url.pathname.match(/^\/ws\/room\/([^/]+)$/);
  const room = m && rooms.get(m[1]);
  if (!room) { socket.destroy(); return; }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.roomId = room.id;
    ws.userId = '';
    ws.userName = '';
    room.sockets.add(ws);

    ws.on('message', (raw) => {
      const text = raw.toString();
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;

      // 记住该连接的身份（首条 join 起），供断线时合成 leave。
      if (msg.from) { ws.userId = String(msg.from); ws.userName = msg.fromName || ws.userName; }

      // 心跳：直接回 pong 给发送者，不广播。
      if (msg.type === 'ping') {
        try { ws.send(JSON.stringify({ type: 'pong', data: {}, from: 'server', fromName: 'server', timestamp: Date.now() })); } catch { /* noop */ }
        return;
      }

      // 其余消息：转发给同房间其他成员。
      broadcast(room, text, ws);
    });

    ws.on('close', () => {
      room.sockets.delete(ws);
      // 合成 leave（覆盖关标签页等非优雅断开），供房主迁移 / 成员列表更新。
      if (ws.userId) {
        broadcast(room, JSON.stringify({ type: 'leave', data: {}, from: ws.userId, fromName: ws.userName, timestamp: Date.now() }), null);
      }
      if (room.sockets.size === 0) {
        rooms.delete(room.id);
        console.log(`[relay] 房间已清空并删除 ${room.id}`);
      }
    });

    ws.on('error', () => { try { ws.close(); } catch { /* noop */ } });
  });
});

server.listen(PORT, () => {
  console.log(`[relay] 联机中继已启动：http://0.0.0.0:${PORT}`);
  console.log(`[relay] 局域网联机：把「服务器地址」填成 http://<本机IP>:${PORT}`);
});
