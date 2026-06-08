// NovelAI 适配器单测(2026-06-08):覆盖 sampler 映射 / roundTo64 / body 嵌套结构 /
// ZIP store+deflate 解析 / 错误路径 / base64 大 buffer。
//
// fake ZIP 构造:手写 Local File Header(30 字节固定头 + 文件名 + 数据);
// deflate 测试用浏览器原生 CompressionStream('deflate-raw') 现压。

import { describe, it, expect } from 'vitest';
import {
  mapToNovelAiSampler,
  roundTo64,
  buildNovelAiBody,
  extractFirstPngFromZip,
  uint8ToBase64,
  novelAiRecoveryHint,
  randomNovelAiSeed,
  isV4Model,
  NOVELAI_SEED_MAX,
  NOVELAI_DEFAULT_SAMPLER,
  NOVELAI_DEFAULT_MODEL,
} from '../image-gen-novelai';

// ─── ZIP LFH 构造 helper ──────────────────────────────────────────────────

function writeU16(buf: Uint8Array, offset: number, v: number) {
  buf[offset] = v & 0xff;
  buf[offset + 1] = (v >> 8) & 0xff;
}
function writeU32(buf: Uint8Array, offset: number, v: number) {
  buf[offset] = v & 0xff;
  buf[offset + 1] = (v >> 8) & 0xff;
  buf[offset + 2] = (v >> 16) & 0xff;
  buf[offset + 3] = (v >>> 24) & 0xff;
}

/** 拼一个含单 entry 的最小 ZIP(只有 LFH + 数据,无 central directory)。
 *  本项目的 extractFirstPngFromZip 只扫 LFH,不需要 central dir。 */
function buildZipEntry(filename: string, data: Uint8Array, method: 0 | 8, uncompressedSize: number): Uint8Array {
  const nameBytes = new TextEncoder().encode(filename);
  const out = new Uint8Array(30 + nameBytes.length + data.length);
  writeU32(out, 0, 0x04034b50);    // LFH signature
  writeU16(out, 4, 20);            // version needed
  writeU16(out, 6, 0);             // flags
  writeU16(out, 8, method);        // method
  writeU16(out, 10, 0);            // mtime
  writeU16(out, 12, 0);            // mdate
  writeU32(out, 14, 0);            // crc32(忽略,本解析器不校验)
  writeU32(out, 18, data.length);  // compressed size
  writeU32(out, 22, uncompressedSize);
  writeU16(out, 26, nameBytes.length);
  writeU16(out, 28, 0);            // extra field length
  out.set(nameBytes, 30);
  out.set(data, 30 + nameBytes.length);
  return out;
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of arrs) { out.set(a, p); p += a.length; }
  return out;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const blob = new Blob([copy]);
  const stream = blob.stream().pipeThrough(cs);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ─── 测试 ─────────────────────────────────────────────────────────────────

describe('mapToNovelAiSampler', () => {
  it('SD 名映射到 k_*', () => {
    expect(mapToNovelAiSampler('Euler a')).toBe('k_euler_ancestral');
    expect(mapToNovelAiSampler('Euler')).toBe('k_euler');
    expect(mapToNovelAiSampler('DPM++ 2M Karras')).toBe('k_dpmpp_2m');
    expect(mapToNovelAiSampler('DPM++ SDE Karras')).toBe('k_dpmpp_sde');
    expect(mapToNovelAiSampler('DDIM')).toBe('ddim_v3');
  });
  it('已是 k_* 透传', () => {
    expect(mapToNovelAiSampler('k_euler_ancestral')).toBe('k_euler_ancestral');
    expect(mapToNovelAiSampler('k_dpmpp_2m')).toBe('k_dpmpp_2m');
  });
  it('ddim_v3 透传', () => {
    expect(mapToNovelAiSampler('ddim_v3')).toBe('ddim_v3');
  });
  it('未知 sampler 兜底默认', () => {
    expect(mapToNovelAiSampler('UnknownSampler')).toBe(NOVELAI_DEFAULT_SAMPLER);
    expect(mapToNovelAiSampler('')).toBe(NOVELAI_DEFAULT_SAMPLER);
  });
});

describe('roundTo64', () => {
  it('64 的倍数原样', () => {
    expect(roundTo64(832)).toBe(832);
    expect(roundTo64(1024)).toBe(1024);
    expect(roundTo64(1216)).toBe(1216);
  });
  it('非倍数四舍五入', () => {
    expect(roundTo64(1000)).toBe(1024); // 1000/64=15.625 → 16*64=1024
    expect(roundTo64(1200)).toBe(1216); // 1200/64=18.75 → 19*64=1216
    expect(roundTo64(900)).toBe(896);   // 900/64=14.06 → 14*64=896
  });
  it('过小或非法值兜底 64', () => {
    expect(roundTo64(0)).toBe(64);
    expect(roundTo64(-100)).toBe(64);
    expect(roundTo64(NaN)).toBe(64);
    expect(roundTo64(30)).toBe(64); // round(0.47)=0 → max(64,0)=64
  });
});

describe('buildNovelAiBody', () => {
  it('默认 model(V4.5)走 V4 路径 — 嵌套结构与必填字段', () => {
    const body = buildNovelAiBody({
      model: 'nai-diffusion-4-5-full',
      prompt: 'a cat',
      negativePrompt: 'blurry',
      width: 832,
      height: 1216,
      steps: 28,
      cfgScale: 5,
      sampler: 'Euler a',
    });
    expect(body.input).toBe('a cat');
    expect(body.model).toBe('nai-diffusion-4-5-full');
    expect(body.action).toBe('generate');
    const p = body.parameters as Record<string, unknown>;
    // V4 公共字段
    expect(p.width).toBe(832);
    expect(p.height).toBe(1216);
    expect(p.scale).toBe(5);
    expect(p.sampler).toBe('k_euler_ancestral');
    expect(p.steps).toBe(28);
    expect(p.n_samples).toBe(1);
    // V4 必填新字段
    expect(p.params_version).toBe(3);
    expect(p.legacy).toBe(false);
    expect(p.legacy_v3_extend).toBe(false);
    expect(p.cfg_rescale).toBe(0);
    expect(p.noise_schedule).toBe('karras');
    expect(p.use_coords).toBe(false);
    expect(p.characterPrompts).toEqual([]);
    expect(p.negative_prompt).toBe('blurry');
    // v4_prompt 嵌套结构
    const v4p = p.v4_prompt as Record<string, unknown>;
    expect((v4p.caption as Record<string, unknown>).base_caption).toBe('a cat');
    expect((v4p.caption as Record<string, unknown>).char_captions).toEqual([]);
    expect(v4p.use_coords).toBe(false);
    expect(v4p.use_order).toBe(true);
    // v4_negative_prompt 嵌套结构
    const v4np = p.v4_negative_prompt as Record<string, unknown>;
    expect((v4np.caption as Record<string, unknown>).base_caption).toBe('blurry');
    expect((v4np.caption as Record<string, unknown>).char_captions).toEqual([]);
    // V3 残留字段不应出现在 V4 路径
    expect(p).not.toHaveProperty('sm');
    expect(p).not.toHaveProperty('sm_dyn');
    expect(p).not.toHaveProperty('ucPreset');
    expect(p).not.toHaveProperty('qualityToggle');
    expect(p).not.toHaveProperty('dynamic_thresholding');
  });
  it('V4 + k_euler_ancestral 采样器加 prefer_brownian / deliberate_euler_ancestral_bug', () => {
    const body = buildNovelAiBody({
      model: 'nai-diffusion-4-5-full',
      prompt: 'x', negativePrompt: '',
      width: 832, height: 1216, steps: 28, cfgScale: 5,
      sampler: 'Euler a', // → k_euler_ancestral
    });
    const p = body.parameters as Record<string, unknown>;
    expect(p.prefer_brownian).toBe(true);
    expect(p.deliberate_euler_ancestral_bug).toBe(false);
  });
  it('V4 + 非 k_euler_ancestral 采样器不带 prefer_brownian', () => {
    const body = buildNovelAiBody({
      model: 'nai-diffusion-4-5-full',
      prompt: 'x', negativePrompt: '',
      width: 832, height: 1216, steps: 28, cfgScale: 5,
      sampler: 'DPM++ 2M Karras', // → k_dpmpp_2m
    });
    const p = body.parameters as Record<string, unknown>;
    expect(p).not.toHaveProperty('prefer_brownian');
    expect(p).not.toHaveProperty('deliberate_euler_ancestral_bug');
  });
  it('V4 全系列模型(4-full / 4-curated-preview / 4-5-curated)都走 V4 路径', () => {
    const models = ['nai-diffusion-4-full', 'nai-diffusion-4-curated-preview', 'nai-diffusion-4-5-curated'];
    for (const m of models) {
      const body = buildNovelAiBody({
        model: m, prompt: 'x', negativePrompt: '',
        width: 832, height: 1216, steps: 28, cfgScale: 5, sampler: 'k_euler',
      });
      const p = body.parameters as Record<string, unknown>;
      expect(p).toHaveProperty('v4_prompt');
      expect(p).toHaveProperty('characterPrompts');
      expect(p).not.toHaveProperty('sm');
    }
  });
  it('V3 模型(nai-diffusion-3 / nai-diffusion-furry-3)走 V3 flat 路径', () => {
    for (const m of ['nai-diffusion-3', 'nai-diffusion-furry-3']) {
      const body = buildNovelAiBody({
        model: m, prompt: 'a cat', negativePrompt: 'blurry',
        width: 832, height: 1216, steps: 28, cfgScale: 5, sampler: 'k_euler',
      });
      const p = body.parameters as Record<string, unknown>;
      // V3 字段保留
      expect(p.sm).toBe(false);
      expect(p.sm_dyn).toBe(false);
      expect(p.qualityToggle).toBe(true);
      expect(p.ucPreset).toBe(0);
      expect(p.dynamic_thresholding).toBe(false);
      expect(p.negative_prompt).toBe('blurry');
      // V4 字段不应出现
      expect(p).not.toHaveProperty('v4_prompt');
      expect(p).not.toHaveProperty('v4_negative_prompt');
      expect(p).not.toHaveProperty('characterPrompts');
      expect(p).not.toHaveProperty('params_version');
    }
  });
  it('V4 + negativePrompt 非字符串 → v4_negative_prompt.base_caption 空串', () => {
    const cases: unknown[] = [null, undefined, [], {}, 123];
    for (const v of cases) {
      const body = buildNovelAiBody({
        model: 'nai-diffusion-4-5-full',
        prompt: 'x', negativePrompt: v as string,
        width: 832, height: 1216, steps: 28, cfgScale: 5, sampler: 'k_euler',
      });
      const p = body.parameters as Record<string, unknown>;
      const v4np = p.v4_negative_prompt as Record<string, unknown>;
      expect((v4np.caption as Record<string, unknown>).base_caption).toBe('');
      expect(p.negative_prompt).toBe('');
    }
  });
  it('V4 顶层 input 与 v4_prompt.caption.base_caption 镜像', () => {
    const body = buildNovelAiBody({
      model: 'nai-diffusion-4-5-full',
      prompt: '镜像测试 prompt', negativePrompt: '',
      width: 832, height: 1216, steps: 28, cfgScale: 5, sampler: 'k_euler',
    });
    expect(body.input).toBe('镜像测试 prompt');
    const p = body.parameters as Record<string, unknown>;
    const v4p = p.v4_prompt as Record<string, unknown>;
    expect((v4p.caption as Record<string, unknown>).base_caption).toBe('镜像测试 prompt');
  });
  it('width/height 非 64 倍数自动 round', () => {
    const body = buildNovelAiBody({
      model: '', prompt: 'x', negativePrompt: '',
      width: 1000, height: 1200, steps: 28, cfgScale: 5, sampler: 'Euler',
    });
    const p = body.parameters as Record<string, unknown>;
    expect(p.width).toBe(1024);
    expect(p.height).toBe(1216);
  });
  it('steps 超 50 被 clamp', () => {
    const body = buildNovelAiBody({
      model: '', prompt: 'x', negativePrompt: '',
      width: 832, height: 1216, steps: 100, cfgScale: 5, sampler: 'k_euler',
    });
    expect((body.parameters as Record<string, unknown>).steps).toBe(50);
  });
  it('空 model 走默认 nai-diffusion-4-5-full(V4 路径)', () => {
    const body = buildNovelAiBody({
      model: '', prompt: 'x', negativePrompt: '',
      width: 832, height: 1216, steps: 28, cfgScale: 5, sampler: 'k_euler',
    });
    expect(body.model).toBe(NOVELAI_DEFAULT_MODEL);
    expect(body.parameters).toHaveProperty('v4_prompt');
  });
  it('seed 是 [1, NOVELAI_SEED_MAX] 内的整数(不再是 -1)', () => {
    const body = buildNovelAiBody({
      model: '', prompt: 'x', negativePrompt: '',
      width: 832, height: 1216, steps: 28, cfgScale: 5, sampler: 'k_euler',
    });
    const seed = (body.parameters as Record<string, unknown>).seed as number;
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(1);
    expect(seed).toBeLessThanOrEqual(NOVELAI_SEED_MAX);
    expect(seed).not.toBe(-1);
  });
  it('连续构造同入参 body,seed 至少有 2 个不同值(随机性)', () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 10; i++) {
      const body = buildNovelAiBody({
        model: '', prompt: 'x', negativePrompt: '',
        width: 832, height: 1216, steps: 28, cfgScale: 5, sampler: 'k_euler',
      });
      seeds.add((body.parameters as Record<string, unknown>).seed as number);
    }
    expect(seeds.size).toBeGreaterThanOrEqual(2);
  });
  it('cfgScale 非有限数(NaN/字符串)兜底 5', () => {
    const cases: Array<[unknown, number]> = [
      [NaN, 5],
      ['abc' as unknown, 5],
      [undefined as unknown, 5],
      [null as unknown, 5],
    ];
    for (const [input, expected] of cases) {
      const body = buildNovelAiBody({
        model: '', prompt: 'x', negativePrompt: '',
        width: 832, height: 1216, steps: 28,
        cfgScale: input as number,
        sampler: 'k_euler',
      });
      expect((body.parameters as Record<string, unknown>).scale).toBe(expected);
    }
  });
  it('cfgScale 越界 clamp 到 [0, 10]', () => {
    const b1 = buildNovelAiBody({
      model: '', prompt: 'x', negativePrompt: '',
      width: 832, height: 1216, steps: 28, cfgScale: -3, sampler: 'k_euler',
    });
    expect((b1.parameters as Record<string, unknown>).scale).toBe(0);
    const b2 = buildNovelAiBody({
      model: '', prompt: 'x', negativePrompt: '',
      width: 832, height: 1216, steps: 28, cfgScale: 25, sampler: 'k_euler',
    });
    expect((b2.parameters as Record<string, unknown>).scale).toBe(10);
  });
});

describe('isV4Model', () => {
  it('nai-diffusion-4* 全部命中', () => {
    expect(isV4Model('nai-diffusion-4-full')).toBe(true);
    expect(isV4Model('nai-diffusion-4-curated-preview')).toBe(true);
    expect(isV4Model('nai-diffusion-4-5-full')).toBe(true);
    expect(isV4Model('nai-diffusion-4-5-curated')).toBe(true);
  });
  it('大小写不敏感', () => {
    expect(isV4Model('NAI-DIFFUSION-4-5-FULL')).toBe(true);
  });
  it('V3 / V2 / V1 / furry / safe 不命中', () => {
    expect(isV4Model('nai-diffusion-3')).toBe(false);
    expect(isV4Model('nai-diffusion-furry-3')).toBe(false);
    expect(isV4Model('nai-diffusion-2')).toBe(false);
    expect(isV4Model('nai-diffusion')).toBe(false);
    expect(isV4Model('safe-diffusion')).toBe(false);
    expect(isV4Model('furry')).toBe(false);
  });
  it('空值与非字符串兜底', () => {
    expect(isV4Model('')).toBe(false);
    // @ts-expect-error 故意传非字符串
    expect(isV4Model(null)).toBe(false);
    // @ts-expect-error 故意传非字符串
    expect(isV4Model(undefined)).toBe(false);
  });
});

describe('randomNovelAiSeed', () => {
  it('每次返回 [1, NOVELAI_SEED_MAX] 内的整数', () => {
    for (let i = 0; i < 50; i++) {
      const s = randomNovelAiSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(NOVELAI_SEED_MAX);
    }
  });
  it('NOVELAI_SEED_MAX 等于 2^32 - 8(对齐社区 SDK 给 batch 留 +7 头)', () => {
    expect(NOVELAI_SEED_MAX).toBe(0xFFFFFFFF - 7);
    expect(NOVELAI_SEED_MAX).toBe(4294967288);
  });
  it('1000 次采样去重 ≥ 990(随机性 smoke)', () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 1000; i++) seeds.add(randomNovelAiSeed());
    expect(seeds.size).toBeGreaterThanOrEqual(990);
  });
});

describe('extractFirstPngFromZip', () => {
  it('store 模式(method=0)抽取 PNG', async () => {
    const zip = buildZipEntry('image_0.png', PNG_SIGNATURE, 0, PNG_SIGNATURE.length);
    const png = await extractFirstPngFromZip(zip);
    expect(png).toEqual(PNG_SIGNATURE);
  });
  it('deflate 模式(method=8)抽取 PNG', async () => {
    const compressed = await deflateRaw(PNG_SIGNATURE);
    const zip = buildZipEntry('image_0.png', compressed, 8, PNG_SIGNATURE.length);
    const png = await extractFirstPngFromZip(zip);
    expect(png).toEqual(PNG_SIGNATURE);
  });
  it('多 entry 只取首个 PNG', async () => {
    const txt = new TextEncoder().encode('hello');
    const txtEntry = buildZipEntry('metadata.txt', txt, 0, txt.length);
    const pngEntry = buildZipEntry('image_0.png', PNG_SIGNATURE, 0, PNG_SIGNATURE.length);
    const png = await extractFirstPngFromZip(concat(txtEntry, pngEntry));
    expect(png).toEqual(PNG_SIGNATURE);
  });
  it('无 PNG entry 抛错', async () => {
    const txt = new TextEncoder().encode('hi');
    const zip = buildZipEntry('only.txt', txt, 0, txt.length);
    await expect(extractFirstPngFromZip(zip)).rejects.toThrow(/ZIP 内未找到 PNG entry/);
  });
  it('损坏头(非 PK 签名)抛错', async () => {
    const bogus = new Uint8Array(40); // 全 0,首字节非 0x50
    await expect(extractFirstPngFromZip(bogus)).rejects.toThrow(/ZIP 内未找到 PNG entry/);
  });
  it('字节流过短抛错', async () => {
    await expect(extractFirstPngFromZip(new Uint8Array(10))).rejects.toThrow(/ZIP 字节流过短/);
  });
});

describe('uint8ToBase64', () => {
  it('小 buffer 正确编码', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // 'Hello'
    expect(uint8ToBase64(bytes)).toBe('SGVsbG8=');
  });
  it('大 buffer 不爆栈', () => {
    const big = new Uint8Array(200_000);
    for (let i = 0; i < big.length; i++) big[i] = i & 0xff;
    const b64 = uint8ToBase64(big);
    expect(b64.length).toBeGreaterThan(200_000); // base64 长度 ≈ 4/3 * input
    // 反解一段验正确性
    const decoded = atob(b64.slice(0, 16));
    expect(decoded.charCodeAt(0)).toBe(0);
    expect(decoded.charCodeAt(1)).toBe(1);
  });
});

describe('novelAiRecoveryHint', () => {
  it('401 提示 token 失效', () => {
    expect(novelAiRecoveryHint(401)).toMatch(/Persistent API Token/);
  });
  it('402 提示 Anlas 不足', () => {
    expect(novelAiRecoveryHint(402)).toMatch(/Anlas/);
  });
  it('429 提示禁并发', () => {
    expect(novelAiRecoveryHint(429)).toMatch(/并发/);
  });
  it('5xx 提示服务端错', () => {
    expect(novelAiRecoveryHint(500)).toMatch(/服务端/);
    expect(novelAiRecoveryHint(503)).toMatch(/服务端/);
  });
  it('其他码无 hint', () => {
    expect(novelAiRecoveryHint(404)).toBeUndefined();
    expect(novelAiRecoveryHint(200)).toBeUndefined();
  });
});
