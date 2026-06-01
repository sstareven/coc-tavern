# 联机中继服务器（自建）

深渊档案馆的多人联机是「房主镜像」架构：只有房主本地跑 AI 生成，整页+状态广播给全员镜像。
这个中继**只做哑转发**——它不理解内容、不存档、不跑 AI，只负责把房间内一名成员发的消息转发给其他成员。

## 启动

```bash
npm install        # 已含 ws 依赖
npm run relay      # 默认监听 http://0.0.0.0:8787
PORT=9000 npm run relay   # 自定义端口
```

启动后在应用「魔杖 → 🌐 联机」面板里，把**服务器地址**填成：

- 同机两个标签测试：`http://localhost:8787`
- 局域网联机：`http://<房主电脑的局域网IP>:8787`（如 `http://192.168.1.20:8787`）

## 协议（与 `src/online/online-client.ts` 对齐）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/rooms` | 房间列表 |
| POST | `/rooms` | `{name,password?,maxUsers?}` → `{id}` |
| POST | `/rooms/:id/join` | `{password}` 校验 → 200 / 403 / 404 |
| WS | `/ws/room/:id` | 房间广播：`ping` 回 `pong`；其余转发给同房间其他成员；断开合成 `leave` |

房间是纯内存的，最后一人离开即销毁。

## 跨网 / 线上注意（混合内容）

浏览器**禁止 https 页面连 ws:// 明文中继**。所以：

- **本地开发**（`http://localhost:5173`）→ 可直连 `ws://localhost:8787`，无障碍。
- **线上部署的应用**（如 Vercel 的 https 页面）→ 中继必须是 **wss://（https）**。最简单两种：
  - 用 [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) 隧道：`cloudflared tunnel --url http://localhost:8787`，它给你一个 https 域名，填进面板即可。
  - 把 `server/relay.js` 部署到任意能提供 https 的 Node 主机（Render 免费 Web 服务等），用它的 https 域名。

## 限制

- 哑转发：不鉴权 WS（密码只在 REST join 时校验）、不持久化、不防滥用。仅供朋友间小范围联机。
- 故事正文与状态经此中继转发——自建在你自己掌控的机器上即可，不经第三方。
