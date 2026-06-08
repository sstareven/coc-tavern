# 文生图（左页插画）配置指南

> v1.15.0 上线左页插画；v1.15.1 接入 NovelAI 官方 API + 重构生图设置 UI。
>
> 本文面向已经入坑的玩家与希望接入新协议的开发者。基础概念请先看 [README.md](../README.md)。

---

## 目录

- [它能做什么](#它能做什么)
- [在哪里配置](#在哪里配置)
- [协议模式总览](#协议模式总览)
- [按服务商配置步骤](#按服务商配置步骤)
  - [DeepSeek / OpenAI 中转（chat-completions 假流式）](#deepseek--openai-中转chat-completions-假流式)
  - [OpenAI 官方 / DALL-E 3 / gpt-image-1](#openai-官方--dall-e-3--gpt-image-1)
  - [自建 Stable Diffusion WebUI](#自建-stable-diffusion-webui)
  - [NovelAI 官方插画](#novelai-官方插画)
  - [Pollinations](#pollinations)
- [生成参数与风格](#生成参数与风格)
- [存储与限速](#存储与限速)
- [prompt 模板按模型条件分支（EJS）](#prompt-模板按模型条件分支ejs)
- [extraParams 进阶](#extraparams-进阶)
- [失败时怎么办](#失败时怎么办)
- [已知限制](#已知限制)

---

## 它能做什么

打开「设置 → API 管理 → 图像生成 API → 总开关」后，每次主回合写入新页都会**自动 fire-and-forget 调用图像 API**，在左页顶部生成一张 834×227（默认）的复古风插画。

- **不阻塞剧情**：插画失败/未配齐时左页正文照常显示，不会卡住翻页。
- **进度可见**：生成中底部一条金色流光进度条 + 阶段标签（准备中 / 排队中 / 连接 API / 生成中 / 解析响应 / 写入存储 / 降级重试）。
- **可手动重生成**：左页 banner 右上角铜版风按钮一键重试，失败的图也能重生。
- **可关闭**：总开关关闭后已生成的图保留、不再触发新调用。
- **剧本独立覆盖**：剧本编辑器的「生图」标签可单独定义本剧本的画风/prompt/尺寸，留空字段沿用全局基线。

---

## 在哪里配置

主界面点最下方「设置」→ 顶部 Tab 切到「**API 管理**」→ 滚到底部「**图像生成 API**」分类。

打开「总开关」后展开四个子组：

| 子组 | 包含项 |
|---|---|
| **基础** | 模型选择 / 协议模式 / 自动生成开关 |
| **存储与限速** | 存储方式 / 单张图最大字节 / 图像 RPM |
| **生成参数** | NovelAI 推荐尺寸预设（仅 novelai） / 默认宽 / 默认高 / 采样步数 / CFG 强度 / 采样器 |
| **风格** | 默认风格预设 / 负面 prompt |

每个项右侧的「?」问号悬停可看完整说明（超长内容自动可滚）。

---

## 协议模式总览

> 不同后端对 OpenAI 兼容 `/v1/images/generations` 协议的字段集要求差异巨大，所以分多种 payload 模式。

| 模式 | 端点 | body 字段集 | 响应格式 | 适用场景 |
|---|---|---|---|---|
| **auto** | 按 URL/model 启发式选 | 同选中的子模式 | 同子模式 | 默认推荐，首次 4xx 自动降级 openai-strict 重试 |
| **openai-strict** | `/v1/images/generations` | `model/prompt/size/n/response_format` | JSON `data[0].b64_json` 或 `url` | OpenAI 官方、DALL-E 3 |
| **gpt-image-1** | `/v1/images/generations` | 同上但剥 `response_format` | JSON `data[0].b64_json` | GPT-image-1（不接受显式 response_format） |
| **sd-compat** | `/v1/images/generations` | + `negative_prompt/steps/cfg_scale/sampler/seed`，保留自由尺寸 | JSON `data[0].b64_json` | 自建 SD WebUI / SD 透传中转 |
| **chat-completions** | `/v1/chat/completions` | `messages=[{role:user,content:prompt}]` | content 含 markdown `![](url 或 dataURL)` | nano-banana / gemini-pro-image / 假流式中转 |
| **pollinations** | `/v1/images/generations` | 同 openai-strict | 同上 | Pollinations |
| **novelai** | `/ai/generate-image` | `{input, model, action, parameters{...}}` 嵌套 | application/zip 内含 PNG | NovelAI 官方 |

**auto 探测的优先级**：
1. model 含 `nano-banana` / `假流式` / `gemini+image` → `chat-completions`
2. URL 含 `openai.com` 或 model 是 `dall-e*` → `openai-strict`
3. model 是 `gpt-image*` → `gpt-image-1`
4. URL 含 `pollinations` → `pollinations`
5. 其他 → `sd-compat`

**novelai 不进 auto**：端点完全异质（不是 `/v1/...`），必须显式选。

---

## 按服务商配置步骤

### DeepSeek / OpenAI 中转（chat-completions 假流式）

很多国内中转把 nano-banana / gemini-3-pro-image 这类多模态模型包装成 `/v1/chat/completions` 端点，让你用一套 OpenAI Key 调出图。

1. 在「API 管理 → 已保存配置」里加一条 profile：
   - **地址**：中转站给你的 OpenAI 兼容 base URL（如 `https://your-relay.example.com`）
   - **API Key**：中转站给你的 sk-xxx
2. 滚到「图像生成 API」，打开总开关：
   - **模型**：选 `nano-banana` / `gemini-3-pro-image` / `gemini-2.5-flash-image` / 中转支持的具体模型名
   - **协议模式**：选 `auto`（会自动识别为 `chat-completions`）或显式选 `chat-completions`
3. 创建/翻页即可看到插画。

> 这类网关最常见的失败是「200 但提不出图」—— v1.14.x 修了 `message.images` 数组、`message.attachments`、SSE 流式、裸 markdown 链接等多种形态。如仍提不出图，查 F12 日志「文生图」分类，里面会打印 `message=[...]` 字段清单帮你定位图落在哪个字段。

---

### OpenAI 官方 / DALL-E 3 / gpt-image-1

1. profile 配 OpenAI 官方：
   - **地址**：`https://api.openai.com/v1`
   - **API Key**：sk-xxx
2. 图像生成 API：
   - **模型**：`dall-e-3` 或 `gpt-image-1`
   - **协议模式**：`auto`（自动选 `openai-strict` 或 `gpt-image-1`）
3. 注意：
   - OpenAI 系强制走 1024×1024 / 1792×1024 / 1024×1792 三档之一，本项目的默认宽高（832×224 横幅）会被自动映射到 `1792×1024`。
   - DALL-E 3 会回吐 `revised_prompt`（OpenAI 改写过的 prompt），UI 会显示在 banner 中。
   - 不读 negative_prompt / steps / cfg_scale / sampler，这些字段在 openai-strict 模式下不发。

---

### 自建 Stable Diffusion WebUI

如果你本机跑 AUTOMATIC1111 / SD.Next / ComfyUI 并开了 OpenAI 兼容透传插件：

1. profile 配本地端点：
   - **地址**：`http://127.0.0.1:7860/v1`（或你的端口）
   - **API Key**：随便填（本地通常不校验）
2. 图像生成 API：
   - **模型**：你 SD 里加载的 checkpoint 名
   - **协议模式**：`sd-compat`（保留 SD 五件套 + 自由尺寸）
3. 调采样步数 / CFG / 采样器 / 默认风格，都会原样发给 SD 后端。

---

### NovelAI 官方插画

> v1.15.1 新增。NovelAI 是订阅制日系插画 API，画风偏 anime / 浮世绘，订阅 Opus 档每月送 1000 Anlas + 满足条件可无限免费生成。

1. **拿 Persistent API Token**：
   - 登录 [novelai.net](https://novelai.net)
   - 右上角头像 → Account → 拉到底 → 「Get Persistent API Token」按钮
   - 复制 `pst-xxx` 开头的 Token（30 天有效，可以重新生成）
2. profile 配 NovelAI：
   - **地址**：`https://image.novelai.net`（**不带 `/v1/`**）
   - **第三方 NovelAI 中转裸域**（地址里既不含 `novelai` 子串、也不含 `/ai/generate-image` 端点路径）：在地址末尾**手动补上 `/ai/generate-image`** 即可被自动识别为 NovelAI,也能避免 engine 端点拼接出现重复路径
   - **API Key**：粘贴 pst-xxx
3. 图像生成 API：
   - **模型**：手填 `nai-diffusion-4-5-full`（推荐）/ `nai-diffusion-4-5-curated` / `nai-diffusion-4-full` / `nai-diffusion-3` / `nai-diffusion-furry-3`
     - NovelAI 没有 `/v1/models` 端点，连接测试会失败但**不影响实际生图**
   - **协议模式**：显式选 `novelai`（不会被 auto 探测命中）
   - **NovelAI 预设**：点「纵向 832×1216」一键应用官方 portrait 推荐尺寸
   - **图像 RPM**：建议设 1（NovelAI 自 2024-03 起禁止并发，并行请求会被立刻 429）
   - **单张图最大字节**：NovelAI 832×1216 PNG 约 1-2.5 MB，建议保持 2 MB 或上调到 3 MB

#### Opus 免费档条件

必须**全部**满足才走免费配额，**任一条不满足**会按 Anlas 计费：

- 分辨率 ≤ 1024×1024（总像素 ≤ 1,048,576）
- 步数 ≤ 28
- n_samples = 1（本项目强制）
- action = generate（不带 base image）
- 不开 SMEA（本项目默认 `sm=false`）

#### CORS 与代理

NovelAI 不下发 `Access-Control-Allow-Origin`，浏览器直连必撞跨域。两种解决方案：

- **A 用支持 NovelAI 透传的中转站**：地址改成中转站给的别名，API Key 改成中转站 Key，但 body 必须保持 NovelAI 的 `{input, model, action, parameters}` 嵌套结构 —— 中转站要不动透传。
- **B 自建 Cloudflare Worker 代理**：在 Worker 里把 `https://your-worker.workers.dev/ai/generate-image` 转发到 `https://image.novelai.net/ai/generate-image`，透传 Headers + 二进制 Body。配置地址填 `https://your-worker.workers.dev`。

> 本项目本身的代码不能解决 CORS（纯前端 SPA 部署在 Vercel），跨域问题必须靠代理解决。

#### NovelAI 故障码 → 中文提示

调用失败时，错误日志的 `recoveryHint` 字段会自动按状态码给中文提示：

| 状态码 | 提示 |
|---|---|
| 401 | NovelAI Token 无效或过期 — 重新获取 Persistent API Token |
| 402 | Anlas 余额不足或订阅不覆盖 — 缩小尺寸到 1024 以内、步数 ≤ 28、n_samples=1 走 Opus 免费档 |
| 429 | NovelAI 已禁用并发 — 等 30s 后重试，或图像 RPM 下调到 1 |
| 5xx | 服务端错 — 查 https://status.novelai.net/ |

---

### Pollinations

Pollinations.ai 是免费免登录的图像 API。

1. profile：
   - **地址**：`https://image.pollinations.ai`
   - **API Key**：随便填
2. 协议模式选 `pollinations`（MVP 同 openai-strict POST 行为）。
3. 模型随意（Pollinations 内部自适配）。

---

## 生成参数与风格

| 参数 | 默认 | 说明 |
|---|---|---|
| **默认宽** | 832 px | SD 友好 8 倍数。NovelAI 模式自动 round 到 64 倍数。 |
| **默认高** | 224 px | 默认横幅比例，左页顶部自适应填满。NovelAI 模式建议改 832×1216 portrait。 |
| **采样步数** | 24 | 去噪步数；20-30 常用。NovelAI Opus 免费档上限 28。 |
| **CFG 强度** | 5 | prompt 引导强度；小=自然，大=贴合 prompt。DALL-E 不读此值。 |
| **采样器** | DPM++ 2M Karras | SD 主流。NovelAI 模式会自动映射到 `k_*` 系列（Euler a → k_euler_ancestral 等）。 |

**风格预设**（10 种）：

`vintage_photo` 复古胶片（默认）/ `oil_painting` 油画 / `ink_wash` 水墨 / `watercolor` 水彩 / `engraving` 铜版画 / `cinematic` 电影摄影 / `sepia_film` 怀旧棕调 / `photoreal` 写实 / `anime` 动漫 / `custom` 自定义

每种风格对应一段英文 SD prompt 片段（SD/NovelAI 对英文响应远好于中文），插入到生成 prompt 的开头。

**负面 prompt**：默认含 lowres / blurry / watermark / extra fingers / bad anatomy 等常见瑕疵关键词。剧本编辑器可在此基础上追加更多。

---

## 存储与限速

| 项 | 默认 | 说明 |
|---|---|---|
| **存储方式** | 本地 blob | `本地 blob` = 存 IndexedDB（断网仍可看，30 页约 6 MB）；`远程 URL` = 直接存中转返回的 https URL（体积 0 但可能 7 天过期失效） |
| **单张图最大字节** | 2 MB | 本地 blob 模式下超过此尺寸跳过保存，防 IndexedDB 单 row 膨胀；超限时日志会精确告诉你"调到 X MB 以上" |
| **图像 RPM** | 0 不限 | 每分钟最多请求数（独立桶，不与主/MVU/补写共享）。DALL-E 3 约 5-15 RPM；SD-WebUI 本地无限制；NovelAI 自 2024-03 禁并发，建议设 1 |

---

## prompt 模板按模型条件分支（EJS）

剧本编辑器的「prompt 模板」字段（也就是 `imageDefaults.promptTemplate` 与 `scenarioDoc.imageGen.promptTemplate`）除了支持旧的 `{{key}}` 占位符,从 v1.15.x 起也支持 **EJS 条件块**,让玩家按图像模型分支:

**可用的条件变量**:

| 变量 | 类型 | 含义 |
|---|---|---|
| `protocol` | string | 实际生效的协议(auto 探测后),`'novelai'` / `'sd-compat'` / `'openai-strict'` / `'gpt-image-1'` / `'chat-completions'` / `'pollinations'` |
| `model` | string | 图像模型 ID(如 `'nai-diffusion-4-5-full'` / `'dall-e-3'` / 自建 SD checkpoint 名) |
| `isNovelAi` | boolean | `protocol === 'novelai'` |
| `isV4` | boolean | NovelAI V4/V4.5 系列(`model` 以 `nai-diffusion-4` 开头) |
| `isSd` | boolean | `protocol === 'sd-compat'` |
| `isOpenAi` | boolean | `'openai-strict'` 或 `'gpt-image-1'` |
| `isChatCompletions` | boolean | 假流式中转(`nano-banana` / `gemini-pro-image`) |

**可用的占位符变量**(同时可用于 `{{key}}` 和 `<%= key %>`):

`style` / `style_anchors` / `location` / `time` / `weather` / `characters` / `san` / `scene` / `scene_brief` / `image_hint`

`image_hint` 由 LLM 子调用产出 — 协议为 `novelai` / `sd-compat` / `openai-strict` / `gpt-image-1` / `pollinations` 时(英文 only 训练或英文效果更好),生图前会自动跑一次主 API 子调用把当页正文叙事转成英文 image prompt(NovelAI → Danbooru tag,其他 → 自然语言短句),让图片真正反映剧情。协议为 `chat-completions`(Gemini / nano-banana 假流式)时跳过(Gemini 系原生支持中文叙事)。失败时回退空串。

**EJS 语法**(子集):

```
<% if (...) { %> ... <% } %>     条件块,块内文本按条件输出
<%= expr %>                       输出表达式结果(字符串)
{{key}}                           旧占位符(向后兼容)
```

**实例**:

按 NovelAI / SD / 通用走不同风格 prompt:

```
<% if (isNovelAi) { %>
  {{characters}}, anime style, {{location}}, masterpiece, very aesthetic, absurdres
<% } else if (isOpenAi) { %>
  A detailed scene of {{characters}} in {{location}} at {{time}}, cinematic, dramatic lighting
<% } else { %>
  {{characters}}, {{location}}, {{time}}, {{style}}, {{style_anchors}}, masterpiece, best quality
<% } %>
```

NovelAI V4 与 V3 出不同的质量 tag:

```
{{characters}}, {{location}}, {{style}},
<% if (isV4) { %> very aesthetic, absurdres <% } else { %> best quality, amazing quality <% } %>
```

字段空时不输出空逗号占位:

```
<% if (characters) { %>{{characters}}, <% } %>
<% if (location) { %>{{location}}, <% } %>
{{style}}
```

**注意**:
- EJS 编译/执行失败会自动 fallback 到只做 `{{key}}` 替换,模板写错不会让生图崩溃
- 默认 NovelAI 模板(玩家没改 `promptTemplate` 时)已经用 EJS 条件按 V4/V3 自动分支
- 模板里别写 `setvar`/`getvar`/`getwi` 之类的 MVU API — image prompt 模板的 EJS 上下文只暴露上面表里的变量,与世界书/主回合的 EJS 引擎是独立的

---

## extraParams 进阶

profile 编辑模态里的「**额外参数**」字段（textarea），支持每行一条规则，往请求 body 里 + 字段 / - 字段。

**通用语法**：

```
+ seed 42                     # 添加或覆盖（自动识别数字/布尔/JSON）
+ stream_options.include_usage true   # 点号嵌套
- top_p                       # 移除字段
# 这是注释
```

**NovelAI 嵌套字段**（NovelAI body 走 `parameters` 子对象）：

```
+ parameters.sm true                # 开 SMEA（会扣 Anlas）
+ parameters.sm_dyn true            # 开 SMEA Dynamic
+ parameters.cfg_rescale 0.2        # V4 Variety+
+ parameters.skip_cfg_above_sigma 19  # V4 Variety+
+ parameters.seed 12345             # 固定 seed(默认每次随机 [1, 2^32-8])
- parameters.qualityToggle          # 关质量 toggle
+ parameters.noise_schedule "karras"  # 噪声调度
```

**SD-WebUI 常用扩展**：

```
+ override_settings.sd_model_checkpoint "anything-v5-pruned"
+ alwayson_scripts.controlnet.args.0.module "canny"
+ hr_upscaler "R-ESRGAN 4x+"
+ enable_hr true
```

---

## 失败时怎么办

### 第一步：看 F12 日志

按 F12 打开浏览器开发者工具 → Console → 注意带「**[文生图]**」前缀的日志，或在 UI 顶栏「日志」面板筛 `image-gen` 分类。

每次生成失败会打印：
- HTTP 状态码 + `mode=xxx` + body 字段清单
- `recoveryHint`（中文修复提示，按错误码定制）
- 响应前 1500 字符（帮你判断网关返回的是啥）

### 第二步：按错误对症

| 现象 | 原因 | 修复 |
|---|---|---|
| HTTP 400 `invalid_request_error` | 字段不被网关接受，或 size 不在允许枚举 | 协议模式切到 `openai-strict` 或 `gpt-image-1` |
| HTTP 200 但提不出图 | chat-completions 中转图字段不在已知位置 | 看日志 `message=[...]` 提示，截图反馈作者补一种形态识别 |
| HTTP 401 / 403 | API Key 失效 / 权限不足 | 重新生成 Key（NovelAI 走 Persistent API Token 入口） |
| HTTP 402（NovelAI） | Anlas 余额不足或超 Opus 免费档 | 缩小尺寸 ≤ 1024² + 步数 ≤ 28 + n_samples=1 |
| HTTP 429 | 速率限制 / 并发限制 | 把图像 RPM 下调（NovelAI 设 1） |
| `JSON 解析失败` | 网关返回 SSE 而非 JSON（chat-completions 类） | 切到 `chat-completions` 模式 |
| `NovelAI ZIP 解析失败` | v5 模型协议变更或网关篡改响应 | 切回 `nai-diffusion-3` 或检查中转是否在透传二进制 |
| 失败一次后自动重试也失败 | auto 探测命中 4xx 已降级 openai-strict 仍失败 | 显式选具体协议模式（不要 auto） |

### 第三步：手动重生成

左页 banner 右上角铜版风按钮即可重试，会按当前最新的 profile + 协议模式重新调用一次。失败状态的页也能重生。

---

## 已知限制

- **左页插画自 v1.15.0 起才可用**：老存档需翻新页才会有图，老页面是空的（无背景兼容迁移）。
- **NovelAI 必须经代理**：纯前端无法解决跨域，必须用支持透传的中转或自建 Cloudflare Worker。
- **NovelAI Token 极敏感**：Persistent API Token 30 天有效但泄露可直接烧光订阅 Anlas，建议定期到 NovelAI 后台 revoke。
- **ZIP 解析器是手写的**：仅支持 `store` (method=0) 与 `deflate` (method=8) 两种压缩；ZIP64 / 加密 / 多 disk 不支持。NovelAI 实测不会触发但若 v5 改格式会全员失败，届时会推 hotfix。
- **n_samples 强制 1**：NovelAI 模式下批量生成需用 extraParams `+ parameters.n_samples 4` 覆写，但会扣 Anlas（即使在 Opus 免费档下）。
- **采样器映射是 best-effort**：NovelAI 模式下选 `UniPC` / `LMS` 等 SD 独有 sampler，会映射到 NovelAI 默认 `k_euler_ancestral`，质量可能与预期不一致。

---

## 想接入新协议？

如果你想加一个新的图像协议（如 Replicate、Civitai、Midjourney 中转等），改动集中在三个文件：

1. `src/api/image-gen-engine.ts`：在 `ImagePayloadMode` 联合加新值，`buildBody` 加新分支构造 body，`callImageApi` 视响应格式加 short-circuit。
2. `src/components/Settings/ImageApiSection.tsx`：`PayloadModeRow` 的 `options` 数组加新条 `BrassSelectOption`，附 brief 一句话特征。
3. `src/api/image-gen-novelai.ts` 是独立适配器的范本：sampler 映射 / 端点常量 / body 构造 / 响应解析 / recoveryHint 全在一个文件里，可以照抄出 `image-gen-xxx.ts`。

`ImagePayloadMode` 类型从 engine 单点 export，store 与 UI 走 `import type` 引用，加新值不用四处改。
