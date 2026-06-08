// NovelAI 官方图像 API 适配器(2026-06-08):
// 走专有端点 https://image.novelai.net/ai/generate-image,
// body 走 {input, model, action, parameters} 嵌套结构,响应是 application/x-zip-compressed 的 ZIP 内含 PNG。
//
// 与 OpenAI 兼容协议完全异质 — 单独成文件以解耦合(decoupling-modularity-required):
// - buildNovelAiBody:从 CallImageApi 通用入参构造 NovelAI body(含 SD sampler 字符串映射 + 64 倍数 round)
// - extractFirstPngFromZip + inflateRaw:无新增 deps(jszip 80KB 不值得引入)
//   用浏览器原生 DecompressionStream('deflate-raw') + 手解 ZIP local file header
// - uint8ToBase64:分块 String.fromCharCode 避免 1-2MB PNG 触发 RangeError
// - novelAiRecoveryHint:HTTP 状态码 → 中文修复提示(401/402/429/5xx)
//
// 设计原则:
// - 默认参数走 Opus 免费档(尺寸 ≤ 1024²、steps ≤ 28、n_samples=1、不开 SMEA)
// - 高级参数(sm/sm_dyn/ucPreset/cfg_rescale/seed 等)走 extraParams 的 'parameters.xxx' 点号路径
// - 失败 ZIP 解析抛 Error → callImageApi 包成 ImageGenError 带 recoveryHint

/** NovelAI 默认端点(image 子域,不是 api 子域)。 */
export const NOVELAI_BASE_URL = 'https://image.novelai.net';

/** NovelAI 端点路径(POST,Bearer auth)。 */
export const NOVELAI_ENDPOINT_PATH = '/ai/generate-image';

/** 默认 model:V4.5 Full(官方主推,2026 在售)。 */
export const NOVELAI_DEFAULT_MODEL = 'nai-diffusion-4-5-full';

/** NovelAI 在售模型清单(无 /v1/models 端点,UI 可作为 fallback 候选)。
 *  NovelAI 出新模型时需要手动追加 — 本清单仅用于「保存 profile 时跳过远端探测」+
 *  UI 模型选择器的默认候选,不是协议层强约束。 */
export const NOVELAI_KNOWN_MODELS: ReadonlyArray<string> = [
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-5-curated',
  'nai-diffusion-4-full',
  'nai-diffusion-4-curated-preview',
  'nai-diffusion-3',
  'nai-diffusion-furry-3',
];

/** 判定 baseUrl 是否指向 NovelAI(含官方域 image.novelai.net 与所有 NovelAI 协议代理)。
 *  两种通用信号任一命中即识别为 NovelAI:
 *  1. URL 任意位置含 'novelai' 子串(覆盖官方域、子路径透传别名等)
 *  2. URL 路径含 '/ai/generate-image'(NovelAI 协议专有路径,业界无冲突,最强信号)
 *
 *  无识别特征的第三方中转裸域(无 novelai 子串、无端点路径)请在 baseUrl 末尾
 *  补 '/ai/generate-image' 后再保存 — 既能触发路径识别,也能让 engine 端点拼接幂等。
 *  全部小写比较,空值与非字符串安全返回 false。 */
export function isNovelAiBaseUrl(url: string): boolean {
  if (typeof url !== 'string' || !url) return false;
  const u = url.toLowerCase();
  if (u.includes('novelai')) return true;
  if (u.includes('/ai/generate-image')) return true;
  return false;
}

/** 返回 NovelAI 已知模型清单的可写副本(给 fetchModelList: Promise<string[]> 调用方填 availableModels)。 */
export function getNovelAiFallbackModels(): string[] {
  return [...NOVELAI_KNOWN_MODELS];
}

/** NovelAI 默认 sampler(免 Anlas 友好,适配 V4/V4.5)。 */
export const NOVELAI_DEFAULT_SAMPLER = 'k_euler_ancestral';

/** NovelAI 推荐默认尺寸(portrait,832×1216 ≈ 1MP)。 */
export const NOVELAI_DEFAULT_WIDTH = 832;
export const NOVELAI_DEFAULT_HEIGHT = 1216;

/** NovelAI seed 合法上界:2^32 - 8。
 *  后端字段声明 uint64 但实际接受 32 位无符号整数,且为 n_samples 最多 8 张
 *  的 batch(后续每张取 seed+i)留 +7 头部余量,避免 seed+7 溢出 uint32。 */
export const NOVELAI_SEED_MAX = 0xFFFFFFFF - 7;

/** 生成一个合法的 NovelAI seed:[1, NOVELAI_SEED_MAX] 区间的非负整数。
 *  每次调用现取,语义即"每次随机"。
 *  不引入 BigInt(2^32 远小于 Number.MAX_SAFE_INTEGER = 2^53-1,JSON 输出
 *  是普通整数字面量,后端 uint64 可吃)。 */
export function randomNovelAiSeed(): number {
  return Math.floor(Math.random() * NOVELAI_SEED_MAX) + 1;
}

/** SD 系 sampler 名 → NovelAI k_* sampler 字符串映射。 */
const NOVELAI_SAMPLER_MAP: Record<string, string> = {
  'DPM++ 2M Karras': 'k_dpmpp_2m',
  'DPM++ SDE Karras': 'k_dpmpp_sde',
  'DPM++ 2S Ancestral': 'k_dpmpp_2s_ancestral',
  'Euler a': 'k_euler_ancestral',
  'Euler': 'k_euler',
  'DDIM': 'ddim_v3',
  'UniPC': 'k_dpmpp_2m',
  'LMS': 'k_euler',
  'DPM2': 'k_dpm_2',
  'DPM2 a': 'k_dpm_2_ancestral',
};

/** 把任意 sampler 字符串映射到 NovelAI 合法值(k_* 系列或 ddim_v3)。已是 k_* 透传。 */
export function mapToNovelAiSampler(s: string): string {
  if (!s) return NOVELAI_DEFAULT_SAMPLER;
  if (s.startsWith('k_') || s === 'ddim_v3') return s;
  return NOVELAI_SAMPLER_MAP[s] ?? NOVELAI_DEFAULT_SAMPLER;
}

/** 四舍五入到 64 的倍数(NovelAI 严格要求 width/height % 64 == 0)。最小 64。 */
export function roundTo64(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 64;
  return Math.max(64, Math.round(n / 64) * 64);
}

export interface BuildNovelAiBodyInput {
  model: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: string;
}

/** 判定 model 是否走 V4/V4.5 协议(嵌套 v4_prompt + characterPrompts 必填)。
 *  覆盖 nai-diffusion-4-full / -4-curated-preview / -4-5-full / -4-5-curated 等。 */
export function isV4Model(model: string): boolean {
  if (typeof model !== 'string') return false;
  return model.toLowerCase().startsWith('nai-diffusion-4');
}

/** V3 协议路径:flat parameters,含 sm/sm_dyn/ucPreset/qualityToggle/dynamic_thresholding。
 *  对应 nai-diffusion-3 / nai-diffusion-furry-3 等老模型。 */
function buildV3Parameters(input: BuildNovelAiBodyInput, common: Record<string, unknown>): Record<string, unknown> {
  return {
    ...common,
    ucPreset: 0,
    qualityToggle: true,
    sm: false,
    sm_dyn: false,
    dynamic_thresholding: false,
    negative_prompt: typeof input.negativePrompt === 'string' ? input.negativePrompt : '',
  };
}

/** V4/V4.5 协议路径:必填嵌套 v4_prompt / v4_negative_prompt + characterPrompts 空数组 +
 *  params_version/legacy/cfg_rescale/noise_schedule/use_coords 等核心字段。
 *  V3 残留(sm/sm_dyn/ucPreset/qualityToggle/dynamic_thresholding)在 V4 路径全部丢弃。
 *  sampler='k_euler_ancestral' 时额外加 prefer_brownian/deliberate_euler_ancestral_bug。
 *  顶层 input 字段仍保留(同时镜像 v4_prompt.caption.base_caption,双兼容)。 */
function buildV4Parameters(input: BuildNovelAiBodyInput, common: Record<string, unknown>): Record<string, unknown> {
  const neg = typeof input.negativePrompt === 'string' ? input.negativePrompt : '';
  const params: Record<string, unknown> = {
    ...common,
    params_version: 3,
    legacy: false,
    legacy_v3_extend: false,
    cfg_rescale: 0,
    noise_schedule: 'karras',
    use_coords: false,
    characterPrompts: [],
    negative_prompt: neg,
    v4_prompt: {
      caption: { base_caption: input.prompt, char_captions: [] },
      use_coords: false,
      use_order: true,
    },
    v4_negative_prompt: {
      caption: { base_caption: neg, char_captions: [] },
      use_coords: false,
      use_order: false,
    },
  };
  // k_euler_ancestral 采样器在 V4 推荐打开 prefer_brownian(社区共识)
  if (common.sampler === 'k_euler_ancestral') {
    params.prefer_brownian = true;
    params.deliberate_euler_ancestral_bug = false;
  }
  return params;
}

/** 从通用入参构造 NovelAI POST /ai/generate-image 的 body。
 *
 *  按 model 前缀分流:'nai-diffusion-4*' → V4/V4.5 嵌套结构;其余 → V3 flat。
 *  默认走 Opus 免费档:n_samples=1;
 *  尺寸 roundTo64 兜底(防 400 invalid request);
 *  steps clamp 到 [1, 50];
 *  scale 兜底 NaN/字符串/越界(后端字段是 float64);
 *  seed 客户端现取 uint32 非负整数(后端协议要求,且为 batch 留头);
 *  negative_prompt 强制 string(防 null/对象类型穿透);
 *  玩家可用 extraParams 的 'parameters.cfg_rescale 0.2'、'parameters.seed 12345' 等点号路径覆写嵌套字段。 */
export function buildNovelAiBody(input: BuildNovelAiBodyInput): Record<string, unknown> {
  const w = roundTo64(input.width || NOVELAI_DEFAULT_WIDTH);
  const h = roundTo64(input.height || NOVELAI_DEFAULT_HEIGHT);
  const scale = Number.isFinite(input.cfgScale)
    ? Math.max(0, Math.min(input.cfgScale, 10))
    : 5;
  const model = input.model || NOVELAI_DEFAULT_MODEL;
  // V3/V4 公共字段(width/height/scale/sampler/steps/seed/n_samples)
  const common: Record<string, unknown> = {
    width: w,
    height: h,
    scale,
    sampler: mapToNovelAiSampler(input.sampler),
    steps: Math.max(1, Math.min(input.steps || 28, 50)),
    seed: randomNovelAiSeed(),
    n_samples: 1,
  };
  const parameters = isV4Model(model)
    ? buildV4Parameters(input, common)
    : buildV3Parameters(input, common);
  return {
    input: input.prompt,
    model,
    action: 'generate',
    parameters,
  };
}

/** HTTP 状态码 → 中文修复提示(callImageApi 失败路径用)。 */
export function novelAiRecoveryHint(status: number): string | undefined {
  if (status === 401) {
    return 'NovelAI Token 无效或过期 — 到 NovelAI Web → Settings → Account → Get Persistent API Token 重新获取(格式 pst-xxx)';
  }
  if (status === 402) {
    return 'NovelAI Anlas 余额不足或订阅不覆盖本次配置 — 缩小尺寸到 1024×1024 以内、步数 ≤ 28、n_samples=1 可走 Opus 免费额度';
  }
  if (status === 429) {
    return 'NovelAI 已禁用并发生成 — 等 30s 后重试,或在『图像 RPM』下调到 1';
  }
  if (status >= 500) {
    return 'NovelAI 服务端错 — 查 https://status.novelai.net/';
  }
  return undefined;
}

// ─── ZIP 解析 ─────────────────────────────────────────────────────────────
// NovelAI ZIP 极简:单 entry,通常 store(method=0)或 deflate(method=8),无 zip64/无加密。
// 自写解析器约 50 行,避免引入 jszip ~80KB gzipped 仅为单功能。

const ZIP_LFH_MAGIC = 0x04034b50; // 'PK\x03\x04' little-endian uint32

/** 从 ZIP 响应中抽取首个 PNG entry 的字节流。
 *  支持 method=0(store)/method=8(deflate);其他方法或加密 entry 抛错。
 *  抛错信息含 method/compSize/头部 hex 等诊断字段,帮玩家上报。 */
export async function extractFirstPngFromZip(zip: Uint8Array): Promise<Uint8Array> {
  if (!zip || zip.length < 30) throw new Error('ZIP 字节流过短');
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let p = 0;
  while (p + 30 <= zip.length) {
    if (dv.getUint32(p, true) !== ZIP_LFH_MAGIC) break;
    const flags = dv.getUint16(p + 6, true);
    const method = dv.getUint16(p + 8, true);
    const compSize = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const extraLen = dv.getUint16(p + 28, true);
    const nameBytes = zip.subarray(p + 30, p + 30 + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    const dataStart = p + 30 + nameLen + extraLen;
    if (/\.png$/i.test(name)) {
      // 加密位(flag bit0):本项目不支持加密 ZIP,直接给专属错
      if (flags & 0x0001) {
        throw new Error(`ZIP entry 被加密 flag=0x${flags.toString(16)} — 上游可能误用了密码保护`);
      }
      const data = zip.subarray(dataStart, dataStart + compSize);
      if (method === 0) return data;
      if (method === 8) {
        try {
          return await inflateRaw(data);
        } catch (e) {
          // 把 method/compSize 上下文 + inflateRaw 内部诊断合并往上抛,
          // 避免玩家只看到 "Failed to fetch" 无从下手
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`ZIP entry 解压失败 method=8 compSize=${compSize}: ${msg}`);
        }
      }
      throw new Error(`不支持的 ZIP 压缩方法 method=${method}`);
    }
    // Data Descriptor(flag bit3 置位)时头部 compSize=0,需扫描下个 PK 签名
    if (compSize === 0 && (flags & 0x08)) {
      let q = dataStart;
      while (q + 4 <= zip.length && dv.getUint32(q, true) !== ZIP_LFH_MAGIC) q++;
      p = q;
    } else {
      p = dataStart + compSize;
    }
  }
  throw new Error('ZIP 内未找到 PNG entry');
}

/** 把 Uint8Array 前 N 字节渲染成空格分隔的小写 hex,用于错误诊断输出。 */
function hexHead(data: Uint8Array, n = 32): string {
  const len = Math.min(n, data.length);
  let s = '';
  for (let i = 0; i < len; i++) {
    if (i > 0) s += ' ';
    s += data[i].toString(16).padStart(2, '0');
  }
  return s;
}

/** 单次按指定 format 尝试 inflate;构造错与 consume 错合并抛出。 */
async function tryInflate(data: Uint8Array, format: 'deflate-raw' | 'deflate'): Promise<Uint8Array> {
  // 每次都新建 Blob — Blob 流被首次 consume 后不可复用
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const ds = new DecompressionStream(format);
  const blob = new Blob([copy]);
  const stream = blob.stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

/** 解压 ZIP method=8 数据:先试 deflate-raw(RFC 1951,ZIP 规范标准),
 *  失败再试 deflate(RFC 1950 zlib wrapper)兜底中转/代理可能包了 zlib header 的情况。
 *  两次都失败时抛诊断错(含 size + 前 32 字节 hex + 两次错信息),便于上报。 */
export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  let rawErr: unknown;
  try {
    return await tryInflate(data, 'deflate-raw');
  } catch (e) {
    rawErr = e;
  }
  // fallback:zlib wrapper 形态
  let wrapErr: unknown;
  try {
    return await tryInflate(data, 'deflate');
  } catch (e) {
    wrapErr = e;
  }
  const rawMsg = rawErr instanceof Error ? rawErr.message : String(rawErr);
  const wrapMsg = wrapErr instanceof Error ? wrapErr.message : String(wrapErr);
  throw new Error(
    `inflate 失败 size=${data.length} head=[${hexHead(data)}] `
    + `(deflate-raw: ${rawMsg}; deflate-fallback: ${wrapMsg})`,
  );
}

/** Uint8Array → base64 字符串。分块避免 1-2MB PNG 触发 RangeError(arg limit)。 */
export function uint8ToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}
